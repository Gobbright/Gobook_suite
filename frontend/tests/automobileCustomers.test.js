import test from 'node:test';
import assert from 'node:assert/strict';
import { customerSummaries, filterCustomers, findInvoiceCustomer } from '../src/features/categories/automobile/automobileCustomers.js';

const customers = [
  { _id: 'one', name: 'Auto Parts', gstin: 'GST-A', phone: '9876543210', city: 'Chennai', status: 'Active', customerType: 'Dealer', createdAt: '2026-10-01T00:00:00Z' },
  { _id: 'two', name: 'Auto Parts', gstin: 'GST-B', phone: '9876543210', city: 'Delhi', status: 'Inactive', customerType: 'Workshop', createdAt: '2026-09-01T00:00:00Z' },
];
const invoice = { _id: 'invoice', documentType: 'invoice', number: 'INV-1', customer: { name: 'Auto Parts', gstin: 'GST-A', phone: '9876543210' }, meta: { date: '2026-10-10' }, totals: { finalTotal: 1000 }, totalPaid: 700, balance: 300 };

test('GSTIN matching disambiguates shared names and phone numbers', () => {
  assert.equal(findInvoiceCustomer(customers, invoice.customer)._id, 'one');
  assert.equal(findInvoiceCustomer(customers, { name: 'Auto Parts', phone: '9876543210' }), null);
});
test('conflicting GSTIN cannot fall back to a shared name or phone', () => {
  assert.equal(findInvoiceCustomer(customers, { name: 'Auto Parts', phone: '9876543210', gstin: 'GST-C' }), null);
});
test('balances use posted sales only and retain payment-service balances', () => {
  const rows = customerSummaries(customers, [invoice, { ...invoice, _id: 'draft', lifecycleStatus: 'draft', balance: 1000 }, { ...invoice, _id: 'cancelled', lifecycleStatus: 'cancelled' }, { ...invoice, _id: 'purchase', documentType: 'purchase-entry' }]);
  assert.equal(rows[0].outstanding, 300);
  assert.equal(rows[0].invoices.length, 1);
  assert.equal(rows[0].invoices[0].paid, 700);
  assert.equal(rows[0].lastInvoice, '2026-10-10');
  assert.equal(rows[1].outstanding, 0);
});
test('customer filters combine type, city, status, search and creation dates', () => {
  const rows = filterCustomers(customers, { type: 'Dealer', city: 'Chennai', status: 'Active', search: 'gst-a', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]._id, 'one');
});
test('legacy customers match normalized Indian phone numbers when unambiguous', () => {
  assert.equal(findInvoiceCustomer([customers[0]], { phone: '+91 98765 43210' })._id, 'one');
  assert.equal(customerSummaries(customers, []).reduce((total, row) => total + row.outstanding, 0), 0);
});
