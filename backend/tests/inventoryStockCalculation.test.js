import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInventoryStock, inventoryBaseQuantity } from '../src/services/inventoryStockCalculation.js';

const product = (stock, overrides = {}) => ({ _id: 'product-1', userId: 'owner-1', description: 'Inventory item', itemType: 'Product', stock, unit: 'Nos', baseUnit: 'Nos', rate: 300, purchasePrice: 100, warehouse: 'Main', ...overrides });
let sequence = 0;
const movement = (direction, totalQty, date, overrides = {}) => ({ _id: `movement-${++sequence}`, userId: 'owner-1', productId: 'product-1', direction, totalQty, date, status: 'Completed', warehouse: 'Main', branch: 'North', sourceType: direction === 'in' ? 'purchase-entry' : 'invoice', unitCost: 100, totalValue: totalQty * 100, ...overrides });

test('opening, inward, outward, closing, physical, reserved and available reconcile', () => {
  const result = calculateInventoryStock({ products: [product(3)], from: '2026-04-01', to: '2026-04-30', costingMethod: 'fifo',
    movements: [movement('in', 5, '2026-03-01'), movement('out', 2, '2026-04-02'), movement('in', 1, '2026-04-03', { sourceType: 'sales-return' }), movement('out', 1, '2026-04-04', { sourceType: '' })],
    reservations: [{ productId: 'product-1', warehouse: 'Main', branch: 'North', quantity: 1, date: '2026-04-05', status: 'Active' }] });
  const [row] = result.data;
  assert.deepEqual([row.openingQty, row.inwardQty, row.outwardQty, row.closingQty], [5, 1, 3, 3]);
  assert.deepEqual([row.physicalQty, row.reservedQty, row.availableQty, row.closingValue], [3, 1, 2, 300]);
  assert.equal(row.references.length, 4);
});

test('historical closing excludes future movements without treating them as opening stock', () => {
  const [row] = calculateInventoryStock({ products: [product(15)], to: '2026-04-30', movements: [movement('in', 5, '2026-03-01'), movement('in', 10, '2026-05-01')] }).data;
  assert.equal(row.physicalQty, 5);
  assert.equal(row.openingQty, 0);
});

test('FIFO, moving weighted average and the existing selling-price basis are explicit', () => {
  const movements = [movement('in', 10, '2026-04-01'), movement('in', 10, '2026-04-02', { unitCost: 200 }), movement('out', 5, '2026-04-03')];
  for (const [method, expected] of [['fifo', 2500], ['weighted-average', 2250], ['selling-price', 4500]]) {
    const [row] = calculateInventoryStock({ products: [product(15)], to: '2026-04-30', movements, costingMethod: method }).data;
    assert.equal(row.closingValue, expected);
    assert.equal(row.valuationComplete, true);
  }
});

test('draft movements and excluded cancelled-source movements do not contribute', () => {
  const movements = [movement('in', 10, '2026-04-01'), movement('out', 2, '2026-04-02', { excluded: true }),
    movement('in', 2, '2026-04-03', { sourceType: 'invoice-cancellation', excluded: true }), movement('out', 99, '2026-04-04', { status: 'Pending' })];
  const [row] = calculateInventoryStock({ products: [product(10)], to: '2026-04-30', movements }).data;
  assert.deepEqual([row.inwardQty, row.outwardQty, row.physicalQty], [10, 0, 10]);
});

