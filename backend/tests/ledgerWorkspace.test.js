import assert from 'node:assert/strict';
import test, { afterEach, beforeEach, mock } from 'node:test';
import mongoose from 'mongoose';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { AppUser } from '../src/models/AppUser.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET ||= 'ledger-workspace-test';
const { updateLedgerAccount, deleteLedgerAccount, getLedgerStatement } = await import('../src/modules/retail/accounting/accountingController.js');
afterEach(() => mock.restoreAll());
beforeEach(() => { mock.method(mongoose.connection, 'transaction', async (work) => work()); });
const owner = '507f1f77bcf86cd799439001';
const id = '507f1f77bcf86cd799439002';
const query = (data) => ({ select() { return this; }, sort() { return this; }, lean: async () => data });
async function invoke(handler, overrides = {}) {
  let body, error;
  await handler({ user: { id: owner }, query: {}, body: {}, params: {}, ...overrides }, { json(value) { body = value; } }, (value) => { error = value; });
  return { body, error };
}

test('deactivation persists within owner scope without modifying or deleting history', async () => {
  mock.method(AppUser, 'findById', () => query(null));
  mock.method(LedgerAccount, 'findOne', () => query({ _id: id, userId: owner, name: 'Bank', group: 'Bank Accounts', active: true }));
  mock.method(AccountingVoucher, 'exists', async () => null);
  mock.method(LedgerAccount, 'findOneAndUpdate', (filter, update, options) => {
    assert.equal(filter.userId, owner);
    assert.equal(filter._id, id);
    assert.deepEqual(update.$set, { active: false, revision: 2 });
    assert.equal(update.$push.auditHistory.action, 'Deactivated');
    assert.equal(options.runValidators, true);
    return query({ _id: id, name: 'Bank', group: 'Bank Accounts', active: false });
  });
  mock.method(AccountingVoucher, 'deleteMany', () => { throw Error('Must preserve history'); });
  const result = await invoke(updateLedgerAccount, { params: { id }, body: { active: false } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.account.active, false);
  const account = new LedgerAccount({ userId: owner, name: 'Bank', group: 'Bank Accounts', active: false });
  assert.equal(account.validateSync(), undefined);
  assert.equal(account.toObject().active, false);
});

test('inactive accounts retain readable statements and per-line bill references', async () => {
  mock.method(AppUser, 'findById', () => query(null));
  mock.method(LedgerAccount, 'findOne', () => query({ name: 'Bank', group: 'Bank Accounts', opening: 500, active: false }));
  mock.method(AccountingVoucher, 'find', (filter) => {
    assert.equal(filter.userId, owner);
    return query([{ _id: id, voucherNo: 'PAY-001', voucherType: 'Payment', date: '2026-11-06', status: 'Posted', lines: [{ ledgerName: 'Bank', side: 'credit', amount: 100, billRef: 'BILL-123' }, { ledgerName: 'Rent', side: 'debit', amount: 100 }] }]);
  });
  const result = await invoke(getLedgerStatement, { query: { ledgerName: 'Bank', status: 'Posted' } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.entries[0].billRef, 'BILL-123');
  assert.equal(result.body.totals.closing, 400);
});

test('referenced ledgers cannot be renamed or deleted and keep their historical identity', async () => {
  mock.method(AppUser, 'findById', () => query(null));
  mock.method(LedgerAccount, 'findOne', () => query({ _id: id, userId: owner, name: 'Supplier', group: 'Sundry Creditors', opening: 0, debit: 0, credit: 0 }));
  mock.method(AccountingVoucher, 'exists', async filter => { assert.equal(filter.userId, owner); assert.equal(filter['lines.ledgerName'], 'Supplier'); return { _id: id }; });
  mock.method(LedgerAccount, 'findOneAndUpdate', () => { throw new Error('Must not rename historical ledger'); });
  mock.method(LedgerAccount, 'findOneAndDelete', () => { throw new Error('Must not delete historical ledger'); });
  const rename = await invoke(updateLedgerAccount, { params: { id }, body: { name: 'Changed supplier' } });
  assert.equal(rename.error.statusCode, 409);
  const remove = await invoke(deleteLedgerAccount, { params: { id } });
  assert.equal(remove.error.statusCode, 409);
});
