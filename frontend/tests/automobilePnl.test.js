import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePnl, pnlCategory, pnlChange, pnlComparison } from '../src/features/categories/automobile/automobilePnl.js';

const filters = { from: '2026-04-01', to: '2027-03-31', branch: '' };
const line = (ledgerName, ledgerGroup, side, amount) => ({ ledgerName, ledgerGroup, side, amount });
const voucher = (voucherNo, lines, overrides = {}) => ({ voucherNo, status: 'Posted', branch: 'Main', date: '2026-10-22', lines, ...overrides });
const vouchers = [
  voucher('sale', [line('Sales', 'Direct Incomes', 'credit', 1000), line('Output GST', 'Duties & Taxes', 'credit', 180), line('Customer', 'Sundry Debtors', 'debit', 1180)]),
  voucher('sales-return', [line('Sales Returns', 'Direct Incomes', 'debit', 100)]),
  voucher('purchase', [line('Purchases', 'Direct Expenses', 'debit', 600)]),
  voucher('purchase-return', [line('Purchase Returns', 'Direct Expenses', 'credit', 50)]),
  voucher('rent', [line('Rent', 'Indirect Expenses', 'debit', 200)]),
  voucher('interest', [line('Interest Income', 'Indirect Incomes', 'credit', 30)]),
];
test('P&L calculates revenue net of returns, direct costs, operating expenses and margins', () => {
  const original = structuredClone(vouchers);
  const report = calculatePnl([], vouchers, filters);
  assert.deepEqual(report.totals, { revenue: 900, directCosts: 550, expenses: 200, otherIncome: 30, grossProfit: 350, netProfit: 180, grossMargin: 350 / 900 * 100, netMargin: 20 });
  assert.equal(report.posted, 6); assert.equal(report.unclassified.length, 0);
  assert.deepEqual(vouchers, original);
});
test('draft, cancelled, out-of-period and other-branch vouchers do not affect branch profit', () => {
  const excluded = [voucher('draft', [line('Sales', 'Direct Incomes', 'credit', 99999)], { status: 'Draft' }), voucher('cancelled', [line('Sales', 'Direct Incomes', 'credit', 99999)], { status: 'Cancelled' }), voucher('old', [line('Sales', 'Direct Incomes', 'credit', 99999)], { date: '2025-04-01' }), voucher('south', [line('Sales', 'Direct Incomes', 'credit', 99999)], { branch: 'South' })];
  const report = calculatePnl([], [...vouchers, ...excluded], { ...filters, branch: 'Main' });
  assert.equal(report.totals.netProfit, 180); assert.equal(report.branches.length, 1);
});
test('account master groups control classification and unknown groups are reported for review', () => {
  const report = calculatePnl([{ name: 'Income', group: 'Other Income', opening: 999999 }], [voucher('test', [line('Income', 'Direct Incomes', 'credit', 25), line('Unknown', 'Miscellaneous', 'debit', 10)])], filters);
  assert.equal(report.totals.revenue, 0); assert.equal(report.totals.otherIncome, 25);
  assert.deepEqual(report.unclassified, ['Unknown']); assert.equal(report.totals.netProfit, 25);
  assert.equal(pnlCategory('COGS'), 'directCosts');
  assert.equal(pnlCategory('Bank Accounts'), '');
});
test('branch and trend totals reconcile and quarterly values aggregate monthly values', () => {
  const records = [...vouchers, voucher('south', [line('Sales', 'Direct Incomes', 'credit', 200)], { branch: 'South', date: '2026-07-02' })];
  const monthly = calculatePnl([], records, filters); const quarterly = calculatePnl([], records, filters, 'quarterly');
  assert.equal(monthly.trend.length, 12); assert.equal(quarterly.trend.length, 4);
  assert.equal(monthly.trend.reduce((sum, point) => sum + point.netProfit, 0), monthly.totals.netProfit);
  assert.equal(quarterly.trend.reduce((sum, point) => sum + point.revenue, 0), monthly.totals.revenue);
  assert.equal(monthly.branches.reduce((sum, branch) => sum + branch.netProfit, 0), monthly.totals.netProfit);
  assert.equal(monthly.branches[0].name, 'South');
});
test('losses retain their signs and margins remain unavailable without positive revenue', () => {
  const report = calculatePnl([], [voucher('expense', [line('Rent', 'Indirect Expenses', 'debit', 500)])], filters);
  assert.equal(report.totals.netProfit, -500); assert.equal(report.totals.netMargin, null);
  assert.equal(report.trend.find((point) => point.key === '2026-10').netProfit, -500);
});
test('comparison dates handle leap years and an equal preceding period', () => {
  assert.deepEqual(pnlComparison('2024-02-01', '2024-02-29', 'year'), { from: '2023-02-01', to: '2023-02-28' });
  assert.deepEqual(pnlComparison('2026-10-01', '2026-10-31', 'period'), { from: '2026-08-31', to: '2026-09-30' });
  assert.equal(pnlChange(100, 0), null); assert.equal(pnlChange(-50, -100), 50);
});
test('fractional amounts and empty reports preserve exact currency totals', () => {
  const report = calculatePnl([], [voucher('fractions', [line('Sales', 'Direct Incomes', 'credit', 0.1), line('Sales', 'Direct Incomes', 'credit', 0.2)])], filters);
  assert.equal(report.totals.netProfit, 0.3);
  const empty = calculatePnl([], [], filters);
  assert.equal(empty.totals.netProfit, 0); assert.equal(empty.totals.netMargin, null); assert.equal(empty.branches.length, 0);
});
