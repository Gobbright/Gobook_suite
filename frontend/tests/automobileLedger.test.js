import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerClosing, ledgerType, statementPeriod } from '../src/features/categories/automobile/automobileLedger.js';

const filters = { from: '2026-10-01', to: '2026-10-31', search: '' };
const statement = {
  ledger: { opening: -1000 },
  entries: [
    { voucherId: 'later', date: '2026-11-01', debit: 500, credit: 0 },
    { voucherId: 'payment', date: '2026-10-20', debit: 0, credit: 300, particulars: 'Bank payment' },
    { voucherId: 'prior', date: '2026-09-30', debit: 1200, credit: 0 },
    { voucherId: 'purchase', date: '2026-10-02', debit: 600, credit: 0, particulars: 'Purchase of parts' },
  ],
};
test('account categories and closing balances preserve debit and credit signs', () => {
  for (const [group, expected] of [['Sundry Debtors', 'Customers'], ['Sundry Creditors', 'Suppliers'], ['Cash-In-Hand', 'Cash'], ['Bank Accounts', 'Bank'], ['Direct Incomes', 'Income'], ['Direct Expenses', 'Expense'], ['Fixed Assets', 'Assets'], ['Capital Account', 'Liabilities']]) assert.equal(ledgerType({ group }), expected);
  assert.equal(ledgerClosing({ opening: -1000, debit: 200, credit: 50 }), -850);
  assert.equal(ledgerClosing({ opening: 0.1, debit: 0.2 }), 0.3);
});
test('period opening carries earlier transactions and closing excludes later ones', () => {
  const before = structuredClone(statement);
  const period = statementPeriod(statement, filters);
  assert.deepEqual([period.opening, period.debit, period.credit, period.closing, period.transactions], [200, 600, 300, 500, 2]);
  assert.deepEqual(period.rows.map((row) => row.balance), [200, 800, 500]);
  assert.equal(period.opening + period.debit - period.credit, period.closing);
  assert.deepEqual(statement, before);
});
test('search hides rows without changing running balances or period totals', () => {
  const period = statementPeriod(statement, { ...filters, search: 'bank payment' });
  assert.equal(period.rows.length, 1);
  assert.equal(period.rows[0].balance, 500);
  assert.deepEqual([period.opening, period.debit, period.credit, period.closing], [200, 600, 300, 500]);
});
test('periods without transactions retain their carried balance', () => {
  const period = statementPeriod(statement, { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual([period.opening, period.closing, period.debit, period.credit, period.transactions], [1000, 1000, 0, 0, 0]);
  const early = statementPeriod(statement, { from: '2026-08-01', to: '2026-08-31' });
  assert.equal(early.opening, -1000);
  assert.equal(early.closing, -1000);
  assert.equal(early.rows[0].credit, 1000);
});
test('multiple lines from the same voucher remain separate with stable running balances', () => {
  const period = statementPeriod({ ledger: { opening: 0 }, entries: [
    { voucherId: 'v1', lineId: 'line1', date: '2026-10-02', debit: 0.1 },
    { voucherId: 'v1', lineId: 'line2', date: '2026-10-02', debit: 0.2 },
  ] }, filters);
  assert.equal(new Set(period.rows.map((row) => row.key)).size, 2);
  assert.equal(period.closing, 0.3);
});
test('empty statements yield zero totals without synthetic transactions', () => {
  assert.deepEqual(statementPeriod({}, filters), { rows: [], opening: 0, closing: 0, debit: 0, credit: 0, transactions: 0 });
});
