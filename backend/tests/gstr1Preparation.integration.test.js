import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { seedGstDashboardFixture } from './fixtures/gstDashboardFixture.js';
import { Invoice } from '../src/models/Invoice.js';
import { Gstr1 } from '../src/models/Gstr1.js';
import { saveGstr1 } from '../src/modules/retail/gst/gstr1Controller.js';
import { loadGstr1Preparation, gstr1Response, prepareGstr1, exportGstr1Preparation, recordGstr1Filing } from '../src/services/gstr1Preparation.js';

test('GSTR-1 persistent preparation, exports and external filing acknowledgement', { skip: !process.env.GST_DASHBOARD_TEST_MONGODB_URI }, async t => {
  await mongoose.connect(process.env.GST_DASHBOARD_TEST_MONGODB_URI, { dbName: `gobook_gst_preparation_${randomUUID().replaceAll('-', '')}` });
  try {
    const f = await seedGstDashboardFixture();
    const request = (body = {}, user = f.actor) => ({ method: 'POST', user, query: {}, body: { period: f.period, ...body } });
    const read = async (period = f.period, user = f.actor) => gstr1Response(await loadGstr1Preparation({ method: 'GET', user, query: { period } }));
    const rejected = (task, code) => assert.rejects(task, error => { assert.equal(error.status || error.statusCode, code, error.message); return true; });
    let result;
    await t.test('legacy local filing is unverified and does not bypass preparation', async () => {
      result = await read();
      assert.equal(result.status, 'draft');
      assert.equal(result.workflow.filed, false);
      assert.equal(result.legacyFiling.verification, 'unverified');
      assert.equal(result.arn, undefined);
      assert.equal(result.sourceDocuments.length, 5);
      assert.ok(!JSON.stringify(result.sourceDocuments).includes('FOREIGN'));
      await rejected(() => prepareGstr1(request(), 'summary'), 409);
      await rejected(() => exportGstr1Preparation(request({ format: 'json' })), 409);
      await rejected(() => saveGstr1(request({ status: 'filed', arn: 'FAKE' }), { json() {} }, error => { throw error; }), 400);
      await rejected(() => loadGstr1Preparation(request({ filingType: 'quarterly' })), 400);
    });
    await t.test('failed validation is persisted and blocks summary', async () => {
      result = await prepareGstr1(request(), 'validate');
      assert.equal(result.workflow.validated, false);
      assert.ok(result.workflow.validation.errors > 0);
      assert.equal((await read()).workflow.history.at(-1).stage, 'validation-failed');
      await rejected(() => prepareGstr1(request(), 'summary'), 409);
    });
    await t.test('corrected billing data validates and summary survives a fresh read', async () => {
      await Invoice.updateMany({ userId: { $in: [f.owner, f.member] }, number: { $ne: 'GST-PREVIOUS-1' } }, { $set: { 'customer.state': 'Tamil Nadu', 'meta.date': '2026-11-03', 'items.$[].hsn': '8471' } });
      result = await prepareGstr1(request(), 'validate');
      assert.equal(result.workflow.validation.errors, 0);
      assert.equal(result.workflow.validated, true);
      assert.equal(result.workflow.summaryGenerated, false);
      result = await prepareGstr1(request({ expectedSourceHash: result.workflow.sourceHash }), 'summary');
      assert.equal(result.workflow.exportReady, true);
      assert.equal(result.workflow.summary.recordCount, 5);
      assert.equal(result.workflow.summary.taxable, 1700);
      assert.equal(result.workflow.summary.tax, 187);
      assert.equal(result.workflow.summary.sections.b2b.count, 1);
      assert.equal(result.workflow.summary.sections.b2cs.count, 3);
      assert.equal(result.workflow.summary.sections.notes.count, 1);
      assert.equal(result.workflow.summary.sections.exports.count, 0);
      assert.equal((await read()).workflow.summaryGenerated, true);
    });
    await t.test('CSV, JSON and actual PDF exports cover the full return and save history', async () => {
      for (const format of ['csv', 'json', 'pdf']) {
        const output = await exportGstr1Preparation(request({ format, expectedSourceHash: result.workflow.sourceHash }));
        assert.ok(output.filename.endsWith(`.${format}`));
        if (format === 'json') assert.equal(JSON.parse(output.content).documents.length, 5);
        if (format === 'csv') assert.ok(output.content.includes('GST-SALE-1') && output.content.includes('GST-SALE-2'));
        if (format === 'pdf') assert.equal(Buffer.from(output.content, 'base64').subarray(0, 5).toString(), '%PDF-');
        assert.equal(output.workflow.history.at(-1).stage, `exported-${format}`);
      }
      assert.ok((await read()).workflow.exportedAt);
    });
    await t.test('a billing edit invalidates saved progress and rejects stale browser actions', async () => {
      const oldHash = result.workflow.sourceHash;
      await Invoice.updateOne({ number: 'GST-SALE-1', userId: f.owner }, { $set: { 'items.0.rate': 1100 } });
      result = await read();
      assert.equal(result.workflow.stale, true);
      assert.equal(result.workflow.validated, false);
      assert.equal(result.workflow.exportReady, false);
      await rejected(() => prepareGstr1(request({ expectedSourceHash: oldHash }), 'validate'), 409);
      await rejected(() => exportGstr1Preparation(request({ format: 'json' })), 409);
      result = await prepareGstr1(request(), 'validate');
      result = await prepareGstr1(request(), 'summary');
      assert.equal(result.workflow.summary.taxable, 1800);
    });
    const receipt = { arn: 'AA3311261234567', filedAt: '2026-11-14', confirmed: true };
    await t.test('filing requires an actual user-entered acknowledgement and valid date', async () => {
      await rejected(() => recordGstr1Filing(request()), 400);
      await rejected(() => recordGstr1Filing(request({ ...receipt, confirmed: false })), 400);
      await rejected(() => recordGstr1Filing(request({ ...receipt, filedAt: '2026-02-30' })), 400);
      await rejected(() => recordGstr1Filing(request({ ...receipt, filedAt: '2099-11-14' })), 400);
      result = await recordGstr1Filing(request({ ...receipt, expectedSourceHash: result.workflow.sourceHash }));
      assert.equal(result.status, 'filed');
      assert.equal(result.filing.source, 'manual');
      assert.equal(result.arn, receipt.arn);
      assert.equal(result.workflow.filed, true);
      assert.equal(result.workflow.exportReady, true);
    });
    await t.test('recorded snapshot stays frozen across billing edits, reload and export', async () => {
      const filedHash = result.workflow.sourceHash;
      await Invoice.updateOne({ number: 'GST-SALE-1', userId: f.owner }, { $set: { 'items.0.rate': 1300 } });
      result = await read();
      assert.equal(result.workflow.sourceHash, filedHash);
      assert.equal(result.workflow.stale, false);
      assert.equal(result.workflow.summary.taxable, 1800);
      assert.equal((await recordGstr1Filing(request(receipt))).arn, receipt.arn);
      await rejected(() => recordGstr1Filing(request({ ...receipt, arn: 'DIFFERENT' })), 409);
      await rejected(() => prepareGstr1(request(), 'validate'), 409);
      const output = await exportGstr1Preparation(request({ format: 'json' }));
      assert.equal(JSON.parse(output.content).summary.taxable, 1800);
      assert.equal((await read()).workflow.filed, true);
    });
    await t.test('empty period requires explicit confirmation and persists valid zero summary', async () => {
      const body = { period: 'April 2026' };
      result = await prepareGstr1(request(body), 'validate');
      assert.equal(result.workflow.validated, false);
      result = await prepareGstr1(request({ ...body, allowEmpty: true }), 'validate');
      assert.equal(result.workflow.validated, true);
      result = await prepareGstr1(request(body), 'summary');
      assert.equal(result.workflow.summary.recordCount, 0);
      assert.equal(result.workflow.summary.total, 0);
      assert.equal((await read(body.period)).workflow.exportReady, true);
    });
    await t.test('staff preparation cannot read the owner filed snapshot or foreign invoices', async () => {
      const staff = { id: String(f.member), businessId: String(f.businessId), accountType: 'member', branch: 'B1' };
      const scoped = await read(f.period, staff);
      assert.equal(scoped.status, 'draft');
      assert.equal(scoped.arn, undefined);
      assert.equal(scoped.sourceDocuments.length, 2);
      assert.ok(scoped.sourceDocuments.every(row => ['GST-SALE-2', 'GST-NONGST-1'].includes(row.invoiceNo)));
      assert.equal(await Gstr1.countDocuments({ userId: f.owner, period: f.period }), 1);
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
