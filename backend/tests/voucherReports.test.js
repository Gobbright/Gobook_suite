import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { AppUser } from '../src/models/AppUser.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { LedgerGroup } from '../src/models/LedgerGroup.js';
import { accountingStore } from './support/accountingStore.js';
import { createAccountingVoucher } from '../src/services/accountingVouchers.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/unused-test-db';
process.env.JWT_SECRET ||= 'voucher-reports-test';
const { getDayBook, getTrialBalance, getBillWiseStatement, resetAccountingFromInvoices } = await import('../src/modules/retail/accounting/accountingController.js');
const { listVouchers } = await import('../src/modules/retail/accounting/voucherController.js');
afterEach(() => mock.restoreAll());

const user = { id: '507f1f77bcf86cd799439001', businessId: '507f1f77bcf86cd799439002' };
const accounts = [{ name: 'Customer', group: 'Sundry Debtors' }, { name: 'Sales', group: 'Direct Incomes' }, { name: 'Bank', group: 'Bank Accounts' }].map((account) => ({ ...account, userId: user.id, businessId: user.businessId }));
const payload = { voucherType: 'Journal', date: '2026-11-10', numberingMode: 'auto', lines: [{ ledgerName: 'Customer', side: 'debit', amount: 100 }, { ledgerName: 'Sales', side: 'credit', amount: 100 }] };
function scopeMocks() {
  mock.method(AppUser, 'findById', () => ({ select() { return this; }, lean: async () => null }));
  mock.method(AppUser, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
}
async function call(handler, query = {}) {
  let result, error;
  await handler({ user, query, body: {} }, { json: (body) => { result = body; } }, (failure) => { error = failure; });
  if (error) throw error;
  return result;
}

test('financial reports ignore draft/status overrides and isolate the selected financial year', async () => {
  accountingStore(accounts); scopeMocks();
  mock.method(LedgerGroup, 'find', () => ({ select() { return this; }, lean: async () => [] }));
  mock.method(AccountingVoucher, 'aggregate', (pipeline) => {
    assert.equal(pipeline[0].$match.status, 'Posted');
    const rows = pipeline.at(-1).$group._id?.owner ? [{ _id: { owner: user.id, name: 'Customer' }, group: 'Sundry Debtors', OpeningMovement: 0, debit: 100, credit: 0 }, { _id: { owner: user.id, name: 'Sales' }, group: 'Direct Incomes', OpeningMovement: 0, debit: 0, credit: 100 }] : [];
    return { allowDiskUse: async () => rows, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  });
  await createAccountingVoucher(payload, user);
  await createAccountingVoucher({ ...payload, status: 'Draft', lines: payload.lines.map((line) => ({ ...line, amount: 900 })) }, user);
  const dayBook = await call(getDayBook, { status: 'All', financialYear: '2026-27' });
  assert.equal(dayBook.totals.count, 1);
  const trialBalance = await call(getTrialBalance, { status: 'Draft', financialYear: '2026-27' });
  assert.equal(trialBalance.accounts.find((account) => account.account === 'Customer').debit, 100);
  assert.equal((await call(getDayBook, { financialYear: '2025-26' })).totals.count, 0);
  await assert.rejects(call(resetAccountingFromInvoices), /cannot delete posted vouchers/);
});

test('bill-wise report distributes a payment across each allocated bill', async () => {
  accountingStore(accounts); scopeMocks();
  await createAccountingVoucher({ ...payload, lines: [{ ...payload.lines[0], allocations: [{ type: 'New Reference', reference: 'BILL-1', amount: 100 }] }, payload.lines[1]] }, user);
  await createAccountingVoucher({ ...payload, lines: [{ ...payload.lines[0], amount: 200, allocations: [{ type: 'New Reference', reference: 'BILL-2', amount: 200 }] }, { ...payload.lines[1], amount: 200 }] }, user);
  await createAccountingVoucher({ ...payload, voucherType: 'Receipt', lines: [{ ledgerName: 'Bank', side: 'debit', amount: 150 }, { ledgerName: 'Customer', side: 'credit', amount: 150, allocations: [{ type: 'Against Reference', reference: 'BILL-1', amount: 50 }, { type: 'Against Reference', reference: 'BILL-2', amount: 100 }] }] }, user);
  const report = await call(getBillWiseStatement, { financialYear: '2026-27' });
  assert.deepEqual(report.rows.map((row) => [row.billRef, row.outstanding]), [['BILL-1', 50], ['BILL-2', 100]]);
  assert.equal(report.totalOutstanding, 150);
});

test('listing bounds pagination, escapes search and preserves company/year/account filters and sorting', async () => {
  accountingStore(accounts); scopeMocks();
  let filter, sort, limit, skip;
  mock.method(AccountingVoucher, 'find', (value) => {
    filter = value;
    const query = { sort(value) { sort = value; return this; }, limit(value) { limit = value; return this; }, skip(value) { skip = value; return this; }, lean: async () => [] };
    return query;
  });
  mock.method(AccountingVoucher, 'countDocuments', async () => 0);
  const response = await call(listVouchers, { financialYear: '2026-27', account: 'Customer', search: '[', page: '-2', limit: '9999', sort: 'debitTotal', direction: 'asc' });
  assert.equal(filter.businessId, user.businessId);
  assert.equal(filter.financialYear, '2026-27');
  assert.equal(filter['lines.ledgerName'], 'Customer');
  assert.equal(filter.$or[0].voucherNo.test('VCH-['), true);
  assert.equal(sort.debitTotal, 1);
  assert.equal(limit, 500); assert.equal(skip, 0);
  assert.equal(response.page, 1);
});
