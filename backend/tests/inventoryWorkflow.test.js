import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import mongoose from 'mongoose';
import { Product } from '../src/models/Product.js';
import { ProductBrand } from '../src/models/ProductBrand.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { Invoice } from '../src/models/Invoice.js';
import { AppUser } from '../src/models/AppUser.js';
import { Payment } from '../src/models/Payment.js';
import { AccountingPosting } from '../src/models/AccountingPosting.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { auditPlugin } from '../src/services/auditPlugin.js';
import { postInventoryForDocument, reverseInventoryForDocument } from '../src/services/inventoryMovements.js';
import { inventoryTransaction, atomicInventoryHandler } from '../src/services/inventoryTransaction.js';
import { importStockIn } from '../src/modules/retail/inventory/stockInController.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET ||= 'inventory-workflow-test';
const { deleteInvoice } = await import('../src/modules/retail/sales/billing-invoicing/invoiceController.js');
afterEach(() => mock.restoreAll());

const userId = '507f1f77bcf86cd799439001';
const productId = '507f1f77bcf86cd799439002';
const docId = '507f1f77bcf86cd799439003';
const variantId = '507f1f77bcf86cd799439004';
const line = { productId, description: 'Test item', qty: 5, rate: 150, itemType: 'Product' };
const purchase = { _id: docId, userId, documentType: 'purchase-entry', number: 'PE-001', customer: { name: 'Vendor' }, items: [line], businessSettingsSnapshot: { retailSubcategory: 'general' }, branch: 'North' };
const copy = (value) => structuredClone(value);

// A transactional store double permits fault injection at every write. The
// session-propagation test below separately checks real Mongoose query behavior.
function store({ stock = 10, variants = [], failMovement = 0, failDelete = false, failCommit = false, missingProduct = false } = {}) {
  let state = { product: missingProduct ? null : { _id: productId, userId, description: 'Test item', itemType: 'Product', stock, variants, barcode: '123', purchasePrice: 100 }, incoming: [], outgoing: [], invoice: copy(purchase), payments: [] };
  let movementWrites = 0;
  const transactions = mock.method(mongoose.connection, 'transaction', async (work) => {
    const snapshot = copy(state);
    try {
      const value = await mongoose.transactionAsyncLocalStorage.run({ session: { test: true } }, work);
      if (failCommit) throw new Error('Commit failed');
      return value;
    } catch (error) { state = snapshot; throw error; }
  });
  mock.method(Product, 'findOne', async () => copy(state.product));
  mock.method(Product, 'findById', async () => copy(state.product));
  mock.method(Product, 'find', () => ({ lean: async () => state.product ? [copy(state.product)] : [] }));
  mock.method(Product, 'create', async (value) => {
    state.product = { ...copy(value), _id: productId, variants: (value.variants || []).map((variant) => ({ ...variant, _id: variantId })) };
    return copy(state.product);
  });
  const productWrites = mock.method(Product, 'updateOne', async (filter, update, options = {}) => {
    const product = state.product;
    if (!product || String(filter._id) !== productId || filter.userId && String(filter.userId) !== userId) return { matchedCount: 0 };
    if (filter.stock && product.stock < filter.stock.$gte) return { matchedCount: 0 };
    for (const { $elemMatch: condition } of filter.variants?.$all || []) {
      const variant = product.variants.find((row) => row._id === condition._id);
      if (!variant || condition.stock && variant.stock < condition.stock.$gte) return { matchedCount: 0 };
    }
    Object.assign(product, update.$set);
    for (const [key, amount] of Object.entries(update.$inc || {})) {
      if (key === 'stock') product.stock += amount;
      else {
        const alias = key.match(/\$\[(\w+)\]/)[1];
        const id = options.arrayFilters.find((entry) => entry[`${alias}._id`])[`${alias}._id`];
        product.variants.find((variant) => variant._id === id).stock += amount;
      }
    }
    if (update.$push?.variants) product.variants.push({ ...update.$push.variants, _id: (BigInt(`0x${variantId}`) + BigInt(product.variants.length)).toString(16).padStart(24, '0') });
    return { matchedCount: 1, modifiedCount: 1 };
  });
  mock.method(ProductBrand, 'updateOne', async () => ({}));
  for (const [Model, key, numberField] of [[StockIn, 'incoming', 'stockInNo'], [StockOut, 'outgoing', 'stockOutNo']]) {
    mock.method(Model, 'find', (filter) => ({ lean: async () => copy(state[key].filter((entry) => entry.sourceType === filter.sourceType && String(entry.sourceId) === String(filter.sourceId))) }));
    mock.method(Model, 'findOne', (filter) => {
      if (filter[numberField]) return Promise.resolve(copy(state[key].find((entry) => entry[numberField] === filter[numberField]) || null));
      return { lean: async () => copy(state[key].at(-1) || null) };
    });
    mock.method(Model, 'create', async (value) => {
      if (++movementWrites === failMovement) throw new Error('Movement write failed');
      const entry = { ...copy(value), _id: `${key}-${movementWrites}` }; state[key].push(entry); return entry;
    });
    mock.method(Model, 'deleteMany', async (filter) => {
      state[key] = state[key].filter((entry) => entry.sourceType !== filter.sourceType || String(entry.sourceId) !== String(filter.sourceId));
      return { acknowledged: true };
    });
  }
  mock.method(AppUser, 'findById', () => ({ select: () => ({ lean: async () => null }) }));
  mock.method(Invoice, 'findOne', () => ({ lean: async () => copy(state.invoice) }));
  mock.method(Invoice, 'exists', async () => null);
  mock.method(Invoice, 'deleteOne', async () => {
    if (failDelete) throw new Error('Document deletion failed');
    state.invoice = null; return { deletedCount: 1 };
  });
  mock.method(Payment, 'find', () => ({ lean: async () => copy(state.payments) }));
  mock.method(Payment, 'deleteMany', async () => { state.payments = []; });
  mock.method(AccountingPosting, 'findOne', () => ({ lean: async () => null }));
  mock.method(AccountingVoucher, 'findOne', async () => null);
  return { state: () => state, transactions, productWrites };
}

