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
import { updateProduct } from '../src/modules/retail/inventory/productController.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { InventoryReservation } from '../src/models/InventoryReservation.js';
import { productHasVariants } from '../src/utils/productVariants.js';
import { CATEGORIES, RETAIL_SUBCATEGORIES } from '../src/constants/categories.js';

// Opt in with a dedicated test replica-set URI. Always override its database
// name, and refuse cleanup unless connected to the generated test database.
test('real MongoDB inventory transactions', { skip: !process.env.INVENTORY_TEST_MONGODB_URI }, async (t) => {
  const dbName = `gobook_inventory_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.INVENTORY_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const userId = new mongoose.Types.ObjectId();
  try {
    for (const Model of [Product, Customer, OnlineOrder, StockIn, StockOut, AuditLog, InventoryReservation]) await Model.init();
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

    function editRequest(product, body, baseline = product) {
      return { user: { id: String(userId), accountType: 'owner' }, params: { id: String(product._id) }, query: {},
        body: { ...body, stockAdjustment: { expectedStock: baseline.stock,
          expectedVariants: (baseline.variants || []).map(row => ({ _id: String(row._id), stock: row.stock })) } } };
    }

    await t.test('every category and retail subcategory uses the same product classification, billing and stock correction rules', async () => {
      const contexts = [...CATEGORIES.map(category => ({ category })), ...RETAIL_SUBCATEGORIES.map(retailSubcategory => ({ category: 'retail', retailSubcategory }))];
      for (const context of contexts) {
        const label = context.retailSubcategory || context.category;
        const { product, invoice } = await setup(4);
        product.variants = [{ modelName: product.description, barcode: 'GLOBAL-SINGLE', stock: 0 }, { modelName: product.description, barcode: 'GLOBAL-SINGLE', stock: 4 }];
        await product.save();
        assert.equal(productHasVariants(product), false, label);
        invoice.documentType = 'invoice';
        invoice.items = [{ productId: product._id, description: product.description, barcode: 'GLOBAL-SINGLE', qty: 1, rate: 100 }];
        await postInventoryForDocument(invoice, userId);
        await postInventoryForDocument(invoice, userId);
        const afterSale = await Product.findById(product._id).lean();
        assert.equal(afterSale.stock, 3, label);
        assert.deepEqual(afterSale.variants.map(row => row.stock), [0, 3], label);
        const request = editRequest(product, { variantMode: 'single', stock: 0, variants: [] }, afterSale);
        Object.assign(request.user, context);
        const corrected = await invoke(updateProduct, request);
        assert.ifError(corrected.error);
        assert.equal(corrected.body.stock, 0, label);
        assert.deepEqual(corrected.body.variants.map(row => row.stock), [0, 0], label);
        assert.equal(productHasVariants(corrected.body), false, label);

        const second = await setup(4);
        second.product.variants = [{ size: 'Small', colour: 'Black', stock: 2 }, { size: 'Large', colour: 'White', stock: 2 }];
        await second.product.save();
        assert.equal(productHasVariants(second.product), true, label);
        const variants = second.product.toObject().variants.map((row, index) => ({ ...row, stock: index ? 2 : 0 }));
        const variantRequest = editRequest(second.product, { variantMode: 'variants', variants });
        Object.assign(variantRequest.user, context);
        const edited = await invoke(updateProduct, variantRequest);
        assert.ifError(edited.error);
        assert.equal(edited.body.stock, 2, label);
        assert.deepEqual(edited.body.variants.map(row => row.stock), [0, 2], label);
        assert.equal(productHasVariants(edited.body), true, label);
      }
    });

    await t.test('a legacy single product saves and corrects stock in the single form while retaining bill references', async () => {
      const { product } = await setup(4);
      product.description = 'Speaker';
      product.productType = 'Standard';
      product.variants = [{ modelName: 'Speaker', barcode: 'SINGLE-LEGACY', stock: 0 }, { modelName: 'Speaker', barcode: 'SINGLE-LEGACY', stock: 4 }];
      await product.save();
      assert.equal(productHasVariants(product), false);
      const ids = product.variants.map(row => String(row._id));
      const renamed = await invoke(updateProduct, { user: { id: String(userId), accountType: 'owner' }, params: { id: String(product._id) }, query: {},
        body: { variantMode: 'single', description: 'Renamed speaker', rate: 250, variants: [], stock: 999 } });
      assert.ifError(renamed.error);
      assert.equal(renamed.body.stock, 4);
      assert.equal(renamed.body.variantMode, 'single');
      assert.equal(productHasVariants(renamed.body), false);
      assert.deepEqual(renamed.body.variants.map(row => String(row._id)), ids);
      assert.deepEqual(renamed.body.variants.map(row => row.stock), [0, 4]);
      assert.deepEqual(renamed.body.variants.map(row => row.rate), [250, 250]);
      const corrected = await invoke(updateProduct, editRequest(product, { variantMode: 'single', stock: 0, variants: [] }, renamed.body));
      assert.ifError(corrected.error);
      assert.equal(corrected.body.stock, 0);
      assert.deepEqual(corrected.body.variants.map(row => row.stock), [0, 0]);
      assert.deepEqual(corrected.body.variants.map(row => String(row._id)), ids);
      assert.equal(productHasVariants(await Product.findById(product._id)), false);
      assert.equal(String((await StockOut.findOne({ userId })).variantId), ids[1]);
    });

    await t.test('real variant products keep their options and only the edited variant quantity changes', async () => {
      const { product } = await setup(4);
      product.productType = 'Standard';
      product.variants = [{ modelName: 'Phone', colour: 'Black', stock: 2 }, { modelName: 'Phone', colour: 'White', stock: 2 }];
      await product.save();
      assert.equal(productHasVariants(product), true);
      const wrongMode = await invoke(updateProduct, editRequest(product, { variantMode: 'single', stock: 0, variants: [] }));
      assert.equal(wrongMode.error.statusCode, 400);
      assert.equal((await Product.findById(product._id)).stock, 4);
      const variants = product.toObject().variants.map((row, index) => ({ ...row, stock: index ? 2 : 0 }));
      const edited = await invoke(updateProduct, editRequest(product, { variantMode: 'variants', variants }));
      assert.ifError(edited.error);
      assert.equal(edited.body.stock, 2);
      assert.deepEqual(edited.body.variants.map(row => row.stock), [0, 2]);
      assert.equal(productHasVariants(edited.body), true);
      assert.equal(String((await StockOut.findOne({ userId })).variantId), String(product.variants[0]._id));
    });

    await t.test('product stock can be set to zero, increased and saved again without duplicate movements', async () => {
      const { product } = await setup(4);
      const request = editRequest(product, { stock: 0 });
      const result = await invoke(updateProduct, request);
      assert.ifError(result.error);
      assert.equal(result.body.stock, 0);
      const issue = await StockOut.findOne({ userId, sourceType: 'product-adjustment' });
      assert.equal(issue.totalQty, 4);
      assert.ok(await AuditLog.findOne({ documentId: product._id, 'meta.reason': 'Product stock edited' }));
      assert.equal((await invoke(updateProduct, request)).error.statusCode, 409);
      assert.equal(await StockOut.countDocuments({ userId }), 1);
      const increased = await invoke(updateProduct, editRequest(product, { stock: 6 }, result.body));
      assert.ifError(increased.error);
      assert.equal(increased.body.stock, 6);
      assert.equal((await StockIn.findOne({ userId, sourceType: 'product-adjustment' })).totalQty, 6);
      const same = await invoke(updateProduct, editRequest(product, { stock: 6 }, increased.body));
      assert.ifError(same.error);
      assert.equal(await StockIn.countDocuments({ userId }), 1);
    });

    await t.test('a product stock edit records each legacy duplicate variant by ID', async () => {
      const { product } = await setup(4);
      product.variants = [{ modelName: 'Speaker', barcode: 'DUPLICATE', stock: 0 }, { modelName: 'Speaker', barcode: 'DUPLICATE', stock: 4 }];
      await product.save();
      const variants = product.toObject().variants.map(row => ({ ...row, stock: 0 }));
      const result = await invoke(updateProduct, editRequest(product, { stock: 0, variants }));
      assert.ifError(result.error);
      assert.equal(result.body.stock, 0);
      assert.deepEqual(result.body.variants.map(row => row.stock), [0, 0]);
      const issue = await StockOut.findOne({ userId });
      assert.equal(String(issue.variantId), String(product.variants[1]._id));
      assert.equal(issue.totalQty, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 1);
    });

    await t.test('moving quantity between variants records both differences even when the total stays unchanged', async () => {
      const { product } = await setup(4);
      product.variants = [{ modelName: 'Black', stock: 4 }, { modelName: 'White', stock: 0 }];
      await product.save();
      const variants = product.toObject().variants.map(row => ({ ...row, stock: 2 }));
      const result = await invoke(updateProduct, editRequest(product, { variants }));
      assert.ifError(result.error);
      assert.equal(result.body.stock, 4);
      assert.deepEqual(result.body.variants.map(row => row.stock), [2, 2]);
      assert.equal((await StockOut.findOne({ userId })).totalQty, 2);
      assert.equal((await StockIn.findOne({ userId })).totalQty, 2);
    });

    await t.test('a stock edit racing a sale cannot overwrite the sale or deduct twice', async () => {
      const { product, invoice } = await setup(4);
      invoice.documentType = 'invoice';
      invoice.items[0].qty = 1;
      const [edit, sale] = await Promise.all([
        invoke(updateProduct, editRequest(product, { stock: 0 })),
        postInventoryForDocument(invoice, userId).then(() => ({ success: true }), error => ({ error })),
      ]);
      const saved = await Product.findById(product._id);
      if (edit.error) {
        assert.equal(edit.error.statusCode, 409);
        assert.equal(sale.success, true);
        assert.equal(saved.stock, 3);
      } else {
        assert.ok(sale.error);
        assert.equal(saved.stock, 0);
      }
      assert.equal(await StockOut.countDocuments({ userId }), 1);
    });

    await t.test('repeated electronics purchase and bill posting, edits and reversal keep exact stock without duplicates', async () => {
      const { product, invoice } = await setup(0);
      product.description = 'ZEBRONICS SPEAKER';
      product.itemGroup = 'Electronics';
      product.productType = 'Standard';
      product.barcode = 'SPEAKER-LIFECYCLE';
      await product.save();
      invoice.businessSettingsSnapshot = { retailSubcategory: 'electronics-technology' };
      invoice.items = [{ productId: product._id, description: product.description, barcode: product.barcode, qty: 4, rate: 100 }];
      await postInventoryForDocument(invoice, userId);
      await postInventoryForDocument(invoice, userId);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal((await Product.findById(product._id)).variants.length, 0);
      const sale = { ...invoice, _id: new mongoose.Types.ObjectId(), documentType: 'invoice', number: 'INV-LIFECYCLE',
        items: [{ ...invoice.items[0], size: product.description, qty: 4 }] };
      await postInventoryForDocument(sale, userId);
      await postInventoryForDocument(sale, userId);
      assert.equal((await Product.findById(product._id)).stock, 0);
      assert.equal(await StockOut.countDocuments({ userId, sourceId: sale._id }), 1);
      sale.items[0].qty = 2;
      await postInventoryForDocument(sale, userId);
      assert.equal((await Product.findById(product._id)).stock, 2);
      assert.equal((await StockOut.findOne({ sourceId: sale._id })).totalQty, 2);
      await reverseInventoryForDocument(sale, userId);
      assert.equal((await Product.findById(product._id)).stock, 4);
      await reverseInventoryForDocument(invoice, userId);
      assert.equal((await Product.findById(product._id)).stock, 0);
      assert.equal(await StockIn.countDocuments({ userId }), 0);
      assert.equal(await StockOut.countDocuments({ userId }), 0);
    });

    await t.test('an ambiguous old bill cannot reverse only the parent and leave model quantities unchanged', async () => {
      const { product, invoice } = await setup(4);
      product.variants = [{ modelName: 'Black', stock: 2 }, { modelName: 'White', stock: 2 }];
      await product.save();
      invoice.documentType = 'invoice';
      await StockOut.create({ userId, stockOutNo: 'SOUT-LEGACY-MISSING-VARIANT', date: new Date(),
        productId: product._id, productName: product.description, to: 'Customer', totalQty: 1,
        status: 'Completed', sourceType: 'invoice', sourceId: invoice._id });
      await assert.rejects(reverseInventoryForDocument(invoice, userId), /Inventory variant is missing/);
      const saved = await Product.findById(product._id);
      assert.equal(saved.stock, 4);
      assert.deepEqual(saved.variants.map(row => row.stock), [2, 2]);
      assert.equal(await StockOut.countDocuments({ userId, sourceId: invoice._id }), 1);
    });

    await t.test('after correcting legacy stock to zero, new purchases and bills update parent and model together', async () => {
      const { product, invoice } = await setup(4);
      product.variants = [{ modelName: 'Speaker', barcode: 'CORRECTION', stock: 0 }, { modelName: 'Speaker', barcode: 'CORRECTION', stock: 4 }];
      await product.save();
      const corrected = await invoke(updateProduct, editRequest(product, { variants: product.toObject().variants.map(row => ({ ...row, stock: 0 })) }));
      assert.ifError(corrected.error);
      invoice.businessSettingsSnapshot = { retailSubcategory: 'electronics-technology' };
      invoice.items = [{ productId: product._id, description: product.description, barcode: 'CORRECTION', qty: 3, rate: 100 }];
      await postInventoryForDocument(invoice, userId);
      let saved = await Product.findById(product._id);
      assert.equal(saved.stock, 3);
      assert.equal(saved.variants.length, 2);
      assert.equal(saved.variants.reduce((total, row) => total + row.stock, 0), 3);
      const receipt = await StockIn.findOne({ sourceId: invoice._id });
      assert.equal(saved.variants.id(receipt.variantId).stock, 3);
      const sale = { ...invoice, _id: new mongoose.Types.ObjectId(), documentType: 'invoice', number: 'INV-AFTER-CORRECTION' };
      await postInventoryForDocument(sale, userId);
      saved = await Product.findById(product._id);
      assert.equal(saved.stock, 0);
      assert.deepEqual(saved.variants.map(row => row.stock), [0, 0]);
      assert.equal(String((await StockOut.findOne({ sourceId: sale._id })).variantId), String(receipt.variantId));
    });

    await t.test('stale, negative and malformed stock edits leave quantities and movements unchanged', async () => {
      const { product, invoice } = await setup(10);
      await postInventoryForDocument({ ...invoice, documentType: 'invoice', items: [{ ...invoice.items[0], qty: 2 }] }, userId);
      const stale = await invoke(updateProduct, editRequest(product, { stock: 0 }));
      assert.equal(stale.error.statusCode, 409);
      const saved = await Product.findById(product._id);
      assert.equal(saved.stock, 8);
      assert.equal((await invoke(updateProduct, editRequest(saved, { stock: -1 }))).error.statusCode, 400);
      const malformed = editRequest(saved, { stock: 0 });
      malformed.body.stockAdjustment.expectedVariants = [null];
      assert.equal((await invoke(updateProduct, malformed)).error.statusCode, 409);
      assert.equal(await StockOut.countDocuments({ userId, sourceType: 'product-adjustment' }), 0);
      assert.equal((await Product.findById(product._id)).stock, 8);
    });

    await t.test('stock edits roll back both the balance and movement if recording fails', async () => {
      const { product } = await setup(4);
      const create = StockOut.create.bind(StockOut);
      mock.method(StockOut, 'create', async (...args) => { await create(...args); throw new Error('Stock edit recording failed'); });
      try {
        const result = await invoke(updateProduct, editRequest(product, { stock: 0 }));
        assert.match(result.error.message, /Stock edit recording failed/);
        assert.equal((await Product.findById(product._id)).stock, 4);
        assert.equal(await StockOut.countDocuments({ userId }), 0);
      } finally { mock.restoreAll(); }
    });

    await t.test('product stock edits cannot reduce reserved stock or edit another account', async () => {
      const { product } = await setup(4);
      product.inventoryRevision = 1;
      await product.save();
      await InventoryReservation.create({ userId, productId: product._id, warehouse: product.warehouse,
        quantity: 2, requestId: randomUUID(), fingerprint: 'test', referenceNo: 'RES-EDIT', date: new Date() });
      const result = await invoke(updateProduct, editRequest(product, { stock: 0 }));
      assert.equal(result.error.statusCode, 409);
      assert.match(result.error.message, /reserved/);
      assert.equal((await Product.findById(product._id)).stock, 4);
      assert.equal(await StockOut.countDocuments({ userId }), 0);
      const request = editRequest(product, { stock: 0 });
      request.user.id = String(new mongoose.Types.ObjectId());
      assert.equal((await invoke(updateProduct, request)).error.statusCode, 404);
      assert.equal((await Product.findById(product._id)).stock, 4);
    });

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

    await t.test('legacy barcode duplicates deduct stock atomically and a stale product edit cannot restore it', async () => {
      const { product, invoice } = await setup(4);
      await Product.updateOne({ _id: product._id }, { $set: { variants: [
        { modelName: 'Speaker', barcode: 'SPEAKER-1', stock: 0 },
        { modelName: 'Speaker', barcode: 'SPEAKER-1', stock: 4 },
      ] } });
      const beforeSale = await Product.findById(product._id).lean();
      invoice.documentType = 'invoice';
      invoice.items = [{ productId: product._id, description: product.description, barcode: 'SPEAKER-1', size: 'Speaker', qty: 4, rate: 100 }];
      await postInventoryForDocument(invoice, userId);
      let saved = await Product.findById(product._id).lean();
      assert.equal(saved.stock, 0);
      assert.deepEqual(saved.variants.map(v => v.stock), [0, 0]);
      assert.equal(String((await StockOut.findOne({ sourceId: invoice._id })).variantId), String(beforeSale.variants[1]._id));
      const result = await invoke(updateProduct, { user: { id: String(userId), accountType: 'owner' }, params: { id: String(product._id) }, body: { description: 'Renamed speaker', rate: 125, stock: 99, variants: beforeSale.variants }, query: {} });
      assert.equal(result.error, undefined);
      saved = await Product.findById(product._id).lean();
      assert.equal(saved.description, 'Renamed speaker');
      assert.equal(saved.stock, 0);
      assert.deepEqual(saved.variants.map(v => v.stock), [0, 0]);
      assert.deepEqual(saved.variants.map(v => String(v._id)), beforeSale.variants.map(v => String(v._id)));
      assert.equal(await StockOut.countDocuments({ userId, sourceId: invoice._id }), 1);
      const removedIdentity = await invoke(updateProduct, { user: { id: String(userId), accountType: 'owner' }, params: { id: String(product._id) }, body: { variants: beforeSale.variants.map(({ _id, ...v }) => v) }, query: {} });
      assert.equal(removedIdentity.error?.statusCode, 400);
      assert.equal((await Product.findById(product._id)).stock, 0);
    });

    await t.test('real product edits preserve IDs for variants distinguished by color and storage', async () => {
      const { product } = await setup(4);
      await Product.updateOne({ _id: product._id }, { $set: { variants: [
        { modelName: 'Phone', colour: 'Black', storage: '128 GB', stock: 2 },
        { modelName: 'Phone', colour: 'Black', storage: '256 GB', stock: 2 },
      ] } });
      const original = await Product.findById(product._id).lean();
      const result = await invoke(updateProduct, { user: { id: String(userId), accountType: 'owner' }, params: { id: String(product._id) }, body: { variants: original.variants.map(v => ({ ...v, rate: 500 })) }, query: {} });
      assert.equal(result.error, undefined);
      const saved = await Product.findById(product._id).lean();
      assert.deepEqual(saved.variants.map(v => v.stock), [2, 2]);
      assert.deepEqual(saved.variants.map(v => String(v._id)), original.variants.map(v => String(v._id)));
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