test('transfers move stock between locations without inflating company inward/outward totals', () => {
  const movements = [movement('in', 10, '2026-04-01'), movement('out', 4, '2026-04-02', { sourceType: 'stock-transfer', sourceId: 'transfer-1' }),
    movement('in', 4, '2026-04-02', { warehouse: 'Second', sourceType: 'stock-transfer', sourceId: 'transfer-1' })];
  const options = { products: [product(10)], to: '2026-04-30', movements, costingMethod: 'fifo' };
  const [company] = calculateInventoryStock(options).data;
  assert.deepEqual([company.physicalQty, company.inwardQty, company.outwardQty], [10, 10, 0]);
  assert.equal(company.closingValue, 1000);
  const locations = calculateInventoryStock({ ...options, groupBy: 'location' }).data;
  assert.equal(locations.find((row) => row.warehouse === 'Main').physicalQty, 6);
  assert.equal(locations.find((row) => row.warehouse === 'Second').closingValue, 400);
  const [destination] = calculateInventoryStock({ ...options, warehouse: 'Second' }).data;
  assert.equal(destination.inwardQty, 4);
  const [branch] = calculateInventoryStock({ ...options, branch: 'North' }).data;
  assert.deepEqual([branch.inwardQty, branch.outwardQty], [10, 0]);
});

test('partial sales returns restore the original issued FIFO cost rather than current purchase price', () => {
  const movements = [movement('in', 3, '2026-04-01'), movement('out', 2, '2026-04-02', { sourceId: 'sale-1', sourceLineId: 'line-1' }),
    movement('in', 2, '2026-04-03', { unitCost: 400 }),
    movement('in', 1, '2026-04-04', { sourceType: 'sales-return', costSourceId: 'sale-1', costSourceLineId: 'line-1', unitCost: undefined, costEstimated: true }),
    movement('in', 1, '2026-04-05', { sourceType: 'sales-return', costSourceId: 'sale-1', costSourceLineId: 'line-1', unitCost: undefined, costEstimated: true })];
  const [row] = calculateInventoryStock({ products: [product(5, { purchasePrice: 999 })], movements, costingMethod: 'fifo', to: '2026-04-30' }).data;
  assert.equal(row.closingValue, 1100);
  assert.equal(row.valuationComplete, true);
  assert.equal(row.inwardValue, 1300);
});

test('transfer FIFO layers preserve acquisition costs and ordering', () => {
  const movements = [movement('in', 2, '2026-04-01'), movement('in', 2, '2026-04-02', { unitCost: 200 }),
    movement('out', 3, '2026-04-03', { sourceType: 'stock-transfer' }),
    movement('in', 3, '2026-04-03', { sourceType: 'stock-transfer', warehouse: 'Second', unitCost: 400 / 3, costLayers: [{ quantity: 2, unitCost: 100, acquiredAt: '2026-04-01' }, { quantity: 1, unitCost: 200, acquiredAt: '2026-04-02' }] }),
    movement('out', 1, '2026-04-04', { warehouse: 'Second' })];
  const [row] = calculateInventoryStock({ products: [product(3)], movements, costingMethod: 'fifo', warehouse: 'Second', to: '2026-04-30' }).data;
  assert.equal(row.closingValue, 300);
});

test('duplicate movements are counted once and conflicting duplicates are rejected', () => {
  const receipt = movement('in', 3, '2026-04-01', { movementKey: 'receipt:line-1' });
  const result = calculateInventoryStock({ products: [product(3)], movements: [receipt, { ...receipt }], to: '2026-04-30' });
  assert.equal(result.data[0].physicalQty, 3);
  assert.ok(result.warnings.includes('DUPLICATE_MOVEMENT_IGNORED'));
  assert.throws(() => calculateInventoryStock({ products: [product(3)], movements: [receipt, { ...receipt, totalQty: 4 }] }), /Conflicting duplicate/);
  assert.throws(() => calculateInventoryStock({ products: [product(3)], movements: [receipt, { ...receipt, batchNumber: 'DIFFERENT' }] }), /Conflicting duplicate/);
});

test('unknown legacy opening stock is visible and incomplete cost history is not presented as precise', () => {
  const result = calculateInventoryStock({ products: [product(4)], costingMethod: 'fifo' });
  assert.equal(result.data[0].openingQty, 4);
  assert.equal(result.data[0].closingValue, null);
  assert.equal(result.data[0].estimatedClosingValue, 400);
  assert.ok(result.warnings.includes('UNRECORDED_OPENING_BALANCE'));
});

