import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { accountingStore } from './support/accountingStore.js';
import { AccountingPosting } from '../src/models/AccountingPosting.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { CashBookEntry } from '../src/models/CashBookEntry.js';
import { BankBookEntry } from '../src/models/BankBookEntry.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { AppUser } from '../src/models/AppUser.js';
import { Invoice } from '../src/models/Invoice.js';
import { Payment } from '../src/models/Payment.js';
import { calcDocumentAmounts, postInvoiceAccounting, postPurchaseEntryAccounting, postSalesReturnAccounting, postSupplierReturnAccounting, postPaymentAccounting, reverseAccountingPosting } from '../src/services/accountingPostings.js';
import { calculateTrialBalance } from '../../frontend/src/features/categories/automobile/automobileTrialBalance.js';
import { calculatePnl } from '../../frontend/src/features/categories/automobile/automobilePnl.js';
import { calculateBalanceSheet } from '../../frontend/src/features/categories/automobile/automobileBalanceSheet.js';
import { calculateCashReport } from '../../frontend/src/features/categories/common/modules/accounting/cashBookReport.js';
import { bankReportSources, calculateBankReport } from '../../frontend/src/features/categories/common/modules/accounting/bankBookReport.js';

afterEach(() => mock.restoreAll());
const user = { id: '507f1f77bcf86cd799439001', businessId: '507f1f77bcf86cd799439002', branch: 'Main' };
const filters = { from: '2026-04-01', to: '2026-11-06', branch: 'Main', account: '' };
const doc = (id, type = 'invoice', total = 1180, party = 'Customer') => ({ _id: id, userId: user.id, documentType: type, number: `${type}-${id}`, branch: 'Main', customer: { name: party }, meta: { date: '2026-11-01' }, totals: { finalTotal: total }, items: [{ qty: 1, rate: total / 1.18, gstRate: 18 }] });
function store() { return accountingStore(); }
function payment(id, invoice, amount, method = 'Cash') { return { _id: id, invoiceNumber: invoice.number, customerName: invoice.customer.name, amount, method, date: '2026-11-02', branch: 'Main', reference: `UTR-${id}` }; }
function closing(data, name) { const row = calculateTrialBalance(data.accounts, data.vouchers, filters).rows.find((item) => item.name === name); return row?.closing || 0; }

test('sales and purchase documents, returns and settlements reconcile across ledgers and reports', async () => {
  const { data } = store();
  const sale = doc('sale'), purchase = doc('purchase', 'purchase-entry', 590, 'Supplier');
  await postInvoiceAccounting(sale, user); await postPurchaseEntryAccounting(purchase, user);
  await postSalesReturnAccounting(doc('sales-return', 'sales-return', 118), user);
  await postSupplierReturnAccounting(doc('supplier-return', 'supplier-return', 59, 'Supplier'), user);
  await postPaymentAccounting(payment('receipt', sale, 500), sale, user);
  await postPaymentAccounting(payment('supplier-payment', purchase, 200), purchase, user);
  assert.equal(closing(data, 'Customer'), 562); assert.equal(closing(data, 'Supplier'), -331);
  assert.equal(closing(data, 'Output GST'), -162); assert.equal(closing(data, 'Input GST'), 81);
  const tb = calculateTrialBalance(data.accounts, data.vouchers, filters);
  assert.equal(tb.difference, 0); assert.deepEqual(tb.issues, []);
  const pnl = calculatePnl(data.accounts, data.vouchers, filters);
  assert.equal(pnl.totals.revenue, 900); assert.equal(pnl.totals.directCosts, 450); assert.equal(pnl.totals.netProfit, 450);
  assert.equal(calculateBalanceSheet(data.accounts, data.vouchers, filters.to, 'Main').totals.difference, 0);
  const cash = calculateCashReport(data.accounts, data.vouchers, data.cash, filters);
  assert.deepEqual([cash.receipts, cash.payments, cash.closing, cash.rows.length], [500, 200, 300, 2]);
  for (const row of data.vouchers) assert.equal(row.debitTotal, row.creditTotal);
});