async function invoke(handler, req) {
  let body, status, error;
  const res = { status(value) { status = value; return res; }, json(value) { body = value; return res; } };
  await handler(req, res, (value) => { error = value; });
  return { body, status, error };
}

test('purchase receipt, repost, edit, and reversal maintain exact stock and branch', async () => {
  const db = store();
  await postInventoryForDocument(purchase, userId);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming[0].branch, 'North');
  await postInventoryForDocument(purchase, userId);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming.length, 1);
  await postInventoryForDocument({ ...purchase, items: [{ ...line, qty: 7 }] }, userId);
  assert.equal(db.state().product.stock, 17);
  await reverseInventoryForDocument(purchase, userId);
  assert.equal(db.state().product.stock, 10);
  assert.equal(db.state().incoming.length, 0);
});

test('PDF purchase creates separate size/colour SKUs under one parent and posts exact variant stock', async () => {
  const db = store({ missingProduct: true });
  const variants = [['S', 'Black', 'TS-BLK-S', 10], ['M', 'Black', 'TS-BLK-M', 15], ['L', 'Black', 'TS-BLK-L', 12], ['M', 'White', 'TS-WHT-M', 8], ['L', 'White', 'TS-WHT-L', 10]];
  const invoice = JSON.parse(JSON.stringify(new Invoice({ ...purchase, businessSettingsSnapshot: { retailSubcategory: 'fashion-lifestyle' }, items: variants.map(([size, colour, modelCode, qty]) => ({ description: 'Cotton T-Shirt', productType: 'Matrix', size, colour, modelCode, productCode: modelCode, qty, rate: 350, gstRate: 5 })) })));
  assert.equal(invoice.items[3].colour, 'White');
  assert.equal(invoice.items[3].modelCode, 'TS-WHT-M');
  await postInventoryForDocument(invoice, userId);
  assert.equal(db.state().product.description, 'Cotton T-Shirt');
  assert.equal(db.state().product.productType, 'Matrix');
  assert.equal(db.state().product.stock, 55);
  assert.deepEqual(db.state().product.variants.map(({ size, colour, modelCode, stock }) => [size, colour, modelCode, stock]), variants);
  assert.equal(new Set(db.state().product.variants.map((row) => row.barcode)).size, 5);
  await postInventoryForDocument(invoice, userId);
  assert.equal(db.state().product.stock, 55);
  await reverseInventoryForDocument(invoice, userId);
  assert.equal(db.state().product.stock, 0);
  assert.deepEqual(db.state().product.variants.map((row) => row.stock), [0, 0, 0, 0, 0]);
});

