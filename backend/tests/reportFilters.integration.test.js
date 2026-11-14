import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { Payment } from '../src/models/Payment.js';
import { AppUser } from '../src/models/AppUser.js';
import { dynamicSalesReport } from '../src/modules/retail/sales/shared/dynamicSalesReport.js';

const oid = () => new mongoose.Types.ObjectId();
const filter = (field, operator, value) => ({ field, operator, value });
const and = (...conditions) => ({ logic: 'and', conditions });
test('dynamic reports execute safe filters, totals, sorting and pagination in MongoDB', { skip: !process.env.REPORT_FILTER_TEST_MONGODB_URI }, async t => {
  const dbName = `gobook_report_filters_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.REPORT_FILTER_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const businessId = oid(), owner = oid(), member = oid(), other = oid(), laptop = oid(), mouse = oid();
  const user = { id: String(owner), businessId: String(businessId), accountType: 'owner', isSuperAdmin: true };
  async function run(filters = and(), query = {}, actor = user) {
    let body;
    await dynamicSalesReport({ user: actor, query: { report: 'sales', filters: JSON.stringify(filters), ...query } }, { json(value) { body = value; return this; } });
    return body;
  }
  try {
    await Promise.all([Invoice.init(), Product.init(), Payment.init(), AppUser.init()]);
    await AppUser.collection.insertMany([{ _id: owner, businessId, accountType: 'owner', role: 'Super Admin', name: 'Owner', email: 'owner@report.test' }, { _id: member, businessId, accountType: 'member', role: 'Staff', branch: 'B1', name: 'Staff', email: 'staff@report.test' }, { _id: other, businessId: oid(), name: 'Other', email: 'other@report.test' }]);
    await Product.collection.insertMany([{ _id: laptop, code: 'LAP-1', userId: owner, description: 'Laptop', brand: 'Dell', category: 'Electronics', purchasePrice: 50, variants: [] }, { _id: mouse, code: 'MOU-1', userId: owner, description: 'Mouse', brand: 'Logitech', category: 'Accessories', purchasePrice: 70, variants: [] }]);
    const invoices = [
      { _id: oid(), userId: owner, businessId, number: 'INV-001', documentType: 'invoice', branch: 'B1', customer: { name: 'ABC Traders' }, meta: { date: '2026-11-01', dueDate: '2099-01-01' }, totals: { finalTotal: 270, addDiscAmt: 30 }, paymentMethod: 'Cash', items: [{ productId: laptop, productCode: 'LAP-1', description: 'Laptop', qty: 2, rate: 100, discount: 10, gstRate: 18 }, { productId: mouse, description: 'Mouse', qty: 1, rate: 120, gstRate: 0 }], createdAt: new Date('2026-11-01T08:00:00Z'), extra: { salesPerson: 'Anbu' } },
      { _id: oid(), userId: member, businessId, number: 'INV-002', documentType: 'bill-of-supply', branch: 'B1', customer: { name: 'XYZ' }, meta: { date: '2026-11-13', rcm: true }, totals: { finalTotal: 200 }, paymentMethod: 'Online', items: [{ description: 'Phone', category: 'Electronics', brand: 'Apple', qty: 1, rate: 200, purchasePrice: 80, gstRate: 0 }], createdAt: new Date('2026-11-13T08:00:00Z') },
      { _id: oid(), userId: owner, businessId, number: 'INV-003', documentType: 'invoice', branch: 'B2', customer: { name: 'ABC Traders' }, meta: { dueDate: '2000-01-01' }, totals: { finalTotal: 50 }, paymentMethod: 'Credit', items: [{ productId: mouse, description: 'Mouse', qty: 1, rate: 50, gstRate: 5 }], createdAt: new Date('2026-11-13T18:30:00Z') },
      { _id: oid(), userId: other, number: 'INV-OTHER', documentType: 'invoice', branch: 'B1', customer: { name: 'ABC Traders' }, meta: { date: '2026-11-01' }, totals: { finalTotal: 9999 }, items: [{ description: 'Other tenant', qty: 1, rate: 9999 }] },
    ];
    await Invoice.collection.insertMany(invoices);
    await Payment.collection.insertMany([{ userId: owner, invoiceId: invoices[0]._id, amount: 100, method: 'Cash' }, { userId: member, invoiceId: invoices[1]._id, amount: 200, method: 'UPI' }]);
    await t.test('totals cover all pages, and page ordering is deterministic', async () => {
      const first = await run(and(), { page: 1, limit: 1, sort: 'name', direction: 'asc' });
      const second = await run(and(), { page: 2, limit: 1, sort: 'name', direction: 'asc' });
      assert.equal(first.total, 3); assert.equal(first.recordCount, 3);
      assert.equal(first.data[0].name, 'INV-001'); assert.equal(second.data[0].name, 'INV-002');
      assert.equal(first.totals.sales, 520); assert.deepEqual(first.totals, second.totals);
      assert.equal(first.totals.discount, 50); assert.equal(first.totals.cost, 320);
    });
    await t.test('invoice rows combine lines by document identity and retain filtered totals', async () => {
      const result = await run(and(), { analysis: 'documents', sort: 'invoiceNumber', direction: 'asc', limit: 1 });
      assert.equal(result.total, 3); assert.equal(result.recordCount, 3);
      const row = result.data[0];
      assert.equal(row.id, String(invoices[0]._id));
      assert.equal(row.invoiceNumber, 'INV-001');
      assert.equal(row.quantity, 3); assert.equal(row.amount, 270);
      assert.equal(row.product, 'Laptop, Mouse'); assert.equal(row.rate, null);
      const details = await run(and(), { analysis: 'transactions' });
      assert.deepEqual(result.totals, details.totals);
      const filtered = await run(and(filter('product', 'equals', String(laptop))), { analysis: 'documents' });
      assert.equal(filtered.total, 1); assert.equal(filtered.data[0].quantity, 2);
      assert.equal(filtered.data[0].product, 'Laptop'); assert.equal(filtered.data[0].rate, 100);
      assert.equal(filtered.data[0].amount, 162);
      const repeated = { ...invoices[2], _id: oid(), userId: member, documentType: 'bill-of-supply', items: [{ description: 'ACP Board', qty: 2, rate: 350 }, { description: 'ACP Board', qty: 4, rate: 350 }], totals: { finalTotal: 2100 } };
      await Invoice.collection.insertOne(repeated);
      try {
        const sameNumber = await run(and(filter('invoiceNumber', 'equals', 'INV-003')), { analysis: 'documents' });
        assert.equal(sameNumber.total, 2);
        const combined = sameNumber.data.find(entry => entry.invoiceId === String(repeated._id));
        assert.equal(combined.product, 'ACP Board'); assert.equal(combined.rate, 350);
        assert.equal(combined.quantity, 6); assert.equal(combined.amount, 2100);
      } finally { await Invoice.collection.deleteOne({ _id: repeated._id }); }
    });
    await t.test('transaction rows include invoice, customer, product, rate and accurate summary values', async () => {
      const first = await run(and(), { analysis: 'transactions', page: 1, limit: 1, sort: 'invoiceDate', direction: 'asc' });
      const second = await run(and(), { analysis: 'transactions', page: 2, limit: 1, sort: 'invoiceDate', direction: 'asc' });
      assert.equal(first.total, 4); assert.equal(first.recordCount, 3);
      assert.equal(first.data[0].invoiceNumber, 'INV-001');
      assert.equal(first.data[0].invoiceDate, '2026-11-01');
      assert.equal(first.data[0].customer, 'ABC Traders');
      assert.equal(first.data[0].product, 'Laptop');
      assert.equal(first.data[0].rate, 100); assert.equal(first.data[0].quantity, 2);
      assert.equal(first.data[0].amount, 162);
      assert.equal(first.totals.netAmount, 520);
      assert.equal(first.totals.quantity, 5);
      assert.ok(Math.abs(first.totals.tax - 31.66) < 0.00001);
      assert.deepEqual(first.totals, second.totals);
      assert.notEqual(first.data[0].id, second.data[0].id);
      const product = await run(and(filter('product', 'equals', String(laptop))), { analysis: 'transactions' });
      assert.equal(product.total, 1); assert.equal(product.recordCount, 1);
      assert.equal(product.totals.sales, 162);
      assert.ok(product.totals.netAmount < 270);
    });
    await t.test('multiple customers, date boundaries and India-local fallback date combine', async () => {
      const range = { field: 'date', operator: 'between', min: '2026-11-01', max: '2026-11-13' };
      const result = await run(and({ field: 'customer', operator: 'equals', values: ['ABC Traders', 'XYZ'] }, range));
      assert.equal(result.recordCount, 2); assert.equal(result.totals.sales, 470);
      assert.equal((await run(and(filter('date', 'equals', '2026-11-14')))).data[0].name, 'INV-003');
    });
    await t.test('product and category match the same line and preserve allocated discounts', async () => {
      const result = await run(and(filter('product', 'equals', String(laptop)), filter('category', 'equals', 'Electronics')));
      assert.equal(result.recordCount, 1); assert.equal(result.totals.sales, 162);
      assert.equal(result.totals.discount, 38); assert.equal(result.totals.quantity, 2);
      assert.equal((await run(and(filter('product', 'equals', String(laptop)), filter('category', 'equals', 'Accessories')))).total, 0);
    });
    await t.test('OR groups, text operators, numeric ranges, GST zero and boolean false remain typed', async () => {
      const or = { logic: 'or', conditions: [filter('invoiceNumber', 'equals', 'INV-001'), filter('amount', 'lessThan', 100)] };
      assert.equal((await run(or)).recordCount, 2);
      assert.equal((await run(and(filter('invoiceNumber', 'contains', 'INV-00')))).recordCount, 3);
      assert.equal((await run(and({ field: 'amount', operator: 'between', min: 50, max: 200 }))).recordCount, 2);
      assert.equal((await run(and(filter('gstRate', 'equals', 0)))).totals.sales, 308);
      assert.equal((await run(and(filter('reverseCharge', 'equals', true)))).recordCount, 1);
      assert.equal((await run(and(filter('customer', 'notEquals', 'XYZ')))).recordCount, 2);
      assert.equal((await run(and(filter('salesperson', 'isEmpty')))).recordCount, 2);
    });
    await t.test('payment aliases and actual receipts drive filtering', async () => {
      assert.equal((await run(and(filter('paymentMode', 'equals', 'Card')))).data[0].name, 'INV-002');
      assert.equal((await run(and(filter('paymentMode', 'equals', 'UPI')))).data[0].name, 'INV-002');
      assert.equal((await run(and(filter('paymentStatus', 'equals', 'Partial')))).data[0].name, 'INV-001');
      assert.equal((await run(and(filter('paymentStatus', 'equals', 'Paid')))).data[0].name, 'INV-002');
    });
    await t.test('counts follow the displayed metric, and split payment aliases remain searchable', async () => {
      const belowCost = await run(and(), { metric: 'below-cost' });
      assert.equal(belowCost.recordCount, 1); assert.equal(belowCost.total, 1);
      assert.equal(belowCost.totals.belowCostSales, 50);
      await Invoice.collection.updateOne({ _id: invoices[2]._id }, { $set: { paymentMethod: '', paymentSplits: [{ methodId: 'bank', method: 'Bank Transfer', amount: 20 }, { methodId: '', method: 'Cash', amount: 30 }] } });
      assert.equal((await run(and(filter('paymentMode', 'equals', 'Bank Transfer')))).data[0].name, 'INV-003');
      assert.equal((await run(and(filter('paymentMode', 'equals', 'Cash')))).recordCount, 2);
      assert.equal((await run(and(filter('paymentMode', 'isEmpty')))).recordCount, 0);
    });
    await t.test('filter options are scoped, searchable and paginated', async () => {
      const options = await run(and(), { view: 'filter-options', field: 'customer', limit: 1 });
      assert.equal(options.total, 2); assert.equal(options.options.length, 1);
      const products = await run(and(), { view: 'filter-options', field: 'product', q: 'LAP-1' });
      assert.equal(products.options[0].label, 'Laptop');
    });
    await t.test('branch staff cannot broaden access using OR conditions or a branch filter', async () => {
      const staff = { id: String(member), businessId: String(businessId), role: 'Staff', branch: 'B1' };
      const result = await run({ logic: 'or', conditions: [filter('branch', 'equals', 'B2'), filter('amount', 'greaterThan', 0)] }, {}, staff);
      assert.equal(result.recordCount, 1); assert.equal(result.data[0].name, 'INV-002');
      assert.equal((await run(and(filter('branch', 'equals', 'B2')), {}, staff)).total, 0);
    });
    await t.test('purchase reports filter supplier bills without counting orders, returns or sales', async () => {
      const purchases = [
        { _id: oid(), userId: owner, businessId, branch: 'B1', number: 'PE-001', documentType: 'purchase-entry', customer: { name: 'Supplier Alpha' }, meta: { date: '2026-11-02', dueDate: '2099-01-01' }, paymentMethod: 'Bank Transfer', totals: { finalTotal: 139, totalGst: 19 }, items: [{ productId: laptop, description: 'Laptop', qty: 2, rate: 50, gstRate: 18 }, { productId: mouse, description: 'Mouse', qty: 1, rate: 20, gstRate: 5 }], createdAt: new Date('2026-11-02T08:00:00Z') },
        { _id: oid(), userId: member, businessId, branch: 'B1', number: 'PE-002', documentType: 'purchase-entry', customer: { name: 'Supplier Beta' }, meta: { date: '2026-11-13' }, paymentMethod: 'Cash', totals: { finalTotal: 42, totalGst: 2 }, items: [{ productId: mouse, description: 'Mouse', qty: 4, rate: 10, gstRate: 5 }], createdAt: new Date('2026-11-13T08:00:00Z') },
      ];
      await Invoice.collection.insertMany([...purchases,
        ...['purchase-order', 'supplier-return', 'debit-note'].map(documentType => ({ ...purchases[0], _id: oid(), number: `${documentType}-ignored`, documentType, customer: { name: 'Order or return only' } })),
        { ...purchases[0], _id: oid(), userId: other, businessId: oid(), number: 'PE-FOREIGN', customer: { name: 'Foreign supplier' } },
      ]);
      await Payment.collection.insertMany([{ userId: owner, invoiceId: purchases[0]._id, amount: 50, method: 'Bank Transfer' }, { userId: member, invoiceId: purchases[1]._id, amount: 42, method: 'Cash' }]);
      const purchase = (filters = and(), query = {}, actor = user) => run(filters, { report: 'purchase', analysis: 'transactions', ...query }, actor);
      const first = await purchase(and(), { page: 1, limit: 1, sort: 'invoiceNumber', direction: 'asc' });
      const second = await purchase(and(), { page: 2, limit: 1, sort: 'invoiceNumber', direction: 'asc' });
      assert.equal(first.total, 3); assert.equal(first.recordCount, 2);
      assert.equal(first.data[0].supplier, 'Supplier Alpha');
      assert.equal(first.totals.quantity, 7); assert.equal(first.totals.sales, 160);
      assert.equal(first.totals.tax, 21); assert.equal(first.totals.netAmount, 181);
      assert.deepEqual(first.totals, second.totals);
      const supplier = await purchase(and(filter('supplier', 'equals', 'Supplier Alpha'), filter('amount', 'greaterThan', 100)));
      const documents = await purchase(and(), { analysis: 'documents', sort: 'invoiceNumber', direction: 'asc' });
      assert.equal(documents.total, 2); assert.equal(documents.recordCount, 2);
      assert.deepEqual(documents.totals, first.totals);
      assert.equal(documents.data[0].quantity, 3); assert.equal(documents.data[0].amount, 120);
      assert.equal(documents.data[0].product, 'Laptop, Mouse'); assert.equal(documents.data[0].rate, null);
      assert.equal(supplier.recordCount, 1); assert.equal(supplier.totals.netAmount, 139);
      const filteredLine = await purchase(and(filter('supplier', 'equals', 'Supplier Alpha'), filter('product', 'equals', String(laptop)), filter('category', 'equals', 'Electronics')));
      assert.equal(filteredLine.total, 1); assert.equal(filteredLine.totals.sales, 100);
      assert.equal(filteredLine.totals.tax, 18); assert.equal(filteredLine.totals.netAmount, 118);
      assert.equal((await purchase(and(filter('product', 'equals', String(laptop)), filter('category', 'equals', 'Accessories')))).total, 0);
      assert.equal((await purchase(and(filter('paymentStatus', 'equals', 'Partial')))).data[0].supplier, 'Supplier Alpha');
      assert.equal((await purchase(and(filter('paymentStatus', 'equals', 'Paid')))).data[0].supplier, 'Supplier Beta');
      assert.equal((await purchase(and(filter('paymentMode', 'equals', 'Bank Transfer')))).recordCount, 1);
      assert.equal((await purchase(and(filter('date', 'equals', '2026-11-02')))).recordCount, 1);
      const options = await purchase(and(), { view: 'filter-options', field: 'supplier', q: 'supplier' });
      assert.deepEqual(options.options.map(option => option.label), ['Supplier Alpha', 'Supplier Beta']);
      const grouped = await purchase(and(), { analysis: 'supplier' });
      assert.equal(grouped.total, 2); assert.equal(grouped.totals.netAmount, 181);
      assert.equal((await purchase(and(), { analysis: 'branch' })).total, 1);
      await assert.rejects(purchase(and(filter('customer', 'equals', 'ABC Traders'))), error => error.statusCode === 400);
      const staff = { id: String(member), businessId: String(businessId), role: 'Staff', branch: 'B1' };
      const scoped = await purchase({ logic: 'or', conditions: [filter('supplier', 'equals', 'Supplier Alpha'), filter('amount', 'greaterThan', 0)] }, {}, staff);
      assert.equal(scoped.recordCount, 1); assert.equal(scoped.data[0].supplier, 'Supplier Beta');
    });
  } finally {
    assert.ok(mongoose.connection.name.startsWith('gobook_report_filters_test_'));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
