import assert from 'node:assert/strict';
import test from 'node:test';
import { ageInDays, ageingBucket, filterReceivables, indiaToday, receivablesSummary, receivableViewHref, validateReceivablePayment } from '../src/features/categories/automobile/automobileReceivables.js';
const today = '2026-10-20';
const row = { id: 'invoice-1', number: 'SI-1', documentType: 'invoice', date: '2026-10-01', dueDate: '2026-10-15', customer: 'Auto Parts', customerPhone: '9876543210', invoiceTotal: 1000, totalPaid: 200, balance: 800, status: 'Partial' };
test('ageing uses India calendar days and catches overdue partial invoices', () => {
  assert.equal(indiaToday(new Date('2026-10-19T20:00:00Z')), today);
  assert.equal(ageInDays(row, today), 5); assert.equal(ageingBucket(row, today), '1–30 Days');
  assert.equal(ageingBucket({ ...row, dueDate: today }, today), 'Current');
  assert.equal(ageingBucket({ ...row, dueDate: '2026-11-01' }, today), 'Current');
  assert.equal(ageingBucket({ ...row, dueDate: '' }, today), 'No Due Date');
  assert.equal(ageingBucket({ ...row, dueDate: '2026-02-30' }, today), 'No Due Date');
  assert.equal(ageingBucket({ ...row, balance: 0 }, today), 'Paid');
});
test('ageing buckets have exact non-overlapping boundaries', () => {
  for (const [days, expected] of [[30, '1–30 Days'], [31, '31–60 Days'], [60, '31–60 Days'], [61, '61–90 Days'], [90, '61–90 Days'], [91, '90+ Days']]) {
    const dueDate = new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
    assert.equal(ageingBucket({ ...row, dueDate }, today), expected);
  }
});
test('summary uses server balances, includes paid receipts and does not fabricate monthly collections', () => {
  const rows = [row, { ...row, id: 'paid', balance: 0, totalPaid: 1000 }, { ...row, id: 'other', customer: 'Motors', balance: 500, totalPaid: 0, dueDate: '' }];
  const summary = receivablesSummary(rows, today);
  assert.equal(summary.totalOutstanding, 1300); assert.equal(summary.totalOverdue, 800); assert.equal(summary.totalPaid, 1200);
  assert.equal(summary.coverage, 48); assert.equal(summary.customers.length, 2);
  assert.equal(summary.buckets.reduce((sum, bucket) => sum + bucket.value, 0), 1300);
  assert.equal(summary.customers[0].balance, 800);
});
test('filters combine search, customer, dates, ageing and true overdue status', () => {
  assert.deepEqual(filterReceivables([row], { from: '2026-10-01', to: '2026-10-31', customer: 'Auto Parts', search: 'si-1', bucket: '1–30 Days', status: 'Overdue' }, today), [row]);
  assert.deepEqual(filterReceivables([row], { search: '98765', status: 'Partial' }, today), [row]);
  assert.deepEqual(filterReceivables([row], { status: 'Paid' }, today), []);
  assert.deepEqual(filterReceivables([{ ...row, balance: 0 }], {}, today), []);
  assert.deepEqual(filterReceivables([row], { from: '2026-11-01', to: '2026-10-01' }, today), []);
});
test('payments reject missing, non-finite, sub-cent and over-balance amounts and invalid dates or modes', () => {
  const form = { amount: '800', date: today, method: 'Bank Transfer' };
  assert.equal(validateReceivablePayment(row, form), '');
  for (const amount of ['', '0', '-1', 'Infinity', '800.01', '1.001']) assert.ok(validateReceivablePayment(row, { ...form, amount }));
  for (const date of ['', '2026-02-30', 'garbage']) assert.ok(validateReceivablePayment(row, { ...form, date }));
  assert.ok(validateReceivablePayment(row, { ...form, method: 'Unsupported' }));
  assert.ok(validateReceivablePayment({ ...row, balance: 0 }, form));
  assert.ok(validateReceivablePayment(null, form));
});
test('invoice view routes preserve bill-of-supply links', () => {
  assert.equal(receivableViewHref(row), '/billing/invoice/invoice-1/view');
  assert.equal(receivableViewHref({ ...row, documentType: 'bill-of-supply' }), '/billing/bill-of-supply/invoice-1/view');
});
