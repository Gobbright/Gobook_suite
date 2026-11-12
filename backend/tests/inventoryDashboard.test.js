import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInventoryStock } from '../src/services/inventoryStockCalculation.js';
import { buildInventoryDashboard, sortInventoryProducts } from '../src/services/inventoryDashboard.js';
import { inventoryStockStatus } from '../src/services/inventoryStockCalculation.js';

const products = [
  { _id: 'A', userId: 'owner', description: 'Parts A', code: 'A', stock: 7, rate: 200, status: 'Active', minStockLevel: 2, category: 'Parts', warehouse: 'Main', branch: 'North' },
  { _id: 'B', userId: 'owner', description: 'Oil B', code: 'B', stock: 0, rate: 200, status: 'Active', minStockLevel: 1, category: 'Fluids', warehouse: 'Main', branch: 'North' },
  { _id: 'C', userId: 'owner', description: 'Parts C', code: 'C', stock: 2, rate: 200, status: 'Active', minStockLevel: 1, category: 'Parts', warehouse: 'Main', branch: 'North' },
  { _id: 'D', userId: 'owner', description: 'Inactive D', code: 'D', stock: 5, rate: 200, status: 'Inactive', minStockLevel: 1, category: '', warehouse: 'Main', branch: 'North' },
];
let sequence = 0;
const movement = (productId, direction, totalQty, date, extra = {}) => ({ _id: `movement-${++sequence}`, productId, userId: 'owner', direction, totalQty, date, unitCost: 100, status: 'Completed', branch: 'North', warehouse: 'Main', sourceType: direction === 'in' ? 'purchase-entry' : 'invoice', ...extra });
const movements = [movement('A', 'in', 10, '2026-03-01'), movement('B', 'in', 2, '2026-03-01'), movement('C', 'in', 2, '2026-03-01'), movement('D', 'in', 5, '2026-03-01'),
  movement('A', 'out', 3, '2026-04-01'), movement('A', 'out', 4, '2026-04-02', { sourceType: 'stock-transfer', sourceId: 'transfer-1' }),
  movement('A', 'in', 4, '2026-04-02', { sourceType: 'stock-transfer', sourceId: 'transfer-1', warehouse: 'Second', branch: 'South' }), movement('B', 'out', 2, '2026-04-03'),
  movement('A', 'in', 99, '2026-04-04', { status: 'Pending' }), movement('A', 'out', 99, '2026-04-04', { excluded: true }), movement('A', 'in', 99, '2026-04-04', { excluded: true })];
const reservations = ['A', 'C'].map((productId) => ({ productId, quantity: 1, date: '2026-04-05', status: 'Active', warehouse: 'Main', branch: 'North' }));

function dashboard(query = {}) {
  const filters = { from: '2026-04-01', to: '2026-04-30', ...query };
  const calculated = calculateInventoryStock({ products, movements, reservations, ...filters, groupBy: 'location', costingMethod: 'fifo' });
  const report = { ...calculated, data: calculated.data.map((row) => ({ ...products.find((product) => product._id === row.productId), ...row })) };
  return buildInventoryDashboard(report, filters);
}

test('dashboard KPIs use distinct products and physical stock independently of reservations', () => {
  const result = dashboard();
  assert.deepEqual(result.stats, { totalProducts: 4, totalQty: 14, totalValue: 1400, reservedQty: 2, lowStock: 1, outOfStock: 1 });
  assert.deepEqual(result.distribution.map((row) => row.count), [1, 1, 1, 1, 0]);
  assert.equal(result.data.find((row) => row.productId === 'A').availableQty, 6);
  assert.deepEqual(result.warehouses.map((row) => [row.name, row.quantity, row.value]), [['Main', 10, 1000], ['Second', 4, 400]]);
  assert.equal(result.categories.find((row) => row.key === 'Parts').value, 900);
});

test('trends use eligible posted movements in the period and net internal transfers', () => {
  const result = dashboard();
  assert.deepEqual(result.trend.map((row) => [row.label, row.inwardQty, row.outwardQty]), [['2026-04-01', 0, 3], ['2026-04-02', 0, 0], ['2026-04-03', 0, 2]]);
  assert.equal(result.data.find((row) => row.productId === 'A').stockOutQty, 3);
  const second = dashboard({ warehouse: 'Second' });
  assert.deepEqual(second.stats, { totalProducts: 1, totalQty: 4, totalValue: 400, reservedQty: 0, lowStock: 0, outOfStock: 0 });
  assert.equal(second.trend[0].inwardQty, 4);
});

