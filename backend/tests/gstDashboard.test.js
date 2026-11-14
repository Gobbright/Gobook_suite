import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/modules/retail/gst/dashboardController.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');

function dashboard({ filed = false, empty = false } = {}) {
  const queryLog = [];
  const rows = empty ? [] : [{ taxable: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0 }];
  const saved = filed ? [{ userId: 'owner-1', period: 'October 2026', status: 'filed', filing: { source: 'manual' }, outwardRows: rows, itcAvailable: [{ cgst: 25, sgst: 25 }], updatedAt: '2026-10-22T10:00:00Z' }] : [];
  const context = {
    Gstr1: { find: (query) => { queryLog.push(query); return { lean: async () => saved }; } },
    Gstr3b: { find: (query) => { queryLog.push(query); return { lean: async () => saved }; } },
    GstReconciliation: { find: (query) => { queryLog.push(query); return { lean: async () => empty ? [] : [{ entries: [{ invoiceNo: 'P1', itcGstr2b: 50 }] }] }; } },
    gstDashboardContext: async () => ({ business: { name: 'Stored Business' }, gstin: 'GSTIN-TEST', owners: ['owner-1'], invoiceScope: { userId: 'owner-1' }, branch: '' }),
    Invoice: { find: () => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [] }) },
    ACTIVE_FINANCIAL_FILTER: {},
    gstInvoicePeriodMatch: () => ({}),
    parsePeriod: (period) => {
      const match = /^([A-Za-z]+) (\d{4})$/.exec(period);
      if (!match) return null;
      const monthIdx = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(match[1]);
      return monthIdx < 0 ? null : { year: Number(match[2]), monthIdx };
    },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    buildGstr3bFromSales: async () => ({ outwardRows: rows, itcAvailable: empty ? [] : [{ cgst: 25, sgst: 25 }], invoiceCount: empty ? 0 : 3, b2bInvoiceCount: empty ? 0 : 1, b2cInvoiceCount: empty ? 0 : 2 }),
    mergeDraftGstr3b: (savedRecord, generated) => savedRecord || generated,
    taxTotal: (taxRows = []) => taxRows.reduce((sum, row) => sum + ['cgst', 'sgst', 'igst', 'cess'].reduce((tax, key) => tax + (row[key] || 0), 0), 0),
    buildPurchaseReconciliationFromSales: async () => ({ entries: empty ? [] : [{ invoiceNo: 'P1', invoiceValue: 550, itcBooks: 50 }, { invoiceNo: 'P2', invoiceValue: 220, itcBooks: 20 }] }),
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { run: context.getGstDashboard, queryLog };
}

test('GST dashboard derives tax breakup and purchase totals and matches saved ITC by invoice', async () => {
  const { run, queryLog } = dashboard();
  let result; let failure;
  await run({ user: { id: 'owner-1' }, query: { period: 'October 2026' } }, { json: (value) => { result = value; } }, (err) => { failure = err; });
  assert.equal(failure, undefined);
  assert.equal(result.currentPeriod, 'October 2026');
  assert.equal(result.stats.outputTax, 180);
  assert.equal(result.stats.netTaxPayable, 130);
  assert.equal(result.overview.salesTaxable, 1000);
  assert.equal(result.overview.purchaseTaxable, 700);
  assert.equal(result.overview.taxBreakup.find((row) => row.key === 'cgst').value, 90);
  assert.equal(result.overview.reconciliation.exceptions, 1);
  assert.equal(result.monthlyTrend.length, 7);
  assert.equal(result.monthlyTrend[0].period, 'April 2026');
  assert.equal(result.monthlyTrend[0].cgst, 90);
  assert.equal(result.monthlyTrend[0].sgst, 90);
  assert.equal(result.monthlyTrend[0].igst, 0);
  assert.equal(result.overview.invoiceCount, 3);
  assert.equal(result.overview.b2bInvoiceCount, 1);
  assert.equal(result.overview.b2cInvoiceCount, 2);
  assert.ok(queryLog.every((query) => query.userId.$in.includes('owner-1') && query.gstin === 'GSTIN-TEST'));
});

test('GST dashboard retains filed states and recent saved activity', async () => {
  const { run } = dashboard({ filed: true });
  let result;
  await run({ user: { id: 'owner-1' }, query: { period: 'October 2026' } }, { json: (value) => { result = value; } }, (err) => { throw err; });
  assert.ok(result.filingCalendar.filter((row) => row.period === 'October 2026').every((row) => row.status === 'filed'));
  assert.equal(result.overview.activity.length, 2);
  assert.equal(result.overview.activity[0].status, 'filed');
});

test('empty records return zero totals and unreviewed reconciliation', async () => {
  const { run } = dashboard({ empty: true });
  let result;
  await run({ user: { id: 'owner-1' }, query: { period: 'October 2026' } }, { json: (value) => { result = value; } }, (err) => { throw err; });
  assert.equal(result.stats.outputTax, 0);
  assert.equal(result.overview.purchaseTaxable, 0);
  assert.equal(result.overview.reconciliation.reviewed, false);
  assert.equal(result.overview.reconciliation.exceptions, 0);
  assert.equal(result.overview.activity.length, 0);
});

test('invalid period is rejected before database access', async () => {
  const { run, queryLog } = dashboard();
  let failure;
  await run({ user: { id: 'owner-1' }, query: { period: 'invalid' } }, { json: () => assert.fail('Unexpected response') }, (err) => { failure = err; });
  assert.equal(failure.status, 400);
  assert.equal(queryLog.length, 0);
});

test('dashboard charts stay within the selected April-to-March financial year', async () => {
  for (const [period, first, count] of [['April 2026', 'April 2026', 1], ['March 2027', 'April 2026', 12], ['January 2027', 'April 2026', 10]]) {
    const { run } = dashboard();
    let result;
    await run({ user: { id: 'owner-1' }, query: { period } }, { json: value => { result = value; } }, error => { throw error; });
    assert.equal(result.monthlyTrend.length, count, period);
    assert.equal(result.monthlyTrend[0].period, first);
    assert.equal(result.monthlyTrend.at(-1).period, period);
  }
});
