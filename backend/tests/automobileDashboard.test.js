import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { automobileDocumentTotal, buildAutomobileDashboard } from '../src/services/automobileDashboard.js';
import { getAutomobileDashboard } from '../src/modules/dashboard/automobileController.js';
import { AppUser } from '../src/models/AppUser.js';
import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { Payment } from '../src/models/Payment.js';
import { Customer } from '../src/models/Customer.js';
import { Vendor } from '../src/models/Vendor.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { AccountingPosting } from '../src/models/AccountingPosting.js';

const now = new Date('2026-10-17T08:00:00Z');
const invoice = (overrides = {}) => ({ _id: 'sale', number: 'INV-1', documentType: 'invoice', lifecycleStatus: 'posted', meta: { date: '2026-10-17' }, customer: { name: 'Auto Care' }, totals: { finalTotal: 1000 }, items: [{ productId: 'tyre', description: 'Tyre', qty: 2, rate: 500 }], ...overrides });

test('Automobile summary reconciles payments, purchase liabilities, categories and stock', () => {
  const result = buildAutomobileDashboard({ now, period: '2026-10', customers: 4, suppliers: 2,
    invoices: [invoice(), invoice({ _id: 'draft', lifecycleStatus: 'draft' }), invoice({ _id: 'cancelled', lifecycleStatus: 'cancelled' }), invoice({ _id: 'purchase', documentType: 'purchase-entry', totals: { finalTotal: 500 }, advanceReceived: 100 })],
    products: [{ _id: 'tyre', description: 'Tyre', status: 'Active', stock: 2, minStockLevel: 3, purchasePrice: 200, category: 'Tyres' }, { _id: 'service', status: 'Active', itemType: 'Service', stock: 0 }],
    payments: [{ invoiceId: 'sale', amount: 400, date: '2026-10-17' }],
    accounts: [{ group: 'Bank Accounts', opening: 100, debit: 500, credit: 50 }],
    postings: [{ date: '2026-10-17', lines: [{ group: 'Direct Incomes', side: 'credit', amount: 900 }, { group: 'Indirect Expenses', side: 'debit', amount: 100 }] }],
  });
  assert.equal(result.metrics.monthlySales.value, 1000);
  assert.equal(result.metrics.receivables.value, 600);
  assert.equal(result.metrics.payables.value, 400);
  assert.equal(result.metrics.profit.value, 800);
  assert.equal(result.metrics.cashBalance.value, 550);
  assert.equal(result.metrics.inventoryValue.value, 400);
  assert.deepEqual(result.inventory, { total: 1, inStock: 0, lowStock: 1, outOfStock: 0 });
  assert.equal(result.categorySales.reduce((sum, row) => sum + row.value, 0), 1000);
  assert.equal(result.topProducts[0].quantity, 2);
  assert.equal(result.recentSales.length, 1);
  assert.equal(result.monthly.at(-1).received, 400);
  assert.equal(result.monthly.at(-1).pending, 600);
});

test('dashboard dates use Indian business days and selected periods rather than insertion time', () => {
  const result = buildAutomobileDashboard({ now, period: '2026-10', invoices: [
    invoice({ meta: { date: '2026-09-30' }, createdAt: now }),
    invoice({ _id: 'utc-edge', meta: {}, createdAt: new Date('2026-09-30T19:00:00Z'), totals: { finalTotal: 200 } }),
  ] });
  assert.equal(result.metrics.monthlySales.value, 200);
  assert.equal(result.daily[0].sales, 200);
  assert.equal(result.monthly.at(-2).sales, 1000);
  assert.equal(result.recentSales[0].date, '2026-10-01');
});

test('zero totals and fully paid invoices do not produce phantom sales or receivables', () => {
  assert.equal(automobileDocumentTotal(invoice({ totals: { finalTotal: 0 } })), 0);
  const result = buildAutomobileDashboard({ now, period: '2026-10', invoices: [invoice()], payments: [{ invoiceId: 'sale', amount: 1000, date: '2026-10-17' }] });
  assert.equal(result.metrics.receivables.value, 0);
  assert.deepEqual(result.pendingCustomers, []);
  assert.equal(result.recentSales[0].status, 'Paid');
});

test('empty dashboards expose zero data and no invented growth percentages', () => {
  const result = buildAutomobileDashboard({ now, period: '2026-10' });
  assert.equal(result.metrics.monthlySales.value, 0);
  assert.equal(result.metrics.monthlySales.change, null);
  assert.deepEqual(result.categorySales, []);
  assert.deepEqual(result.topProducts, []);
});

test('Shared dashboard rejects unrelated categories and invalid months before database access', async () => {
  for (const [req, status] of [[{ user: { category: 'hospital' }, query: {} }, 404], [{ user: { category: 'automobile' }, query: { period: '2026-99' } }, 400], [{ user: { category: 'retail' }, query: { period: '2026-99' } }, 400]]) {
    let failure;
    await getAutomobileDashboard(req, { json() { assert.fail('Should not return dashboard data'); } }, (error) => { failure = error; });
    assert.equal(failure.statusCode, status);
  }
});

for (const category of ['automobile', 'retail']) test(`${category} data reads use server-resolved tenant and branch scope`, async () => {
  const actor = { role: 'Staff', accountType: 'staff', branch: 'MAIN' };
  const captured = [];
  mock.method(AppUser, 'findById', () => ({ select: () => ({ lean: async () => actor }) }));
  for (const model of [Invoice, Product, Payment, LedgerAccount, AccountingPosting]) {
    mock.method(model, 'find', (filter) => {
      captured.push(filter);
      return { select: () => ({ lean: async () => [] }) };
    });
  }
  for (const model of [Customer, Vendor]) mock.method(model, 'countDocuments', async (filter) => { captured.push(filter); return 0; });
  try {
    let response, failure;
    await getAutomobileDashboard({ user: { id: 'actual-owner', category }, query: { period: '2026-10', branch: 'OTHER', userId: 'another-tenant' } }, { json: (body) => { response = body; } }, (error) => { failure = error; });
    assert.equal(failure, undefined);
    assert.equal(response.metrics.monthlySales.value, 0);
    assert.equal(captured.length, 7);
    for (const filter of captured) {
      assert.equal(filter.userId, 'actual-owner');
      assert.equal(JSON.stringify(filter).includes('OTHER'), false);
      assert.equal(JSON.stringify(filter).includes('another-tenant'), false);
    }
    assert(captured[0].$and.some((clause) => clause.$or.some((entry) => entry.branch === 'MAIN')));
    assert.equal(captured[0].documentType.$in.includes('bill-of-supply'), category === 'retail');
  } finally { mock.restoreAll(); }
});

test('retail dashboard includes bills of supply in sales, collections and product charts', () => {
  const invoices = [invoice(), invoice({ _id: 'exempt', documentType: 'bill-of-supply', totals: { finalTotal: 500 }, advanceReceived: 100 })];
  const result = buildAutomobileDashboard({ invoices, now, period: '2026-10', includeBillOfSupply: true });
  assert.equal(result.metrics.monthlySales.value, 1500);
  assert.equal(result.metrics.receivables.value, 1400);
  assert.equal(result.recentSales.length, 2);
  assert.equal(result.categorySales.reduce((sum, row) => sum + row.value, 0), 1500);
  assert.equal(buildAutomobileDashboard({ invoices, now, period: '2026-10' }).metrics.monthlySales.value, 1000);
});
