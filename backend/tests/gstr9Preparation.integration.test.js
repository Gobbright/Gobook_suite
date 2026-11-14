import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { seedGstDashboardFixture } from './fixtures/gstDashboardFixture.js';
import { loadAnnual, prepareAnnual } from '../src/services/gstr9Preparation.js';
import { Invoice } from '../src/models/Invoice.js';
import { Gstr9 } from '../src/models/Gstr9.js';
import { Gstr3b } from '../src/models/Gstr3b.js';

test('annual preparation reconciles source records, explicit adjustments and recorded payment evidence', { skip: !process.env.GST_DASHBOARD_TEST_MONGODB_URI }, async t => {
  await mongoose.connect(process.env.GST_DASHBOARD_TEST_MONGODB_URI, { dbName: `gobook_gst_annual_${randomUUID().replaceAll('-', '')}` });
  try {
    const f = await seedGstDashboardFixture(); await Gstr9.init();
    const req = { user: f.actor, query: {} }, fy = '2026-27';
    const load = async (year = fy, user = req.user) => (await loadAnnual({ ...req, user }, year)).result;
    let current = await load();
    const action = (stage, body = {}) => prepareAnnual({ ...req, body: { fy, expectedSourceHash: current.sourceHash, ...body } }, stage);
    const reject = (task, status) => assert.rejects(task, error => { assert.equal(error.statusCode, status, error.message); return true; });
    await t.test('books include staff, net notes and other supplies, without treating legacy filings as live amounts', async () => {
      assert.equal(current.business.name, 'Stored GST Business');
      assert.equal(current.overview.turnover, 8700);
      assert.equal(current.overview.outputTax, 1447);
      assert.equal(current.overview.itcClaimed, 154);
      assert.equal(current.overview.taxPaid, null);
      assert.equal(current.annualDetails.monthly.length, 12);
      assert.equal(current.annualDetails.monthly.find(row => row.period === 'October 2026').status, 'unverified');
      assert.equal(current.annualDetails.monthly.find(row => row.period === 'April 2026').returnTaxable, null);
      assert.equal(current.turnoverBreakdown.reduce((sum, row) => sum + row.value, 0), 8700);
    });
    await t.test('annual corrections, reversals and prior-year disclosures are applied exactly once', async () => {
      const adjustments = [
        { id: 'outward', type: 'outwardIncrease', reference: 'ANNUAL-1', note: 'Unreported annual correction', taxable: 100, cgst: 9, sgst: 9 },
        { id: 'reversal', type: 'itcReversal', reference: 'REV-1', note: 'Annual eligibility review', cgst: 10, sgst: 10 },
        { id: 'prior', type: 'previousIncrease', reference: 'NEXT-FY-1', note: 'Selected FY transaction reported in next FY', taxable: 500, igst: 90 },
        { id: 'paid', type: 'taxPaidCash', reference: 'PORTAL-RECEIPT', note: 'Recorded actual portal tax payment', cgst: 400, sgst: 400 },
      ];
      current = await action('draft', { adjustments });
      assert.equal(current.overview.turnover, 8800);
      assert.equal(current.overview.outputTax, 1465);
      assert.equal(current.overview.itcClaimed, 154);
      assert.equal(current.table7[0].cgst, 10);
      assert.equal(current.overview.taxPaid, 800);
      assert.equal(current.annualDetails.previousRows[0].taxable, 500);
      assert.equal((await load()).overview.turnover, 8800);
      assert.equal(current.workflow.validated, false);
    });
    await t.test('monthly saved ITC deltas and reversals survive annual consolidation without freezing new purchases', async () => {
      const monthly = await Gstr3b.create({ userId: f.owner, gstin: f.gstin, period: f.period, status: 'draft', itcSourceMode: 'adjustments', itcAdjustments: [{ key: 'A(5)', cgst: -10, sgst: 0, igst: 0, cess: 0 }], itcReversed: [{ key: 'B(1)', cgst: 2, sgst: 3, igst: 0, cess: 0 }] });
      let purchase;
      try {
        const result = await load();
        assert.equal(result.overview.itcClaimed, 144);
        assert.equal(result.table7[0].cgst, 12);
        assert.equal(result.table7[0].sgst, 13);
        purchase = await Invoice.collection.insertOne({ userId: f.member, businessId: f.businessId, number: 'ANNUAL-PURCHASE', documentType: 'purchase-entry', lifecycleStatus: 'posted', meta: { date: '2026-11-12' }, items: [{ qty: 1, rate: 100, gstRate: 18 }] });
        assert.equal((await load()).overview.itcClaimed, 162);
      } finally { await Gstr3b.deleteOne({ _id: monthly._id }); if (purchase) await Invoice.deleteOne({ _id: purchase.insertedId }); current = await load(); }
    });
    await t.test('validation and summary persist, source changes revoke readiness, stale writes are rejected', async () => {
      await reject(() => action('summary'), 409);
      current = await action('validate'); assert.equal(current.workflow.validated, true);
      current = await action('summary', { reviewed: true }); assert.equal(current.workflow.summaryGenerated, true); assert.equal(current.workflow.readyToFile, false);
      assert.equal((await load()).workflow.summaryGenerated, true);
      const previousHash = current.sourceHash;
      const record = await Invoice.collection.insertOne({ userId: f.member, businessId: f.businessId, number: 'ANNUAL-FRESH', documentType: 'invoice', lifecycleStatus: 'posted', meta: { date: '2026-11-12' }, items: [{ qty: 1, rate: 50, gstRate: 18 }] });
      try {
        current = await load(); assert.equal(current.overview.turnover, 8850); assert.equal(current.workflow.readyToFile, false); assert.equal(current.workflow.stale, true);
        await reject(() => action('draft', { expectedSourceHash: previousHash }), 409);
      } finally { await Invoice.deleteOne({ _id: record.insertedId }); current = await load(); }
    });
    await t.test('partial scopes and foreign users cannot use owner return snapshots or annual adjustments', async () => {
      const result = await load(fy, { id: String(f.member), businessId: String(f.businessId), accountType: 'member', branch: 'B1' });
      assert.equal(result.overview.turnover, 700);
      assert.equal(result.adjustments.length, 0);
      assert.equal(result.overview.taxPaid, null);
      assert.equal(result.annualDetails.comparison[0].gstr1, null);
    });
    await t.test('e-way bills remain compliance records and do not create duplicate annual turnover', async () => {
      const record = await Invoice.collection.insertOne({ userId: f.owner, businessId: f.businessId, number: 'EWAY-ONLY', documentType: 'e-way-bill', lifecycleStatus: 'posted', meta: { date: '2026-11-12' }, items: [{ qty: 1, rate: 99999, gstRate: 18 }] });
      try { const result = await load(); assert.equal(result.compliance.eWayBills.length, 1); assert.equal(result.overview.turnover, 8800); assert.equal(result.overview.outputTax, 1465); }
      finally { await Invoice.deleteOne({ _id: record.insertedId }); }
    });
    await t.test('invalid amounts, reversal overflow, incomplete years and synthetic filing are blocked', async () => {
      current = await load();
      await reject(() => action('draft', { adjustments: [{ type: 'itcReversal', reference: 'X', note: 'X', cgst: -1 }] }), 400);
      await reject(() => action('draft', { adjustments: [{ type: 'taxPaidCash', reference: 'X', note: 'X', taxable: 100 }] }), 400);
      await reject(() => action('filed', { arn: 'AA1234567890123', filedAt: '2026-11-10', confirmed: true }), 409);
      current = await action('draft', { adjustments: [{ type: 'itcReversal', reference: 'OVER', note: 'Too much', cgst: 9999 }] });
      await reject(() => action('validate'), 400);
      await reject(() => load('2026-29'), 400);
      current = await action('draft', { adjustments: [] });
      assert.equal(current.overview.taxPaid, null);
    });
    await t.test('closed-year external acknowledgements freeze the reviewed annual snapshot', async () => {
      const older = await Invoice.collection.insertOne({ userId: f.owner, businessId: f.businessId, number: 'CLOSED-YEAR', documentType: 'invoice', lifecycleStatus: 'posted', meta: { date: '2025-11-12' }, items: [{ qty: 1, rate: 100, gstRate: 18 }] });
      let previous = await load('2025-26');
      const run = async (stage, extra = {}) => { previous = await prepareAnnual({ ...req, body: { fy: '2025-26', expectedSourceHash: previous.sourceHash, ...extra } }, stage); return previous; };
      await run('draft'); await run('validate'); await run('summary', { reviewed: true });
      await run('filed', { arn: 'AA1234567890123', filedAt: '2026-11-10', confirmed: true });
      assert.equal(previous.status, 'filed'); assert.equal(previous.filing.verification, 'not-portal-verified');
      await Invoice.updateOne({ _id: older.insertedId }, { $set: { 'items.0.rate': 500 } });
      const frozen = await load('2025-26'); assert.equal(frozen.overview.turnover, 100); assert.equal(frozen.workflow.filed, true);
      await reject(() => run('draft'), 409);
      assert.equal(await Gstr3b.countDocuments({ userId: f.owner, period: 'November 2025' }), 0);
    });
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
