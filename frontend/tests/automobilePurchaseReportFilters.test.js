import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMOBILE_PURCHASE_PRIMARY_FIELDS, AUTOMOBILE_PURCHASE_ADVANCED_FIELDS, automobilePurchaseDocuments, emptyAutomobilePurchaseFilters, matchesAutomobilePurchase } from '../src/features/categories/automobile/automobilePurchaseReportFilters.js';

const record = { extra: { goodsReceiptStatus: 'Partially Received', qualityInspection: 'Passed' }, itcEligible: false, items: [
  { productId: 'brake', qty: 2, rate: 100, discount: 10, partType: 'OEM' },
  { productId: 'engine', qty: 5, rate: 200, partType: 'Aftermarket' },
] };
const products = [{ _id: 'brake', category: 'Brake Parts', manufacturerPartNumber: 'BP-123', code: 'SKU-1' }, { _id: 'engine', category: 'Engine Parts' }];
const matches = (filters, source = record) => matchesAutomobilePurchase(source, { ...emptyAutomobilePurchaseFilters(), ...filters }, products);
test('automobile purchase dimensions must match the same part', () => {
  assert.equal(matches({ productCategory: 'Brake Parts', partType: 'OEM' }), true);
  assert.equal(matches({ productCategory: 'Brake Parts', partType: 'Aftermarket' }), false);
  assert.equal(matches({ partNumber: 'bp-12', sku: 'sku-1' }), true);
});
test('procurement statuses use recorded values and preserve false ITC eligibility', () => {
  assert.equal(matches({ goodsReceiptStatus: 'Partially Received', qualityInspection: 'Passed', itcStatus: 'Ineligible' }), true);
  assert.equal(matches({ itcStatus: 'Eligible' }), false);
  assert.equal(matches({ stockUpdateStatus: 'Not Updated' }), false);
  assert.equal(matches({ returnStatus: 'No Return' }), false);
});
test('quantity, rate and discounts combine on a single item, including zero bounds', () => {
  assert.equal(matches({ minQty: '3', maxRate: '150' }), false);
  assert.equal(matches({ minQty: '2', maxRate: '100', discountPercent: '10', discountAmount: '20' }), true);
  assert.equal(matches({ maxQty: '0' }), false);
  assert.equal(matches({ minRate: '0' }, { items: [{}] }), false);
});
test('empty records remain visible until a recorded dimension is requested', () => {
  assert.equal(matches({}, {}), true);
  assert.equal(matches({ goodsReceiptStatus: 'Pending' }, {}), false);
});
test('automobile purchase layout has six primary filters and the requested advanced lookups', () => {
  assert.deepEqual(AUTOMOBILE_PURCHASE_PRIMARY_FIELDS.map(([key]) => key), ['dateRange', 'purchaseType', 'supplier', 'goodsReceiptStatus', 'productCategory', 'paymentStatus']);
  const advanced = AUTOMOBILE_PURCHASE_ADVANCED_FIELDS.map(([key]) => key);
  assert.ok(advanced.includes('purchaseOrderNo'));
  assert.ok(advanced.includes('productSku'));
  assert.ok(advanced.includes('staff'));
});
test('All includes all procurement document types and each purchase type selects its own records', () => {
  const purchases = [{ documentType: 'purchase-entry' }, { documentType: 'purchase-order' }, { documentType: 'debit-note' }];
  const returns = [{ documentType: 'supplier-return' }];
  assert.equal(automobilePurchaseDocuments(purchases, returns, '').length, 4);
  for (const [type, expected] of [['purchase-invoice', 'purchase-entry'], ['purchase-order', 'purchase-order'], ['purchase-return', 'supplier-return'], ['debit-note', 'debit-note']]) {
    assert.deepEqual(automobilePurchaseDocuments(purchases, returns, type).map((row) => row.documentType), [expected]);
  }
});
test('purchase order selection matches an order, recorded reference or linked order ID', () => {
  const order = { _id: 'order1', documentType: 'purchase-order', number: 'PO-001' };
  const filters = { ...emptyAutomobilePurchaseFilters(), purchaseOrderNo: 'PO-001' };
  assert.equal(matchesAutomobilePurchase(order, filters), true);
  assert.equal(matchesAutomobilePurchase({ ...record, extra: { linkedPurchaseOrderId: 'order1' } }, filters, products, [order]), true);
  assert.equal(matchesAutomobilePurchase({ ...record, extra: { linkedPurchaseOrderNo: 'PO-001' } }, filters, products), true);
  assert.equal(matchesAutomobilePurchase({ ...record, extra: { linkedPurchaseOrderNo: 'PO-0010' } }, filters, products), false);
});
test('Product / SKU searches product names and item codes on the same matching part', () => {
  const catalog = [{ _id: 'brake', description: 'Front brake pad', code: 'PAD-100' }];
  assert.equal(matchesAutomobilePurchase(record, { productSku: 'brake pad', partType: 'OEM' }, catalog), true);
  assert.equal(matchesAutomobilePurchase(record, { productSku: 'pad-100', partType: 'Aftermarket' }, catalog), false);
  assert.equal(matchesAutomobilePurchase({ items: [{ vehicleType: 'SUV' }] }, { vehicleType: 'Car/SUV' }), true);
});
