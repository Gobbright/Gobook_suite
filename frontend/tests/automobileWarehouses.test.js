import assert from 'node:assert/strict';
import test from 'node:test';
import { nextWarehouseCode, warehouseStock } from '../src/features/categories/automobile/automobileWarehouses.js';

test('warehouse stock uses assigned products, selling prices and active SKU counts', () => {
  const rows = warehouseStock([{ _id: 'main', name: 'Main Warehouse' }, { _id: 'north', name: 'North Warehouse' }], [
    { warehouse: 'Main Warehouse', stock: 10, rate: 100, status: 'Active', minStockLevel: 2 },
    { warehouse: ' main warehouse ', stock: 2, rate: 250, status: 'Active', minStockLevel: 3 },
    { warehouse: 'Main Warehouse', stock: 1, rate: 50, status: 'Inactive' },
    { warehouse: 'North Warehouse', stock: 0, rate: 900, status: 'Active', minStockLevel: 1 },
    { warehouse: 'Unrelated', stock: 100, rate: 9999, status: 'Active' },
  ]);
  assert.deepEqual(rows.map((row) => [row.stockValue, row.activeSkus, row.lowStock, row.assignedProducts]), [[1550, 2, 1, 3], [0, 1, 1, 1]]);
});
test('duplicate warehouse names have no invented or double-counted stock values', () => {
  const rows = warehouseStock([{ _id: 'a', name: 'Main' }, { _id: 'b', name: 'MAIN' }], [{ warehouse: 'main', stock: 10, rate: 100, status: 'Active' }]);
  assert.ok(rows.every((row) => row.ambiguous && row.stockValue === null && row.activeSkus === null && row.lowStock === null));
});
test('empty warehouses show zero stock and untracked products do not trigger low-stock alerts', () => {
  const rows = warehouseStock([{ name: 'Main' }, { name: 'Empty' }], [{ warehouse: 'Main', stock: 0, rate: 100, status: 'Active', minStockLevel: 5, trackInventory: false }]);
  assert.equal(rows[0].activeSkus, 1); assert.equal(rows[0].lowStock, 0);
  assert.equal(rows[1].stockValue, 0); assert.equal(rows[1].assignedProducts, 0);
});
test('warehouse numbering avoids existing sequential codes while preserving custom code schemes', () => {
  assert.equal(nextWarehouseCode([]), 'WH-001');
  assert.equal(nextWarehouseCode([{ code: 'WH-004' }, { code: 'WH-002' }, { code: 'WH-MB-001' }, {}]), 'WH-005');
});