test('branch and date selections affect balances and period movements, not only labels', () => {
  assert.equal(dashboard({ branch: 'South' }).stats.totalQty, 4);
  const earlier = dashboard({ to: '2026-04-01' });
  assert.equal(earlier.stats.totalQty, 16);
  assert.equal(earlier.stats.reservedQty, 0);
  assert.equal(earlier.warehouses.length, 1);
  assert.equal(dashboard({ from: '2026-04-03' }).trend.length, 1);
});

test('KPI, status, unassigned category and movement drill-downs return their matching products', () => {
  assert.deepEqual(dashboard({ stockStatus: 'low' }).data.map((row) => row.productId), ['C']);
  assert.deepEqual(dashboard({ stockStatus: 'out' }).data.map((row) => row.productId), ['B']);
  assert.deepEqual(dashboard({ stockStatus: 'reserved' }).data.map((row) => row.productId), ['A', 'C']);
  assert.deepEqual(dashboard({ categoryMissing: '1' }).data.map((row) => row.productId), ['D']);
  assert.deepEqual(dashboard({ movementFrom: '2026-04-03', movementTo: '2026-04-03', movementDirection: 'out' }).data.map((row) => row.productId), ['B']);
});

test('incomplete valuation stays null, and empty and invalid requests are explicit', () => {
  const result = buildInventoryDashboard({ data: [{ productId: 'unknown', description: 'Legacy', physicalQty: 3, availableQty: 3, reservedQty: 0, closingValue: null, category: '', warehouse: '', references: [] }] });
  assert.equal(result.stats.totalValue, null);
  assert.equal(result.categories[0].value, null);
  assert.equal(result.warehouses[0].value, null);
  assert.equal(buildInventoryDashboard({ data: [] }).stats.totalProducts, 0);
  assert.throws(() => dashboard({ stockStatus: 'invented' }), /status/);
  assert.throws(() => dashboard({ movementFrom: '2026-04-05', movementTo: '2026-04-01' }), /range/);
});

test('long periods use monthly buckets with actual date bounds for drill-down', () => {
  const result = dashboard({ from: '2026-01-01' });
  assert.equal(result.trend.find((row) => row.label === '2026-03').inwardQty, 19);
  assert.deepEqual(result.trend.find((row) => row.label === '2026-04'), { label: '2026-04', from: '2026-04-01', to: '2026-04-30', inwardQty: 0, outwardQty: 5 });
});

test('overstock uses a configured physical maximum without treating zero as a limit', () => {
  const base = { status: 'Active', physicalQty: 20, availableQty: 15, minStockLevel: 2, maxStockLevel: 10 };
  assert.equal(inventoryStockStatus(base), 'Overstock');
  assert.equal(inventoryStockStatus({ ...base, maxStockLevel: 0 }), 'In Stock');
  assert.equal(inventoryStockStatus({ ...base, availableQty: 0 }), 'Out of Stock');
  assert.equal(inventoryStockStatus({ ...base, availableQty: 1 }), 'Low Stock');
  const result = buildInventoryDashboard({ data: [{ ...base, productId: 'over', description: 'Overstock', closingValue: 2000, references: [] }] }, { stockStatus: 'overstock' });
  assert.equal(result.data[0].stockStatus, 'Overstock');
  assert.equal(result.distribution.find((row) => row.key === 'overstock').count, 1);
  assert.equal(buildInventoryDashboard({ data: [{ ...base, productId: 'over', references: [] }] }, { zeroStock: '1' }).data.length, 0);
});

test('column sorting is stable and keeps unknown valuation last in either direction', () => {
  const rows = [{ productId: 'B', physicalQty: 2, stockValue: null, code: 'SKU-2' }, { productId: 'C', physicalQty: 1, stockValue: 10, code: 'SKU-10' }, { productId: 'A', physicalQty: 2, stockValue: 5, code: 'SKU-1' }];
  assert.deepEqual(sortInventoryProducts([...rows], { sortBy: 'physicalQty', sortDirection: 'desc' }).map((row) => row.productId), ['A', 'B', 'C']);
  assert.deepEqual(sortInventoryProducts([...rows], { sortBy: 'sku', sortDirection: 'asc' }).map((row) => row.productId), ['A', 'B', 'C']);
  for (const direction of ['asc', 'desc']) assert.equal(sortInventoryProducts([...rows], { sortBy: 'stockValue', sortDirection: direction }).at(-1).productId, 'B');
  assert.throws(() => sortInventoryProducts(rows, { sortBy: '$where' }), /sorting/);
  assert.throws(() => sortInventoryProducts(rows, { sortBy: 'physicalQty', sortDirection: 'invented' }), /sorting/);
});
