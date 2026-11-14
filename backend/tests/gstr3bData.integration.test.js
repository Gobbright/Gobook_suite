import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { seedGstDashboardFixture } from './fixtures/gstDashboardFixture.js';
import { getGstr3b, saveGstr3b, fileGstr3b, postGstr3bAccountingAdjustment } from '../src/modules/retail/gst/gstr3bController.js';
import { Invoice } from '../src/models/Invoice.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Gstr3b } from '../src/models/Gstr3b.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { GstReconciliation } from '../src/models/GstReconciliation.js';
import { getGstDashboard } from '../src/modules/retail/gst/dashboardController.js';
const total = (rows, field) => rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
test('GSTR-3B uses live business records and saved adjustments without sample data', { skip: !process.env.GST_DASHBOARD_TEST_MONGODB_URI }, async t => {
  await mongoose.connect(process.env.GST_DASHBOARD_TEST_MONGODB_URI, { dbName: `gobook_gst_3b_${randomUUID().replaceAll('-', '')}` });
  try {
    const f = await seedGstDashboardFixture();
    async function run(handler = getGstr3b, body = {}, user = f.actor, period = f.period) {
      let result;
      const res = { json(value) { result = value; }, status() { return this; } };
      await handler({ method: handler === getGstr3b ? 'GET' : 'PUT', user, query: { period }, body: { period, ...body } }, res, error => { throw error; });
      return result;
    }
    const reject = (task, code) => assert.rejects(task, error => { assert.equal(error.statusCode, code, error.message); return true; });
    let current;
    await t.test('owner totals include staff, net notes, zero-rated lines and bill-of-supply values', async () => {
      current = await run();
      assert.equal(current.business.name, 'Stored GST Business');
      assert.equal(current.gstin, f.gstin);
      assert.equal(current.invoiceCount, 4);
      assert.equal(current.purchaseCount, 2);
      assert.equal(total(current.outwardRows, 'taxable'), 1700);
      assert.equal(current.outwardRows.find(row => row.key === 'a').taxable, 1400);
      assert.equal(current.outwardRows.find(row => row.key === 'c').taxable, 100);
      assert.equal(current.outwardRows.find(row => row.key === 'e').taxable, 200);
      assert.equal(total(current.outwardRows, 'cgst') + total(current.outwardRows, 'sgst'), 187);
      assert.equal(total(current.itcAvailable, 'cgst') + total(current.itcAvailable, 'sgst'), 154);
      assert.deepEqual(current.ledgerBalances, { cash: null, credit: null, source: 'not-connected' });
      assert.equal(current.sources.itc, 'purchase entries');
      assert.ok(current.sourceHash);
      assert.equal(current.gstr2b.totalItc, 144);
      assert.equal(current.gstr2b.invoiceCount, 1);
      assert.equal(current.gstr2b.taxHeadBreakupAvailable, false);
      assert.equal(current.capabilities.portalPayment, false);
    });
    await t.test('statement comparison excludes foreign purchases and duplicate statement lines', async () => {
      await GstReconciliation.updateOne({ userId: f.owner, period: f.period }, { $push: { entries: { $each: [
        { invoiceNo: 'FOREIGN', gstin: '33AAAAA1111A1Z5', itcGstr2b: 90000, statementRecorded: true },
        { invoiceNo: 'BILL-SAME', gstin: '33AAAAA1111A1Z5', itcGstr2b: 144, statementRecorded: true },
      ] } } });
      const result = await run();
      assert.equal(result.gstr2b.totalItc, 144);
      assert.equal(result.gstr2b.invoiceCount, 1);
      assert.equal(total(result.itcAvailable, 'cgst'), 77);
    });
    await t.test('inward zero-GST values and inter-state breakdown come from permitted source records', async () => {
      const ids = await Invoice.collection.insertMany([
        { userId: f.owner, businessId: f.businessId, number: 'ZERO-PURCHASE', documentType: 'purchase-entry', lifecycleStatus: 'posted', meta: { date: '2026-11-10' }, supplyType: 'interstate', items: [{ qty: 2, rate: 120, gstRate: 0 }], charges: [{ amount: 30, gstRate: 0 }] },
        { userId: f.owner, businessId: f.businessId, number: 'INTER-SALE', documentType: 'invoice', lifecycleStatus: 'posted', meta: { date: '2026-11-10' }, supplyType: 'interstate', customer: { name: 'Unregistered', state: 'Kerala' }, items: [{ qty: 1, rate: 100, gstRate: 18 }] },
      ]);
      try {
        const result = await run();
        assert.deepEqual(result.untaxedInward, { interstate: 270, intrastate: 0 });
        assert.equal(result.interstateSupplies.length, 1);
        assert.equal(result.interstateSupplies[0].label, 'Kerala');
        assert.equal(result.interstateSupplies[0].taxable, 100);
        assert.equal(result.interstateSupplies[0].igst, 18);
      } finally { await Invoice.deleteMany({ _id: { $in: Object.values(ids.insertedIds) } }); }
    });
    await t.test('staff source scope excludes owner and foreign invoices but resolves owner GST settings', async () => {
      const user = { id: String(f.member), businessId: String(f.businessId), accountType: 'member', branch: 'B1' };
      const result = await run(getGstr3b, {}, user);
      assert.equal(result.business.name, 'Stored GST Business');
      assert.equal(result.gstin, f.gstin);
      assert.equal(result.invoiceCount, 2);
      assert.equal(result.purchaseCount, 1);
      assert.equal(total(result.outwardRows, 'taxable'), 700);
      assert.equal(total(result.itcAvailable, 'cgst'), 5);
      assert.equal(result.gstr2b.recorded, false);
    });
    await t.test('saving ITC adjustments and fees cannot replace trusted source sales', async () => {
      const edits = structuredClone(current.itcAvailable);
      edits.find(row => row.key === 'A(5)').cgst = 67;
      current = await run(saveGstr3b, { expectedSourceHash: current.sourceHash, outwardRows: [{ key: 'a', taxable: 999999 }], itcAvailable: edits, lateFeeCgst: 12 });
      assert.equal(total(current.outwardRows, 'taxable'), 1700);
      assert.equal(total(current.itcAvailable, 'cgst'), 67);
      assert.equal(current.lateFeeCgst, 12);
      assert.equal(current.sources.itc, 'purchase entries + saved adjustments');
      assert.equal((await run()).lateFeeCgst, 12);
    });
    await t.test('new purchases update saved ITC while retaining explicit manual adjustments', async () => {
      const oldHash = current.sourceHash;
      await Invoice.collection.insertOne({ userId: f.member, businessId: f.businessId, number: 'NEW-PURCHASE', branch: 'B1', documentType: 'purchase-entry', lifecycleStatus: 'posted', meta: { date: '2026-11-10' }, customer: { name: 'Recorded vendor' }, items: [{ qty: 1, rate: 100, gstRate: 18 }] });
      current = await run();
      assert.equal(current.purchaseCount, 3);
      assert.equal(total(current.itcAvailable, 'cgst'), 76);
      assert.equal(total(current.itcAvailable, 'sgst'), 86);
      assert.notEqual(current.sourceHash, oldHash);
      const dashboard = await run(getGstDashboard);
      assert.equal(dashboard.stats.itcAvailable, 162);
      await reject(() => run(saveGstr3b, { expectedSourceHash: oldHash, itcAvailable: current.itcAvailable }), 409);
      await Invoice.updateOne({ number: 'NEW-PURCHASE', userId: f.member }, { $set: { lifecycleStatus: 'cancelled' } });
      assert.equal(total((await run()).itcAvailable, 'cgst'), 67);
    });
    await t.test('invalid edits, direct filing and invalid periods cannot create invented records', async () => {
      await reject(() => run(saveGstr3b, { itcAvailable: [{ key: 'A(5)', cgst: -1 }] }), 400);
      await reject(() => run(saveGstr3b, { lateFeeCgst: -1 }), 400);
      await reject(() => run(saveGstr3b, { itcAvailable: [{ key: 'fake', cgst: 100 }] }), 400);
      await reject(() => run(saveGstr3b, { status: 'filed', arn: 'FAKE' }), 400);
      await reject(() => run(fileGstr3b), 503);
      await reject(() => run(getGstr3b, {}, f.actor, 'November 2026 trailing'), 400);
    });
    await t.test('legacy synthetic filing is unverified and does not replace live source figures', async () => {
      const result = await run(getGstr3b, {}, f.actor, 'October 2026');
      assert.equal(result.status, 'draft');
      assert.equal(result.legacyFiling.status, 'unverified');
      assert.equal(result.arn, undefined);
      assert.equal(total(result.outwardRows, 'taxable'), 7000);
      assert.equal(total(result.outwardRows, 'cgst'), 630);
    });
    await t.test('accounting posts the current actor return and real totals even when another actor shares the GSTIN', async check => {
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      if (!hello.setName) { check.skip('Accounting posting requires a MongoDB replica set.'); return; }
      await Gstr3b.create({ userId: f.foreign, gstin: f.gstin, period: f.period, outwardRows: [{ key: 'a', taxable: 900000, cgst: 9000, sgst: 9000 }] });
      const posted = await run(postGstr3bAccountingAdjustment);
      assert.equal(String(posted.record.userId), String(f.owner));
      assert.equal(posted.payment.outputTotal, 187);
      assert.equal(posted.payment.bankPaymentTotal, 55);
      assert.equal(posted.voucher.status, 'Posted');
      assert.equal(posted.record.accountingVoucherNo, posted.voucher.voucherNo);
      assert.equal((await Gstr3b.findOne({ userId: f.foreign, period: f.period }).lean()).outwardRows[0].taxable, 900000);
      const repeated = await run(postGstr3bAccountingAdjustment);
      assert.equal(String(repeated.voucher._id), String(posted.voucher._id));
      assert.equal(repeated.voucher.voucherNo, posted.voucher.voucherNo);
      assert.equal(await AccountingVoucher.countDocuments({ userId: f.owner, sourceType: 'gst-adjustment' }), 1);
    });
    await t.test('accounting references only display an existing posted voucher owned by this actor', async () => {
      const foreignVoucher = new mongoose.Types.ObjectId();
      await AccountingVoucher.collection.insertOne({ _id: foreignVoucher, userId: f.foreign, status: 'Posted', voucherNo: 'FOREIGN-VOUCHER' });
      await Gstr3b.updateOne({ userId: f.owner, gstin: f.gstin, period: f.period }, { $set: { accountingVoucherId: foreignVoucher, accountingVoucherNo: 'FOREIGN-VOUCHER' } });
      assert.equal((await run()).accountingVoucherNo, '');
      const owned = new mongoose.Types.ObjectId();
      await AccountingVoucher.collection.insertOne({ _id: owned, userId: f.owner, businessId: f.businessId, status: 'Posted', voucherNo: 'REAL-POSTED-VOUCHER' });
      await Gstr3b.updateOne({ userId: f.owner, gstin: f.gstin, period: f.period }, { $set: { accountingVoucherId: owned } });
      assert.equal((await run()).accountingVoucherNo, 'REAL-POSTED-VOUCHER');
    });
    await t.test('empty months use zero totals and missing setup never supplies a sample GSTIN', async () => {
      const empty = await run(getGstr3b, {}, f.actor, 'April 2026');
      assert.equal(empty.invoiceCount, 0);
      assert.equal(empty.purchaseCount, 0);
      assert.equal(total(empty.outwardRows, 'taxable'), 0);
      await BusinessSettings.updateOne({ userId: f.owner }, { $unset: { gstin: '' } });
      assert.equal((await run()).gstin, '');
      await BusinessSettings.updateOne({ userId: f.owner }, { $set: { gstin: '27ZZZZZ9999A1Z5' } });
      assert.equal((await run()).gstin, '');
    });
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
