import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseEntryRow, filterPurchaseEntries, purchaseEntryStats } from '../src/features/categories/automobile/automobilePurchaseEntries.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const doc = { _id: 'pe-1', number: 'PE-001', documentType: 'purchase-entry', meta: { date: '2026-10-21', dueDate: '2099-11-21' }, customer: { name: 'Auto Parts', city: 'Chennai' }, extra: { vendorInvoiceNo: 'SUP-001', linkedPurchaseOrderId: 'po-1', linkedPurchaseOrderNo: 'PO-001' }, items: [{ description: 'Tyre', qty: 2, rate: 100, discount: 10, discountType: 'percent', gstRate: 18, hsn: '4011' }], charges: [{ amount: 10, gstRate: 18 }] };
test('purchase entries use saved totals, including zero, and server paid/balance values', () => {
  const row = purchaseEntryRow({ ...doc, totals: { finalTotal: 500 }, totalPaid: 100, balance: 250 });
  assert.equal(row.total, 500); assert.equal(row.paid, 100); assert.equal(row.balanceDue, 250);
  assert.equal(purchaseEntryRow({ ...doc, totals: { finalTotal: 0 }, balance: 0 }).total, 0);
  assert.equal(purchaseEntryRow(doc).total, 224);
});
test('PO matching uses exact IDs, saved fallback totals and distinguishes absent references', () => {
  const po = { _id: 'po-1', number: 'PO-001', totals: { finalTotal: 224 } };
  assert.equal(purchaseEntryRow(doc, [po]).matchStatus, 'Matched');
  assert.equal(purchaseEntryRow(doc, [{ ...po, _id: 'po-10' }]).matchStatus, 'PO Unavailable');
  assert.equal(purchaseEntryRow({ ...doc, extra: {} }).matchStatus, 'No Linked PO');
  assert.equal(purchaseEntryRow({ ...doc, extra: { ...doc.extra, purchaseOrderTotal: 200 } }).difference, 24);
  assert.equal(purchaseEntryRow({ ...doc, extra: { ...doc.extra, purchaseOrderTotal: 200 } }).matchStatus, 'Mismatch');
});
test('known zero PO and supplier invoice totals remain recorded values', () => {
  const row = purchaseEntryRow({ ...doc, totals: { finalTotal: 0 }, extra: { ...doc.extra, purchaseOrderTotal: 0, vendorInvoiceAmount: 0 } });
  assert.equal(row.matchStatus, 'Matched'); assert.equal(row.poTotal, 0); assert.equal(row.vendorDifference, 0);
});
test('entry filters combine supplier invoice and PO search with payment and advanced filters', () => {
  const rows = [purchaseEntryRow({ ...doc, totalPaid: 100, balance: 124, payStatus: 'Partially Paid', paymentMethod: 'Cash + UPI' })];
  assert.equal(filterPurchaseEntries(rows, { search: 'SUP-001', from: '2026-10-21', to: '2026-10-21', paymentStatus: 'Partial', paymentMethod: 'UPI', hsn: '4011', city: 'Chennai', amountMin: '224', status: 'PO Unavailable' }).length, 1);
  assert.equal(filterPurchaseEntries(rows, { search: 'PO-001' }).length, 1);
  assert.equal(filterPurchaseEntries(rows, { amountMax: '0' }).length, 0);
  assert.equal(filterPurchaseEntries(rows, { status: 'Matched' }).length, 0);
});
test('purchase value and payable summary exclude drafts and cancellations', () => {
  const rows = ['posted', 'draft', 'cancelled'].map((lifecycleStatus) => purchaseEntryRow({ ...doc, lifecycleStatus, totalPaid: 100, balance: 124 }));
  const stats = purchaseEntryStats(rows);
  assert.equal(stats.count, 3); assert.equal(stats.value, 224); assert.equal(stats.paid, 100); assert.equal(stats.balance, 124);
});
test('Automobile Purchase Entry menu opens the list while Retail still opens its form', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/purchase-entry'));
  assert.ok(links('retail').includes('/billing/purchase-entry/new'));
});
