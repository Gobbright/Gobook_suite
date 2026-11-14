import { CATEGORIES } from '../src/constants/categories.js';
import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import mongoose from 'mongoose';
import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { StockIn } from '../src/models/StockIn.js';
import { StockOut } from '../src/models/StockOut.js';
import { AppUser } from '../src/models/AppUser.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Payment } from '../src/models/Payment.js';
import { AccountingPosting } from '../src/models/AccountingPosting.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { CashBookEntry } from '../src/models/CashBookEntry.js';
import { BankBookEntry } from '../src/models/BankBookEntry.js';
import { SupplierReturnLock } from '../src/models/SupplierReturnLock.js';
import { OnlineOrder } from '../src/models/OnlineOrder.js';
import { invoiceState, returnState, isFinanciallyActive, stripWorkflowFields, approvedRestockItems, ACTIVE_FINANCIAL_FILTER } from '../src/services/salesLifecycle.js';
import { creditedAmount } from '../src/services/financialCredits.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET ||= 'lifecycle-workflow-test';
const { createInvoice, updateInvoice, deleteInvoice } = await import('../src/modules/retail/sales/billing-invoicing/invoiceController.js');
const { transitionInvoice, transitionSalesReturn } = await import('../src/modules/retail/sales/billing-invoicing/lifecycleController.js');
const { createSalesReturn, deleteSalesReturn, updateSalesReturn } = await import('../src/modules/retail/sales/sales-return/salesReturnController.js');
const { createCreditNote } = await import('../src/modules/retail/sales/credit-debit-note/creditNoteController.js');
const { recordPayment } = await import('../src/modules/retail/sales/billing-invoicing/paymentController.js');
const { transitionChallan, convertChallan } = await import('../src/modules/retail/sales/delivery-challan/challanWorkflow.js');
const { createChallan, updateChallan, deleteChallan } = await import('../src/modules/retail/sales/delivery-challan/challanController.js');
afterEach(() => mock.restoreAll());

const owner = '507f1f77bcf86cd799439001';
const productId = '507f1f77bcf86cd799439002';
const plain = (value) => value == null ? value : JSON.parse(JSON.stringify(value.toObject?.() || value));
const saleBody = (patch = {}) => ({ number: 'INV-001', documentType: 'invoice', customer: { name: 'Customer' }, meta: { date: '2026-10-15' }, items: [{ productId, description: 'Item', qty: 5, rate: 100, itemType: 'Product', unit: 'Nos' }], totals: { finalTotal: 500 }, ...patch });

function matches(doc, filter = {}) {
  if (!doc) return false;
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((entry) => matches(doc, entry));
    if (key === '$and') return value.every((entry) => matches(doc, entry));
    if (key === 'lines.ledgerName') return doc.lines?.some((line) => line.ledgerName === value);
    const current = key.split('.').reduce((item, part) => item?.[part], doc);
    if (value instanceof RegExp) return value.test(String(current || ''));
    if (value && typeof value === 'object' && !value._bsontype) {
      if ('$in' in value) return value.$in.some((entry) => String(entry) === String(current));
      if ('$nin' in value) return !value.$nin.some((entry) => String(entry) === String(current));
      if ('$gte' in value) return Number(current) >= value.$gte;
      if ('$exists' in value) return (current !== undefined) === value.$exists;
      if ('$ne' in value) return String(current) !== String(value.$ne);
    }
    return String(current) === String(value);
  });
}

