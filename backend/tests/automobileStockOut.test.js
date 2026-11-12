import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { StockOut } from '../src/models/StockOut.js';
import { StockIn } from '../src/models/StockIn.js';
import { createStockInBatch } from '../src/modules/retail/inventory/stockInController.js';
import { createStockOutBatch } from '../src/modules/retail/inventory/stockOutController.js';

afterEach(() => mock.restoreAll());
const owner = '507f1f77bcf86cd799439001';
const first = '507f1f77bcf86cd799439002';
const second = '507f1f77bcf86cd799439003';
const variantId = '507f1f77bcf86cd799439004';
const copy = (data) => structuredClone(data);
function setup({ failCommit = false, variant = false, inward = false } = {}) {
  const Model = inward ? StockIn : StockOut;
  const numberField = inward ? 'stockInNo' : 'stockOutNo';
  let state = { products: [
    { _id: first, userId: owner, description: 'Tyre', itemType: 'Product', status: 'Active', warehouse: 'Main Warehouse', stock: 10, purchasePrice: 500, rate: 700, variants: variant ? [{ _id: variantId, modelName: 'R15', stock: 4, purchasePrice: 550 }] : [] },
    { _id: second, userId: owner, description: 'Filter', itemType: 'Product', status: 'Active', warehouse: 'Main Warehouse', stock: 5, purchasePrice: 100, rate: 150, variants: [] },
  ], entries: [] };
  mock.method(mongoose.connection, 'transaction', async (work) => {
    const before = copy(state);
    try { const result = await work(); if (failCommit) throw new Error('Commit failed'); return result; }
    catch (error) { state = before; throw error; }
  });
  mock.method(Model, 'find', (filter) => ({ lean: async () => copy(state.entries.filter((entry) => entry.userId === filter.userId && filter.$or.some((clause) => Object.entries(clause).every(([key, value]) => entry[key] === value)))) }));
  mock.method(Model, 'create', async (entry) => {
    if (state.entries.some((row) => row[numberField] === entry[numberField])) throw new Error('Duplicate number');
    const created = { ...copy(entry), _id: `record-${state.entries.length}`, createdAt: entry.createdAt || '2026-10-22T10:00:00Z' }; state.entries.push(created); return created;
  });
  mock.method(Model, 'deleteMany', async (filter) => { state.entries = state.entries.filter((entry) => !Object.entries(filter).every(([key, value]) => entry[key] === value)); });
  mock.method(Product, 'findOne', async (filter) => copy(state.products.find((product) => product._id === String(filter._id) && product.userId === filter.userId) || null));
  mock.method(Product, 'updateOne', async (filter, update) => {
    const product = state.products.find((row) => row._id === String(filter._id) && row.userId === filter.userId);
    if (!product || filter.stock && product.stock < filter.stock.$gte) return { matchedCount: 0 };
    const selectedVariant = filter.variants?.$elemMatch;
    const target = selectedVariant && product.variants.find((row) => row._id === selectedVariant._id);
    if (selectedVariant && (!target || selectedVariant.stock && target.stock < selectedVariant.stock.$gte)) return { matchedCount: 0 };
    product.stock += update.$inc.stock;
    if (target) target.stock += update.$inc['variants.$[variant].stock'];
    return { matchedCount: 1 };
  });
  return () => state;
}
const payload = (patch = {}) => ({ stockOutNo: 'SOUT-2026-001', date: '2026-10-22', warehouse: 'Main Warehouse', adjustmentReason: 'Workshop Consumption', status: 'Completed', items: [{ productId: first, qty: 2 }, { productId: second, qty: 3 }], ...patch });
async function call(body, category = 'automobile', inward = false) {
  let response; let failure; let code;
  await (inward ? createStockInBatch : createStockOutBatch)({ body, user: { id: owner, email: 'admin@example.test', category } }, { status(value) { code = value; return this; }, json(value) { response = value; } }, (error) => { failure = error; });
  return { response, failure, code };
}
test('confirmation deducts every line and derives value from inventory costs', async () => {
  const state = setup(); const result = await call(payload({ items: [{ productId: first, qty: 2, unitCost: 1 }, { productId: second, qty: 3 }] }));
  assert.equal(result.failure, undefined); assert.equal(result.code, 201);
  assert.deepEqual(state().products.map((row) => row.stock), [8, 2]);
  assert.deepEqual(state().entries.map((entry) => entry.totalValue), [1000, 300]);
  assert.deepEqual(state().entries.map((entry) => entry.stockOutNo), ['SOUT-2026-001-01', 'SOUT-2026-001-02']);
  assert.ok(state().entries.every((entry) => entry.createdBy === 'admin@example.test'));
});
test('insufficient stock on a later line rolls back earlier deductions and records', async () => {
  const state = setup(); const result = await call(payload({ items: [{ productId: first, qty: 2 }, { productId: second, qty: 6 }] }));
  assert.equal(result.failure.statusCode, 409); assert.equal(result.response, undefined);
  assert.deepEqual(state().products.map((row) => row.stock), [10, 5]); assert.equal(state().entries.length, 0);
});
test('drafts do not deduct stock and can be atomically confirmed', async () => {
  const state = setup(); assert.equal((await call(payload({ status: 'Pending' }))).failure, undefined);
  assert.deepEqual(state().products.map((row) => row.stock), [10, 5]);
  const result = await call(payload({ editDraft: true })); assert.equal(result.failure, undefined);
  assert.deepEqual(state().products.map((row) => row.stock), [8, 2]); assert.equal(state().entries.length, 2);
  assert.ok(state().entries.every((entry) => entry.status === 'Completed'));
});
test('failed draft confirmation preserves its original records', async () => {
  const state = setup(); await call(payload({ status: 'Pending' })); const before = copy(state());
  const result = await call(payload({ editDraft: true, items: [{ productId: first, qty: 20 }] }));
  assert.equal(result.failure.statusCode, 409); assert.deepEqual(state(), before);
});
test('completed entry replay cannot deduct stock a second time', async () => {
  const state = setup(); await call(payload()); const before = copy(state());
  const result = await call(payload({ editDraft: true })); assert.equal(result.failure.statusCode, 409); assert.deepEqual(state(), before);
});
test('a warehouse mismatch and foreign product cannot issue inventory', async () => {
  const state = setup(); const wrongWarehouse = await call(payload({ warehouse: 'Other Warehouse' })); assert.equal(wrongWarehouse.failure.statusCode, 400);
  const unknown = await call(payload({ items: [{ productId: '507f1f77bcf86cd799439099', qty: 1 }] })); assert.equal(unknown.failure.statusCode, 400);
  assert.equal(state().entries.length, 0); assert.deepEqual(state().products.map((row) => row.stock), [10, 5]);
});
test('variants require an explicit selection and deduct both variant and product stock', async () => {
  const state = setup({ variant: true }); const missing = await call(payload({ items: [{ productId: first, qty: 2 }] })); assert.equal(missing.failure.statusCode, 400);
  const result = await call(payload({ items: [{ productId: first, variantId, qty: 2 }] })); assert.equal(result.failure, undefined);
  assert.equal(state().products[0].stock, 8); assert.equal(state().products[0].variants[0].stock, 2); assert.equal(state().entries[0].totalValue, 1100);
});
test('commit failure produces no success response and preserves inventory', async () => {
  const state = setup({ failCommit: true }); const result = await call(payload());
  assert.equal(result.response, undefined); assert.match(result.failure.message, /Commit failed/); assert.equal(state().entries.length, 0); assert.deepEqual(state().products.map((row) => row.stock), [10, 5]);
});
test('other categories and invalid quantities are rejected', async () => {
  const state = setup(); assert.equal((await call(payload(), 'retail')).failure.statusCode, 403);
  for (const invalid of [0, -1, 'abc']) assert.equal((await call(payload({ items: [{ productId: first, qty: invalid }] }))).failure.statusCode, 400);
  assert.equal(state().entries.length, 0);
});

