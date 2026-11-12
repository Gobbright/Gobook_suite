import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppUser } from '../src/models/AppUser.js';
import { Product } from '../src/models/Product.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { StockAlert } from '../src/models/StockAlert.js';
import { Warehouse } from '../src/models/Warehouse.js';
import { Invoice } from '../src/models/Invoice.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { InventoryReservation } from '../src/models/InventoryReservation.js';
import { InventoryTransfer } from '../src/models/InventoryTransfer.js';
import { OnlineOrder } from '../src/models/OnlineOrder.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { stockAlertsForRequest, saveStockAlertConfig, reviewStockAlerts, stockAlertPurchaseOrderSeed } from '../src/services/stockAlerts.js';
import { inventoryDashboardForRequest } from '../src/services/inventoryDashboard.js';

test('stock alert lifecycle on an isolated replica set', { skip: !process.env.INVENTORY_TEST_MONGODB_URI, timeout: 120000 }, async (context) => {
  const dbName = `gobook_stock_alert_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.INVENTORY_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  try {
    for (const Model of [AppUser, Product, StockIn, StockOut, StockAlert, Warehouse, Invoice, BusinessSettings, InventoryReservation, InventoryTransfer, OnlineOrder, AuditLog]) await Model.init();
    const owner = await AppUser.create({ name: 'Alert test owner', email: 'owner@example.test', status: 'Active', accountType: 'owner' });
    const user = { id: String(owner._id), accountType: 'owner' };
    await Warehouse.create([{ userId: owner._id, name: 'Main', branch: 'North', status: 'Active' }, { userId: owner._id, name: 'Second', branch: 'South', status: 'Active' }]);
    let product;
    async function setup() {
      for (const Model of [Product, StockIn, StockOut, StockAlert, InventoryReservation]) await Model.deleteMany({});
      product = await Product.create({ userId: owner._id, code: 'ALERT-1', description: 'Real stock item', stock: 2, warehouse: 'Main', branch: 'North', minStockLevel: 3, maxStockLevel: 10, reorderLevel: 4, purchasePrice: 100 });
      await StockIn.create({ userId: owner._id, productId: product._id, stockInNo: 'OPEN-1', supplier: 'Opening', date: new Date('2026-01-01'), totalQty: 2, totalValue: 200, unitCost: 100, status: 'Completed', warehouse: 'Main', branch: 'North' });
    }
    const request = (query = {}) => ({ user, query });
    const configRequest = (body) => ({ user, query: {}, params: { productId: String(product._id) }, body });

    await context.test('concurrent refreshes keep one unresolved alert per type and location', async () => {
      await setup();
      const results = await Promise.all([stockAlertsForRequest(request()), stockAlertsForRequest(request()), stockAlertsForRequest(request())]);
      assert.equal(await StockAlert.countDocuments({ unresolved: true }), 2);
      assert.equal(results[0].data.find((row) => row.alertType === 'Low Stock').reorderQty, 8);
      assert.deepEqual(results[0].data.map((row) => row._id).sort(), results[1].data.map((row) => row._id).sort());
      const saved = await StockAlert.findOne().lean();
      await assert.rejects(StockAlert.create({ ...saved, _id: new mongoose.Types.ObjectId() }), (error) => error.code === 11000);
    });

    await context.test('review state persists, material stock changes reopen, replenishment resolves, and recurrence creates new history', async () => {
      await setup();
      const first = await stockAlertsForRequest(request());
      await reviewStockAlerts({ ...request(), body: { ids: first.data.map((row) => row._id) } });
      assert.ok((await stockAlertsForRequest(request())).data.every((row) => row.state === 'Reviewed'));
      await InventoryReservation.create({ userId: owner._id, productId: product._id, branch: 'North', warehouse: 'Main', quantity: 1, requestId: 'alert-reservation-1', fingerprint: 'test', referenceNo: 'ORDER-1', date: new Date(), status: 'Active' });
      assert.ok((await stockAlertsForRequest(request())).data.every((row) => row.state === 'Open'));
      await Product.updateOne({ _id: product._id }, { $set: { stock: 10 } });
      const receipt = await StockIn.create({ userId: owner._id, productId: product._id, stockInNo: 'RECEIPT-1', supplier: 'Vendor', date: new Date(), totalQty: 8, totalValue: 800, unitCost: 100, status: 'Completed', warehouse: 'Main', branch: 'North' });
      assert.equal((await stockAlertsForRequest(request())).total, 0);
      assert.equal(await StockAlert.countDocuments({ state: 'Resolved' }), 2);
      await receipt.deleteOne(); await Product.updateOne({ _id: product._id }, { $set: { stock: 2 } });
      const recurring = await stockAlertsForRequest(request());
      assert.equal(recurring.total, 2);
      assert.ok(recurring.data.every((row) => !first.data.some((old) => old._id === row._id)));
    });

    await context.test('warehouse overrides apply to empty configured locations and can disable alerts', async () => {
      await setup();
      await saveStockAlertConfig(configRequest({ scope: 'warehouse', warehouse: 'Second', branch: 'South', minStockLevel: 1, maxStockLevel: 6, reorderLevel: null, enabled: true }));
      const south = await stockAlertsForRequest(request({ branch: 'South' }));
      assert.equal(south.total, 2);
      assert.equal(south.data[0].physicalQty, 0);
      assert.equal(south.data[0].reorderQty, 6);
      const stockSummary = await inventoryDashboardForRequest(request({ branch: 'South', warehouse: 'Second' }));
      assert.equal(stockSummary.data[0].minStockLevel, 1);
      assert.equal(stockSummary.data[0].maxStockLevel, 6);
      await saveStockAlertConfig(configRequest({ scope: 'warehouse', warehouse: 'Second', branch: 'South', minStockLevel: null, maxStockLevel: null, reorderLevel: null, enabled: false }));
      assert.equal((await stockAlertsForRequest(request({ branch: 'South' }))).total, 0);
      assert.ok(await AuditLog.exists({ modelName: 'StockAlertThresholds', documentId: product._id }));
      await assert.rejects(saveStockAlertConfig(configRequest({ scope: 'product', minStockLevel: 9, maxStockLevel: 2, reorderLevel: 0, enabled: true })), /Maximum/);
      await assert.rejects(saveStockAlertConfig(configRequest({ scope: 'product', minStockLevel: -1, maxStockLevel: 10, reorderLevel: 0, enabled: true })), /nonnegative/);
    });

    await context.test('draft and cancelled sources do not create false alerts; company filters do not leak', async () => {
      await setup();
      await Product.create({ userId: new mongoose.Types.ObjectId(), code: 'FOREIGN', description: 'Foreign item', stock: 0 });
      const draft = await Invoice.create({ userId: owner._id, documentType: 'invoice', number: 'DRAFT-1', lifecycleStatus: 'draft', items: [] });
      await StockOut.create({ userId: owner._id, productId: product._id, stockOutNo: 'DRAFT-OUT', to: 'Buyer', date: new Date(), totalQty: 2, status: 'Completed', sourceType: 'invoice', sourceId: draft._id, branch: 'North', warehouse: 'Main' });
      await Product.updateOne({ _id: product._id }, { $set: { stock: 0 } });
      const report = await stockAlertsForRequest(request());
      assert.ok(report.data.every((row) => row.description === 'Real stock item' && row.physicalQty === 2));
      draft.lifecycleStatus = 'cancelled'; await draft.save();
      assert.equal((await stockAlertsForRequest(request({ type: 'Out of Stock' }))).total, 0);
      assert.equal((await stockAlertsForRequest(request({ search: 'not-present' }))).total, 0);
    });

    await context.test('branch members cannot alter company defaults or another branch, and stale review IDs are rejected', async () => {
      await setup();
      const member = await AppUser.create({ name: 'North member', email: 'member@example.test', status: 'Active', accountType: 'member', branch: 'North', permissions: { actions: { edit: true, create: false } } });
      const owned = await Product.create({ userId: member._id, code: 'MEMBER-1', description: 'Member product', stock: 0, warehouse: 'Member Main', branch: 'North', minStockLevel: 2, maxStockLevel: 5 });
      await Warehouse.create([{ userId: member._id, name: 'Member Main', branch: 'North', status: 'Active' }, { userId: member._id, name: 'Member Second', branch: 'South', status: 'Active' }]);
      const memberRequest = { user: { id: String(member._id), accountType: 'member', branch: 'North' }, query: {}, params: { productId: String(owned._id) } };
      await assert.rejects(saveStockAlertConfig({ ...memberRequest, body: { scope: 'product', minStockLevel: 1, maxStockLevel: 5, reorderLevel: 0, enabled: true } }), /owner/);
      await assert.rejects(saveStockAlertConfig({ ...memberRequest, body: { scope: 'warehouse', warehouse: 'Member Second', branch: 'South', minStockLevel: 1, maxStockLevel: 5, reorderLevel: 0, enabled: true } }), /permitted branch/);
      const scoped = await stockAlertsForRequest({ ...memberRequest, query: { branch: 'South' } });
      assert.ok(scoped.data.every((row) => row.branch === 'North' && row.description === 'Member product'));
      await assert.rejects(stockAlertPurchaseOrderSeed({ ...memberRequest, params: { id: scoped.data[0]._id } }), /permission/);
      const foreign = await stockAlertsForRequest(request());
      await assert.rejects(reviewStockAlerts({ ...memberRequest, body: { ids: [foreign.data[0]._id] } }), /outside your scope/);
    });

    await context.test('failed projection refresh rolls back the owner guard and all alert writes', async () => {
      await setup();
      const before = (await AppUser.findById(owner._id)).stockAlertsRevision;
      const original = StockAlert.bulkWrite;
      StockAlert.bulkWrite = async () => { throw new Error('Injected alert write failure'); };
      try { await assert.rejects(stockAlertsForRequest(request()), /Injected/); }
      finally { StockAlert.bulkWrite = original; }
      assert.equal(await StockAlert.countDocuments({}), 0);
      assert.equal((await AppUser.findById(owner._id)).stockAlertsRevision, before);
    });

    await context.test('purchase shortcut recalculates quantity, references its alert and never creates or posts a document', async () => {
      await setup();
      const first = await stockAlertsForRequest(request());
      const alert = first.data.find((row) => row.alertType === 'Reorder Required');
      const seed = await stockAlertPurchaseOrderSeed({ ...request(), params: { id: alert._id } });
      assert.equal(seed.items[0].qty, 8);
      assert.equal(seed.items[0].productCode, 'ALERT-1');
      assert.equal(seed.branch, 'North');
      assert.equal(seed.extra.stockAlertId, alert._id);
      assert.equal(await Invoice.countDocuments({ documentType: 'purchase-order' }), 0);
      assert.equal((await Product.findById(product._id)).stock, 2);
      await saveStockAlertConfig(configRequest({ scope: 'product', minStockLevel: 0, maxStockLevel: 0, reorderLevel: 0, enabled: false }));
      await assert.rejects(stockAlertPurchaseOrderSeed({ ...request(), params: { id: alert._id } }), /no longer requires/);
    });
  } finally {
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_stock_alert_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