test('batch, branch and variant dimensions do not merge distinct locations', () => {
  const movements = [movement('in', 2, '2026-04-01', { variantId: 'small', batchNumber: 'A' }),
    movement('in', 3, '2026-04-01', { variantId: 'large', batchNumber: 'B', branch: 'South' })];
  const result = calculateInventoryStock({ products: [product(5)], movements, groupBy: 'batch', branch: 'North', variantId: 'small', batch: 'A' });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].physicalQty, 2);
});

test('released and expired reservations respect the selected report date', () => {
  const reservations = [{ productId: 'product-1', quantity: 2, date: '2026-04-01', status: 'Released', releasedAt: '2026-04-20', warehouse: 'Main' },
    { productId: 'product-1', quantity: 1, date: '2026-04-01', status: 'Active', expiresAt: '2026-04-10', warehouse: 'Main' }];
  assert.equal(calculateInventoryStock({ products: [product(5)], reservations, to: '2026-04-05' }).data[0].reservedQty, 3);
  assert.equal(calculateInventoryStock({ products: [product(5)], reservations, to: '2026-04-30' }).data[0].reservedQty, 0);
});

test('units convert explicitly to base quantities and unknown conversions are rejected', () => {
  assert.equal(inventoryBaseQuantity({ qty: 2, unit: 'Box' }, product(0, { purchaseUnit: 'Box', conversionQty: 12, conversionToUnit: 'Nos' })).quantity, 24);
  assert.equal(inventoryBaseQuantity({ qty: 0.125, unit: 'Kg' }, { unit: 'Kg' }).quantity, 0.125);
  assert.throws(() => inventoryBaseQuantity({ qty: 2, unit: 'Box' }, product(0)), /conversion/);
  assert.throws(() => inventoryBaseQuantity({ qty: 2, unit: 'Box', conversionFactor: 100 }, product(0)), /conversion/);
  assert.throws(() => inventoryBaseQuantity({ qty: 2, conversionFactor: 5 }, product(0)), /configuration/);
  assert.throws(() => inventoryBaseQuantity({ qty: Infinity }, product(0)), /Invalid quantity/);
});

test('invalid dates, groupings, quantities and cost layers are rejected', () => {
  for (const options of [{ from: '2026-02-30' }, { from: '2026-05-01', to: '2026-04-01' }, { groupBy: 'invalid' }, { costingMethod: 'invented' }]) assert.throws(() => calculateInventoryStock(options));
  assert.throws(() => calculateInventoryStock({ products: [product(1)], movements: [movement('in', NaN, '2026-04-01')] }), /invalid completed/);
  assert.throws(() => calculateInventoryStock({ products: [product(1)], movements: [movement('in', 1, '2026-04-01', { costLayers: [{ quantity: 2, unitCost: 1 }] })] }), /cost layers/);
});

test('defined variants without posted history have calculated zero rows, not master-counter balances', () => {
  const zero = calculateInventoryStock({ products: [product(0, { variants: [{ _id: 'small', stock: 0 }, { _id: 'large', stock: 0 }] })], groupBy: 'variant' });
  assert.deepEqual(zero.data.map((row) => [row.variantId, row.physicalQty]), [['small', 0], ['large', 0]]);
  const legacy = calculateInventoryStock({ products: [product(5, { variants: [{ _id: 'small', stock: 5 }] })], movements: [movement('in', 5, '2026-04-01')], groupBy: 'variant', to: '2026-04-30' });
  assert.equal(legacy.data.find((row) => row.variantId === 'small').physicalQty, 0);
  assert.equal(legacy.data.find((row) => row.variantId === '').physicalQty, 5);
  assert.ok(legacy.data.find((row) => row.variantId === '').warnings.includes('UNASSIGNED_VARIANT'));
});
