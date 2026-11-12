import assert from 'node:assert/strict';
import test from 'node:test';
import { bankBookSources, calculateBankBook, isBankAccount } from '../src/features/categories/automobile/automobileBankBook.js';

const accounts = [{ name: 'SBI', group: 'Bank Accounts', opening: 1000, branch: 'Main' }, { name: 'HDFC', group: 'Bank Accounts', opening: 2000, branch: 'Main' }];
const line = (ledgerName, ledgerGroup, side, amount) => ({ ledgerName, ledgerGroup, side, amount });
const voucher = (id, date, lines, extra = {}) => ({ _id: id, voucherNo: id, status: 'Posted', date, branch: 'Main', voucherType: 'Receipt', lines, ...extra });
const filters = { from: '2026-10-01', to: '2026-10-31', branch: '' };
const receipt = voucher('receipt', '2026-10-02', [line('SBI', 'Bank Accounts', 'debit', 500), line('Customer', 'Sundry Debtors', 'credit', 500)]);
const payment = voucher('payment', '2026-10-03', [line('SBI', 'Bank Accounts', 'credit', 100), line('Rent', 'Indirect Expenses', 'debit', 100)], { voucherType: 'Payment' });
const transfer = voucher('transfer', '2026-10-04', [line('SBI', 'Bank Accounts', 'credit', 200), line('HDFC', 'Bank Accounts', 'debit', 200)], { voucherType: 'Contra' });
test('selected bank balances separate transfers from normal receipts and payments', () => {
  const sources = bankBookSources(accounts, [receipt, payment, transfer], []);
  const sbi = calculateBankBook(accounts, sources.events, 'SBI', filters);
  assert.deepEqual([sbi.opening, sbi.receipts, sbi.payments, sbi.transfers, sbi.closing], [1000, 500, 100, -200, 1200]);
  const hdfc = calculateBankBook(accounts, sources.events, 'HDFC', filters);
  assert.equal(hdfc.transfers, 200); assert.equal(hdfc.closing, 2200);
  assert.equal(sbi.opening + sbi.receipts - sbi.payments + sbi.transfers + sbi.adjustments, sbi.closing);
});
test('historical duplicates preserve saved reconciliation without double-counting amounts', () => {
  const legacy = [{ _id: 'old', bank: 'SBI', vchNo: 'receipt', date: '2026-10-02', vchType: 'Deposit', deposit: 500, reconciled: true }];
  const sources = bankBookSources(accounts, [receipt, payment], legacy);
  const report = calculateBankBook(accounts, sources.events, 'SBI', filters);
  assert.equal(report.rows.length, 2); assert.equal(report.rows[0].reconciled, true);
  assert.equal(report.rows[1].reconciled, false); assert.equal(report.untracked, 0); assert.equal(report.uncleared, 100);
});

test('manual bank vouchers carry per-bank reconciliation without changing their financial movement', () => {
  const posted = { ...transfer, bankReconciliations: [{ bank: 'SBI', reconciled: true, bankDate: '2026-10-05' }] };
  const sources = bankBookSources(accounts, [posted], []);
  assert.equal(sources.events.find((row) => row.bank === 'SBI').reconciled, true);
  assert.equal(sources.events.find((row) => row.bank === 'HDFC').reconciled, false);
  assert.equal(calculateBankBook(accounts, sources.events, 'SBI', filters).closing, 800);
  assert.equal(calculateBankBook(accounts, sources.events, 'HDFC', filters).closing, 2200);
});
test('source identity deduplicates renamed voucher numbers within the same bank only', () => {
  const posted = { ...receipt, sourceType: 'payment', sourceId: 'source' };
  const legacy = [{ _id: 'duplicate', bank: 'SBI', vchNo: 'old-number', date: '2026-10-02', sourceType: 'payment', sourceId: 'source', deposit: 500, reconciled: false }, { _id: 'other-bank', bank: 'HDFC', vchNo: 'old-number-2', date: '2026-10-02', sourceType: 'payment', sourceId: 'source', deposit: 50 }];
  const sources = bankBookSources(accounts, [posted], legacy);
  assert.equal(sources.events.length, 2);
  assert.equal(calculateBankBook(accounts, sources.events, 'SBI', filters).uncleared, 500);
  assert.equal(calculateBankBook(accounts, sources.events, 'HDFC', filters).receipts, 50);
});
test('opening and closing snapshots adjust balances explicitly and in chronological order', () => {
  const legacy = [{ _id: 'ob', bank: 'SBI', vchNo: 'ob', vchType: 'OB', date: '2026-10-01', branch: 'Main', balance: 800 }, { _id: 'cb', bank: 'SBI', vchNo: 'cb', vchType: 'CB', date: '2026-10-03', branch: 'Main', balance: 1250 }];
  const report = calculateBankBook(accounts, bankBookSources(accounts, [receipt], legacy).events, 'SBI', filters);
  assert.deepEqual([report.opening, report.receipts, report.adjustments, report.closing], [1000, 500, -250, 1250]);
});
test('date and branch filters carry earlier balances and exclude drafts or future entries', () => {
  const records = [receipt, payment, { ...receipt, _id: 'draft', status: 'Draft' }, { ...receipt, _id: 'later', date: '2026-11-01' }, { ...receipt, _id: 'south', branch: 'South' }];
  const report = calculateBankBook(accounts, bankBookSources(accounts, records, []).events, 'SBI', { ...filters, from: '2026-10-03', branch: 'Main' });
  assert.equal(report.opening, 1500); assert.equal(report.closing, 1400); assert.equal(report.rows.length, 1);
});
test('bank overdrafts preserve negative balances and loans are not treated as bank accounts', () => {
  assert.equal(isBankAccount({ group: 'Bank Overdraft' }), true);
  assert.equal(isBankAccount({ group: 'Bank Loans' }), false);
  const overdraft = [{ name: 'OD', group: 'Bank Overdraft', opening: -200 }];
  assert.equal(calculateBankBook(overdraft, [], 'OD', filters).closing, -200);
});
test('empty bank reports contain no invented transactions or reconciliation history', () => {
  const sources = bankBookSources([], [], []); assert.deepEqual(sources, { banks: [], events: [] });
  const report = calculateBankBook([], [], '', filters);
  assert.equal(report.closing, 0); assert.equal(report.rows.length, 0); assert.equal(report.untracked, 0);
});
