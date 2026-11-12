import assert from 'node:assert/strict';
import test from 'node:test';
import { supplierReturnRow, supplierReturnStatus, supplierReturnStats, filterSupplierReturns, supplierReturnHistory } from '../src/features/categories/automobile/automobileSupplierReturns.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const note = { _id: 'sr-1', number: 'SR-001', documentType: 'supplier-return', meta: { date: '2026-10-21' }, customer: { name: 'Auto Parts', city: 'Chennai' }, extra: { originalPurchaseId: 'pe-1', originalInvoiceNo: 'PE-001', vendorInvoiceNo: 'SUP-001', reason: 'Defective parts' }, items: [{ description: 'Brake Pad', itemType: 'Product', qty: 2, rate: 100, discount: 10, discountType: 'percent', gstRate: 18 }], accounting: { posted: true, voucherNo: 'JV-001', postedAt: '2026-10-21T05:00:00Z' } };
test('supplier return amounts honor saved zero totals and percentage/fixed discounts', () => {
  assert.equal(supplierReturnRow(note).total, 212);
  assert.equal(supplierReturnRow({ ...note, items: [{ ...note.items[0], discountType: 'amount' }] }).total, 224);
  assert.equal(supplierReturnRow({ ...note, totals: { finalTotal: 0 } }).total, 0);
});
test('posting and settlement require accounting evidence and never infer approvals or cash refunds', () => {
  assert.equal(supplierReturnStatus(note), 'Posted');
  assert.equal(supplierReturnRow(note).settlement, 'Supplier Ledger');
  assert.equal(supplierReturnStatus({ ...note, accounting: undefined }), 'Posting Not Recorded');
  assert.equal(supplierReturnRow({ ...note, accounting: { posted: false }, extra: { status: 'Refunded' } }).settlement, 'Not Recorded');
  assert.equal(supplierReturnStatus({ ...note, accounting: { posted: false } }), 'Not Posted');
  assert.equal(supplierReturnStatus({ ...note, lifecycleStatus: 'cancelled' }), 'Cancelled');
});
test('returned stock quantity counts goods and excludes services', () => {
  assert.equal(supplierReturnRow({ ...note, items: [...note.items, { itemType: 'Service', qty: 4, rate: 10 }, { itemType: 'Product', qty: 0.5, rate: 20 }] }).goodsQty, 2.5);
});
test('summary excludes drafts/cancellations from value and requires posting evidence for ledger credits', () => {
  const rows = [supplierReturnRow(note), supplierReturnRow({ ...note, accounting: { posted: false } }), supplierReturnRow({ ...note, lifecycleStatus: 'cancelled' })];
  const stats = supplierReturnStats(rows);
  assert.equal(stats.count, 3); assert.equal(stats.value, 424); assert.equal(stats.credit, 212); assert.equal(stats.unposted, 1); assert.equal(stats.posted, 1); assert.equal(stats.quantity, 4);
});
test('filters search original purchase, vendor invoice and reason while combining dates, supplier and posting status', () => {
  const rows = [supplierReturnRow(note)];
  for (const search of ['PE-001', 'SUP-001', 'defective']) assert.equal(filterSupplierReturns(rows, { search, from: '2026-10-21', to: '2026-10-21', customer: 'Auto', status: 'Posted' }).length, 1);
  assert.equal(filterSupplierReturns(rows, { status: 'Not Posted' }).length, 0);
  assert.equal(filterSupplierReturns(rows, { to: '2026-10-20' }).length, 0);
});
test('history contains actual valid timestamps without inventing approval events', () => {
  assert.deepEqual(supplierReturnHistory({ ...note, accounting: undefined }), []);
  const history = supplierReturnHistory({ ...note, createdAt: '2026-10-20T05:00:00Z', updatedAt: 'invalid' });
  assert.equal(history.length, 2); assert.equal(history[0].label, 'Supplier ledger posted'); assert.equal(history[0].reference, 'JV-001');
});
test('Automobile Supplier Returns menu opens the list and Retail keeps its existing creation link', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/supplier-return'));
  assert.ok(links('retail').includes('/billing/supplier-return/new'));
});