function setup() {
  let state = { invoices: [], incoming: [], outgoing: [], postings: [], vouchers: [], journals: [], ledgers: {}, payments: [], stock: 10 };
  const options = { failAccounting: false, deny: false };
  const asDoc = (value) => value ? new Invoice(value) : null;
  const query = (read, hydrate = (value) => value) => ({
    then(resolve, reject) { return Promise.resolve(read()).then(hydrate).then(resolve, reject); },
    lean: async () => plain(read()), select() { return this; }, sort() { return this; }, limit() { return this; }, skip() { return this; },
  });
  const apply = (doc, update) => {
    for (const [path, value] of Object.entries(plain(update.$set || {}))) {
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((parent, key) => (parent[key] ||= {}), doc);
      target[last] = value;
    }
    for (const [key, amount] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + amount;
    for (const path of Object.keys(update.$unset || {})) {
      const keys = path.split('.'); const last = keys.pop();
      const parent = keys.reduce((value, key) => value?.[key], doc); if (parent) delete parent[last];
    }
    for (const [key, entry] of Object.entries(update.$push || {})) (doc[key] ||= []).push(plain(entry));
  };
  mock.method(mongoose.connection, 'transaction', async (work) => {
    const snapshot = plain(state);
    try { return await mongoose.transactionAsyncLocalStorage.run({ session: {} }, work); }
    catch (error) { state = snapshot; throw error; }
  });
  mock.method(AppUser, 'findById', () => query(() => ({ _id: owner, status: 'Active', accountType: options.deny ? 'member' : 'owner', permissions: { actions: {} } })));
  mock.method(BusinessSettings, 'findOne', () => query(() => ({})));
  mock.method(Invoice, 'findOne', (filter) => query(() => state.invoices.find((doc) => matches(doc, filter)), asDoc));
  mock.method(Invoice, 'find', (filter) => query(() => state.invoices.filter((doc) => matches(doc, filter))));
  mock.method(Invoice, 'exists', async (filter) => state.invoices.some((doc) => matches(doc, filter)));
  mock.method(Invoice, 'aggregate', async () => []);
  mock.method(Invoice, 'create', async (input) => { const doc = new Invoice(input); state.invoices.push(plain(doc)); return doc; });
  mock.method(Invoice, 'findOneAndUpdate', (filter, update) => query(() => {
    const doc = state.invoices.find((entry) => matches(entry, filter));
    if (doc) apply(doc, update);
    return doc;
  }, asDoc));
  mock.method(Invoice, 'updateOne', async (filter, update) => { const doc = state.invoices.find((entry) => matches(entry, filter)); if (doc) apply(doc, update); return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 }; });
  mock.method(Invoice, 'deleteOne', async (filter) => { const index = state.invoices.findIndex((doc) => matches(doc, filter)); if (index >= 0) state.invoices.splice(index, 1); return { deletedCount: index >= 0 ? 1 : 0 }; });
  mock.method(Invoice, 'findOneAndDelete', (filter) => query(() => { const index = state.invoices.findIndex((doc) => matches(doc, filter)); return index >= 0 ? state.invoices.splice(index, 1)[0] : null; }, asDoc));
  mock.method(Product, 'findOne', (filter) => query(() => matches({ _id: productId, userId: owner, description: 'Item' }, filter) ? { _id: productId, userId: owner, description: 'Item', stock: state.stock, variants: [] } : null));
  mock.method(Product, 'updateOne', async (filter, update) => { if (!matches({ _id: productId, userId: owner, stock: state.stock }, filter)) return { matchedCount: 0 }; state.stock += update.$inc?.stock || 0; return { matchedCount: 1 }; });
  for (const [Model, key] of [[StockIn, 'incoming'], [StockOut, 'outgoing'], [AccountingPosting, 'postings'], [AccountingVoucher, 'vouchers'], [JournalEntry, 'journals']]) {
    mock.method(Model, 'find', (filter) => query(() => state[key].filter((doc) => matches(doc, filter))));
    mock.method(Model, 'findOne', (filter) => query(() => {
      const doc = state[key].findLast((entry) => matches(entry, filter));
      return doc ? { ...doc, save: async function () { const saved = plain(this); const index = state[key].findIndex((entry) => entry._id === doc._id); state[key][index] = saved; return this; }, deleteOne: async () => { state[key] = state[key].filter((entry) => entry._id !== doc._id); } } : null;
    }));
    mock.method(Model, 'create', async (input) => { if (key === 'postings' && options.failAccounting) throw new Error('Injected accounting failure'); const doc = { ...plain(input), _id: String(new mongoose.Types.ObjectId()) }; state[key].push(doc); return doc; });
    mock.method(Model, 'deleteMany', async (filter) => { state[key] = state[key].filter((doc) => !matches(doc, filter)); });
    mock.method(Model, 'deleteOne', async (filter) => { state[key] = state[key].filter((doc) => !matches(doc, filter)); });
  }
  mock.method(LedgerAccount, 'updateOne', async (filter, update) => {
    const ledger = state.ledgers[filter.name] ||= { debit: 0, credit: 0 };
    for (const [key, value] of Object.entries(update.$inc || {})) ledger[key] = (ledger[key] || 0) + value;
  });
  mock.method(LedgerAccount, 'findOneAndUpdate', (_filter, update) => query(() => ({ _id: String(new mongoose.Types.ObjectId()), group: update.$setOnInsert.group })));
  mock.method(AccountingVoucher, 'find', (filter) => query(() => state.vouchers.filter((voucher) => matches(voucher, filter))));
  mock.method(Payment, 'exists', async (filter) => state.payments.some((doc) => matches(doc, filter)));
  mock.method(Payment, 'find', (filter) => query(() => state.payments.filter((doc) => matches(doc, filter))));
  mock.method(Payment, 'create', async (input) => { const doc = new Payment(input); state.payments.push(plain(doc)); return doc; });
  mock.method(Payment, 'updateOne', async (filter, update) => { const doc = state.payments.find((entry) => matches(entry, filter)); if (doc) apply(doc, update); return { matchedCount: doc ? 1 : 0 }; });
  mock.method(Payment, 'deleteMany', async (filter) => { state.payments = state.payments.filter((doc) => !matches(doc, filter)); });
  mock.method(SupplierReturnLock, 'create', async () => ({}));
  mock.method(SupplierReturnLock, 'deleteOne', async () => ({}));
  for (const Model of [CashBookEntry, BankBookEntry]) {
    mock.method(Model, 'deleteMany', async () => ({}));
    mock.method(Model, 'create', async (input) => ({ ...input, _id: String(new mongoose.Types.ObjectId()) }));
  }
  return { state: () => state, options };
}

async function call(handler, { id, body = {}, userId = owner, category } = {}) {
  let result, error, status;
  const res = { status(code) { status = code; return res; }, json(body) { result = plain(body); return res; } };
  await handler({ user: { id: userId, category }, params: { id }, body, query: {} }, res, (value) => { error = value; });
  return { result, error, status };
}
async function create(patch = {}) {
  const result = await call(createInvoice, { body: saleBody(patch) });
  assert.equal(result.error, undefined, result.error?.stack);
  return result.result;
}
async function action(id, action, patch = {}) {
  return call(transitionInvoice, { id, body: { action, ...patch } });
}
async function dispatchedSale() {
  const invoice = await create();
  assert.equal((await action(invoice._id, 'dispatch')).error, undefined);
  return invoice;
}
async function requestReturn(invoice) {
  const result = await call(createSalesReturn, { body: { number: 'SR-001', customer: invoice.customer, meta: invoice.meta, items: [{ ...invoice.items[0], qty: 3 }], extra: { originalSalesId: invoice._id, reason: 'Customer returned goods' }, returnStatus: 'completed', lifecycleStatus: 'posted' } });
  assert.equal(result.error, undefined, result.error?.stack);
  return result.result;
}

