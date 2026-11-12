import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { Customer } from '../src/models/Customer.js';
import { OnlineOrder } from '../src/models/OnlineOrder.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { updateOnlineOrderStatus } from '../src/modules/online-store/onlineStoreController.js';
import { postInventoryForDocument, reverseInventoryForDocument } from '../src/services/inventoryMovements.js';
import { adjustManualStock } from '../src/services/manualStockAdjustment.js';
import { inventoryTransaction } from '../src/services/inventoryTransaction.js';

// Opt in with a dedicated test replica-set URI. Always override its database
// name, and refuse cleanup unless connected to the generated test database.
test('real MongoDB inventory transactions', { skip: !process.env.INVENTORY_TEST_MONGODB_URI }, async (t) => {
  const dbName = `gobook_inventory_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.INVENTORY_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const userId = new mongoose.Types.ObjectId();
  try {
    for (const Model of [Product, Customer, OnlineOrder, StockIn, StockOut]) await Model.init();
    async function invoke(handler, req) {
      let body;
      let status;
      let error;
      const res = { status(value) { status = value; return res; }, json(value) { body = value; return res; } };
      await handler(req, res, (value) => { error = value; });
      return { body, status, error };
    }
    async function setup(stock = 10) {
      await Product.deleteMany({ userId });
      await Customer.deleteMany({ userId });
      await OnlineOrder.deleteMany({ userId });
      await StockIn.deleteMany({ userId });
      await StockOut.deleteMany({ userId });
      const product = await Product.create({ userId, code: '1001', description: 'Integration item', stock });
      return { product, invoice: { _id: new mongoose.Types.ObjectId(), userId, documentType: 'purchase-entry', number: 'PE-TEST', businessSettingsSnapshot: { retailSubcategory: 'general' }, items: [{ productId: product._id, description: product.description, qty: 5, rate: 100, itemType: 'Product' }] } };
    }

    await t.test('database rolls back stock and an inserted receipt when a later write fails', async () => {
      const { product, invoice } = await setup();
      const create = StockIn.create.bind(StockIn);
      mock.method(StockIn, 'create', async (...args) => { await create(...args); throw new Error('Injected failure after insert'); });
      try {
        await assert.rejects(postInventoryForDocument(invoice, userId), /Injected failure/);
        assert.equal((await Product.findById(product._id)).stock, 10);
        assert.equal(await StockIn.countDocuments({ userId }), 0);
      } finally { mock.restoreAll(); }
    });

    await t.test('simultaneous outbound documents cannot overdraw stock', async () => {
      const { product, invoice } = await setup();
      const makeReturn = () => ({ ...invoice, _id: new mongoose.Types.ObjectId(), documentType: 'supplier-return', items: [{ ...invoice.items[0], qty: 6 }] });
      const results = await Promise.allSettled([postInventoryForDocument(makeReturn(), userId), postInventoryForDocument(makeReturn(), userId)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 1);
    });

    await t.test('simultaneous reposts of one receipt keep a single stock effect', async () => {
      const { product, invoice } = await setup(0);
      await Promise.all([postInventoryForDocument(invoice, userId), postInventoryForDocument(invoice, userId)]);
      assert.equal((await Product.findById(product._id)).stock, 5);
      assert.equal(await StockIn.countDocuments({ userId, sourceId: invoice._id }), 1);
    });

    await t.test('simultaneous manual stock-outs cannot overdraw stock', async () => {
      const { product } = await setup();
      const createIssue = (stockOutNo) => inventoryTransaction(async () => {
        const entry = await StockOut.create({ userId, stockOutNo, date: new Date(), productId: product._id, productName: product.description, to: 'Test', totalQty: 6, status: 'Completed' });
        await adjustManualStock(entry, -1);
      });
      const results = await Promise.allSettled([createIssue('SOUT-MANUAL-1'), createIssue('SOUT-MANUAL-2')]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 1);
    });

    await t.test('manual variant adjustments update parent and variant quantities together', async () => {
      const { product } = await setup(0);
      product.variants = [{ size: 'Blue', stock: 0, rate: 100 }];
      await product.save();
      const variant = product.variants[0];
      const entry = { userId, productId: product._id, productName: product.description, variantId: variant._id, variantName: 'Blue', totalQty: 3, status: 'Completed' };
      await inventoryTransaction(() => adjustManualStock(entry, 1));
      const updated = await Product.findById(product._id);
      assert.equal(updated.stock, 3);
      assert.equal(updated.variants.id(variant._id).stock, 3);
    });

    await t.test('an insufficient variant cannot deduct only the parent stock', async () => {
      const { product } = await setup(10);
      product.variants = [{ size: 'Blue', stock: 2, rate: 100 }];
      await product.save();
      const variant = product.variants[0];
      const entry = { userId, productId: product._id, productName: product.description, variantId: variant._id, variantName: 'Blue', totalQty: 3, status: 'Completed' };
      await assert.rejects(inventoryTransaction(() => adjustManualStock(entry, -1)), /Insufficient stock/);
      const unchanged = await Product.findById(product._id);
      assert.equal(unchanged.stock, 10);
      assert.equal(unchanged.variants.id(variant._id).stock, 2);
    });

    await t.test('a deleted product movement cannot reverse into a replacement with the same name', async () => {
      const { product, invoice } = await setup(10);
      const deletedProductId = new mongoose.Types.ObjectId();
      await StockIn.create({
        userId, stockInNo: 'SIN-STALE', date: new Date(), productId: deletedProductId,
        productName: product.description, supplier: 'Vendor', totalQty: 5, status: 'Completed',
        sourceType: invoice.documentType, sourceId: invoice._id, sourceNo: invoice.number,
      });
      await assert.rejects(reverseInventoryForDocument(invoice, userId), /inventory product .* is missing/);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(await StockIn.countDocuments({ userId, sourceId: invoice._id }), 1);
    });

    await t.test('a stale purchase product ID cannot create or update a same-name replacement', async () => {
      const { product, invoice } = await setup(10);
      invoice.items[0].productId = new mongoose.Types.ObjectId();
      await assert.rejects(postInventoryForDocument(invoice, userId), /not linked to an inventory product/);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(await Product.countDocuments({ userId }), 1);
      assert.equal(await StockIn.countDocuments({ userId }), 0);
    });

    await t.test('online order confirmation aggregates duplicate lines and rolls back an overdraw', async () => {
      const { product } = await setup(10);
      const order = await OnlineOrder.create({
        userId, storeSettingsId: new mongoose.Types.ObjectId(), orderNo: 'OS-OVERDRAW',
        customerName: 'Online Buyer', customerPhone: '9000000000',
        items: [
          { productId: product._id, name: product.description, qty: 6, rate: 100, amount: 600 },
          { productId: product._id, name: product.description, qty: 6, rate: 100, amount: 600 },
        ],
        subtotal: 1200, grandTotal: 1200,
      });
      const result = await invoke(updateOnlineOrderStatus, { user: { id: userId }, params: { id: order._id }, body: { status: 'Confirmed' } });
      assert.equal(result.error?.statusCode, 409);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal((await OnlineOrder.findById(order._id)).status, 'Pending');
      assert.equal(await StockOut.countDocuments({ userId }), 0);
      assert.equal(await Customer.countDocuments({ userId }), 0);
    });

    await t.test('online order cancellation retains dispatch history and creates a traceable receipt', async () => {
      const { product } = await setup(10);
      const order = await OnlineOrder.create({
        userId, storeSettingsId: new mongoose.Types.ObjectId(), orderNo: 'OS-CANCEL',
        customerName: 'Online Buyer', customerPhone: '9000000000',
        items: [{ productId: product._id, name: product.description, qty: 3, rate: 100, amount: 300 }],
        subtotal: 300, grandTotal: 300,
      });
      const confirmed = await invoke(updateOnlineOrderStatus, { user: { id: userId }, params: { id: order._id }, body: { status: 'Confirmed' } });
      assert.equal(confirmed.error, undefined);
      assert.equal((await Product.findById(product._id)).stock, 7);
      const cancelled = await invoke(updateOnlineOrderStatus, { user: { id: userId }, params: { id: order._id }, body: { status: 'Cancelled' } });
      assert.equal(cancelled.error, undefined);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(await StockOut.countDocuments({ userId, sourceType: 'online-order', sourceId: order._id }), 1);
      assert.equal(await StockIn.countDocuments({ userId, sourceType: 'online-order-cancellation', sourceId: order._id }), 1);
    });

    await t.test('invoice barcode selects the exact variant and edited quantities replace its previous deduction', async () => {
      const { product, invoice } = await setup(20);
      await Product.updateOne({ _id: product._id }, { $set: { variants: [
        { size: 'M', colour: 'Red', barcode: 'RED-M', stock: 10 },
        { size: 'M', colour: 'Blue', barcode: 'BLUE-M', stock: 10 },
      ] } });
      invoice.documentType = 'invoice';
      invoice.items[0] = { ...invoice.items[0], size: 'M', barcode: 'BLUE-M', qty: 3 };
      await postInventoryForDocument(invoice, userId);
      let saved = await Product.findById(product._id).lean();
      assert.equal(saved.stock, 17);
      assert.deepEqual(saved.variants.map((row) => row.stock), [10, 7]);
      invoice.items[0].qty = 5;
      await postInventoryForDocument(invoice, userId);
      saved = await Product.findById(product._id).lean();
      assert.equal(saved.stock, 15);
      assert.deepEqual(saved.variants.map((row) => row.stock), [10, 5]);
      assert.equal(await StockOut.countDocuments({ sourceId: invoice._id }), 1);
      await reverseInventoryForDocument(invoice, userId);
      saved = await Product.findById(product._id).lean();
      assert.equal(saved.stock, 20);
      assert.deepEqual(saved.variants.map((row) => row.stock), [10, 10]);
    });

    await t.test('consumed manual receipts cannot be deleted into negative stock', async () => {
      const { product } = await setup(2);
      const receipt = { userId, productId: product._id, productName: product.description, totalQty: 5, status: 'Completed' };
      await assert.rejects(inventoryTransaction(() => adjustManualStock(receipt, -1)), /Insufficient stock/);
      assert.equal((await Product.findById(product._id)).stock, 2);
    });
  } finally {
    mock.restoreAll();
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
