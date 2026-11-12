import assert from 'node:assert/strict';
import test from 'node:test';
import { filterVouchers, sourceVoucherLink, voucherAmounts } from '../src/features/categories/automobile/automobileVouchers.js';

const vouchers = [
  { _id: 'receipt', voucherNo: 'RV-001', voucherType: 'Receipt', date: '2026-10-22', status: 'Posted', partyName: 'Ramesh Motors', referenceNo: 'INV-001', narration: 'Payment received', debitTotal: 125000, creditTotal: 125000, sourceType: 'payment', sourceId: 'payment-id', lines: [{ ledgerName: 'HDFC Bank', side: 'debit', amount: 125000 }, { ledgerName: 'Ramesh Motors', side: 'credit', amount: 125000, billRef: 'BILL-10' }] },
  { _id: 'journal', voucherNo: 'JV-001', voucherType: 'Journal', date: '2026-10-20', status: 'Draft', narration: 'Depreciation', lines: [{ ledgerName: 'Depreciation Expense', side: 'debit', amount: 18500 }, { ledgerName: 'Vehicle Account', side: 'credit', amount: 18500 }] },
];
const empty = { from: '', to: '', type: '', account: '', status: '', search: '' };
test('voucher amounts preserve both sides of double-entry records', () => {
  assert.deepEqual(voucherAmounts(vouchers[0]), { debit: 125000, credit: 125000 });
  assert.deepEqual(voucherAmounts(vouchers[1]), { debit: 18500, credit: 18500 });
  assert.deepEqual(voucherAmounts({ lines: [{ side: 'debit', amount: 0.1 }, { side: 'debit', amount: 0.2 }, { side: 'credit', amount: 0.3 }] }), { debit: 0.3, credit: 0.3 });
});
test('date, type, status and account filters work together without changing source vouchers', () => {
  const before = structuredClone(vouchers);
  const matches = filterVouchers(vouchers, { ...empty, from: '2026-10-21', to: '2026-10-22', type: 'Receipt', status: 'Posted', account: 'HDFC Bank' });
  assert.deepEqual(matches.map((voucher) => voucher._id), ['receipt']);
  assert.equal(filterVouchers(vouchers, { ...empty, account: 'Unknown Account' }).length, 0);
  assert.deepEqual(vouchers, before);
});
test('search includes accounts, parties, narration and bill references', () => {
  for (const search of ['ramesh', 'hdfc', 'BILL-10', 'inv-001', 'payment received']) assert.deepEqual(filterVouchers(vouchers, { ...empty, search }).map((voucher) => voucher._id), ['receipt']);
  assert.deepEqual(filterVouchers(vouchers, { ...empty, search: 'depreciation' }).map((voucher) => voucher._id), ['journal']);
});
test('source links use supported document routes and never invent routes for manual vouchers', () => {
  assert.equal(sourceVoucherLink(vouchers[1]), '');
  assert.equal(sourceVoucherLink(vouchers[0]), '');
  assert.equal(sourceVoucherLink({ sourceType: 'purchase-entry', sourceId: 'purchase-id' }), '/billing/purchase-entry/purchase-id/view');
  assert.equal(sourceVoucherLink({ sourceType: 'invoice', sourceId: 'a/b' }), '/billing/invoice/a%2Fb/view');
});
