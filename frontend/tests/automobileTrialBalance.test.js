import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTrialBalance, financialPeriod, previousTrialPeriod } from '../src/features/categories/automobile/automobileTrialBalance.js';

const accounts = [{ name: 'Cash', group: 'Cash-In-Hand', opening: 1000, branch: 'Main' }, { name: 'Capital', group: 'Capital Account', opening: -1000, branch: 'Main' }];
const lines = (debit, credit, amount) => [{ ledgerName: debit, side: 'debit', amount }, { ledgerName: credit, side: 'credit', amount }];
const vouchers = [
  { voucherNo: 'before', status: 'Posted', date: '2026-09-30', branch: 'Main', lines: lines('Cash', 'Revenue', 100) },
  { voucherNo: 'during', status: 'Posted', date: '2026-10-02', branch: 'Main', lines: lines('Expense', 'Cash', 40) },
  { voucherNo: 'draft', status: 'Draft', date: '2026-10-05', branch: 'Main', lines: lines('Expense', 'Cash', 999) },
  { voucherNo: 'cancelled', status: 'Cancelled', date: '2026-10-06', branch: 'Main', lines: lines('Expense', 'Cash', 999) },
  { voucherNo: 'after', status: 'Posted', date: '2026-11-01', branch: 'Main', lines: lines('Expense', 'Cash', 400) },
];
const filters = { from: '2026-10-01', to: '2026-10-31', branch: '' };
test('trial balance carries opening movements and excludes drafts, cancellations and later dates', () => {
  const original = structuredClone({ accounts, vouchers });
  const report = calculateTrialBalance(accounts, vouchers, filters);
  const cash = report.rows.find((row) => row.name === 'Cash');
  assert.deepEqual([cash.opening, cash.debit, cash.credit, cash.closing], [1100, 0, 40, 1060]);
  assert.deepEqual([report.debit, report.credit, report.difference, report.posted, report.unposted], [1100, 1100, 0, 1, 1]);
  for (const row of report.rows) assert.equal(row.opening + row.debit - row.credit, row.closing);
  assert.deepEqual({ accounts, vouchers }, original);
});
test('branch reports include only that branch and exclude unassigned opening balances', () => {
  const report = calculateTrialBalance([...accounts, { name: 'Other', opening: 300, branch: 'South' }, { name: 'Unassigned', opening: 400 }], [...vouchers, { voucherNo: 'south', status: 'Posted', date: '2026-10-03', branch: 'South', lines: lines('Expense', 'Other', 50) }], { ...filters, branch: 'Main' });
  assert.equal(report.rows.some((row) => ['Other', 'Unassigned'].includes(row.name)), false);
  assert.equal(report.difference, 0);
  assert.equal(report.posted, 1);
});
test('unbalanced posted vouchers flag affected accounts and preserve the actual imbalance', () => {
  const report = calculateTrialBalance([], [{ voucherNo: 'bad', status: 'Posted', date: '2026-10-03', lines: [{ ledgerName: 'Suspense', side: 'debit', amount: 10000 }] }], filters);
  assert.equal(report.issues.length, 1);
  assert.equal(report.rows[0].issues[0].voucherNo, 'bad');
  assert.equal(report.difference, 10000);
  assert.equal(report.rows[0].code, '');
});
test('financial years follow configured starts including calendar years', () => {
  assert.deepEqual(financialPeriod('2026-03-31'), { year: 2025, from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(financialPeriod('2026-04-01'), { year: 2026, from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(financialPeriod('2026-10-22', '01 January'), { year: 2026, from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(financialPeriod('2026-06-30', '01 July'), { year: 2025, from: '2025-07-01', to: '2026-06-30' });
});
test('comparison uses the immediately preceding period with the same number of days', () => {
  assert.deepEqual(previousTrialPeriod('2026-10-01', '2026-10-31'), { from: '2026-08-31', to: '2026-09-30' });
  assert.equal(previousTrialPeriod('', '2026-10-31'), null);
  assert.equal(previousTrialPeriod('2026-11-01', '2026-10-31'), null);
});
test('empty accounts and fractional currency do not create phantom differences', () => {
  assert.equal(calculateTrialBalance([], [], filters).difference, 0);
  const report = calculateTrialBalance([], [{ status: 'Posted', date: '2026-10-03', lines: [{ ledgerName: 'Debit', side: 'debit', amount: 0.1 }, { ledgerName: 'Debit', side: 'debit', amount: 0.2 }, { ledgerName: 'Credit', side: 'credit', amount: 0.3 }] }], filters);
  assert.deepEqual([report.debit, report.credit, report.issues.length], [0.3, 0.3, 0]);
});