test('jeans with the same waist and colour keep separate lengths and stock after PDF import', async () => {
  const db = store({ stock: 0 });
  const invoice = JSON.parse(JSON.stringify(new Invoice({ ...purchase, businessSettingsSnapshot: { retailSubcategory: 'fashion-lifestyle' }, items: ['30', '32'].map((length, index) => ({ ...line, qty: index + 3, size: '32', length, colour: 'Blue', brand: 'BluePeak', material: '98% Cotton, 2% Elastane', productType: 'Matrix' })) })));
  await postInventoryForDocument(invoice, userId);
  assert.equal(db.state().product.stock, 7);
  assert.deepEqual(db.state().product.variants.map(({ size, length, colour, stock }) => [size, length, colour, stock]), [['32', '30', 'Blue', 3], ['32', '32', 'Blue', 4]]);
  assert.equal(new Product(db.state().product).variants[1].length, '32');
  await reverseInventoryForDocument(invoice, userId);
  assert.equal(db.state().product.stock, 0);
  assert.deepEqual(db.state().product.variants.map(row => row.stock), [0, 0]);
});

test('first movement failure rolls back product quantity without relying on movement records', async () => {
  const db = store({ failMovement: 1 });
  await assert.rejects(postInventoryForDocument(purchase, userId), /Movement write failed/);
  assert.equal(db.state().product.stock, 10);
  assert.equal(db.state().incoming.length, 0);
});

test('a later movement failure rolls back every line and earlier movement', async () => {
  const db = store({ failMovement: 2 });
  await assert.rejects(postInventoryForDocument({ ...purchase, items: [line, line] }, userId), /Movement write failed/);
  assert.equal(db.state().product.stock, 10);
  assert.equal(db.state().incoming.length, 0);
});

test('new products and variants created during a failed receipt also roll back', async () => {
  const db = store({ missingProduct: true, failMovement: 1 });
  await assert.rejects(postInventoryForDocument({ ...purchase, items: [{ ...line, productId: null, size: 'Blue' }] }, userId), /Movement write failed/);
  assert.equal(db.state().product, null);
});

test('duplicate supplier-return lines are checked against their combined quantity', async () => {
  const db = store();
  await assert.rejects(postInventoryForDocument({ ...purchase, documentType: 'supplier-return', items: [{ ...line, qty: 6 }, { ...line, qty: 6 }] }, userId), /Insufficient stock/);
  assert.equal(db.state().product.stock, 10);
  assert.equal(db.productWrites.mock.callCount(), 0);
});

test('duplicate variant lines cannot overdraw a variant when aggregate product stock is sufficient', async () => {
  const db = store({ stock: 20, variants: [{ _id: variantId, size: 'Blue', stock: 5 }] });
  await assert.rejects(postInventoryForDocument({ ...purchase, documentType: 'supplier-return', items: [{ ...line, size: 'Blue', qty: 3 }, { ...line, size: 'Blue', qty: 3 }] }, userId), /Insufficient variant stock/);
  assert.equal(db.state().product.variants[0].stock, 5);
});

test('valid repeated variant lines update stock once and retain variant identity', async () => {
  const db = store({ stock: 20, variants: [{ _id: variantId, size: 'Blue', stock: 8 }] });
  const note = { ...purchase, documentType: 'supplier-return', items: [{ ...line, size: 'Blue', qty: 3 }, { ...line, size: 'Blue', qty: 3 }] };
  await postInventoryForDocument(note, userId);
  assert.equal(db.state().product.stock, 14);
  assert.equal(db.state().product.variants[0].stock, 2);
  assert.equal(db.state().outgoing[0].variantId, variantId);
  assert.equal(db.productWrites.mock.callCount(), 1);
  await reverseInventoryForDocument(note, userId);
  assert.equal(db.state().product.variants[0].stock, 8);
});

test('conditional stock update rejects a stale product snapshot', async () => {
  const db = store();
  mock.method(Product, 'updateOne', async (filter) => {
    assert.deepEqual(filter.stock, { $gte: 5 });
    assert.equal(filter.userId, userId);
    return { matchedCount: 0 };
  });
  await assert.rejects(postInventoryForDocument({ ...purchase, documentType: 'supplier-return' }, userId), /Stock changed/);
  assert.equal(db.state().outgoing.length, 0);
});

