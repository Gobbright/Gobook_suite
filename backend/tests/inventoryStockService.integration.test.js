import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppUser } from '../src/models/AppUser.js';
import { Product } from '../src/models/Product.js';
import { Warehouse } from '../src/models/Warehouse.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { InventoryReservation } from '../src/models/InventoryReservation.js';
import { InventoryTransfer } from '../src/models/InventoryTransfer.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Invoice } from '../src/models/Invoice.js';
import { OnlineOrder } from '../src/models/OnlineOrder.js';
import { reserveInventory, releaseInventory, createInventoryTransfer, transitionInventoryTransfer } from '../src/services/inventoryStockOperations.js';
import { inventoryReportForRequest, loadInventoryStock } from '../src/services/inventoryStockService.js';
import { postInventoryForDocument } from '../src/services/inventoryMovements.js';
import { getStockSummary, getStockLedger } from '../src/modules/retail/inventory/reportController.js';
import { inventoryDashboardForRequest, inventoryProductDetailsForRequest } from '../src/services/inventoryDashboard.js';

test('central inventory service on an isolated replica-set database', { skip: !process.env.INVENTORY_TEST_MONGODB_URI, timeout: 120000 }, async (context) => {
  const dbName = `gobook_stock_service_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.INVENTORY_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  try {
    for (const Model of [AppUser, Product, Warehouse, BusinessSettings, StockIn, StockOut, InventoryReservation, InventoryTransfer, AuditLog, Invoice, OnlineOrder]) await Model.init();
    const actor = await AppUser.create({ name: 'Inventory test owner', email: 'inventory-test@example.test', role: 'Super Admin', accountType: 'owner', status: 'Active' });
    const userId = actor._id;
    const user = { id: String(userId), role: 'Super Admin', accountType: 'owner', isSuperAdmin: true };
    await BusinessSettings.create({ userId, inventoryCostingMethod: 'fifo' });
    await Warehouse.create([{ userId, name: 'Main', branch: 'North' }, { userId, name: 'Second', branch: 'South' }]);
    async function setup() {
      for (const Model of [InventoryReservation, InventoryTransfer, StockIn, StockOut, Product]) await Model.deleteMany({ userId });
      const product = await Product.create({ userId, code: 'STOCK-1', description: 'Stock item', stock: 10, rate: 200, purchasePrice: 100, warehouse: 'Main', branch: 'North' });
      await StockIn.create({ userId, stockInNo: 'OPEN-1', productId: product._id, productName: product.description, supplier: 'Opening', totalQty: 10, totalValue: 1000, unitCost: 100,
        status: 'Completed', date: new Date('2026-01-01'), warehouse: 'Main', branch: 'North', sourceType: 'product-opening', sourceId: product._id });
      return product;
    }
    const request = (body, id) => ({ user, body, params: { id }, query: {} });
    const transferBody = (product, quantity = 3, requestId = 'transfer-request-1') => ({ productId: product._id, fromBranch: 'North', toBranch: 'South', fromWarehouse: 'Main', toWarehouse: 'Second', quantity, date: '2026-04-01', referenceNo: 'TRANSFER-1', requestId });
    const reserveBody = (product, quantity = 3, requestId = 'reservation-request-1') => ({ productId: product._id, branch: 'North', warehouse: 'Main', quantity, referenceNo: 'ORDER-1', requestId });

    await context.test('configured cost reports, filtered KPIs and tenant isolation use existing records', async () => {
      const product = await setup();
      await Product.create({ userId: new mongoose.Types.ObjectId(), code: 'FOREIGN', description: 'Other company', stock: 100, rate: 5 });
      const report = await inventoryReportForRequest({ user, query: { branch: 'North', warehouse: 'Main', from: '2026-01-01', to: '2026-04-30' } });
      assert.equal(report.data.length, 1);
      assert.equal(report.data[0].productId, String(product._id));
      assert.equal(report.data[0].closingValue, 1000);
      assert.equal(report.costingMethod, 'fifo');
      assert.equal((await inventoryReportForRequest({ user, query: { search: 'not-present' } })).data.length, 0);
    });

    await context.test('reservation retries cannot duplicate holds and concurrent holds cannot overbook', async () => {
      const product = await setup();
      const body = reserveBody(product, 6);
      const first = await reserveInventory(request(body));
      assert.equal(String((await reserveInventory(request(body)))._id), String(first._id));
      await assert.rejects(reserveInventory(request({ ...body, quantity: 7 })), /requestId/);
      const report = await inventoryReportForRequest({ user, query: {} });
      assert.equal(report.data[0].physicalQty, 10);
      assert.equal(report.data[0].reservedQty, 6);
      assert.equal(report.data[0].availableQty, 4);
      await assert.rejects(reserveInventory(request(reserveBody(product, 5, 'reservation-request-2'))), /Insufficient/);
      await releaseInventory(request({ reason: 'Order cancelled' }, String(first._id)));
      assert.equal((await inventoryReportForRequest({ user, query: {} })).data[0].availableQty, 10);
      const concurrent = await Promise.allSettled([reserveInventory(request(reserveBody(product, 6, 'reservation-concurrent-a'))), reserveInventory(request(reserveBody(product, 6, 'reservation-concurrent-b')))]);
      assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
    });

    await context.test('sales cannot issue stock reserved by the centralized service', async () => {
      const product = await setup();
      await reserveInventory(request(reserveBody(product, 6)));
      const sale = { _id: new mongoose.Types.ObjectId(), documentType: 'invoice', number: 'SALE-HOLD', items: [{ productId: product._id, qty: 5, rate: 200 }] };
      await assert.rejects(postInventoryForDocument(sale, userId), /reserved|available stock/);
      assert.equal((await Product.findById(product._id)).stock, 10);
      assert.equal(await StockOut.countDocuments({ sourceId: sale._id }), 0);
    });

    await context.test('draft transfer has no stock effect and concurrent posting creates exactly one paired movement', async () => {
      const product = await setup();
      const draft = await createInventoryTransfer(request(transferBody(product)));
      assert.equal(await StockOut.countDocuments({ sourceId: draft._id }), 0);
      await Promise.all([transitionInventoryTransfer(request({ action: 'post' }, String(draft._id))), transitionInventoryTransfer(request({ action: 'post' }, String(draft._id)))]);
      assert.equal(await StockOut.countDocuments({ sourceId: draft._id }), 1);
      assert.equal(await StockIn.countDocuments({ sourceId: draft._id }), 1);
      assert.equal((await Product.findById(product._id)).stock, 10);
      const report = await inventoryReportForRequest({ user, query: { groupBy: 'location' } });
      assert.equal(report.data.find((row) => row.warehouse === 'Main').physicalQty, 7);
      assert.equal(report.data.find((row) => row.warehouse === 'Second').closingValue, 300);
      const aggregate = await inventoryReportForRequest({ user, query: {} });
      assert.deepEqual([aggregate.data[0].inwardQty, aggregate.data[0].outwardQty, aggregate.data[0].physicalQty], [10, 0, 10]);
    });

    await context.test('transfer cancellation retains dispatch/receipt history and balances net to their original locations', async () => {
      const product = await setup();
      const transfer = await createInventoryTransfer(request(transferBody(product)));
      await transitionInventoryTransfer(request({ action: 'post' }, String(transfer._id)));
      await transitionInventoryTransfer(request({ action: 'cancel', reason: 'Destination changed' }, String(transfer._id)));
      await transitionInventoryTransfer(request({ action: 'cancel', reason: 'Retry' }, String(transfer._id)));
      assert.equal(await StockOut.countDocuments({ sourceId: transfer._id }), 2);
      assert.equal(await StockIn.countDocuments({ sourceId: transfer._id }), 2);
      const report = await inventoryReportForRequest({ user, query: { groupBy: 'location' } });
      assert.equal(report.data.find((row) => row.warehouse === 'Main').physicalQty, 10);
      assert.ok(!report.data.some((row) => row.warehouse === 'Second' && row.physicalQty !== 0));
    });

    await context.test('source posting retries retain movement identity, edits retain audit snapshots and database uniqueness blocks duplicate lines', async () => {
      const product = await setup();
      const source = { _id: new mongoose.Types.ObjectId(), documentType: 'purchase-entry', number: 'PURCHASE-IDEMPOTENT', branch: 'North', meta: { date: '2026-04-01' }, items: [{ productId: product._id, qty: 2, rate: 100 }] };
      await postInventoryForDocument(source, userId);
      const first = await StockIn.findOne({ sourceId: source._id }).lean();
      assert.equal((await postInventoryForDocument(source, userId)).duplicate, true);
      assert.equal(String((await StockIn.findOne({ sourceId: source._id }))._id), String(first._id));
      await postInventoryForDocument({ ...source, items: [{ ...source.items[0], qty: 3 }] }, userId);
      assert.equal((await Product.findById(product._id)).stock, 13);
      assert.ok(await AuditLog.exists({ modelName: 'InventoryStockPosting', documentId: source._id }));
      const saved = await StockIn.findOne({ sourceId: source._id }).lean();
      await assert.rejects(StockIn.create({ ...saved, _id: new mongoose.Types.ObjectId(), stockInNo: 'DUPLICATE-LINE' }), (error) => error.code === 11000);
    });

    await context.test('an incomplete source posting is rejected instead of being counted as a successful retry', async () => {
      const product = await setup();
      const source = { _id: new mongoose.Types.ObjectId(), documentType: 'purchase-entry', number: 'INCOMPLETE-PURCHASE', meta: { date: '2026-04-01' }, items: [{ productId: product._id, qty: 1, rate: 100 }, { productId: product._id, qty: 2, rate: 100 }] };
      await postInventoryForDocument(source, userId);
      await StockIn.deleteOne({ sourceId: source._id, sourceLineId: '1' });
      await assert.rejects(postInventoryForDocument(source, userId), /incomplete/);
      assert.equal((await Product.findById(product._id)).stock, 13);
      assert.equal(await StockIn.countDocuments({ sourceId: source._id }), 1);
    });

    await context.test('posting failure rolls back both transfer legs and transfer status', async () => {
      const product = await setup();
      const transfer = await createInventoryTransfer(request(transferBody(product, 11)));
      await assert.rejects(transitionInventoryTransfer(request({ action: 'post' }, String(transfer._id))), /Insufficient/);
      assert.equal((await InventoryTransfer.findById(transfer._id)).status, 'Draft');
      assert.equal(await StockIn.countDocuments({ sourceId: transfer._id }), 0);
      assert.equal(await StockOut.countDocuments({ sourceId: transfer._id }), 0);
      const missing = await loadInventoryStock({ products: [], costingMethod: 'fifo' });
      assert.equal(missing.data.length, 0);
    });

    await context.test('failure after dispatch rolls back the first leg and concurrency revision', async () => {
      const product = await setup();
      const transfer = await createInventoryTransfer(request(transferBody(product)));
      const originalCreate = StockIn.create;
      StockIn.create = async function (...args) {
        if (String(args[0]?.sourceId) === String(transfer._id)) throw new Error('Injected receipt failure');
        return originalCreate.apply(this, args);
      };
      try {
        await assert.rejects(transitionInventoryTransfer(request({ action: 'post' }, String(transfer._id))), /Injected receipt failure/);
      } finally {
        StockIn.create = originalCreate;
      }
      assert.equal(await StockOut.countDocuments({ sourceId: transfer._id }), 0);
      assert.equal((await InventoryTransfer.findById(transfer._id)).status, 'Draft');
      assert.equal((await Product.findById(product._id)).inventoryRevision, 0);
    });

    await context.test('variant and batch transfers convert configured units and preserve variant counters', async () => {
      const product = await setup();
      product.purchaseUnit = 'Box'; product.conversionToUnit = 'Nos'; product.conversionQty = 2;
      product.variants = [{ size: 'Small', stock: 10, purchasePrice: 100, rate: 200 }];
      await product.save();
      const variantId = product.variants[0]._id;
      await StockIn.updateOne({ productId: product._id }, { $set: { variantId, batchNumber: 'BATCH-1' } });
      const transfer = await createInventoryTransfer(request({ ...transferBody(product, 2), unit: 'Box', variantId, batchNumber: 'BATCH-1' }));
      await transitionInventoryTransfer(request({ action: 'post' }, String(transfer._id)));
      const report = await inventoryReportForRequest({ user, query: { groupBy: 'batch', warehouse: 'Second', batch: 'BATCH-1' } });
      assert.equal(report.data[0].physicalQty, 4);
      assert.equal(report.data[0].closingValue, 400);
      assert.equal(report.data[0].variantId, String(variantId));
      assert.equal((await Product.findById(product._id)).variants[0].stock, 10);
      await assert.rejects(reserveInventory(request({ ...reserveBody(product, 1), variantId, batchNumber: 'OTHER-BATCH' })), /Insufficient/);
    });

    await context.test('branch restrictions and mutation permissions are enforced independently of client fields', async () => {
      const member = await AppUser.create({ name: 'Branch member', email: 'branch-member@example.test', accountType: 'member', branch: 'North', status: 'Active', permissions: { actions: { edit: true } } });
      const product = await Product.create({ userId: member._id, code: 'MEMBER-ITEM', description: 'Member item', warehouse: 'Main', branch: 'North' });
      await Warehouse.create([{ userId: member._id, name: 'Main', branch: 'North' }, { userId: member._id, name: 'Second', branch: 'South' }]);
      const memberRequest = { user: { id: String(member._id), accountType: 'member', branch: 'North' }, query: { branch: 'South' }, body: transferBody(product) };
      await assert.rejects(createInventoryTransfer(memberRequest), (error) => error.status === 403 || error.statusCode === 403);
      await AppUser.updateOne({ _id: member._id }, { $set: { 'permissions.actions.edit': false } });
      await assert.rejects(reserveInventory({ ...memberRequest, body: reserveBody(product) }), /permission/);
      assert.equal(await InventoryTransfer.countDocuments({ userId: member._id }), 0);
    });

    await context.test('dashboard filters and totals use stored transfers, reservations and configured costs', async () => {
      const product = await setup();
      await Product.updateOne({ _id: product._id }, { $set: { category: 'Parts', brand: 'Real brand', partNumber: 'PART-321' } });
      const transfer = await createInventoryTransfer(request(transferBody(product)));
      await transitionInventoryTransfer(request({ action: 'post' }, String(transfer._id)));
      await reserveInventory(request(reserveBody(product, 2)));
      const dashboard = await inventoryDashboardForRequest({ user, query: { limit: '1', search: 'PART-321', category: 'Parts' } });
      assert.deepEqual(dashboard.stats, { totalProducts: 1, totalQty: 10, totalValue: 1000, reservedQty: 2, lowStock: 0, outOfStock: 0 });
      assert.equal(dashboard.warehouses.find((row) => row.key === 'Second').value, 300);
      assert.ok(dashboard.filterOptions.warehouse.includes('Second'));
      assert.ok(dashboard.trend.every((point) => point.outwardQty === 0));
      assert.equal((await inventoryDashboardForRequest({ user, query: { branch: 'South' } })).stats.totalQty, 3);
      assert.equal((await inventoryDashboardForRequest({ user, query: { warehouse: 'Second' } })).stats.totalQty, 3);
      assert.equal((await inventoryDashboardForRequest({ user, query: { dateTo: '2026-03-31' } })).stats.totalQty, 10);
      assert.equal((await inventoryDashboardForRequest({ user, query: { brand: 'not-present' } })).total, 0);
      assert.equal((await inventoryDashboardForRequest({ user, query: { stockStatus: 'reserved' } })).total, 1);
      await assert.rejects(inventoryDashboardForRequest({ user, query: { sort: 'invalid' } }), /sorting/);
    });

    await context.test('table sorting and pagination operate on all matches and preserve threshold filters', async () => {
      const product = await setup();
      await Product.updateOne({ _id: product._id }, { $set: { maxStockLevel: 5 } });
      await Product.create({ userId, code: 'ZERO', description: 'Zero stock', stock: 0 });
      const query = { page: '1', limit: '1', sortBy: 'physicalQty', sortDirection: 'asc' };
      const first = await inventoryDashboardForRequest({ user, query });
      const second = await inventoryDashboardForRequest({ user, query: { ...query, page: '2' } });
      assert.equal(first.total, 2);
      assert.equal(first.data.length, 1);
      assert.equal(first.data[0].physicalQty, 0);
      assert.equal(second.data[0].physicalQty, 10);
      assert.equal(second.data[0].maxStockLevel, 5);
      assert.equal(second.data[0].stockStatus, 'Overstock');
      assert.equal(first.stats.totalQty, second.stats.totalQty);
      assert.equal((await inventoryDashboardForRequest({ user, query: { stockStatus: 'overstock' } })).total, 1);
      assert.equal((await inventoryDashboardForRequest({ user, query: { zeroStock: '1' } })).data[0].code, 'ZERO');
    });

    await context.test('product details use calculated variants, reservations and scope, not variant master counters', async () => {
      const product = await setup();
      product.variants = [{ size: 'Small', barcode: 'VARIANT-123', stock: 99 }]; await product.save();
      const variantId = product.variants[0]._id;
      await StockIn.updateOne({ productId: product._id }, { $set: { variantId, batchNumber: 'BATCH-1' } });
      await reserveInventory(request({ ...reserveBody(product, 2), variantId, batchNumber: 'BATCH-1' }));
      const detailRequest = { user, params: { productId: String(product._id) }, query: { warehouse: 'Main', branch: 'North' } };
      const result = await inventoryProductDetailsForRequest(detailRequest);
      assert.equal(result.product.physicalQty, 10);
      assert.equal(result.product.reservedQty, 2);
      assert.equal(result.product.availableQty, 8);
      assert.equal(result.data[0].variantName, 'Small');
      assert.equal(result.data[0].physicalQty, 10);
      assert.equal(result.data[0].batch, 'BATCH-1');
      assert.equal(result.data[0].stockValue, 1000);
      assert.equal(result.product.variants, undefined);
      assert.equal((await inventoryDashboardForRequest({ user, query: { search: 'VARIANT-123' } })).total, 1);
      assert.equal((await inventoryDashboardForRequest({ user, query: { search: 'STOCK-1' } })).total, 1);
      await assert.rejects(inventoryProductDetailsForRequest({ ...detailRequest, user: { id: String(new mongoose.Types.ObjectId()) } }), /No stock records/);
      await assert.rejects(inventoryProductDetailsForRequest({ ...detailRequest, query: { warehouse: 'Second' } }), /No stock records/);
    });

    await context.test('summary and ledger reuse posted stock calculations and omit draft or cancelled sources', async () => {
      const product = await setup();
      const draft = await Invoice.create({ userId, documentType: 'invoice', number: 'DRAFT-TEST', lifecycleStatus: 'draft', items: [] });
      await StockOut.create({ userId, stockOutNo: 'DRAFT-OUT', to: 'Draft customer', productId: product._id, totalQty: 2, totalValue: 400, date: new Date('2026-04-02'), status: 'Completed', sourceId: draft._id, sourceType: 'invoice', warehouse: 'Main', branch: 'North' });
      await Product.updateOne({ _id: product._id }, { $set: { stock: 8 } });
      async function responseFor(handler, query) {
        let body;
        await handler({ user, query }, { json(value) { body = value; } }, (error) => { throw error; });
        return body;
      }
      const summary = await responseFor(getStockSummary, { dateFrom: '2026-01-01', dateTo: '2026-04-30' });
      assert.equal(summary.stats.totalQty, 10);
      assert.equal(summary.stats.totalValue, 1000);
      assert.equal(summary.data[0].warehouse, 'Main');
      assert.equal(summary.data[0].branch, 'North');
      const ledger = await responseFor(getStockLedger, { dateFrom: '2026-01-01', dateTo: '2026-04-30' });
      assert.equal(ledger.total, 1);
      assert.equal(ledger.data[0].direction, 'in');
      assert.equal(ledger.stockBalances[0].physicalQty, 10);
      draft.lifecycleStatus = 'cancelled'; await draft.save();
      assert.equal((await responseFor(getStockLedger, {})).total, 1);
    });
  } finally {
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_stock_service_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