async function challan(patch = {}) {
  const response = await call(createChallan, { category: 'automobile', body: saleBody({ documentType: 'delivery-challan', number: 'DC-001', ...patch }) });
  assert.equal(response.error, undefined, response.error?.stack);
  return response.result;
}
test('challan delivery workflow records timestamps without inventory or accounting changes', async () => {
  const env = setup(); const doc = await challan({ extra: { deliveryStatus: 'delivered', convertedInvoiceId: 'forged' } });
  assert.equal(doc.extra.deliveryStatus, 'draft');
  assert.equal(doc.extra.convertedInvoiceId, undefined);
  for (const status of ['ready', 'dispatched', 'in-transit', 'delivered']) {
    const response = await call(transitionChallan, { category: 'automobile', id: doc._id, body: { status } });
    assert.equal(response.error, undefined, response.error?.stack);
    assert.equal(response.result.challan.extra.deliveryStatus, status);
  }
  assert.ok(env.state().invoices[0].extra.deliveredAt);
  assert.equal(env.state().stock, 10); assert.equal(env.state().outgoing.length, 0); assert.equal(env.state().postings.length, 0);
  const backwards = await call(transitionChallan, { category: 'automobile', id: doc._id, body: { status: 'ready' } });
  assert.equal(backwards.error?.statusCode, 409);
});
test('challan conversion creates one linked draft; posting it moves stock exactly once', async () => {
  const env = setup(); const doc = await challan({ extra: { stockHandledByOnlineOrder: true }, advanceReceived: 500 });
  const converted = await call(convertChallan, { category: 'automobile', id: doc._id });
  assert.equal(converted.error, undefined, converted.error?.stack);
  const invoice = converted.result.invoice;
  assert.equal(invoice.lifecycleStatus, 'draft'); assert.equal(invoice.advanceReceived, 0);
  assert.equal(invoice.extra.sourceChallanId, doc._id); assert.equal(invoice.extra.stockHandledByOnlineOrder, undefined);
  assert.equal(converted.result.challan.extra.convertedInvoiceId, invoice._id);
  assert.equal(env.state().stock, 10); assert.equal(env.state().outgoing.length, 0); assert.equal(env.state().postings.length, 0);
  const repeat = await call(convertChallan, { category: 'automobile', id: doc._id });
  assert.equal(repeat.result.invoice._id, invoice._id); assert.equal(env.state().invoices.length, 2);
  assert.equal((await action(invoice._id, 'post')).error, undefined);
  assert.equal(env.state().stock, 5); assert.equal(env.state().outgoing.length, 1);
  assert.equal((await action(invoice._id, 'post')).error?.statusCode, 409);
  assert.equal(env.state().stock, 5);
});
test('converted and dispatched challans reject edits and converted challans reject deletion', async () => {
  setup(); const doc = await challan();
  await call(transitionChallan, { category: 'automobile', id: doc._id, body: { status: 'ready' } });
  await call(transitionChallan, { category: 'automobile', id: doc._id, body: { status: 'dispatched' } });
  assert.equal((await call(updateChallan, { category: 'automobile', id: doc._id, body: { items: [] } })).error?.statusCode, 409);
  await call(convertChallan, { category: 'automobile', id: doc._id });
  assert.equal((await call(updateChallan, { category: 'automobile', id: doc._id, body: { extra: {} } })).error?.statusCode, 409);
  assert.equal((await call(deleteChallan, { category: 'automobile', id: doc._id })).error?.statusCode, 409);
});
test('challan updates cannot forge workflow fields or billing links', async () => {
  setup(); const doc = await challan();
  const updated = await call(updateChallan, { category: 'automobile', id: doc._id, body: { notes: 'Updated', extra: { deliveryStatus: 'delivered', convertedInvoiceId: 'forged', transporter: 'Carrier' } } });
  assert.equal(updated.error, undefined, updated.error?.stack);
  assert.equal(updated.result.notes, 'Updated'); assert.equal(updated.result.extra.transporter, 'Carrier');
  assert.equal(updated.result.extra.deliveryStatus, 'draft'); assert.equal(updated.result.extra.convertedInvoiceId, undefined);
});
test('challan conversion checks permissions, tenant scope and source validation before writes', async () => {
  const env = setup(); const doc = await challan(); env.options.deny = true;
  assert.equal((await call(convertChallan, { category: 'automobile', id: doc._id })).error?.statusCode, 403);
  env.options.deny = false;
  assert.equal((await call(convertChallan, { category: 'automobile', userId: '507f1f77bcf86cd799439099', id: doc._id })).error?.statusCode, 404);
  assert.equal((await call(convertChallan, { category: 'retail', id: doc._id })).error?.statusCode, 403);
  env.state().invoices[0].items = [];
  assert.equal((await call(convertChallan, { category: 'automobile', id: doc._id })).error?.statusCode, 400);
  assert.equal(env.state().invoices.length, 1); assert.equal(env.state().stock, 10);
});
test('failed challan conversion rolls back its draft and link', async () => {
  const env = setup(); const doc = await challan();
  mock.method(Invoice, 'findOneAndUpdate', () => ({ then(resolve) { return Promise.resolve(null).then(resolve); } }));
  const converted = await call(convertChallan, { category: 'automobile', id: doc._id });
  assert.equal(converted.error?.statusCode, 409);
  assert.equal(env.state().invoices.length, 1); assert.equal(env.state().invoices[0].extra.convertedInvoiceId, undefined);
  assert.equal(env.state().stock, 10);
});

