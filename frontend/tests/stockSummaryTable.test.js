import test from 'node:test';
import assert from 'node:assert/strict';
import { STOCK_TABLE_COLUMNS, stockExportColumns, stockTableValue, stockStatusClass, stockLedgerLink, stockLedgerScope, stockDashboardFilters, selectedStockRows } from '../src/utils/stockDashboard.js';

test('stock table exposes all requested columns without deriving quantities in the browser', () => {
  assert.deepEqual(STOCK_TABLE_COLUMNS.map((column) => column.label), ['Product Name', 'SKU/Barcode', 'Brand', 'Category', 'Warehouse', 'Branch', 'Physical Stock', 'Reserved Stock', 'Available Stock', 'Minimum Stock', 'Maximum Stock', 'Stock Value', 'Stock Status', 'Actions']);
  const row = { physicalQty: 10, reservedQty: 2, availableQty: 8, stock: 99, stockValue: null, maxStockLevel: 0 };
  assert.equal(stockTableValue(row, 'physicalQty'), 10);
  assert.equal(stockTableValue(row, 'availableQty'), 8);
  assert.equal(stockTableValue(row, 'stockValue'), 'Unavailable');
  assert.equal(stockTableValue(row, 'maxStockLevel'), 'Not set');
  assert.equal(stockTableValue({ code: 'SKU-1', barcode: 'BAR-1' }, 'sku'), 'SKU-1 / BAR-1');
});

test('exports follow column visibility and selection across pages', () => {
  const columns = stockExportColumns(['description', 'physicalQty', 'actions']);
  assert.deepEqual(columns.map((column) => column.label), ['Product Name', 'Physical Stock']);
  assert.equal(columns[1].value({ physicalQty: 12 }), 12);
  const rows = [{ _id: 'page-1' }, { _id: 'page-2' }, { _id: 'page-3' }];
  assert.deepEqual(selectedStockRows(rows, ['page-1', 'page-3']).map((row) => row._id), ['page-1', 'page-3']);
  assert.equal(selectedStockRows(rows, []).length, 3);
});

test('stock statuses use the requested green, orange, red and purple classes', () => {
  assert.equal(stockStatusClass('In Stock'), 'ass-active');
  assert.equal(stockStatusClass('Low Stock'), 'ass-low');
  assert.equal(stockStatusClass('Out of Stock'), 'ass-out');
  assert.equal(stockStatusClass('Overstock'), 'ass-overstock');
});

test('ledger navigation preserves product, variant, batch, location and dates', () => {
  const link = stockLedgerLink('product-1', { dateFrom: '2026-04-01', dateTo: '2026-04-30', warehouse: 'Main', branch: 'North' }, { warehouse: 'Second', branch: 'South', variantId: 'small', batch: 'B-1' });
  const url = new URL(link, 'http://localhost');
  assert.equal(url.searchParams.get('dateFrom'), '2026-04-01');
  assert.deepEqual(stockLedgerScope(url.search), { productId: 'product-1', warehouse: 'Second', branch: 'South', variantId: 'small', batch: 'B-1' });
  const unassigned = new URL(stockLedgerLink('product-1', {}, { warehouse: '', branch: '', variantId: '', batch: '' }), 'http://localhost');
  assert.equal(unassigned.searchParams.get('warehouseMissing'), '1');
  assert.equal(unassigned.searchParams.get('variantMissing'), '1');
  assert.equal(stockDashboardFilters('?stockStatus=zero').zeroStock, '1');
});
