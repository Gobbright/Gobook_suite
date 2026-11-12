import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceCategory, balanceComparisonDate, balanceTrend, calculateBalanceSheet } from '../src/features/categories/automobile/automobileBalanceSheet.js';

const accounts = [
  { name: 'Cash', group: 'Cash-In-Hand', opening: 1000, branch: 'Main' },
  { name: 'Equipment', group: 'Fixed Assets', opening: 500, branch: 'Main' },
  { name: 'Capital', group: 'Capital Account', opening: -1200, branch: 'Main' },
  { name: 'Supplier', group: 'Sundry Creditors', opening: -300, branch: 'Main' },
];
const vouchers = [
  { voucherNo: 'sale', status: 'Posted', branch: 'Main', date: '2026-10-01', lines: [{ ledgerName: 'Cash', ledgerGroup: 'Cash-In-Hand', side: 'debit', amount: 200 }, { ledgerName: 'Sales', ledgerGroup: 'Direct Incomes', side: 'credit', amount: 200 }] },
  { voucherNo: 'rent', status: 'Posted', branch: 'Main', date: '2026-10-02', lines: [{ ledgerName: 'Rent', ledgerGroup: 'Indirect Expenses', side: 'debit', amount: 50 }, { ledgerName: 'Cash', ledgerGroup: 'Cash-In-Hand', side: 'credit', amount: 50 }] },
];
test('assets reconcile to liabilities and equity including unclosed profit', () => {
  const before = structuredClone({ accounts, vouchers });
  const report = calculateBalanceSheet(accounts, vouchers, '2026-10-22');
  assert.deepEqual([report.totals.assets, report.totals.liabilities, report.totals.equity, report.totals.difference], [1650, 300, 1350, 0]);
  assert.equal(report.unclosedProfit, 150); assert.equal(report.totals.workingCapital, 850);
  assert.equal(report.ratios.current, 1150 / 300);
  assert.deepEqual({ accounts, vouchers }, before);
});
test('closing transfers do not count retained profit twice', () => {
  const report = calculateBalanceSheet(accounts, [...vouchers, { status: 'Posted', date: '2026-10-03', branch: 'Main', lines: [{ ledgerName: 'Sales', ledgerGroup: 'Direct Incomes', side: 'debit', amount: 200 }, { ledgerName: 'Rent', ledgerGroup: 'Indirect Expenses', side: 'credit', amount: 50 }, { ledgerName: 'Retained Earnings', ledgerGroup: 'Reserves & Surplus', side: 'credit', amount: 150 }] }], '2026-10-22');
  assert.equal(report.unclosedProfit, 0); assert.equal(report.totals.equity, 1350); assert.equal(report.totals.difference, 0);
});
test('drafts, future dates and other branches are excluded from as-on balances', () => {
  const extra = [{ ...vouchers[0], status: 'Draft' }, { ...vouchers[0], date: '2027-01-01' }, { ...vouchers[0], branch: 'South' }];
  const report = calculateBalanceSheet(accounts, [...vouchers, ...extra], '2026-10-22', 'Main');
  assert.equal(report.totals.assets, 1650); assert.equal(report.unclosedProfit, 150);
});
test('missing classifications and unbalanced vouchers remain visible instead of forcing equity', () => {
  const report = calculateBalanceSheet([...accounts, { name: 'Unmapped', group: 'Miscellaneous', opening: 80 }], [{ status: 'Posted', voucherNo: 'bad', date: '2026-10-01', lines: [{ ledgerName: 'Cash', ledgerGroup: 'Cash-In-Hand', side: 'debit', amount: 25 }] }], '2026-10-22');
  assert.equal(report.unclassified[0].name, 'Unmapped'); assert.equal(report.issues.length, 1);
  assert.equal(report.totals.difference, 25); assert.equal(report.totals.equity, 1200);
});
test('classification separates loans, bank overdrafts, assets and equity', () => {
  for (const [group, expected] of [['Fixed Assets', 'fixedAssets'], ['Bank Accounts', 'currentAssets'], ['Loans & Advances (Asset)', 'currentAssets'], ['Bank Overdraft', 'currentLiabilities'], ['Long-Term Bank Loans', 'longTermLiabilities'], ['Secured Loans', 'longTermLiabilities'], ['Current Liabilities', 'currentLiabilities'], ['Capital Account', 'equity'], ['Direct Incomes', 'profit'], ['Indirect Expenses', 'profit']]) assert.equal(balanceCategory(group), expected);
});
test('zero denominators and negative equity do not create infinite ratios', () => {
  const empty = calculateBalanceSheet([], [], '2026-10-22');
  assert.deepEqual(empty.ratios, { current: null, debtEquity: null, fixedAsset: null, netWorth: null });
  const negative = calculateBalanceSheet([{ name: 'Capital', group: 'Capital Account', opening: 100 }], [], '2026-10-22');
  assert.equal(negative.totals.equity, -100); assert.equal(negative.ratios.debtEquity, null);
});
test('comparison dates handle leap days and financial year boundaries', () => {
  assert.equal(balanceComparisonDate('2024-02-29', 'year', '01 April'), '2023-02-28');
  assert.equal(balanceComparisonDate('2026-10-22', 'fy', '01 April'), '2026-03-31');
  assert.equal(balanceComparisonDate('2026-10-22', 'fy', '01 January'), '2025-12-31');
});
test('monthly chart snapshots use month ends and the selected date', () => {
  const trend = balanceTrend(accounts, vouchers, '2026-10-22');
  assert.deepEqual(trend.map((point) => point.date), ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-22']);
  assert.equal(trend[4].assets, 1500); assert.equal(trend[5].assets, 1650);
  assert.equal(trend[5].assets, trend[5].liabilitiesEquity);
});
