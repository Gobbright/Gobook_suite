import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { ModuleRecord } from '../src/models/ModuleRecord.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { createRecord, updateRecord, deleteRecord } from '../src/modules/module-records/controller.js';

test('hospital records commit their stock effects atomically', { skip: !process.env.INVENTORY_TEST_MONGODB_URI }, async t => {
  const dbName = `gobook_inventory_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.INVENTORY_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const userId = new mongoose.Types.ObjectId();
  async function invoke(handler, { data, moduleKey, id, owner = userId } = {}) {
    let body, error;
    const res = { status() { return res; }, json(value) { body = value; return res; } };
    await handler({ user: { id: String(owner), category: 'hospital', accountType: 'owner' }, params: { id: String(id || '') }, body: { moduleKey, data } }, res, value => { error = value; });
    return { body, error };
  }
  async function setup() {
    for (const Model of [Product, ModuleRecord, StockIn, StockOut]) await Model.deleteMany({ userId });
    return Product.create({ userId, code: '1001', description: 'Test medicine', itemGroup: 'Pharma', stock: 4, rate: 100 });
  }
  function bill(product, qty = 2) {
    return { inventoryPosting: { version: 1, key: randomUUID() }, billNo: 'PH-TEST', date: '2026-11-12', status: 'Paid',
      items: [{ id: String(product._id), name: product.description, qty, rate: 100, batch: 'MAIN' }] };
  }
  const billing = 'hospital/pharmacy-billing';
  try {
    for (const Model of [Product, ModuleRecord, StockIn, StockOut, AuditLog]) await Model.init();
    await t.test('ordinary module records retain their existing CRUD behavior without stock postings', async () => {
      const product = await setup();
      const created = await invoke(createRecord, { moduleKey: 'hospital/patients', data: { name: 'Test patient' } }); assert.ifError(created.error);
      const updated = await invoke(updateRecord, { id: created.body._id, data: { name: 'Updated patient' } }); assert.ifError(updated.error);
      assert.equal(updated.body.data.name, 'Updated patient');
      assert.ifError((await invoke(deleteRecord, { id: created.body._id })).error);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 0);
    });
    await t.test('billing deducts once, and retried or concurrent requests cannot duplicate the bill or stock issue', async () => {
      const product = await setup(); const data = bill(product, 4);
      const results = await Promise.all([invoke(createRecord, { moduleKey: billing, data }), invoke(createRecord, { moduleKey: billing, data })]);
      results.forEach(result => assert.ifError(result.error));
      assert.equal(String(results[0].body._id), String(results[1].body._id));
      assert.equal((await Product.findById(product._id)).stock, 0);
      assert.equal(await ModuleRecord.countDocuments({ userId, moduleKey: billing }), 1);
      assert.equal(await StockOut.countDocuments({ userId }), 1);
      const changed = await invoke(createRecord, { moduleKey: billing, data: { ...data, items: [{ ...data.items[0], qty: 1 }] } });
      assert.equal(changed.error.statusCode, 409);
      assert.equal((await Product.findById(product._id)).stock, 0);
    });
    await t.test('insufficient stock and a later movement failure cannot leave a saved bill or partial stock', async () => {
      const product = await setup();
      const failed = await invoke(createRecord, { moduleKey: billing, data: bill(product, 5) });
      assert.equal(failed.error.statusCode, 409);
      assert.equal(await ModuleRecord.countDocuments({ userId }), 0);
      const create = StockOut.create.bind(StockOut);
      mock.method(StockOut, 'create', async (...args) => { await create(...args); throw new Error('Injected hospital issue failure'); });
      try {
        const result = await invoke(createRecord, { moduleKey: billing, data: bill(product, 2) });
        assert.match(result.error.message, /Injected hospital issue failure/);
        assert.equal((await Product.findById(product._id)).stock, 4);
        assert.equal(await ModuleRecord.countDocuments({ userId }), 0);
        assert.equal(await StockOut.countDocuments({ userId }), 0);
      } finally { mock.restoreAll(); }
    });
    await t.test('editing or deleting a posted bill replaces or reverses its stock effect', async () => {
      const product = await setup(); const data = bill(product, 2);
      const created = await invoke(createRecord, { moduleKey: billing, data }); assert.ifError(created.error);
      const edited = await invoke(updateRecord, { id: created.body._id, data: { ...data, items: [{ ...data.items[0], qty: 1 }] } });
      assert.ifError(edited.error);
      assert.equal((await Product.findById(product._id)).stock, 3);
      assert.equal((await StockOut.findOne({ userId })).totalQty, 1);
      const removed = await invoke(deleteRecord, { id: created.body._id }); assert.ifError(removed.error);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 0);
    });
    await t.test('returns use the original sold item, reject excess quantities and preserve linked bill history', async () => {
      const product = await setup();
      const created = await invoke(createRecord, { moduleKey: billing, data: bill(product, 2) }); assert.ifError(created.error);
      const data = { inventoryPosting: { version: 1, key: randomUUID() }, returnId: 'RET-TEST', invoiceId: String(created.body._id), reusable: true,
        date: '2026-11-12', status: 'COMPLETED', items: [{ originalLineIndex: 0, returnQty: 1 }] };
      const restored = await invoke(createRecord, { moduleKey: 'hospital/pharmacy-returns', data }); assert.ifError(restored.error);
      assert.equal((await Product.findById(product._id)).stock, 3);
      const excess = await invoke(createRecord, { moduleKey: 'hospital/pharmacy-returns', data: { ...data,
        inventoryPosting: { version: 1, key: randomUUID() }, items: [{ originalLineIndex: 0, returnQty: 2 }] } });
      assert.equal(excess.error.statusCode, 409);
      assert.equal((await Product.findById(product._id)).stock, 3);
      assert.equal((await invoke(deleteRecord, { id: created.body._id })).error.statusCode, 409);
      const metadata = await invoke(updateRecord, { id: created.body._id, data: { ...created.body.data, notes: 'Metadata edit' } }); assert.ifError(metadata.error);
      assert.ifError((await invoke(deleteRecord, { id: restored.body._id })).error);
      assert.ifError((await invoke(deleteRecord, { id: created.body._id })).error);
      assert.equal((await Product.findById(product._id)).stock, 4);
    });
    await t.test('dispensing a pharmacy stock record is atomic, retry-safe and reversible', async () => {
      await setup();
      const stock = await ModuleRecord.create({ userId, moduleKey: 'hospital/pharmacy-stock', data: { medicineName: 'Batch medicine', quantity: 5 } });
      const data = { inventoryPosting: { version: 1, key: randomUUID() }, rxId: 'RX-TEST', status: 'DISPENSED', date: '2026-11-12',
        items: [{ stockSource: 'pharmacy-stock', stockId: String(stock._id), medicine: 'Batch medicine', dispensed: 2 }] };
      const created = await invoke(createRecord, { moduleKey: 'hospital/pharmacy-dispensing', data }); assert.ifError(created.error);
      assert.ifError((await invoke(createRecord, { moduleKey: 'hospital/pharmacy-dispensing', data })).error);
      assert.equal((await ModuleRecord.findById(stock._id)).data.quantity, 3);
      const edited = await invoke(updateRecord, { id: created.body._id, data: { ...data, items: [{ ...data.items[0], dispensed: 1 }] } }); assert.ifError(edited.error);
      assert.equal((await ModuleRecord.findById(stock._id)).data.quantity, 4);
      assert.ifError((await invoke(deleteRecord, { id: created.body._id })).error);
      assert.equal((await ModuleRecord.findById(stock._id)).data.quantity, 5);
    });
    await t.test('a mixed dispensing failure rolls back the pharmacy batch, product and dispensing record together', async () => {
      const product = await setup();
      const stock = await ModuleRecord.create({ userId, moduleKey: 'hospital/pharmacy-stock', data: { quantity: 5 } });
      const data = { inventoryPosting: { version: 1, key: randomUUID() }, status: 'DISPENSED', date: '2026-11-12', items: [
        { stockSource: 'pharmacy-stock', stockId: String(stock._id), medicine: 'Batch medicine', dispensed: 2 },
        { stockSource: 'inventory', stockId: String(product._id), medicine: product.description, dispensed: 10 },
      ] };
      const result = await invoke(createRecord, { moduleKey: 'hospital/pharmacy-dispensing', data });
      assert.equal(result.error.statusCode, 409);
      assert.equal((await ModuleRecord.findById(stock._id)).data.quantity, 5);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await ModuleRecord.countDocuments({ userId, moduleKey: 'hospital/pharmacy-dispensing' }), 0);
    });
    await t.test('hospital billing deducts the selected variant and cannot change another account inventory', async () => {
      const product = await setup();
      product.variants = [{ size: 'Small', stock: 2 }, { size: 'Large', stock: 2 }]; await product.save();
      const data = bill(product, 1); data.items[0].variantId = String(product.variants[1]._id);
      const created = await invoke(createRecord, { moduleKey: billing, data }); assert.ifError(created.error);
      assert.deepEqual((await Product.findById(product._id)).variants.map(row => row.stock), [2, 1]);
      const foreign = await invoke(createRecord, { moduleKey: billing, data: bill(product, 1), owner: new mongoose.Types.ObjectId() });
      assert.equal(foreign.error.statusCode, 400);
      assert.equal((await Product.findById(product._id)).stock, 3);
    });
  } finally {
    mock.restoreAll();
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
