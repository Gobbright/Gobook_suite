import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_GROUPS, filterReportDirectory, reportInGroup, reportTrend } from '../src/features/categories/automobile/automobileReports.js';

const reports = [{ name: 'Invoice Reports', description: 'Billing documents', category: 'Sales', downloadKey: 'invoice:invoice' }, { name: 'Vendor Reports', category: 'Purchase', downloadKey: 'vendors' }, { name: 'Payroll Reports', category: 'HR', downloadKey: 'payroll' }, { name: 'Stock In Reports', category: 'Inventory', downloadKey: 'stockIn' }];
test('report groups classify actual catalogue entries without claiming supplier records are purchases', () => {
  const keys = REPORT_GROUPS.map(([key]) => key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of ['sales', 'purchase', 'inventory', 'accounting', 'supplier', 'customer', 'gst', 'employee']) assert.ok(keys.includes(key));
  assert.equal(reportInGroup(reports[0], 'sales'), true);
  assert.equal(reportInGroup(reports[1], 'supplier'), true); assert.equal(reportInGroup(reports[1], 'purchase'), false);
  assert.equal(reportInGroup(reports[2], 'employee'), true); assert.equal(reportInGroup(reports[3], 'movement'), true);
});
test('report search, category and favourites compose against download keys', () => {
  assert.equal(filterReportDirectory(reports, { category: 'sales', search: 'BILLING', tab: 'favourites' }, ['invoice:invoice']).length, 1);
  assert.equal(filterReportDirectory(reports, { tab: 'favourites' }, ['not-accessible']).length, 0);
});
test('planned and recent views never fabricate reports missing from the accessible catalogue', () => {
  assert.deepEqual(filterReportDirectory(reports, { tab: 'scheduled' }, [], [{ key: 'payroll' }, { key: 'deleted-report' }]).map((row) => row.downloadKey), ['payroll']);
  assert.deepEqual(filterReportDirectory(reports, { tab: 'recent' }, [], [], { stockIn: '2026-10-24T10:00:00Z', removed: '2026-10-24T10:00:00Z' }).map((row) => row.downloadKey), ['stockIn']);
});
test('weekly trend preserves actual monthly sales and purchase totals including the partial final week', () => {
  const daily = Array.from({ length: 10 }, (_, index) => ({ label: String(index), sales: index + 1, purchases: 2 }));
  const trend = reportTrend({ daily }, 'Weekly');
  assert.equal(trend.length, 2); assert.equal(trend[0].sales, 28); assert.equal(trend[1].sales, 27);
  assert.equal(trend.reduce((sum, row) => sum + row.purchases, 0), 20);
  assert.equal(reportTrend({ daily }, 'Daily'), daily);
});
