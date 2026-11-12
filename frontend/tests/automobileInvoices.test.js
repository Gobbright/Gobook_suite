import assert from 'node:assert/strict';
import test from 'node:test';
import { automobileInvoiceRow } from '../src/features/categories/automobile/automobileInvoices.js';
const invoice = { _id: 'invoice-1', number: 'SI-1', customer: { name: 'Auto Parts' }, documentType: 'invoice', meta: { date: '2026-10-20' }, items: [{ description: 'Tyre', qty: 2, rate: 100, discount: 10, discountType: 'percent', gstRate: 18 }], charges: [{ label: 'Freight', amount: 10, gstRate: 18 }] };
test('Bills amounts distinguish percentage and fixed discounts and include charge GST', () => {
  const percent = automobileInvoiceRow(invoice);
  assert.equal(percent.taxable, 190); assert.equal(percent.gst, 34.2); assert.equal(percent.total, 224);
  const fixed = automobileInvoiceRow({ ...invoice, items: [{ ...invoice.items[0], discountType: 'amount' }] });
  assert.equal(fixed.taxable, 200); assert.equal(fixed.gst, 36); assert.equal(fixed.total, 236);
});
test('saved totals including zero and server payment balances survive normalization', () => {
  const row = automobileInvoiceRow({ ...invoice, totals: { finalTotal: 0 }, totalPaid: 0, balance: 0, payStatus: 'Paid' });
  assert.equal(row.total, 0); assert.equal(row.paid, 0); assert.equal(row.balanceDue, 0); assert.equal(row.paymentStatus, 'Paid');
  const credited = automobileInvoiceRow({ ...invoice, totals: { finalTotal: 500 }, totalPaid: 100, balance: 250, payStatus: 'Partial' });
  assert.equal(credited.total, 500); assert.equal(credited.balanceDue, 250); assert.equal(credited.paymentStatus, 'Partial');
});
test('draft and cancelled bills never contribute receivables or claim paid status', () => {
  for (const state of ['draft', 'cancelled']) {
    const row = automobileInvoiceRow({ ...invoice, lifecycleStatus: state, balance: 500, payStatus: 'Paid' });
    assert.equal(row.balanceDue, 0); assert.equal(row.paymentStatus.toLowerCase(), state);
  }
});
test('bill-of-supply fallback omits tax while keeping its route metadata', () => {
  const row = automobileInvoiceRow({ ...invoice, documentType: 'bill-of-supply' });
  assert.equal(row.gst, 0); assert.equal(row.taxable, 190); assert.equal(row.total, 190); assert.equal(row.documentType, 'bill-of-supply');
});
