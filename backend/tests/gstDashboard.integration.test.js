import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { getGstDashboard } from '../src/modules/retail/gst/dashboardController.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { seedGstDashboardFixture } from './fixtures/gstDashboardFixture.js';

test('GST dashboard uses stored invoices, settings, returns and statements with business isolation', { skip: !process.env.GST_DASHBOARD_TEST_MONGODB_URI }, async t => {
  const dbName = `gobook_gst_dashboard_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.GST_DASHBOARD_TEST_MONGODB_URI, { dbName });
  try {
    const fixture = await seedGstDashboardFixture();
    async function run(query = {}, user = fixture.actor) {
      let result;
      await getGstDashboard({ user, query: { period: fixture.period, ...query } }, { json: value => { result = value; } }, error => { throw error; });
      return result;
    }
    await t.test('live tax totals include business staff invoices and exclude foreign, draft and cancelled invoices', async () => {
      const result = await run();
      assert.equal(result.business.name, 'Stored GST Business');
      assert.equal(result.gstin, fixture.gstin);
      assert.equal(result.stats.outputTax, 187);
      assert.equal(result.stats.itcAvailable, 154);
      assert.equal(result.stats.netTaxPayable, 33);
      assert.equal(result.overview.salesTaxable, 1700);
      assert.equal(result.overview.invoiceCount, 4);
      assert.equal(result.overview.b2bInvoiceCount, 1);
      assert.equal(result.overview.b2cInvoiceCount, 3);
      assert.equal(result.overview.purchaseTaxable, 1000);
      assert.equal(result.overview.taxBreakup.reduce((sum, row) => sum + row.value, 0), result.stats.outputTax);
    });
    await t.test('filings and activity come from saved records without an invented annual return', async () => {
      const result = await run();
      assert.equal(result.filingCalendar.length, 2);
      assert.equal(result.filingCalendar.find(row => row.return === 'GSTR-1').status, 'draft');
      assert.equal(result.filingCalendar.find(row => row.return === 'GSTR-3B').status, 'not-started');
      assert.ok(result.overview.activity.some(row => row.label.includes('GST-SALE-1')));
      assert.ok(result.overview.activity.every(row => !row.label.includes('FOREIGN')));
      assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
    });
    await t.test('a statement for one supplier does not reconcile another supplier sharing the bill number', async () => {
      const result = await run();
      assert.equal(result.overview.reconciliation.purchases, 2);
      assert.equal(result.overview.reconciliation.exceptions, 1);
      assert.ok(result.actions.find(row => row.key === 'reconcile').label.startsWith('1 purchase invoice'));
    });
    await t.test('filed monthly snapshots retain real cess while current totals use current invoices', async () => {
      const result = await run();
      const october = result.monthlyTrend.find(row => row.period === 'October 2026');
      assert.equal(october.output, 103);
      assert.equal(october.itc, 11);
      assert.equal(october.cess, 3);
      assert.equal(result.monthlyTrend.at(-1).output, result.stats.outputTax);
    });
    await t.test('staff see their permitted records and owner branch filters cannot use whole-business snapshots', async () => {
      const staff = { id: String(fixture.member), businessId: String(fixture.businessId), accountType: 'member', branch: 'B1' };
      const result = await run({}, staff);
      assert.equal(result.business.name, 'Stored GST Business');
      assert.equal(result.stats.outputTax, 25);
      assert.equal(result.stats.itcAvailable, 10);
      assert.equal(result.overview.invoiceCount, 2);
      const empty = await run({ branch: 'NO-SUCH-BRANCH' });
      assert.equal(empty.stats.outputTax, 0);
      assert.equal(empty.stats.itcAvailable, 0);
      assert.ok(empty.monthlyTrend.every(row => row.output === 0));
    });
    await t.test('missing GST setup does not display a sample GSTIN', async () => {
      await BusinessSettings.updateOne({ userId: fixture.owner }, { $set: { gstin: '' } });
      const result = await run();
      assert.equal(result.gstin, '');
      assert.equal(result.stats.outputTax, 187);
      assert.ok(result.actions.some(row => row.key === 'gstin'));
      assert.ok(result.filingCalendar.every(row => row.status === 'not-started'));
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