test('Automobile quotation saves retain details without payments, stock or accounting changes', async () => {
  const env = setup();
  const saved = await call(createInvoice, { category: 'automobile', body: saleBody({ documentType: 'quotation', number: 'QTN-001', extra: { validTill: '2026-10-24', quotationStatus: 'Draft' }, terms: 'Valid for seven days', advanceReceived: 500, paymentMethod: 'Cash', paymentSplits: [{ amount: 500, method: 'Cash' }] }) });
  assert.equal(saved.error, undefined, saved.error?.stack);
  assert.equal(saved.result.extra.quotationStatus, 'Draft');
  assert.equal(saved.result.extra.validTill, '2026-10-24');
  assert.equal(saved.result.terms, 'Valid for seven days');
  assert.equal(saved.result.advanceReceived, 0);
  assert.equal(saved.result.paymentMethod, '');
  assert.deepEqual(saved.result.paymentSplits, []);
  assert.equal(env.state().stock, 10);
  assert.equal(env.state().outgoing.length, 0);
  assert.equal(env.state().postings.length, 0);
  assert.equal(env.state().payments.length, 0);
  const edited = await call(updateInvoice, { category: 'automobile', id: saved.result._id, body: { notes: 'Updated delivery date', advanceReceived: 100 } });
  assert.equal(edited.error, undefined, edited.error?.stack);
  assert.equal(edited.result.advanceReceived, 0);
  assert.equal(edited.result.notes, 'Updated delivery date');
  assert.equal(env.state().stock, 10);
});

test('Automobile quotation conversion links one invoice and rejects repeat conversion', async () => {
  const env = setup();
  const quote = await create({ documentType: 'quotation', number: 'QT-001', extra: { quotationStatus: 'Accepted', validTill: '2099-12-31' } });
  const first = await call(createInvoice, { category: 'automobile', body: saleBody({ extra: { sourceQuotationId: quote._id } }) });
  assert.equal(first.error, undefined, first.error?.stack);
  const linked = env.state().invoices.find((doc) => doc._id === quote._id);
  assert.equal(linked.extra.convertedInvoiceId, first.result._id);
  assert.equal(linked.extra.quotationStatus, 'Converted');
  assert.equal(env.state().stock, 5);
  const repeat = await call(createInvoice, { category: 'automobile', body: saleBody({ number: 'INV-002', extra: { sourceQuotationId: quote._id } }) });
  assert.equal(repeat.error?.statusCode, 409);
  assert.equal(env.state().invoices.length, 2);
  assert.equal(env.state().stock, 5);
});

test('failed quotation conversion preserves the quotation, stock and accounting', async () => {
  const env = setup();
  const quote = await create({ documentType: 'quotation', number: 'QT-001', extra: { quotationStatus: 'Accepted' } });
  env.options.failAccounting = true;
  const result = await call(createInvoice, { category: 'automobile', body: saleBody({ extra: { sourceQuotationId: quote._id } }) });
  assert.ok(result.error);
  assert.equal(env.state().invoices.length, 1);
  assert.equal(env.state().invoices[0].extra.quotationStatus, 'Accepted');
  assert.equal(env.state().invoices[0].extra.convertedInvoiceId, undefined);
  assert.equal(env.state().stock, 10);
  assert.equal(env.state().outgoing.length, 0);
});

test('Automobile rejects empty drafts and foreign quotation conversion before any writes', async () => {
  const env = setup();
  const empty = await call(createInvoice, { category: 'automobile', body: saleBody({ lifecycleStatus: 'draft', items: [] }) });
  assert.equal(empty.error?.statusCode, 400);
  assert.equal(env.state().invoices.length, 0);
  const quote = await create({ documentType: 'quotation', number: 'QT-001', extra: { quotationStatus: 'Accepted' } });
  const foreign = await call(createInvoice, { category: 'automobile', userId: '507f1f77bcf86cd799439099', body: saleBody({ extra: { sourceQuotationId: quote._id } }) });
  assert.equal(foreign.error?.statusCode, 404);
  assert.equal(env.state().invoices.length, 1);
  assert.equal(env.state().stock, 10);
});

test('draft creation and deletion never affect stock, movements, or accounting', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft', advanceReceived: 500 });
  assert.equal(draft.advanceReceived, 0);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().outgoing.length, 0);
  assert.equal(db.state().postings.length, 0);
  const deleted = await call(deleteInvoice, { id: draft._id });
  assert.equal(deleted.error, undefined);
  assert.equal(db.state().invoices.length, 0);
  assert.equal(db.state().stock, 10);
});

test('supplier payments reduce payables and paid purchase edits move their settlement to the edited supplier', async () => {
  const db = setup();
  const purchase = await create({ documentType: 'purchase-entry', customer: { name: 'Supplier A' } });
  const paid = await call(recordPayment, { id: purchase._id, body: { amount: 200, method: 'Cash' } });
  assert.equal(paid.error, undefined, paid.error?.stack);
  assert.equal(db.state().vouchers.find((row) => row.sourceType === 'payment').voucherType, 'Payment');
  assert.equal(db.state().ledgers['Supplier A'].debit, 200);
  assert.equal(db.state().ledgers.Cash.credit, 200);
  const edited = await call(updateInvoice, { id: purchase._id, body: { customer: { name: 'Supplier B' } } });
  assert.equal(edited.error, undefined, edited.error?.stack);
  assert.equal(db.state().payments[0].customerName, 'Supplier B');
  assert.equal(db.state().ledgers['Supplier A'].debit, 0);
  assert.equal(db.state().ledgers['Supplier A'].credit, 0);
  assert.equal(db.state().ledgers['Supplier B'].debit, 200);
  assert.equal(db.state().ledgers['Supplier B'].credit, 500);
  assert.equal(db.state().vouchers.filter((row) => row.sourceType === 'payment').length, 1);
  const belowPaid = await call(updateInvoice, { id: purchase._id, body: { totals: { finalTotal: 100 } } });
  assert.equal(belowPaid.error.statusCode, 409);
});

