import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stockDashboardFilters, stockProductLink, stockChartFilter, allStockDashboardRows } from '../src/utils/stockDashboard.js';

test('product drill-down preserves location, category and date filters without injecting unrelated URL parameters', () => {
  const filters = stockDashboardFilters('?warehouse=Main&branch=North&dateFrom=2026-04-01&dateTo=2026-04-30&category=Parts&token=private');
  const params = new URL(stockProductLink(filters, { stockStatus: 'low' }), 'http://localhost').searchParams;
  assert.equal(params.get('stockDashboard'), '1');
  assert.equal(params.get('warehouse'), 'Main');
  assert.equal(params.get('branch'), 'North');
  assert.equal(params.get('category'), 'Parts');
  assert.equal(params.get('dateTo'), '2026-04-30');
  assert.equal(params.get('stockStatus'), 'low');
  assert.equal(params.has('token'), false);
});

test('trend drill-down carries the selected series and real bucket range', () => {
  const params = new URL(stockProductLink({ warehouse: 'Second' }, { movementFrom: '2026-04-01', movementTo: '2026-04-30', movementDirection: 'in' }), 'http://localhost').searchParams;
  assert.equal(params.get('movementDirection'), 'in');
  assert.equal(params.get('movementTo'), '2026-04-30');
  assert.deepEqual(stockChartFilter('warehouse', ''), { warehouse: '', warehouseMissing: '1' });
  assert.deepEqual(stockChartFilter('category', 'Parts'), { category: 'Parts', categoryMissing: '' });
});

test('exports retrieve all filtered API pages rather than only the visible table', async () => {
  const calls = [];
  const api = { async invStockDashboard(params) { calls.push(params); return { total: 3, data: params.page === 1 ? [{ _id: 'one' }, { _id: 'two' }] : [{ _id: 'three' }] }; } };
  const result = await allStockDashboardRows(api, { warehouse: 'Main', dateTo: '2026-04-30' });
  assert.equal(result.length, 3);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].warehouse, 'Main');
  assert.equal(calls[1].dateTo, '2026-04-30');
  await assert.rejects(allStockDashboardRows({ invStockDashboard: async () => { throw new Error('Offline'); } }, {}), /Offline/);
});

test('both layouts retain KPIs and the product table without charts, and preserve ordinary product management', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const automobile = read('../src/features/categories/automobile/AutomobileStockSummaryPage.jsx');
  const common = read('../src/features/categories/common/modules/inventory/StockSummaryPage.jsx');
  const products = read('../src/features/categories/common/modules/inventory/ProductsPage.jsx');
  const charts = read('../src/features/categories/common/modules/inventory/StockDashboardCharts.jsx');
  for (const source of [automobile, common]) {
    for (const label of ['Total Products', 'Total Physical Stock Quantity', 'Total Stock Value', 'Low Stock Items', 'Out of Stock Items', 'Reserved Stock']) assert.ok(source.includes(label));
    assert.ok(!source.includes('StockDashboardCharts'));
    assert.ok(source.includes('<StockSummaryTable'));
    assert.ok(source.includes('Retry'));
  }
  assert.ok(products.includes("get('stockDashboard') === '1'"));
  assert.ok(products.includes('<ProductManagementPage'));
  assert.ok(charts.includes('Stock Status Distribution'));
  assert.ok(charts.includes('Stock In vs Stock Out'));
  assert.ok(charts.includes('onKeyDown'));
  assert.ok(charts.includes('No stock data for these filters.'));
});