test('bank settlements use one bank identity, preserve UTR references and never double-count legacy mirrors', async () => {
  const { data } = store(); const sale = doc('sale'), purchase = doc('purchase', 'purchase-entry', 590, 'Supplier');
  await postInvoiceAccounting(sale, user); await postPurchaseEntryAccounting(purchase, user);
  await postPaymentAccounting(payment('bank-in', sale, 700, 'UPI'), sale, user);
  await postPaymentAccounting(payment('bank-out', purchase, 300, 'Bank Transfer'), purchase, user);
  const sources = bankReportSources(data.accounts, data.vouchers, data.bank);
  assert.deepEqual(sources.banks, ['HDFC']);
  const report = calculateBankReport(data.accounts, sources.events, { ...filters, account: 'HDFC' });
  assert.deepEqual([report.receipts, report.payments, report.closing, report.rows.length], [700, 300, 400, 2]);
  assert.equal(report.rows[0].referenceNo, 'UTR-bank-in'); assert.equal(report.rows[1].referenceNo, 'UTR-bank-out');
  assert.equal(closing(data, 'HDFC'), report.closing);
});

test('reposting edited sources replaces amounts once, and deleting settlements reverses their balances', async () => {
  const { data } = store(); const purchase = doc('purchase', 'purchase-entry', 590, 'Supplier');
  await postPurchaseEntryAccounting(purchase, user);
  await postPurchaseEntryAccounting({ ...purchase, totals: { finalTotal: 708 }, items: [{ qty: 1, rate: 600, gstRate: 18 }] }, user);
  assert.equal(data.postings.length, 1); assert.equal(data.vouchers.length, 1); assert.equal(closing(data, 'Supplier'), -708);
  const paid = payment('payment', purchase, 200);
  await postPaymentAccounting(paid, purchase, user); await postPaymentAccounting(paid, purchase, user);
  assert.equal(closing(data, 'Supplier'), -508); assert.equal(data.cash.length, 1);
  await reverseAccountingPosting({ userId: user.id, sourceType: 'payment', sourceId: paid._id });
  assert.equal(closing(data, 'Supplier'), -708); assert.equal(closing(data, 'Cash'), 0); assert.equal(data.cash.length, 0);
  await reverseAccountingPosting({ userId: user.id, sourceType: 'purchase-entry', sourceId: purchase._id });
  assert.equal(data.vouchers.filter((voucher) => voucher.status === 'Posted').length, 0); assert.equal(data.postings.length, 0); assert.equal(closing(data, 'Purchases'), 0);
  assert.equal(data.vouchers.length, 2); assert.ok(data.vouchers.every((voucher) => voucher.auditHistory.at(-1).action === 'Cancelled'));
});

test('draft/cancelled sources and nonfinancial payment targets cannot create postings', async () => {
  const { data } = store();
  for (const status of ['draft', 'cancelled']) {
    const purchase = { ...doc(status, 'purchase-entry'), lifecycleStatus: status };
    assert.equal(await postPurchaseEntryAccounting(purchase, user), null);
    assert.equal(await postPaymentAccounting(payment(status, purchase, 100), purchase, user), null);
  }
  const quotation = doc('quote', 'quotation');
  await assert.rejects(postPaymentAccounting(payment('bad', quotation, 100), quotation, user), /sales invoice or purchase entry/);
  assert.equal(data.postings.length, 0); assert.equal(data.vouchers.length, 0);
});

test('a posting persistence failure cleans up vouchers, books and ledger increments', async () => {
  const { data, options } = store(); options.failPosting = true;
  const sale = doc('sale');
  await assert.rejects(postPaymentAccounting(payment('failed', sale, 100), sale, user), /persistence failure/);
  assert.equal(data.vouchers.length, 0); assert.equal(data.cash.length, 0); assert.equal(data.journals.length, 0);
  assert.ok(data.accounts.every((row) => row.debit === 0 && row.credit === 0));
});