for (const documentType of ['invoice', 'bill-of-supply', 'e-invoice', 'pharmacy-bill']) {
  test(`${documentType} deducts the scanned variant once, replaces edited quantities and restores deleted stock`, async () => {
    const otherVariantId = '507f1f77bcf86cd799439005';
    const db = store({ stock: 20, variants: [
      { _id: variantId, size: 'M', colour: 'Red', barcode: 'RED-M', stock: 10 },
      { _id: otherVariantId, size: 'M', colour: 'Blue', barcode: 'BLUE-M', stock: 10 },
    ] });
    const invoice = { ...purchase, documentType, lifecycleStatus: 'posted', items: [{ ...line, size: 'M', barcode: 'BLUE-M', qty: 3 }] };
    await postInventoryForDocument(invoice, userId);
    assert.equal(db.state().product.stock, 17);
    assert.deepEqual(db.state().product.variants.map((row) => row.stock), [10, 7]);
    assert.equal(db.state().outgoing[0].variantId, otherVariantId);
    await postInventoryForDocument(invoice, userId);
    assert.equal(db.state().product.stock, 17);
    assert.equal(db.state().outgoing.length, 1);
    await postInventoryForDocument({ ...invoice, items: [{ ...invoice.items[0], qty: 5 }] }, userId);
    assert.equal(db.state().product.stock, 15);
    assert.deepEqual(db.state().product.variants.map((row) => row.stock), [10, 5]);
    await reverseInventoryForDocument(invoice, userId);
    assert.equal(db.state().product.stock, 20);
    assert.deepEqual(db.state().product.variants.map((row) => row.stock), [10, 10]);
  });
}

test('explicit variant identity survives invoice persistence and overrides an old label or barcode', async () => {
  const otherVariantId = '507f1f77bcf86cd799439005';
  const db = store({ stock: 20, variants: [
    { _id: variantId, size: 'M', barcode: 'RED-M', stock: 10 },
    { _id: otherVariantId, size: 'M', barcode: 'BLUE-M', stock: 10 },
  ] });
  const invoice = new Invoice({ ...purchase, documentType: 'invoice', items: [{ ...line, variantId: otherVariantId, size: 'Old label', barcode: 'RED-M' }] });
  assert.equal(String(invoice.items[0].variantId), otherVariantId);
  await postInventoryForDocument(invoice, userId);
  assert.deepEqual(db.state().product.variants.map((row) => row.stock), [10, 5]);
});

test('ambiguous or removed variants cannot deduct a different variant or leave partial stock changes', async () => {
  const db = store({ stock: 20, variants: [
    { _id: variantId, size: 'M', stock: 10 },
    { _id: '507f1f77bcf86cd799439005', size: 'M', stock: 10 },
  ] });
  for (const extra of [{ size: 'M' }, { variantId: '507f1f77bcf86cd799439099', size: 'M' }]) {
    await assert.rejects(postInventoryForDocument({ ...purchase, documentType: 'invoice', items: [{ ...line, ...extra }] }, userId), /inventory variant/);
    assert.equal(db.state().product.stock, 20);
    assert.deepEqual(db.state().product.variants.map((row) => row.stock), [10, 10]);
    assert.equal(db.state().outgoing.length, 0);
  }
});

test('legacy lines with a parent product brand can still select a unique variant by name', async () => {
  const db = store({ variants: [{ _id: variantId, size: 'Blue', stock: 10 }] });
  await postInventoryForDocument({ ...purchase, documentType: 'invoice', items: [{ ...line, size: 'Blue', brand: 'Parent brand' }] }, userId);
  assert.equal(db.state().product.stock, 5);
  assert.equal(db.state().product.variants[0].stock, 5);
});

test('failed edit restores the previous receipt and product quantity', async () => {
  const db = store({ failMovement: 2 });
  await postInventoryForDocument(purchase, userId);
  await assert.rejects(postInventoryForDocument({ ...purchase, items: [{ ...line, qty: 9 }] }, userId), /Movement write failed/);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming[0].totalQty, 5);
});

test('purchase-linked receipt cannot be overwritten by CSV import', async () => {
  const db = store();
  await postInventoryForDocument(purchase, userId);
  const writes = mock.method(StockIn, 'findByIdAndUpdate', () => assert.fail('Linked record must not be written'));
  const result = await invoke(importStockIn, { user: { id: userId }, file: { originalname: 'stock.csv', buffer: Buffer.from(`Stock In No,Date,Supplier,Qty,Value\n${db.state().incoming[0].stockInNo},2026-10-15,Vendor,99,9900\n`) } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.skipped, 1);
  assert.match(result.body.errors[0], /original purchase or return/);
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming[0].totalQty, 5);
});