test('supplier return credits reduce the available payment balance on a purchase', async () => {
  const db = setup(); const purchase = await create({ documentType: 'purchase-entry', customer: { name: 'Supplier' } });
  db.state().invoices.push({ ...saleBody({ documentType: 'supplier-return', number: 'PR-001', totals: { finalTotal: 150 }, items: [{ qty: 1, rate: 150 }] }), _id: String(new mongoose.Types.ObjectId()), userId: owner, extra: { originalPurchaseId: purchase._id } });
  const excessive = await call(recordPayment, { id: purchase._id, body: { amount: 400, method: 'Cash' } });
  assert.equal(excessive.error.statusCode, 400);
  const valid = await call(recordPayment, { id: purchase._id, body: { amount: 350, method: 'Cash' } });
  assert.equal(valid.error, undefined, valid.error?.stack);
});

test('posting a draft deducts stock and posts accounting exactly once', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft' });
  assert.equal((await action(draft._id, 'post')).error, undefined);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().postings.length, 1);
  assert.equal((await action(draft._id, 'post')).error.statusCode, 409);
  assert.equal(db.state().stock, 5);
});

test('cancellation retains invoice, dispatch movement, and a traceable stock reversal', async () => {
  const db = setup();
  const invoice = await create();
  const cancelled = await action(invoice._id, 'cancel', { reason: 'Customer cancelled before dispatch' });
  assert.equal(cancelled.error, undefined);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().postings.length, 0);
  assert.equal(db.state().outgoing.length, 1);
  assert.equal(db.state().incoming[0].sourceType, 'invoice-cancellation');
  assert.equal(db.state().invoices[0].lifecycleStatus, 'cancelled');
  assert.equal(db.state().invoices[0].lifecycleEvents.at(-1).reason, 'Customer cancelled before dispatch');
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Repeat' })).error.statusCode, 409);
  assert.equal(db.state().stock, 10);
});

test('posted bill edits replace inventory and accounting without resetting lifecycle', async () => {
  const db = setup();
  const invoice = await create();
  const updated = await call(updateInvoice, { id: invoice._id, body: saleBody({ lifecycleStatus: 'draft', items: [{ ...invoice.items[0], qty: 3 }], totals: { finalTotal: 300 } }) });
  assert.equal(updated.error, undefined, updated.error?.stack);
  assert.equal(db.state().stock, 7);
  assert.equal(db.state().invoices[0].lifecycleStatus, 'posted');
  assert.equal(db.state().outgoing.length, 1);
  assert.equal(db.state().outgoing[0].totalQty, 3);
  assert.equal(db.state().postings.length, 1);
  assert.equal(db.state().ledgers.Customer.debit, 300);
  assert.equal(updated.result.lifecycleEvents.at(-1).action, 'edited');
  assert.equal((await call(deleteInvoice, { id: invoice._id })).error, undefined);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().invoices.length, 0);
  assert.equal(db.state().outgoing.length, 0);
  assert.equal(db.state().postings.length, 0);
  assert.equal(db.state().ledgers.Customer.debit, 0);
});

test('dispatch prevents cancellation and never changes inventory a second time', async () => {
  const db = setup();
  const invoice = await dispatchedSale();
  assert.equal(db.state().stock, 5);
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Try cancel' })).error.statusCode, 409);
  assert.equal((await call(deleteInvoice, { id: invoice._id })).error, undefined);
  assert.equal(db.state().stock, 10);
});

test('paid bill edits preserve receipts and reassign their accounting to the edited customer', async () => {
  const db = setup(); const invoice = await create();
  const paid = await call(recordPayment, { id: invoice._id, body: { amount: 200, method: 'Cash', date: '2026-11-03' } });
  assert.equal(paid.error, undefined, paid.error?.stack);
  const receiptId = db.state().payments[0]._id;
  const edited = await call(updateInvoice, { id: invoice._id, body: saleBody({ number: 'INV-RENAMED', customer: { name: 'New Customer' }, items: [{ ...invoice.items[0], qty: 4 }], totals: { finalTotal: 400 }, advanceReceived: 0 }) });
  assert.equal(edited.error, undefined, edited.error?.stack);
  assert.equal(db.state().stock, 6);
  assert.equal(db.state().payments.length, 1);
  assert.equal(db.state().payments[0]._id, receiptId);
  assert.equal(db.state().payments[0].amount, 200);
  assert.equal(db.state().payments[0].invoiceNumber, 'INV-RENAMED');
  assert.equal(db.state().payments[0].customerName, 'New Customer');
  assert.equal(db.state().ledgers.Customer.debit, 0); assert.equal(db.state().ledgers.Customer.credit, 0);
  assert.equal(db.state().ledgers['New Customer'].debit, 400); assert.equal(db.state().ledgers['New Customer'].credit, 200);
  assert.equal(db.state().ledgers.Cash.debit, 200);
  assert.equal(edited.result.extra.newBalance, 200);
  assert.equal((await call(deleteInvoice, { id: invoice._id })).error, undefined);
  assert.equal(db.state().stock, 10); assert.equal(db.state().payments.length, 0);
  assert.equal(db.state().ledgers.Cash.debit, 0); assert.equal(db.state().ledgers['New Customer'].debit, 0); assert.equal(db.state().ledgers['New Customer'].credit, 0);
});

test('bill edits reject totals below received payments and linked return mutations without partial writes', async () => {
  const db = setup(); const invoice = await create();
  db.state().payments.push({ _id: String(new mongoose.Types.ObjectId()), userId: owner, invoiceId: invoice._id, amount: 400 });
  const snapshot = plain(db.state());
  const edited = await call(updateInvoice, { id: invoice._id, body: saleBody({ totals: { finalTotal: 300 } }) });
  assert.equal(edited.error?.statusCode, 409); assert.deepEqual(db.state(), snapshot);
  db.state().payments = [];
  await action(invoice._id, 'dispatch'); await requestReturn(invoice);
  for (const handler of [updateInvoice, deleteInvoice]) {
    const response = await call(handler, { id: invoice._id, body: saleBody() });
    assert.equal(response.error?.statusCode, 409); assert.match(response.error.message, /linked/);
  }
  assert.equal(db.state().stock, 5); assert.equal(db.state().invoices.length, 2);
});

