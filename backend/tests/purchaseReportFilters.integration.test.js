import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { AppUser } from '../src/models/AppUser.js';
import { dynamicSalesReport } from '../src/modules/retail/sales/shared/dynamicSalesReport.js';
import { publicReportFields } from '../src/services/reportFilterConfig.js';

test('purchase picker retains general and industry-specific filters', () => {
  const keys = user => publicReportFields('purchase', user).map(field => field.key);
  const general = keys({});
  for (const key of ['supplier', 'supplierCode', 'supplierInvoiceNo', 'purchaseType', 'staff', 'gstType', 'itcStatus', 'goodsReceiptStatus', 'orderStatus', 'stockUpdateStatus', 'qualityInspection', 'returnStatus', 'stockLocation', 'quantity', 'purchaseRate', 'discountPercent', 'discountAmount']) assert.ok(general.includes(key), key);
  for (const key of ['customer', 'salesperson', 'reverseCharge', 'imei', 'vehicleType', 'fabricType']) assert.ok(!general.includes(key), key);
  const electronics = keys({ retailSubcategory: 'electronics' });
  assert.ok(electronics.includes('imei') && electronics.includes('ram') && !electronics.includes('vehicleType'));
  const automobile = keys({ category: 'automobile' });
  assert.ok(automobile.includes('vehicleType') && automobile.includes('partNumber') && !automobile.includes('imei'));
  const fashion = keys({ retailSubcategory: 'fashion' });
  assert.ok(fashion.includes('fabricType') && fashion.includes('size') && !fashion.includes('imei'));
  assert.ok(!publicReportFields('sales').some(field => field.key === 'supplierInvoiceNo'));
});

