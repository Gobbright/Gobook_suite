import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVendors, vendorDueDate, vendorSummaries } from '../src/features/categories/automobile/automobileVendors.js';
const vendors = [
  { _id: 'one', name: 'Parts Supply', gstin: 'GST-A', phone: '9876543210', status: 'Active', branch: 'Main', category: 'Distributor', creditDays: 30 },
  { _id: 'two', name: 'Parts Supply', gstin: 'GST-B', phone: '9876543210', status: 'Inactive', branch: 'North', creditDays: 0 },
];
const purchase = { _id: 'purchase', documentType: 'purchase-entry', number: 'PI-1', customer: { name: 'Parts Supply', gstin: 'GST-A' }, meta: { date: '2026-10-01' }, totals: { finalTotal: 1000 }, totalPaid: 650, balance: 350 };
test('vendor payables retain payment-service balance and exclude drafts and cancelled purchases', () => {
  const rows = vendorSummaries(vendors, [purchase, { ...purchase, _id: 'draft', lifecycleStatus: 'draft' }, { ...purchase, _id: 'cancelled', lifecycleStatus: 'cancelled' }]);
  assert.equal(rows[0].payable, 350);
  assert.equal(rows[0].purchases.length, 1);
  assert.equal(rows[0].purchases[0].paid, 650);
  assert.equal(rows[1].payable, 0);
});
test('return counts use actual pending states and exclude cancellations', () => {
  const notes = [
    { customer: purchase.customer, lifecycleStatus: 'draft' },
    { customer: purchase.customer, accounting: { posted: false } },
    { customer: purchase.customer, accounting: { posted: true } },
    { customer: purchase.customer, lifecycleStatus: 'cancelled', accounting: { posted: false } },
  ];
  const row = vendorSummaries(vendors, [], notes)[0];
  assert.equal(row.returns.length, 3);
  assert.equal(row.pendingReturns, 2);
});
test('supplier ledger match requires one exact account name', () => {
  assert.equal(vendorSummaries([vendors[0]], [], [], [{ name: 'Parts Supply', opening: -500 }])[0].ledger.opening, -500);
  assert.equal(vendorSummaries([vendors[0]], [], [], [{ name: 'Parts Supply' }, { name: 'Parts Supply' }])[0].ledger, null);
});
test('payment dates prefer saved due dates and use recorded credit days only', () => {
  assert.equal(vendorDueDate({ date: '2026-10-01' }, vendors[0]), '2026-10-31');
  assert.equal(vendorDueDate({ date: '2026-10-01' }, { creditDays: null }), '');
  assert.equal(vendorDueDate({ date: '2026-10-01', meta: { dueDate: '2026-10-15' } }, vendors[0]), '2026-10-15');
  assert.equal(vendorDueDate({ date: '2026-10-01' }, { creditDays: 0 }), '2026-10-01');
});
test('vendor filters combine status, supplier type, branch, terms and contact search', () => {
  assert.equal(filterVendors(vendors, { search: 'gst-a', status: 'Active', category: 'Distributor', branch: 'Main', days: '30' }).length, 1);
  assert.equal(filterVendors(vendors, { search: '', days: '0' })[0]._id, 'two');
});