test('failed posted bill edits and deletion roll back stock, invoice and accounting', async () => {
  const db = setup(); const invoice = await create(); const snapshot = plain(db.state());
  db.options.failAccounting = true;
  const edited = await call(updateInvoice, { id: invoice._id, body: saleBody({ items: [{ ...invoice.items[0], qty: 2 }], totals: { finalTotal: 200 } }) });
  assert.match(edited.error.message, /Injected accounting failure/); assert.deepEqual(db.state(), snapshot);
  db.options.failAccounting = false;
  mock.method(AccountingPosting, 'deleteOne', async () => { throw new Error('Delete reversal failed'); });
  const deleted = await call(deleteInvoice, { id: invoice._id });
  assert.match(deleted.error.message, /Delete reversal failed/); assert.deepEqual(db.state(), snapshot);
});

test('posted bill mutations enforce permissions and ownership before any writes', async () => {
  const db = setup(); const invoice = await create(); const snapshot = plain(db.state());
  for (const handler of [updateInvoice, deleteInvoice]) {
    db.options.deny = true;
    assert.equal((await call(handler, { id: invoice._id, body: saleBody() })).error?.statusCode, 403);
    db.options.deny = false;
    assert.equal((await call(handler, { id: invoice._id, userId: '507f1f77bcf86cd799439099', body: saleBody() })).error?.statusCode, 404);
  }
  assert.deepEqual(db.state(), snapshot);
});

test('deleting a converted bill releases its source link and keeps source records', async () => {
  const db = setup(); const source = await challan();
  await call(transitionChallan, { category: 'automobile', id: source._id, body: { status: 'ready' } });
  await call(transitionChallan, { category: 'automobile', id: source._id, body: { status: 'dispatched' } });
  const converted = await call(convertChallan, { category: 'automobile', id: source._id });
  const invoice = converted.result.invoice;
  await action(invoice._id, 'post');
  const renamed = await call(updateInvoice, { id: invoice._id, body: { number: 'INV-CHANGED' } });
  assert.equal(renamed.error, undefined, renamed.error?.stack);
  assert.equal(db.state().invoices.find((doc) => doc._id === source._id).extra.convertedInvoiceNumber, 'INV-CHANGED');
  const deleted = await call(deleteInvoice, { id: invoice._id });
  assert.equal(deleted.error, undefined, deleted.error?.stack);
  assert.equal(db.state().stock, 10); assert.equal(db.state().invoices.length, 1);
  assert.equal(db.state().invoices[0].extra.convertedInvoiceId, undefined);
});

test('return request and receipt do not restock; inspection approves only sellable quantities', async () => {
  const db = setup();
  const invoice = await dispatchedSale();
  const note = await requestReturn(invoice);
  assert.equal(note.returnStatus, 'requested');
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().postings.length, 1);
  const received = await call(transitionSalesReturn, { id: note._id, body: { action: 'receive' } });
  assert.equal(received.error, undefined);
  assert.equal(db.state().stock, 5);
  const approved = await call(transitionSalesReturn, { id: note._id, body: { action: 'approve', reason: 'Two sellable, one damaged', items: [{ lineId: note.items[0]._id, restockQty: 2 }] } });
  assert.equal(approved.error, undefined, approved.error?.stack);
  assert.equal(db.state().stock, 7);
  assert.equal(db.state().incoming[0].totalQty, 2);
  assert.equal(db.state().postings.find((entry) => entry.sourceType === 'sales-return').lines.find((line) => line.accountName === 'Customer').amount, 300);
  assert.equal(approved.result.note.returnStatus, 'completed');
  assert.equal((await call(transitionSalesReturn, { id: note._id, body: { action: 'approve', reason: 'Repeat', items: [{ lineId: note.items[0]._id, restockQty: 2 }] } })).error.statusCode, 409);
  assert.equal((await call(deleteSalesReturn, { id: note._id })).error.statusCode, 409);
  assert.equal((await call(updateSalesReturn, { id: note._id })).error.statusCode, 409);
  assert.equal(db.state().stock, 7);
});

test('damaged returns can be credited with zero units going into sellable stock', async () => {
  const db = setup();
  const note = await requestReturn(await dispatchedSale());
  await call(transitionSalesReturn, { id: note._id, body: { action: 'receive' } });
  const result = await call(transitionSalesReturn, { id: note._id, body: { action: 'approve', reason: 'All units damaged', items: [{ lineId: note.items[0]._id, restockQty: 0 }] } });
  assert.equal(result.error, undefined);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().incoming.length, 0);
  assert.ok(db.state().postings.some((entry) => entry.sourceType === 'sales-return'));
});

test('approval before receipt or quantities above received goods are rejected', async () => {
  const db = setup();
  const note = await requestReturn(await dispatchedSale());
  const approve = { action: 'approve', reason: 'Inspected', items: [{ lineId: note.items[0]._id, restockQty: 3 }] };
  assert.equal((await call(transitionSalesReturn, { id: note._id, body: approve })).error.statusCode, 409);
  await call(transitionSalesReturn, { id: note._id, body: { action: 'receive' } });
  assert.equal((await call(transitionSalesReturn, { id: note._id, body: { ...approve, items: [{ lineId: note.items[0]._id, restockQty: 4 }] } })).error.statusCode, 400);
  assert.equal(db.state().stock, 5);
});

test('inspection/accounting failure rolls back stock and leaves the return received', async () => {
  const db = setup();
  const note = await requestReturn(await dispatchedSale());
  await call(transitionSalesReturn, { id: note._id, body: { action: 'receive' } });
  db.options.failAccounting = true;
  const result = await call(transitionSalesReturn, { id: note._id, body: { action: 'approve', reason: 'Inspected', items: [{ lineId: note.items[0]._id, restockQty: 3 }] } });
  assert.match(result.error.message, /Injected accounting failure/);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().incoming.length, 0);
  assert.equal(db.state().invoices.find((doc) => doc._id === note._id).returnStatus, 'received');
});