test('restored purchase filters execute against supplier documents and matching purchased variants', { skip: !process.env.REPORT_FILTER_TEST_MONGODB_URI }, async t => {
  const dbName = `gobook_purchase_filters_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.REPORT_FILTER_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const oid = () => new mongoose.Types.ObjectId();
  const owner = oid(), businessId = oid(), productId = oid(), variantId = oid(), orderId = oid(), invoiceId = oid();
  const user = { id: String(owner), businessId: String(businessId), accountType: 'owner', isSuperAdmin: true, retailSubcategory: 'electronics' };
  const condition = (field, value, operator = 'equals') => ({ field, value, operator });
  async function run(conditions = [], query = {}) {
    let body;
    await dynamicSalesReport({ user, query: { report: 'purchase', analysis: 'transactions', filters: JSON.stringify({ logic: 'and', conditions }), ...query } }, { json(value) { body = value; return this; } });
    return body;
  }
  try {
    await Promise.all([Invoice.init(), Product.init(), AppUser.init()]);
    await AppUser.collection.insertOne({ _id: owner, businessId, accountType: 'owner', name: 'Purchase Test', email: 'purchase@example.test' });
    await Product.collection.insertOne({ _id: productId, userId: owner, description: 'Laptop', category: 'Electronics', code: 'LAP-1', hsn: '8471', attributes: { processor: 'Intel' }, variants: [
      { _id: variantId, modelName: 'Purchased Model', ram: '16 GB', storage: '256 GB' },
      { _id: oid(), modelName: 'Other Model', ram: '64 GB', storage: '1 TB' },
    ] });
    const base = { userId: owner, businessId, branch: 'Warehouse A', customer: { name: 'Supplier Alpha', code: 'SUP-01', category: 'Distributor' }, meta: { date: '2026-11-01' }, lifecycleStatus: 'posted', totals: { finalTotal: 417.15, totalGst: 42.15 }, items: [
      { productId, variantId, description: 'Laptop', qty: 2, rate: 100, discount: 10, gstRate: 18, extra: { serialNumber: ['SN-1', 'SN-2'], imei1: 'IMEI-1', imei2: 'IMEI-2', ram: '8 GB', goodsReceiptStatus: 'Fully Received', qualityInspection: 'Passed', stockUpdateStatus: 'Updated', returnStatus: 'No Return', stockLocation: 'Rack A' } },
      { description: 'Cable', qty: 8, rate: 25, discount: 5, discountType: 'amount', gstRate: 5, extra: { qualityInspection: 'Failed', stockLocation: 'Rack B' } },
    ], inputTaxCreditEligible: true, extra: { vendorInvoiceNumber: 'BILL-77', linkedPurchaseOrderId: String(orderId), purchaseStaff: { name: 'Priya' }, purchaseOrderStatus: 'Fulfilled' } };
    await Invoice.collection.insertMany([
      { ...base, _id: invoiceId, number: 'PE-1', documentType: 'purchase-entry' },
      { ...base, _id: orderId, number: 'PO-1', documentType: 'purchase-order' },
      ...['supplier-return', 'purchase-return', 'debit-note', 'invoice'].map((documentType, index) => ({ ...base, _id: oid(), number: `OTHER-${index}`, documentType })),
      { ...base, _id: oid(), userId: oid(), businessId: oid(), number: 'FOREIGN', documentType: 'purchase-entry' },
    ]);
    await t.test('supplier invoice aliases, staff, linked order, GST and ITC match saved purchase metadata', async () => {
      for (const [key, value] of [['supplierCode', 'SUP-01'], ['supplierInvoiceNo', 'BILL-77'], ['staff', 'Priya'], ['purchaseOrderNo', 'PO-1'], ['supplierCategory', 'Distributor'], ['gstType', 'gst'], ['gstType', 'itc'], ['itcStatus', 'Eligible'], ['branch', 'Warehouse A']]) {
        const result = await run([condition(key, value)]);
        assert.equal(result.recordCount, 1, key);
        assert.equal(result.data[0].invoiceId, String(invoiceId), key);
      }
      assert.equal((await run([condition('gstType', 'non-gst')])).total, 0);
    });
    await t.test('procurement, quantity, rate and discount filters apply to the same invoice line', async () => {
      for (const [key, value] of [['goodsReceiptStatus', 'Fully Received'], ['orderStatus', 'Fulfilled'], ['stockUpdateStatus', 'Updated'], ['returnStatus', 'No Return'], ['stockLocation', 'Rack A']]) assert.equal((await run([condition(key, value)])).recordCount, 1, key);
      const matching = await run([condition('qualityInspection', 'Passed'), condition('quantity', 2), { field: 'purchaseRate', operator: 'between', min: 90, max: 110 }, condition('discountPercent', 10)]);
      assert.equal(matching.total, 1); assert.equal(matching.data[0].quantity, 2);
      assert.equal((await run([condition('qualityInspection', 'Passed'), condition('quantity', 8)])).total, 0);
      const amount = await run([condition('discountAmount', 5)]);
      assert.equal(amount.total, 1); assert.equal(amount.data[0].product, 'Cable');
    });
    await t.test('snapshot values override the purchased variant; unrelated catalog variants never match', async () => {
      for (const [key, value] of [['ram', '8 GB'], ['storage', '256 GB'], ['processor', 'Intel'], ['hsn', '8471'], ['productModel', 'Purchased Model'], ['serialNumber', 'SN-2'], ['imei', 'IMEI-1'], ['imei', 'IMEI-2']]) assert.equal((await run([condition(key, value)])).total, 1, key);
      assert.equal((await run([condition('ram', '16 GB')])).total, 0);
      assert.equal((await run([condition('ram', '64 GB')])).total, 0);
      const values = await run([], { view: 'filter-options', field: 'serialNumber' });
      assert.deepEqual(values.options.map(option => option.value), ['SN-1', 'SN-2']);
    });
    await t.test('purchase types include orders, returns and debit notes only when selected', async () => {
      assert.equal((await run()).recordCount, 1);
      assert.equal((await run([condition('purchaseType', 'purchase-order')])).recordCount, 1);
      assert.equal((await run([condition('purchaseType', 'supplier-return')])).recordCount, 2);
      assert.equal((await run([condition('purchaseType', 'debit-note')])).recordCount, 1);
      assert.equal((await run([{ field: 'purchaseType', operator: 'notEquals', values: ['purchase-order'] }])).recordCount, 4);
    });
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
