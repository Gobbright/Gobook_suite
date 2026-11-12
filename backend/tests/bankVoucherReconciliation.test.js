import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { voucherBankEntries, parseVoucherBankEntryId } from '../src/services/bankVoucherReconciliation.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { BankBookEntry } from '../src/models/BankBookEntry.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { AppUser } from '../src/models/AppUser.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET ||= 'bank-voucher-test';
const { getBankReconciliation, updateBankReconciliation } = await import('../src/modules/retail/accounting/accountingController.js');
afterEach(() => mock.restoreAll());

const owner = '507f1f77bcf86cd799439001';
const id = '507f1f77bcf86cd799439002';
const bank = 'SBI / Current: 1%';
const line = (ledgerName, ledgerGroup, side, amount) => ({ ledgerName, ledgerGroup, side, amount });
const voucher = { _id: id, userId: owner, status: 'Posted', voucherNo: 'REC-001', voucherType: 'Receipt', date: '2026-10-26', updatedAt: new Date('2026-10-26T00:00:00Z'), lines: [line(bank, 'Bank Accounts', 'debit', 250), line('Customer', 'Sundry Debtors', 'credit', 250)] };
const query = (value) => ({ select() { return this; }, sort() { return this; }, async lean() { return value; } });
async function invoke(handler, req) {
  let body; let error;
  await handler({ user: { id: owner }, query: {}, params: {}, body: {}, ...req }, { json(value) { body = value; } }, (value) => { error = value; });
  return { body, error };
}
function scopeMock() { mock.method(AppUser, 'findById', () => query(null)); }

test('bank reconciliation derives posted receipts without creating duplicate book or ledger records', () => {
  const rows = voucherBankEntries([voucher, { ...voucher, _id: 'draft', status: 'Draft' }, { ...voucher, _id: 'cancel', status: 'Cancelled' }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deposit, 250);
  assert.equal(rows[0].withdrawal, 0);
  assert.equal(rows[0].reconciled, false);
  assert.deepEqual(parseVoucherBankEntryId(rows[0]._id), { voucherId: id, bank });
  assert.equal(parseVoucherBankEntryId('voucher:invalid'), null);
  assert.equal(parseVoucherBankEntryId(`voucher:${id}:%ZZ`), null);
  assert.equal(voucher.bankReconciliations, undefined);
});

test('legacy source matches avoid duplicate transactions and transfers reconcile each bank independently', () => {
  const source = { ...voucher, sourceType: 'payment', sourceId: id };
  assert.equal(voucherBankEntries([source], [{ bank, vchNo: 'old-number', vchType: 'Receipt', sourceType: 'payment', sourceId: id }]).length, 0);
  const transfer = { ...voucher, voucherType: 'Contra', lines: [line(bank, 'Bank Accounts', 'credit', 300), line('HDFC', 'Bank Accounts', 'debit', 300)], bankReconciliations: [{ bank, reconciled: true, bankDate: '2026-10-26' }] };
  const rows = voucherBankEntries([transfer]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.bank === bank).reconciled, true);
  assert.equal(rows.find((row) => row.bank === bank).withdrawal, 300);
  assert.equal(rows.find((row) => row.bank === 'HDFC').reconciled, false);
  assert.equal(rows.find((row) => row.bank === 'HDFC').deposit, 300);
});

test('reconciliation API includes manual vouchers and retains owner scope on reads', async () => {
  scopeMock();
  mock.method(BankBookEntry, 'distinct', async () => []);
  mock.method(BankBookEntry, 'find', () => query([]));
  mock.method(AccountingVoucher, 'find', (filter) => { assert.equal(filter.userId, owner); assert.equal(filter.status, 'Posted'); return query([voucher]); });
  const { body, error } = await invoke(getBankReconciliation, { query: { bank, from: '2026-10-01', to: '2026-10-31', status: 'Uncleared' } });
  assert.equal(error, undefined);
  assert.deepEqual(body.banks, [bank]);
  assert.equal(body.entries.length, 1);
  assert.equal(body.summary.bookBalance, 250);
});

test('saving a voucher reconciliation writes only clearing metadata and detects concurrent changes', async () => {
  scopeMock();
  mock.method(AccountingVoucher, 'findOne', (filter) => { assert.equal(filter.userId, owner); assert.equal(filter._id, id); return query(voucher); });
  mock.method(BankBookEntry, 'create', () => { throw new Error('Must not duplicate bank book entries'); });
  mock.method(LedgerAccount, 'updateOne', () => { throw new Error('Must not change ledger balances'); });
  let fail = false;
  mock.method(AccountingVoucher, 'findOneAndUpdate', (filter, update) => {
    assert.equal(filter.userId, owner);
    assert.equal(filter.updatedAt, voucher.updatedAt);
    assert.deepEqual(Object.keys(update.$set), ['bankReconciliations']);
    assert.deepEqual(update.$inc, { __v: 1 });
    assert.equal(update.$set.bankReconciliations[0].bank, bank);
    return query(fail ? null : { ...voucher, ...update.$set });
  });
  const request = { params: { id: voucherBankEntries([voucher])[0]._id }, body: { reconciled: true, bankDate: '2026-10-26', bankReference: 'UTR-250', deposit: 99999 } };
  const saved = await invoke(updateBankReconciliation, request);
  assert.equal(saved.error, undefined);
  assert.equal(saved.body.entry.bankReference, 'UTR-250');
  assert.equal(saved.body.entry.deposit, 250);
  fail = true;
  assert.equal((await invoke(updateBankReconciliation, request)).error.statusCode, 409);
});

test('foreign or missing vouchers and invalid cleared dates cannot be reconciled', async () => {
  scopeMock();
  mock.method(AccountingVoucher, 'findOne', (filter) => { assert.equal(filter.userId, owner); return query(null); });
  const request = { params: { id: voucherBankEntries([voucher])[0]._id }, body: { reconciled: true, bankDate: '2026-10-26' } };
  assert.equal((await invoke(updateBankReconciliation, request)).error.statusCode, 404);
  assert.equal((await invoke(updateBankReconciliation, { ...request, body: { reconciled: true, bankDate: '2026-02-30' } })).error.statusCode, 400);
});
