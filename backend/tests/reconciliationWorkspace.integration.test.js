import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { seedGstDashboardFixture } from './fixtures/gstDashboardFixture.js';
import { loadWorkspace, mutateWorkspace } from '../src/services/reconciliationWorkspace.js';
import { GstReconciliation } from '../src/models/GstReconciliation.js';
import { Invoice } from '../src/models/Invoice.js';
import { Gstr1 } from '../src/models/Gstr1.js';
import { getGstr3b } from '../src/modules/retail/gst/gstr3bController.js';

test('reconciliation is a scoped, persistent discrepancy-resolution workspace', { skip: !process.env.GST_DASHBOARD_TEST_MONGODB_URI }, async t => {
  await mongoose.connect(process.env.GST_DASHBOARD_TEST_MONGODB_URI, { dbName: `gobook_gst_recon_${randomUUID().replaceAll('-', '')}` });
  try {
    const f = await seedGstDashboardFixture(), req = { user: f.actor }, identity = { period: f.period, type: '2b' };
    const load = async (input = identity, user = f.actor) => (await loadWorkspace({ user }, input)).result;
    let current = await load();
    const run = async (action, extra = {}) => { current = await mutateWorkspace({ ...req, body: { ...identity, expectedSourceHash: current.sourceHash, action, ...extra } }); return current; };
    const reject = (task, status) => assert.rejects(task, error => { assert.equal(error.statusCode, status, error.message); return true; });
    const a = { invoiceNo: 'BILL-SAME', gstin: '33AAAAA1111A1Z5', supplier: 'Supplier A', date: '2026-11-03', taxable: 800, gst: 144 };
    const b = { ...a, gstin: '33BBBBB2222B1Z5', supplier: 'Supplier B', taxable: 200, gst: 10 };
    const extra = { ...a, invoiceNo: 'PORTAL-ONLY', taxable: 300, gst: 54 };
    await t.test('GET includes staff records, retains unknown legacy fields and does not write', async () => {
      const before = await GstReconciliation.findOne({ userId: f.owner }).lean();
      assert.equal(current.business.name, 'Stored GST Business'); assert.equal(current.summary.books.gst, 154); assert.equal(current.summary.books.value, 1154);
      assert.equal(current.summary.statuses.partial, 1); assert.equal(current.summary.statuses.not_in_2b, 1);
      assert.equal(current.summary.portal.taxable, null);
      await load(); const after = await GstReconciliation.findById(before._id).lean(); assert.deepEqual(after, before);
    });
    await t.test('full imports retain statement-only invoices and zero amounts, with supplier-isolated matching', async () => {
      await run('importPortal', { records: [a, b, extra], filename: 'statement.csv' });
      assert.equal(current.summary.statuses.matched, 2); assert.equal(current.summary.statuses.not_in_books, 1);
      assert.equal(current.summary.portal.gst, 208); assert.equal(current.summary.portal.taxable, 1300);
      assert.equal(current.summary.eligibleBooks, 0);
      const saved = await load(); assert.deepEqual(saved.summary, current.summary); assert.equal(saved.history[0].action, 'importPortal');
      let report; await getGstr3b({ user: f.actor, query: { period: f.period } }, { json: value => { report = value; } }, error => { throw error; }); assert.equal(report.gstr2b.totalItc, 154);
    });
    await t.test('review decisions and separate ITC eligibility persist with notes, and source changes revoke them', async () => {
      const row = current.rows.find(row => row.book?.gstin === a.gstin);
      await run('resolve', { rowIds: [row.id], resolution: 'accepted', note: 'Invoice and supplier documents checked' });
      assert.equal(current.rows.find(item => item.id === row.id).eligibility, 'review');
      await run('eligibility', { rowIds: [row.id], eligibility: 'eligible', note: 'Eligibility verified against supporting documents' });
      assert.equal((await load()).summary.eligibleBooks, 144);
      const invoice = await Invoice.findOne({ number: 'GST-PURCHASE-1', userId: f.owner }).lean();
      await Invoice.updateOne({ _id: invoice._id }, { $set: { 'items.0.rate': 900 } });
      const changed = await load(); const changedRow = changed.rows.find(item => item.id === row.id);
      assert.equal(changedRow.reviewInvalidated, true); assert.equal(changedRow.resolution, 'none'); assert.equal(changed.summary.eligibleBooks, 0);
      await reject(() => run('auto'), 409);
      await Invoice.updateOne({ _id: invoice._id }, { $set: { 'items.0.rate': 800 } }); current = await load();
    });
    await t.test('manual unlink and link are durable, require a reason and clear old review decisions', async () => {
      const row = current.rows.find(row => row.book?.gstin === a.gstin);
      const portalId = row.portal.id, bookId = row.book.id;
      await run('unlink', { bookId, note: 'Recheck the pairing' });
      assert.equal(current.rows.find(item => item.book?.id === bookId).portal, null);
      await run('link', { bookId, portalId, note: 'Supporting invoice establishes the link' });
      const linked = current.rows.find(item => item.book?.id === bookId);
      assert.equal(linked.manual, true); assert.equal(linked.resolution, 'none'); assert.equal(linked.eligibility, 'review');
      await reject(() => run('link', { bookId: current.rows.find(item => item.book?.gstin === b.gstin).book.id, portalId, note: 'Wrong reuse' }), 409);
    });
    await t.test('duplicate imports remain visible and cannot be accepted or marked eligible silently', async () => {
      await run('importPortal', { records: [a, a, b] });
      assert.equal(current.summary.portal.count, 3); assert.equal(current.summary.duplicates, 2);
      const row = current.rows.find(item => item.book?.gstin === a.gstin);
      assert.equal(row.ambiguous, true);
      await reject(() => run('resolve', { rowIds: [row.id], resolution: 'accepted', note: 'Cannot accept ambiguity' }), 400);
      await run('importPortal', { records: [a, b, extra] });
    });
    await t.test('uploaded purchase registers supplement reconciliation without editing accounting invoices', async () => {
      const count = await Invoice.countDocuments({ userId: f.owner });
      await run('importRegister', { records: [{ ...a, invoiceNo: 'UPLOAD-ONLY', taxable: 50, gst: 9 }, a] });
      assert.equal(current.register.supplemental, 1); assert.equal(current.register.sourceDuplicatesSkipped, 1);
      assert.equal(current.summary.books.count, 3); assert.equal(current.summary.books.gst, 163);
      assert.equal(await Invoice.countDocuments({ userId: f.owner }), count);
      await run('auto'); assert.equal((await load()).summary.books.count, 3);
      const supplemental = current.rows.find(row => row.book?.invoiceNo === 'UPLOAD-ONLY');
      const portalOnly = current.rows.find(row => row.portal?.invoiceNo === extra.invoiceNo);
      await run('link', { bookId: supplemental.book.id, portalId: portalOnly.portal.id, note: 'Manual review of supplemental register reference' });
      await run('importRegister', { records: [a] });
      const refreshed = await loadWorkspace(req, identity);
      assert.equal(refreshed.workspace.links.some(link => link.bookId === supplemental.book.id), false);
      assert.equal(refreshed.result.rows.find(row => row.portal?.invoiceNo === extra.invoiceNo).book, null);
    });
    await t.test('ITC unavailable flags and rejected matches cannot become eligible', async () => {
      await run('importPortal', { records: [{ ...a, statementEligibility: 'ineligible' }, b, extra] });
      const row = current.rows.find(item => item.book?.gstin === a.gstin && item.portal);
      await reject(() => run('eligibility', { rowIds: [row.id], eligibility: 'eligible', note: 'Not allowed' }), 400);
      await run('resolve', { rowIds: [row.id], resolution: 'rejected', note: 'Supplier evidence is inconsistent' });
      assert.equal((await load()).rows.find(item => item.id === row.id).resolution, 'rejected');
    });
    await t.test('sales compares actual invoice snapshots and supports portal-only and duplicate invoices', async () => {
      const snapshot = [{ sourceId: 'stored-sale', documentType: 'invoice', invoiceNo: 'GST-SALE-1', date: '2026-11-03', gstin: '33AAAAA0000A1Z5', name: 'Registered Buyer', taxable: 1000, cgst: 90, sgst: 90, igst: 0 }];
      await Gstr1.updateOne({ userId: f.owner, gstin: f.gstin, period: f.period }, { $set: { sourceDocuments: snapshot, status: 'draft' } });
      const sales = await load({ ...identity, type: '1' }); assert.equal(sales.summary.statuses.matched, 1); assert.ok(sales.statementSource.includes('draft'));
      assert.equal(sales.summary.books.gst, 187);
      const response = await mutateWorkspace({ ...req, body: { ...identity, type: '1', expectedSourceHash: sales.sourceHash, action: 'importPortal', records: [{ invoiceNo: 'SALES-PORTAL-ONLY', gstin: '', supplier: 'Walk-in', date: '2026-11-03', taxable: 777, gst: 25 }] } });
      assert.equal(response.summary.statuses.not_in_books, 1);
      assert.equal((await load()).summary.portal.gst, current.summary.portal.gst);
    });
    await t.test('foreign users, invalid rows and stale updates cannot overwrite permitted records', async () => {
      const staff = await load(identity, { id: String(f.member), businessId: String(f.businessId), accountType: 'member', branch: 'B1' });
      assert.equal(staff.summary.books.count, 1); assert.equal(staff.summary.portal.count, 0);
      await reject(() => run('importPortal', { records: [{ ...a, gst: 'invalid' }] }), 400);
      await reject(() => run('resolve', { rowIds: ['foreign-row'], resolution: 'accepted', note: 'Foreign' }), 400);
      await reject(() => load({ period: f.period, type: 'invented' }), 400);
      await reject(() => load({ period: 'November 2026 trailing' }), 400);
    });
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