test('TDS and TCS use separate asset/liability ledgers instead of changing sales or purchase value', async () => {
  const { data } = store();
  const sale = { ...doc('tax-sale'), totals: { finalTotal: 1170, tdsAmt: 20, tcsAmt: 10 } };
  const purchase = { ...doc('tax-purchase', 'purchase-entry', 1180, 'Supplier'), totals: { finalTotal: 1170, tdsAmt: 20, tcsAmt: 10 } };
  await postInvoiceAccounting(sale, user); await postPurchaseEntryAccounting(purchase, user);
  assert.equal(closing(data, 'Sales'), -1000); assert.equal(closing(data, 'Purchases'), 1000);
  assert.equal(closing(data, 'TDS Receivable'), 20); assert.equal(closing(data, 'TDS Payable'), -20);
  assert.equal(closing(data, 'TCS Receivable'), 10); assert.equal(closing(data, 'TCS Payable'), -10);
  assert.equal(calculateTrialBalance(data.accounts, data.vouchers, filters).difference, 0);
  await postSalesReturnAccounting({ ...sale, _id: 'tax-sr', documentType: 'sales-return' }, user);
  await postSupplierReturnAccounting({ ...purchase, _id: 'tax-pr', documentType: 'supplier-return' }, user);
  for (const name of ['Sales', 'Sales Returns', 'Purchases', 'Purchase Returns', 'TDS Receivable', 'TDS Payable', 'TCS Receivable', 'TCS Payable']) {
    if (name.startsWith('T')) assert.equal(closing(data, name), 0);
  }
  assert.equal(calculatePnl(data.accounts, data.vouchers, filters).totals.netProfit, 0);
});

test('amount calculation preserves a saved zero and proportionally applies discounts and withholding when totals are absent', () => {
  assert.equal(calcDocumentAmounts({ items: [{ qty: 1, rate: 100 }], totals: { finalTotal: 0 } }).total, 0);
  const result = calcDocumentAmounts({ items: [{ qty: 1, rate: 100, gstRate: 18 }], additionalDiscount: { type: 'amount', value: 10 }, tds: { enabled: true, rate: 2 }, tcs: { enabled: true, rate: 1 } });
  assert.deepEqual(result, { taxable: 91.53, gst: 16.47, total: 107.08, tds: 2, tcs: 1.08 });
});

test('accounting rebuild includes purchases, both returns and sales/supplier settlements', async () => {
  process.env.CLIENT_URL ||= 'http://localhost:5173';
  process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
  process.env.JWT_SECRET ||= 'accounting-integration-test';
  const { resetAccountingFromInvoices } = await import('../src/modules/retail/accounting/accountingController.js');
  const { data } = store();
  const query = (value) => ({ select() { return this; }, sort() { return this; }, lean: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  mock.method(AppUser, 'findById', () => query(null));
  const sale = doc('sale'), purchase = doc('purchase', 'purchase-entry', 590, 'Supplier');
  const documents = [sale, purchase, doc('sr', 'sales-return', 118), doc('pr', 'supplier-return', 59, 'Supplier')];
  mock.method(Invoice, 'find', filter => { assert.ok(filter.documentType.$in.includes('purchase-entry')); assert.ok(filter.documentType.$in.includes('supplier-return')); return query(documents); });
  mock.method(Payment, 'find', () => query([{ ...payment('sale-payment', sale, 500), invoiceId: sale._id }, { ...payment('purchase-payment', purchase, 200), invoiceId: purchase._id }]));
  mock.method(LedgerAccount, 'deleteMany', async () => { data.accounts = []; return { deletedCount: 0 }; });
  let response, error;
  await resetAccountingFromInvoices({ user: { id: user.id }, query: {}, body: {} }, { json: body => { response = body; } }, failure => { error = failure; });
  assert.equal(error, undefined, error?.stack);
  assert.deepEqual(response.errors, []);
  assert.deepEqual(response.rebuilt, { invoices: 4, payments: 2 });
  assert.equal(data.vouchers.length, 6);
  assert.equal(closing(data, 'Supplier'), -331);
});