const inwardPayload = (patch = {}) => {
  const body = payload({ adjustmentReason: 'Stock Count Surplus', ...patch });
  delete body.stockOutNo;
  return { ...body, stockInNo: 'SIN-2026-001' };
};
test('manual stock in calculates values without requiring supplier or billing totals', async () => {
  const state = setup({ inward: true });
  const result = await call(inwardPayload({ totalValue: 1, totalQty: 999, itemCount: 999 }), 'automobile', true);
  assert.equal(result.failure, undefined); assert.equal(result.code, 201);
  assert.deepEqual(state().products.map((row) => row.stock), [12, 8]);
  assert.deepEqual(state().entries.map((entry) => entry.totalValue), [1000, 300]);
  assert.deepEqual(state().entries.map((entry) => entry.totalQty), [2, 3]);
  assert.ok(state().entries.every((entry) => entry.supplier === 'Stock Count Surplus' && entry.itemCount === 1));
  assert.deepEqual(state().entries.map((entry) => entry.stockInNo), ['SIN-2026-001-01', 'SIN-2026-001-02']);
});
test('inward drafts leave inventory unchanged and confirmation posts exactly once', async () => {
  const state = setup({ inward: true });
  assert.equal((await call(inwardPayload({ status: 'Pending' }), 'automobile', true)).failure, undefined);
  assert.deepEqual(state().products.map((row) => row.stock), [10, 5]);
  assert.equal((await call(inwardPayload({ editDraft: true }), 'automobile', true)).failure, undefined);
  assert.deepEqual(state().products.map((row) => row.stock), [12, 8]);
  const before = copy(state());
  assert.equal((await call(inwardPayload({ editDraft: true }), 'automobile', true)).failure.statusCode, 409);
  assert.deepEqual(state(), before);
});
test('a later invalid inward line rolls back earlier stock increases and preserves a saved draft', async () => {
  const state = setup({ inward: true });
  await call(inwardPayload({ status: 'Pending' }), 'automobile', true);
  const before = copy(state());
  const result = await call(inwardPayload({ editDraft: true, items: [{ productId: first, qty: 3 }, { productId: '507f1f77bcf86cd799439099', qty: 1 }] }), 'automobile', true);
  assert.equal(result.failure.statusCode, 400); assert.equal(result.response, undefined); assert.deepEqual(state(), before);
});
test('inward quantities can exceed existing stock and update the selected variant', async () => {
  const state = setup({ inward: true, variant: true });
  const result = await call(inwardPayload({ items: [{ productId: first, variantId, qty: 20 }] }), 'automobile', true);
  assert.equal(result.failure, undefined); assert.equal(state().products[0].stock, 30);
  assert.equal(state().products[0].variants[0].stock, 24); assert.equal(state().entries[0].totalValue, 11000);
});
test('inward commit failure cannot publish success or leave increased stock', async () => {
  const state = setup({ inward: true, failCommit: true });
  const result = await call(inwardPayload(), 'automobile', true);
  assert.equal(result.response, undefined); assert.match(result.failure.message, /Commit failed/);
  assert.deepEqual(state().products.map((row) => row.stock), [10, 5]); assert.equal(state().entries.length, 0);
});
test('manual endpoints reject purchase and sales source links rather than duplicating their movements', async () => {
  const state = setup();
  for (const patch of [{ sourceType: 'purchase-entry' }, { sourceId: first }, { sourceNo: 'INV-001' }]) {
    const result = await call(payload(patch)); assert.equal(result.failure.statusCode, 400);
  }
  assert.equal(state().entries.length, 0); assert.deepEqual(state().products.map((row) => row.stock), [10, 5]);
});
test('inward adjustments enforce manual-only sources and positive quantities', async () => {
  const state = setup({ inward: true });
  assert.equal((await call(inwardPayload({ sourceType: 'purchase-entry' }), 'automobile', true)).failure.statusCode, 400);
  for (const qty of [0, -1, 'bad']) assert.equal((await call(inwardPayload({ items: [{ productId: first, qty }] }), 'automobile', true)).failure.statusCode, 400);
  assert.equal((await call(inwardPayload(), 'retail', true)).failure.statusCode, 403);
  assert.equal(state().entries.length, 0);
});