test('financial credit adjustments post accounting without moving stock', async () => {
  const db = setup();
  const invoice = await create();
  const credit = await call(createCreditNote, { body: saleBody({ number: 'CRN-001', items: [{ description: 'Price correction', qty: 1, rate: 50 }], totals: { finalTotal: 50 }, returnStatus: 'completed', extra: { originalInvoiceNo: invoice.number, reason: 'Price corrected' } }) });
  assert.equal(credit.error, undefined, credit.error?.stack);
  assert.equal(credit.result.extra.originalSalesId, invoice._id);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().incoming.length, 0);
  assert.equal(db.state().outgoing.length, 1);
  assert.ok(db.state().postings.some((entry) => entry.sourceType === 'credit-note'));
});

test('cancellation requires reason, permission, no linked returns, and resolved payments', async () => {
  const db = setup();
  const invoice = await create();
  assert.equal((await action(invoice._id, 'cancel')).error.statusCode, 400);
  db.options.deny = true;
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Cancel' })).error.statusCode, 403);
  db.options.deny = false;
  db.state().payments.push({ invoiceId: invoice._id, userId: owner });
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Cancel' })).error.statusCode, 409);
  assert.equal(db.state().stock, 5);
});

test('legacy invoices require explicit confirmation before cancellation', async () => {
  const db = setup();
  const invoice = await create();
  delete db.state().invoices[0].fulfillmentStatus;
  delete db.state().invoices[0].lifecycleStatus;
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Cancel' })).error.statusCode, 409);
  assert.equal((await action(invoice._id, 'confirm-undispatched', { reason: 'Verified goods remain on premises' })).error, undefined);
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Customer cancelled' })).error, undefined);
  assert.equal(db.state().stock, 10);
});

test('payments against drafts are rejected before any payment or stock write', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft' });
  assert.equal((await call(recordPayment, { id: draft._id, body: { amount: 10 } })).error.statusCode, 409);
  assert.equal(db.state().payments.length, 0);
  assert.equal(db.state().stock, 10);
});

test('e-invoice receipts post payment accounting without deducting inventory again', async () => {
  const db = setup();
  mock.method(Payment, 'create', async (input) => {
    const payment = new Payment({ ...input, _id: new mongoose.Types.ObjectId() });
    db.state().payments.push(plain(payment));
    return payment;
  });
  mock.method(CashBookEntry, 'create', async (input) => input);
  const invoice = await create({ documentType: 'e-invoice', number: 'EI-001' });
  assert.equal(db.state().stock, 5);
  const receipt = await call(recordPayment, { id: invoice._id, body: { amount: 200, method: 'Cash', reference: 'RCPT-001' } });
  assert.equal(receipt.error, undefined, receipt.error?.stack);
  assert.equal(receipt.status, 201);
  assert.equal(receipt.result.allocation.amount, 200);
  assert.equal(db.state().payments.length, 1);
  assert.ok(db.state().postings.some((entry) => entry.sourceType === 'payment'));
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().outgoing.length, 1);
});

test('legacy semantics and protected workflow fields preserve existing stock', () => {
  assert.equal(invoiceState({}), 'posted');
  assert.equal(returnState({}), 'completed');
  assert.equal(isFinanciallyActive({ documentType: 'sales-return' }), true);
  assert.equal(isFinanciallyActive({ lifecycleStatus: 'draft' }), false);
  assert.equal(isFinanciallyActive({ lifecycleStatus: 'cancelled' }), false);
  assert.equal(isFinanciallyActive({ documentType: 'sales-return', returnStatus: 'received' }), false);
  assert.deepEqual(stripWorkflowFields({ number: '1', cancelledAt: 'x', returnStatus: 'completed', lifecycleEvents: [], items: [{ qty: 2, restockQty: 2 }] }), { number: '1', items: [{ qty: 2 }] });
  assert.equal(matches({ lifecycleStatus: 'draft' }, ACTIVE_FINANCIAL_FILTER), false);
  assert.equal(matches({ returnStatus: 'requested' }, ACTIVE_FINANCIAL_FILTER), false);
  assert.equal(matches({}, ACTIVE_FINANCIAL_FILTER), true);
  assert.throws(() => approvedRestockItems({ returnStatus: 'received', items: [{ _id: 'a', qty: 1 }] }, [{ lineId: 'a', restockQty: 1 }, { lineId: 'a', restockQty: 1 }]), /every return line/);
});

test('a draft stays a draft when ordinary update requests try to post or dispatch it', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft' });
  const updated = await call(updateInvoice, { id: draft._id, body: saleBody({ lifecycleStatus: 'posted', fulfillmentStatus: 'dispatched', advanceReceived: 500 }) });
  assert.equal(updated.error, undefined, updated.error?.stack);
  assert.equal(updated.result.lifecycleStatus, 'draft');
  assert.equal(updated.result.fulfillmentStatus, 'not-dispatched');
  assert.equal(updated.result.advanceReceived, 0);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().postings.length, 0);
});

test('failed posting preserves the draft and rolls back stock, movements, and ledgers', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft' });
  db.options.failAccounting = true;
  const posted = await action(draft._id, 'post');
  assert.match(posted.error.message, /Injected accounting failure/);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().outgoing.length, 0);
  assert.equal(db.state().invoices[0].lifecycleStatus, 'draft');
  assert.deepEqual(db.state().ledgers, {});
});

