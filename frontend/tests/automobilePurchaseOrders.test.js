import assert from 'node:assert/strict';
import test from 'node:test';
import { purchaseOrderRow, purchaseOrderStatus, filterPurchaseOrders, purchaseOrderPrintDocument } from '../src/features/categories/automobile/automobilePurchaseOrders.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const po = { _id: 'po-1', number: 'PO-001', documentType: 'purchase-order', meta: { date: '2026-10-20' }, extra: { expectedDelivery: '2026-10-25' }, customer: { name: 'Auto Parts', city: 'Chennai', state: 'Tamil Nadu' }, items: [{ description: 'Tyre', qty: 2, rate: 100, discount: 10, discountType: 'percent', gstRate: 18, hsn: '4011', barcode: 'TY1', itemType: 'goods' }], charges: [{ amount: 10, gstRate: 18 }] };
test('PO amounts honor discounts, charge GST, and saved zero totals', () => {
  const row = purchaseOrderRow(po);
  assert.equal(row.taxable, 190); assert.ok(Math.abs(row.gst - 34.2) < 0.000001); assert.equal(row.total, 224);
  const fixed = purchaseOrderRow({ ...po, items: [{ ...po.items[0], discountType: 'amount' }] });
  assert.equal(fixed.total, 236);
  assert.equal(purchaseOrderRow({ ...po, totals: { finalTotal: 0 } }).total, 0);
  assert.equal(purchaseOrderPrintDocument(fixed).items[0].discount, 5);
});
test('only exact linked, active entries contribute value and entered quantity', () => {
  const entry = { _id: 'pe-1', extra: { linkedPurchaseOrderId: 'po-1' }, totals: { finalTotal: 224 }, items: [{ qty: 1 }] };
  const row = purchaseOrderRow(po, [entry, { ...entry, lifecycleStatus: 'draft' }, { ...entry, lifecycleStatus: 'cancelled' }, { ...entry, extra: { linkedPurchaseOrderId: 'po-10' } }]);
  assert.equal(row.purchaseEntryCount, 1); assert.equal(row.enteredQty, 1); assert.equal(row.orderedQty, 2);
  assert.equal(row.purchaseEntryMatched, true); assert.equal(purchaseOrderStatus(row), 'PE Matched');
  assert.equal(purchaseOrderRow(po, [{ ...entry, totals: { finalTotal: 225 } }]).purchaseEntryMatched, false);
});
test('approval and receipt statuses require explicit saved records', () => {
  assert.equal(purchaseOrderStatus(purchaseOrderRow(po)), 'Pending PE');
  assert.equal(purchaseOrderStatus(purchaseOrderRow({ ...po, extra: { poStatus: 'pending_approval' } })), 'Pending Approval (Recorded)');
  assert.equal(purchaseOrderStatus(purchaseOrderRow({ ...po, extra: { poStatus: 'partially-received' } })), 'Partially Received (Recorded)');
  assert.equal(purchaseOrderStatus(purchaseOrderRow({ ...po, lifecycleStatus: 'cancelled', extra: { poStatus: 'approved' } })), 'Cancelled');
});
test('supplier, date, status and advanced filters combine and zero bounds work', () => {
  const rows = [purchaseOrderRow(po), purchaseOrderRow({ ...po, _id: 'po-2', totals: { finalTotal: 0 } })];
  const filters = { search: 'PO-001', customer: 'Auto', from: '2026-10-20', to: '2026-10-20', status: 'Pending PE', city: 'Chennai', hsn: '4011', productName: 'tyre', barcode: 'TY1', gstType: 'with', itemType: 'goods', amountMin: '200' };
  assert.equal(filterPurchaseOrders(rows, filters).length, 1);
  assert.equal(filterPurchaseOrders(rows, { amountMax: '0' }).length, 1);
  assert.equal(filterPurchaseOrders(rows, { ...filters, from: '2026-10-21' }).length, 0);
});
test('Automobile menu opens the register while Retail keeps its existing create route', () => {
  const user = { accountType: 'owner', role: 'Owner' };
  const links = (category) => getSidebarSections(category, user).flatMap((section) => section.items).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/purchase-order'));
  assert.ok(links('retail').includes('/billing/purchase-order/new'));
});
