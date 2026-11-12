import assert from 'node:assert/strict';
import test from 'node:test';
import { cashBookEvents, calculateCashBook, cashDaySummary } from '../src/features/categories/automobile/automobileCashBook.js';

const accounts = [{ name: 'Cash', group: 'Cash-In-Hand', opening: 1000, branch: 'Main' }, { name: 'Bank', group: 'Bank Accounts', opening: 99999 }];
const cashVoucher = (id, date, side, amount, extra = {}) => ({ _id: id, voucherNo: id, date, status: 'Posted', voucherType: side === 'debit' ? 'Receipt' : 'Payment', branch: 'Main', lines: [{ ledgerName: 'Cash', ledgerGroup: 'Cash-In-Hand', side, amount }, { ledgerName: 'Counterpart', ledgerGroup: 'Current Assets', side: side === 'debit' ? 'credit' : 'debit', amount }], ...extra });
const filters = { from: '2026-10-01', to: '2026-10-31', branch: '' };
test('cash book carries previous movements into opening and calculates chronological balances', () => {
  const events = cashBookEvents(accounts, [cashVoucher('before', '2026-09-30', 'debit', 200), cashVoucher('in', '2026-10-02', 'debit', 500), cashVoucher('out', '2026-10-03', 'credit', 100), cashVoucher('later', '2026-11-01', 'credit', 999)], []);
  const report = calculateCashBook(accounts, events, filters);
  assert.deepEqual([report.opening, report.receipts, report.payments, report.closing], [1200, 500, 100, 1600]);
  assert.deepEqual(report.rows.map((row) => row.balance), [1700, 1600]);
  assert.equal(report.opening + report.receipts - report.payments + report.adjustments, report.closing);
});
test('historical records are deduplicated by voucher number or source identity', () => {
  const records = [cashVoucher('new', '2026-10-02', 'debit', 500, { sourceType: 'payment', sourceId: 'source' })];
  const legacy = [{ _id: 'same-number', vchNo: 'new', date: '2026-10-02', receipt: 500 }, { _id: 'same-source', vchNo: 'old-number', sourceType: 'payment', sourceId: 'source', date: '2026-10-02', receipt: 500 }, { _id: 'manual', vchNo: 'manual', vchType: 'Receipt', date: '2026-10-03', receipt: 25 }];
  const report = calculateCashBook(accounts, cashBookEvents(accounts, records, legacy), filters);
  assert.equal(report.rows.length, 2); assert.equal(report.receipts, 525);
});
test('draft and bank-only vouchers are excluded and internal cash transfers are netted', () => {
  const events = cashBookEvents(accounts, [cashVoucher('draft', '2026-10-02', 'debit', 500, { status: 'Draft' }), { _id: 'bank', status: 'Posted', date: '2026-10-02', lines: [{ ledgerName: 'Bank', ledgerGroup: 'Bank Accounts', side: 'debit', amount: 99 }] }, { _id: 'internal', status: 'Posted', date: '2026-10-02', lines: [{ ledgerName: 'Cash', ledgerGroup: 'Cash-In-Hand', side: 'credit', amount: 50 }, { ledgerName: 'Petty Cash', ledgerGroup: 'Cash-In-Hand', side: 'debit', amount: 50 }] }], []);
  assert.equal(events.length, 0);
});
test('legacy opening snapshots reset their branch rather than doubling account opening', () => {
  const events = cashBookEvents(accounts, [cashVoucher('in', '2026-10-02', 'debit', 100)], [{ _id: 'ob', date: '2026-10-01', vchNo: 'OB-001', vchType: 'OB', branch: 'Main', balance: 800 }]);
  const report = calculateCashBook(accounts, events, filters);
  assert.deepEqual([report.opening, report.adjustments, report.receipts, report.closing], [1000, -200, 100, 900]);
  assert.equal(report.daily[0].closing, 800);
});
test('daily summaries carry balances through dates without movements', () => {
  const report = calculateCashBook(accounts, cashBookEvents(accounts, [cashVoucher('in', '2026-10-02', 'debit', 100)], []), filters);
  const day = cashDaySummary(report, '2026-10-03');
  assert.deepEqual([day.opening, day.receipts, day.payments, day.closing], [1100, 0, 0, 1100]);
  assert.equal(cashDaySummary(report, '2026-10-01').opening, 1000);
});
test('branch filters and payment heads use only included cash movements', () => {
  const report = calculateCashBook([...accounts, { name: 'South Cash', group: 'Cash-In-Hand', opening: 500, branch: 'South' }], cashBookEvents(accounts, [cashVoucher('pay', '2026-10-03', 'credit', 100), cashVoucher('south', '2026-10-03', 'credit', 999, { branch: 'South' })], []), { ...filters, branch: 'Main' });
  assert.equal(report.opening, 1000); assert.equal(report.closing, 900);
  assert.deepEqual(report.heads, [{ name: 'Counterpart', amount: 100 }]);
});
test('negative balances are preserved and fractional amounts round correctly', () => {
  const report = calculateCashBook([], cashBookEvents([], [cashVoucher('a', '2026-10-01', 'credit', 0.1), cashVoucher('b', '2026-10-02', 'credit', 0.2)], []), filters);
  assert.equal(report.payments, 0.3); assert.equal(report.closing, -0.3);
});