test('failed cancellation preserves stock deduction, invoice, and accounting', async () => {
  const db = setup();
  const invoice = await create();
  mock.method(AccountingPosting, 'deleteOne', async () => { throw new Error('Reversal failed'); });
  const result = await action(invoice._id, 'cancel', { reason: 'Customer cancelled' });
  assert.match(result.error.message, /Reversal failed/);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().incoming.length, 0);
  assert.equal(db.state().invoices[0].lifecycleStatus, 'posted');
  assert.equal(db.state().postings.length, 1);
  assert.equal(db.state().ledgers.Customer.debit, 500);
});

test('financial credits respect reserved return amounts and completed credits reduce the amount due', async () => {
  const db = setup();
  const invoice = await dispatchedSale();
  const note = await requestReturn(invoice);
  const creditBody = (amount) => saleBody({ number: 'CRN-001', items: [{ description: 'Price correction', qty: 1, rate: amount }], totals: { finalTotal: amount }, extra: { originalInvoiceNo: invoice.number, reason: 'Price corrected' } });
  assert.equal((await call(createCreditNote, { body: creditBody(250) })).error.statusCode, 409);
  assert.equal((await call(createCreditNote, { body: creditBody(200) })).error, undefined);
  assert.equal(await creditedAmount(invoice), 200);
  await call(transitionSalesReturn, { id: note._id, body: { action: 'receive' } });
  const approved = await call(transitionSalesReturn, { id: note._id, body: { action: 'approve', reason: 'All sellable', items: [{ lineId: note.items[0]._id, restockQty: 3 }] } });
  assert.equal(approved.error, undefined);
  assert.equal(await creditedAmount(invoice), 500);
  assert.equal(db.state().stock, 8);
});

test('foreign invoices and incomplete drafts cannot be posted or credited', async () => {
  const db = setup();
  const draft = await create({ lifecycleStatus: 'draft', customer: {}, items: [] });
  assert.equal((await action(draft._id, 'post')).error.statusCode, 400);
  assert.equal((await call(transitionInvoice, { id: draft._id, body: { action: 'post' }, userId: '507f1f77bcf86cd799439099' })).error.statusCode, 404);
  assert.equal((await call(createCreditNote, { body: saleBody({ number: 'CRN-001', extra: { originalInvoiceNo: draft.number, reason: 'Correction' } }) })).error.statusCode, 409);
  assert.equal(db.state().stock, 10);
});

test('converted online invoice cancellation uses its original order movement exactly once', async () => {
  const db = setup();
  const invoice = await create();
  const orderId = '507f1f77bcf86cd799439088';
  db.state().invoices[0].extra = { stockHandledByOnlineOrder: true, onlineOrderId: orderId };
  db.state().outgoing[0].sourceType = 'online-order';
  db.state().outgoing[0].sourceId = orderId;
  const orderWrite = mock.method(OnlineOrder, 'updateOne', async (filter, update) => {
    assert.equal(String(filter._id), orderId);
    assert.equal(String(filter.invoiceId), invoice._id);
    assert.equal(update.$set.status, 'Cancelled');
    return { matchedCount: 1 };
  });
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Cancel before shipping' })).error, undefined);
  assert.equal(db.state().stock, 10);
  assert.equal(db.state().incoming.length, 1);
  assert.equal(orderWrite.mock.callCount(), 1);
  assert.equal((await action(invoice._id, 'cancel', { reason: 'Repeat' })).error.statusCode, 409);
  assert.equal(db.state().stock, 10);
});

test('missing original stock movements prevent cancellation from inventing stock', async () => {
  const db = setup();
  const invoice = await create();
  db.state().outgoing = [];
  const result = await action(invoice._id, 'cancel', { reason: 'Cancel before shipping' });
  assert.equal(result.error.statusCode, 409);
  assert.equal(db.state().stock, 5);
  assert.equal(db.state().invoices[0].lifecycleStatus, 'posted');
});

for (const category of CATEGORIES) {
  test(`${category} B2C bills post, edit and delete stock through the shared lifecycle`, async () => {
    const db = setup();
    const extra = { billingMode: 'b2c', invoicePrintFormat: 'thermal80' };
    const customer = { name: 'Customer', phone: '9876543210' };
    const saved = await call(createInvoice, { category, body: saleBody({ extra, customer }) });
    assert.equal(saved.error, undefined, saved.error?.stack);
    assert.equal(db.state().stock, 5);
    assert.equal(saved.result.extra.billingMode, 'b2c');
    const updated = await call(updateInvoice, { category, id: saved.result._id, body: saleBody({ extra, customer, items: [{ ...saved.result.items[0], qty: 3 }], totals: { finalTotal: 300 } }) });
    assert.equal(updated.error, undefined, updated.error?.stack);
    assert.equal(db.state().stock, 7);
    assert.equal(db.state().outgoing.length, 1);
    assert.equal((await call(deleteInvoice, { category, id: saved.result._id })).error, undefined);
    assert.equal(db.state().stock, 10);
    assert.equal(db.state().outgoing.length, 0);
  });
}

test('billing mobile validation rejects missing numbers before creating or editing stock records', async () => {
  for (const billingMode of ['b2b', 'b2c']) {
    const db = setup();
    const extra = { billingMode };
    const rejected = await call(createInvoice, { body: saleBody({ extra }) });
    assert.equal(rejected.error.statusCode, 400);
    assert.match(rejected.error.message, /mobile number is required/);
    assert.equal(db.state().invoices.length, 0);
    assert.equal(db.state().stock, 10);
    const saved = await call(createInvoice, { body: saleBody({ extra, customer: { name: 'Customer', phone: '9876543210' } }) });
    assert.equal(saved.error, undefined);
    const edited = await call(updateInvoice, { id: saved.result._id, body: { customer: { name: 'Customer', phone: '' } } });
    assert.equal(edited.error.statusCode, 400);
    assert.equal(db.state().stock, 5);
    assert.equal(db.state().invoices[0].customer.phone, '9876543210');
    mock.restoreAll();
  }
});
