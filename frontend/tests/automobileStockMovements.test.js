import assert from 'node:assert/strict';
import test from 'node:test';
import { stockMovementRows, stockMovementTotals } from '../src/features/categories/automobile/automobileStockMovements.js';

const products = [{ _id: 'tyre', code: 'TYR-001', warehouse: 'Main Warehouse', rate: 9999, partNumber: 'R15' }];
test('automatic stock in preserves posted purchase quantities and recorded values', () => {
  const source = [{ _id: 'receipt', stockInNo: 'SIN-001', productId: 'tyre', productName: 'Tyre', sourceType: 'purchase-entry', sourceId: 'purchase', sourceNo: 'PE-001', totalQty: 10, totalValue: 5000, status: 'Completed', date: '2026-10-22' }];
  const original = structuredClone(source);
  const rows = stockMovementRows(source, products, 'in');
  assert.equal(rows[0].number, 'SIN-001'); assert.equal(rows[0].type, 'Purchase');
  assert.equal(rows[0].quantity, 10); assert.equal(rows[0].rate, 500); assert.equal(rows[0].value, 5000);
  assert.equal(rows[0].code, 'TYR-001'); assert.equal(rows[0].warehouse, 'Main Warehouse');
  assert.deepEqual(stockMovementTotals(rows), { movements: 1, quantity: 10, value: 5000, products: 1, pending: 0 });
  assert.deepEqual(source, original);
});
test('sales and supplier returns automatically contribute to outward totals', () => {
  const rows = stockMovementRows([
    { _id: 'sale', stockOutNo: 'SOUT-001', productId: 'tyre', sourceType: 'invoice', totalQty: 2, totalValue: 1400, status: 'Completed' },
    { _id: 'returned', stockOutNo: 'SOUT-002', productId: 'tyre', sourceType: 'supplier-return', totalQty: 1, totalValue: 500, status: 'Completed' },
  ], products, 'out');
  assert.deepEqual(rows.map((row) => row.type), ['Sales', 'Supplier Return']);
  assert.deepEqual(stockMovementTotals(rows), { movements: 2, quantity: 3, value: 1900, products: 1, pending: 0 });
});
test('pending entries remain visible without inflating posted totals', () => {
  const rows = stockMovementRows([
    { _id: 'posted', productId: 'tyre', totalQty: 3, totalValue: 1500, status: 'Completed' },
    { _id: 'draft', productId: 'tyre', totalQty: 100, totalValue: 99999, status: 'Pending' },
  ], products, 'in');
  assert.equal(rows.length, 2);
  assert.deepEqual(stockMovementTotals(rows), { movements: 1, quantity: 3, value: 1500, products: 1, pending: 1 });
});
test('warehouse snapshots and historical adjustments remain visible without inventing a source document', () => {
  const rows = stockMovementRows([{ _id: 'legacy', stockInNo: 'SIN-OLD', warehouse: 'North Warehouse', productName: 'Old Part', totalQty: 0, totalValue: 0, status: 'Completed' }], [], 'in');
  assert.equal(rows[0].warehouse, 'North Warehouse'); assert.equal(rows[0].type, 'Adjustment');
  assert.equal(rows[0].rate, null); assert.equal(rows[0].sourceId, undefined);
  assert.deepEqual(stockMovementTotals([]), { movements: 0, quantity: 0, value: 0, products: 0, pending: 0 });
});