test('failed deletion retains the purchase, stock, and original movement', async () => {
  const db = store({ failDelete: true });
  await postInventoryForDocument(purchase, userId);
  const result = await invoke(deleteInvoice, { user: { id: userId }, params: { id: docId }, body: {}, query: {} });
  assert.match(result.error.message, /Document deletion failed/);
  assert.equal(result.body, undefined);
  assert.equal(db.state().invoice._id, docId);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming.length, 1);
});

test('successful deletion reverses inventory and removes the purchase together', async () => {
  const db = store();
  await postInventoryForDocument(purchase, userId);
  const result = await invoke(deleteInvoice, { user: { id: userId }, params: { id: docId }, body: {}, query: {} });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 200);
  assert.equal(db.state().invoice, null);
  assert.equal(db.state().product.stock, 10);
  assert.equal(db.state().incoming.length, 0);
});

test('purchase deletion is blocked when received stock has already been consumed', async () => {
  const db = store();
  await postInventoryForDocument(purchase, userId);
  db.state().product.stock = 2;
  const result = await invoke(deleteInvoice, { user: { id: userId }, params: { id: docId }, body: {}, query: {} });
  assert.equal(result.error.statusCode, 409);
  assert.equal(db.state().product.stock, 2);
  assert.ok(db.state().invoice);
});

test('purchase with linked supplier returns cannot be deleted', async () => {
  const db = store();
  mock.method(Invoice, 'exists', async () => ({ _id: 'return-id' }));
  const result = await invoke(deleteInvoice, { user: { id: userId }, params: { id: docId }, body: {}, query: {} });
  assert.equal(result.error.statusCode, 409);
  assert.match(result.error.message, /supplier returns/);
  assert.ok(db.state().invoice);
});

test('nested inventory work uses one transaction and no success response escapes a failed commit', async () => {
  const db = store({ failCommit: true });
  const handler = atomicInventoryHandler(async (req, res) => { await postInventoryForDocument(purchase, userId); res.status(201).json({ saved: true }); });
  const result = await invoke(handler, {});
  assert.match(result.error.message, /Commit failed/);
  assert.equal(result.body, undefined);
  assert.equal(db.transactions.mock.callCount(), 1);
  assert.equal(db.state().product.stock, 10);
});

test('Mongoose automatically attaches the transaction session to product writes', async () => {
  const session = { test: true };
  mock.method(Product.collection, 'updateOne', async (filter, update, options) => {
    assert.equal(options.session, session);
    return { matchedCount: 1 };
  });
  await mongoose.transactionAsyncLocalStorage.run({ session }, () => Product.updateOne({ _id: productId }, { $inc: { stock: 1 } }));
});

test('unsupported transaction deployment fails closed with an actionable error', async () => {
  mock.method(mongoose.connection, 'transaction', async () => { throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member'), { code: 20 }); });
  await assert.rejects(inventoryTransaction(() => assert.fail('Must not fall back to nontransactional writes')), (error) => error.statusCode === 503 && error.code === 'MONGODB_TRANSACTIONS_REQUIRED' && /temporarily unavailable/.test(error.message));
});

test('new product receipts apply quantity exactly once', async () => {
  const db = store({ missingProduct: true });
  await postInventoryForDocument({ ...purchase, items: [{ ...line, productId: null, size: 'Blue' }] }, userId);
  assert.equal(db.state().product.stock, 5);
  assert.equal(db.state().product.variants[0].stock, 5);
  await postInventoryForDocument({ ...purchase, items: [{ ...line, productId: null, size: 'Blue' }] }, userId);
  assert.equal(db.state().product.stock, 5);
  assert.equal(db.state().product.variants[0].stock, 5);
});

test('Automobile receipt uses Electronics product handling without changing its business subcategory', async () => {
  const db = store({ missingProduct: true });
  const receipt = {
    ...purchase,
    businessSettingsSnapshot: { retailSubcategory: '', documentWorkflow: 'electronics-technology' },
    items: [{ ...line, productId: null, brand: 'Brand One', size: 'Model A', barcode: '1234567890123' }],
  };
  await postInventoryForDocument(receipt, userId);
  assert.equal(db.state().product.itemGroup, 'Electronics');
  assert.equal(db.state().product.stock, 5);
  assert.equal(db.state().product.variants[0].stock, 5);
  await postInventoryForDocument(receipt, userId);
  assert.equal(db.state().product.stock, 5);
  assert.equal(receipt.businessSettingsSnapshot.retailSubcategory, '');
});

test('imported electronics with the same colour and different storage create separate variants', async () => {
  const db = store({ missingProduct: true });
  const receipt = { ...purchase, businessSettingsSnapshot: { retailSubcategory: 'electronics-technology' }, items: [
    { ...line, productId: null, productType: 'Matrix', colour: 'Black', ram: '6 GB', storage: '128 GB', qty: 5 },
    { ...line, productId: null, productType: 'Matrix', colour: 'Black', ram: '6 GB', storage: '256 GB', qty: 3 },
  ] };
  await postInventoryForDocument(receipt, userId);
  assert.equal(db.state().product.stock, 8);
  assert.deepEqual(db.state().product.variants.map((variant) => [variant.ram, variant.storage, variant.stock]), [['6 GB', '128 GB', 5], ['6 GB', '256 GB', 3]]);
  await postInventoryForDocument(receipt, userId);
  assert.equal(db.state().product.stock, 8);
});

test('accounting reversal failure during deletion rolls back inventory and preserves the source', async () => {
  const db = store();
  await postInventoryForDocument(purchase, userId);
  mock.method(AccountingPosting, 'findOne', () => ({ lean: async () => { throw new Error('Accounting reversal failed'); } }));
  const result = await invoke(deleteInvoice, { user: { id: userId }, params: { id: docId }, body: {}, query: {} });
  assert.match(result.error.message, /Accounting reversal failed/);
  assert.equal(result.body, undefined);
  assert.equal(db.state().product.stock, 15);
  assert.equal(db.state().incoming.length, 1);
  assert.ok(db.state().invoice);
});

test('reducing a purchase below already-consumed quantity is rejected without changing its receipt', async () => {
  const db = store({ stock: 0 });
  await postInventoryForDocument(purchase, userId);
  db.state().product.stock = 2; // Three units have been sold.
  await assert.rejects(postInventoryForDocument({ ...purchase, items: [{ ...line, qty: 1 }] }, userId), /Insufficient stock/);
  assert.equal(db.state().product.stock, 2);
  assert.equal(db.state().incoming[0].totalQty, 5);
});

test('transaction audit hooks await their write and propagate failure before commit', async () => {
  const hooks = new Map();
  auditPlugin({ options: {}, pre() {}, post(names, handler) { for (const name of Array.isArray(names) ? names : [names]) hooks.set(name, handler); } });
  mock.method(AuditLog, 'create', async () => { throw new Error('Audit persistence failed'); });
  const doc = { _id: docId, constructor: { modelName: 'Invoice' }, number: 'PE-001', $locals: { __auditWasNew: true } };
  await assert.rejects(mongoose.transactionAsyncLocalStorage.run({ session: {} }, () => hooks.get('save')(doc)), /Audit persistence failed/);
});

test('audit hooks ignore embedded line items that have no model name', async () => {
  const hooks = new Map();
  auditPlugin({ options: {}, pre() {}, post(names, handler) { for (const name of Array.isArray(names) ? names : [names]) hooks.set(name, handler); } });
  let writes = 0;
  mock.method(AuditLog, 'create', async () => { writes++; });
  const lineItem = { _id: docId, $isSubdocument: true, constructor: {}, $locals: {} };
  await mongoose.transactionAsyncLocalStorage.run({ session: {} }, () => hooks.get('save')(lineItem));
  assert.equal(writes, 0);
});

test('transaction retries send only the committed response', async () => {
  let attempts = 0;
  mock.method(mongoose.connection, 'transaction', async (work) => {
    try { await work(); } catch (error) { assert.match(error.message, /Retry/); }
    return work();
  });
  const handler = atomicInventoryHandler(async (req, res) => {
    attempts++;
    res.status(201).json({ attempt: attempts });
    if (attempts === 1) throw new Error('Retry');
  });
  const result = await invoke(handler, {});
  assert.equal(result.error, undefined);
  assert.deepEqual(result.body, { attempt: 2 });
});
