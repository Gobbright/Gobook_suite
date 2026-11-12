import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { createAccountingVoucher, updateAccountingVoucher, deleteAccountingVoucher, cancelAccountingVoucher, reverseAccountingVoucher, getNextVoucherNo, getVoucherBillReferences } from '../src/services/accountingVouchers.js';
import { billBalances, normalizeVoucherLines, voucherFinancialYear } from '../src/services/voucherRules.js';
import { accountingStore } from './support/accountingStore.js';

afterEach(() => mock.restoreAll());
const user = { id: '507f1f77bcf86cd799439001', businessId: '507f1f77bcf86cd799439002', accountType: 'owner' };
const accounts = [
  { userId: user.id, name: 'Rent', group: 'Indirect Expenses' },
  { userId: user.id, name: 'Bank', group: 'Bank Accounts' },
  { userId: user.id, name: 'Cash', group: 'Cash-In-Hand' },
  { userId: user.id, name: 'Customer', group: 'Sundry Debtors' },
  { userId: user.id, name: 'Supplier', group: 'Sundry Creditors' },
  { userId: user.id, name: 'Sales', group: 'Direct Incomes' },
];
const body = { voucherNo: 'PAY-001', numberingMode: 'manual', voucherType: 'Payment', date: '2026-11-06', status: 'Posted', entryMode: 'manual', lines: [{ ledgerName: 'Rent', side: 'debit', amount: 250 }, { ledgerName: 'Bank', side: 'credit', amount: 250 }] };
const balance = (data, name) => { const account = data.accounts.find((row) => row.name === name); return account.debit - account.credit; };
const line = (ledgerName, side, amount, type, reference) => ({ ledgerName, side, amount, allocations: type ? [{ type, reference, amount }] : [] });

for (const voucherType of ['Contra', 'Payment', 'Receipt', 'Journal', 'Sales', 'Purchase', 'Credit Note', 'Debit Note']) {
  test(`${voucherType}: drafts do not post, balanced posting occurs once and audit history is retained`, async () => {
    const { data } = accountingStore(accounts);
    const saved = await createAccountingVoucher({ ...body, voucherType, status: 'Draft' }, user);
    assert.equal(balance(data, 'Rent'), 0);
    assert.equal(saved.postedAt, undefined);
    const posted = await updateAccountingVoucher(saved._id, { status: 'Posted', revision: 1 }, user);
    assert.equal(balance(data, 'Rent'), 250);
    assert.equal(posted.debitTotal, posted.creditTotal);
    assert.deepEqual(posted.auditHistory.map((entry) => entry.action), ['Draft created', 'Posted']);
    await assert.rejects(updateAccountingVoucher(saved._id, { status: 'Posted' }, user), voucherType === 'Journal' ? /immutable/ : /reason/);
    assert.equal(balance(data, 'Rent'), 250);
    await assert.rejects(deleteAccountingVoucher(saved._id, user), /Only manual drafts/);
  });
}

test('posting and alteration failures roll back the voucher and all ledger changes atomically', async () => {
  const { data, options } = accountingStore(accounts);
  options.failVoucher = true;
  await assert.rejects(createAccountingVoucher(body, user), /persistence failure/);
  assert.equal(balance(data, 'Rent'), 0);
  assert.equal(data.vouchers.length, 0);
  options.failVoucher = false;
  const voucher = await createAccountingVoucher(body, user);
  mock.method(AccountingVoucher, 'findOne', () => Promise.resolve({ ...voucher.toObject(), save: async () => { throw new Error('Save failed'); } }));
  await assert.rejects(updateAccountingVoucher(voucher._id, { alterationReason: 'Correct rent', lines: body.lines.map((entry) => ({ ...entry, amount: 300 })) }, user), /Save failed/);
  assert.equal(balance(data, 'Rent'), 250);
});

test('alterations require permission, reason and a current revision; cancelled vouchers cannot reopen', async () => {
  const { data } = accountingStore(accounts);
  const voucher = await createAccountingVoucher(body, user);
  await assert.rejects(updateAccountingVoucher(voucher._id, { alterationReason: 'Unauthorized' }, { ...user, accountType: 'member' }), /authorized accountant/);
  await assert.rejects(updateAccountingVoucher(voucher._id, { alterationReason: 'Correct', revision: 0 }, user), /changed/);
  await assert.rejects(updateAccountingVoucher(voucher._id, { alterationReason: 'Reset', status: 'Draft' }, user), /cannot be changed/);
  const edited = await updateAccountingVoucher(voucher._id, { alterationReason: 'Correct amount', revision: 1, lines: body.lines.map((entry) => ({ ...entry, amount: 300 })) }, user);
  assert.equal(balance(data, 'Rent'), 300);
  assert.equal(edited.auditHistory[1].before.debitTotal, 250);
  assert.equal(edited.auditHistory[1].after.debitTotal, 300);
  const cancelled = await cancelAccountingVoucher(voucher._id, { reason: 'Entered twice' }, user);
  assert.equal(balance(data, 'Rent'), 0);
  assert.equal(cancelled.auditHistory.at(-1).action, 'Cancelled');
  await assert.rejects(updateAccountingVoucher(voucher._id, { alterationReason: 'Reopen' }, user), /cancelled/);
});

test('reversal creates an opposite balanced journal and retains the original posted voucher', async () => {
  const { data } = accountingStore(accounts);
  const original = await createAccountingVoucher(body, user);
  const reversal = await reverseAccountingVoucher(original._id, { reason: 'Correct by reversal', date: '2026-11-07' }, user);
  assert.equal(reversal.voucherType, 'Journal');
  assert.equal(reversal.reversalOf, original._id);
  assert.equal(data.vouchers[0].status, 'Posted');
  assert.equal(data.vouchers[0].reversedBy, reversal._id);
  assert.equal(balance(data, 'Rent'), 0);
  await assert.rejects(reverseAccountingVoucher(original._id, { reason: 'Again' }, user), /unreversed/);
  await assert.rejects(cancelAccountingVoucher(reversal._id, { reason: 'Remove reversal' }, user), /reversal voucher cannot be cancelled/);
});

test('strict validation rejects malformed lines, nonfinite/negative amounts, unknown and inactive ledgers', async () => {
  const { data } = accountingStore(accounts);
  for (const amount of [-1, 0, Infinity, NaN, 'bad']) {
    await assert.rejects(createAccountingVoucher({ ...body, lines: [{ ...body.lines[0], amount }, body.lines[1]] }, user), /positive finite/);
  }
  await assert.rejects(createAccountingVoucher({ ...body, lines: [...body.lines, { ledgerName: '', side: 'debit', amount: 10 }] }, user), /Every voucher line/);
  await assert.rejects(createAccountingVoucher({ ...body, lines: [body.lines[0]] }, user), /two/);
  await assert.rejects(createAccountingVoucher({ ...body, lines: [{ ...body.lines[0], ledgerName: 'Missing' }, body.lines[1]] }, user), /active ledger/);
  data.accounts[0].active = false;
  await assert.rejects(createAccountingVoucher(body, user), /active ledger/);
  assert.equal(data.vouchers.length, 0);
});

test('financial years follow company settings and invalid dates or mismatched years are rejected', async () => {
  accountingStore(accounts);
  assert.equal(voucherFinancialYear('2026-03-31'), '2025-26');
  assert.equal(voucherFinancialYear('2026-04-01'), '2026-27');
  assert.equal(voucherFinancialYear('2026-07-14', '15 July'), '2025-26');
  assert.throws(() => voucherFinancialYear('2026-02-30'), /valid voucher date/);
  await assert.rejects(createAccountingVoucher({ ...body, financialYear: '2025-26' }, user), /outside/);
  await assert.rejects(createAccountingVoucher({ ...body, sourceType: 'invoice', sourceId: user.id }, user), /accounting engine/);
});

test('auto numbering is reserved on save; duplicate manual numbers roll back without a second posting', async () => {
  const { data } = accountingStore(accounts);
  const first = await createAccountingVoucher({ ...body, numberingMode: 'auto' }, user);
  const second = await createAccountingVoucher({ ...body, numberingMode: 'auto' }, user);
  assert.notEqual(first.voucherNo, second.voucherNo);
  assert.equal(await getNextVoucherNo(user.id, 'Payment', body.date), 'PAY-26-27-00003');
  await assert.rejects(createAccountingVoucher({ ...body, voucherNo: first.voucherNo }, user), /Duplicate voucher/);
  assert.equal(balance(data, 'Rent'), 500);
  assert.equal(data.vouchers.length, 2);
});

test('retrying an acknowledged or interrupted save request cannot post twice', async () => {
  const { data } = accountingStore(accounts);
  const request = { ...body, requestKey: 'voucher-request-0001', numberingMode: 'auto' };
  const first = await createAccountingVoucher(request, user);
  const retry = await createAccountingVoucher(request, user);
  assert.equal(first._id, retry._id);
  assert.equal(data.vouchers.length, 1);
  assert.equal(balance(data, 'Rent'), 250);
  await assert.rejects(createAccountingVoucher({ ...request, status: 'Draft' }, user), /already used/);
});

test('multiple partial bill allocations settle references and prevent overpayment, wrong sides and duplicate new references', async () => {
  const { data } = accountingStore(accounts);
  const sale = async (reference, amount) => createAccountingVoucher({ ...body, voucherType: 'Sales', numberingMode: 'auto', entryMode: 'bill', lines: [line('Customer', 'debit', amount, 'New Reference', reference), line('Sales', 'credit', amount)] }, user);
  await sale('BILL-1', 100); await sale('BILL-2', 200);
  const receipt = { ...body, voucherType: 'Receipt', numberingMode: 'auto', entryMode: 'bill', lines: [line('Bank', 'debit', 150), { ...line('Customer', 'credit', 150), allocations: [{ type: 'Against Reference', reference: 'BILL-1', amount: 50 }, { type: 'Against Reference', reference: 'BILL-2', amount: 100 }] }] };
  const saved = await createAccountingVoucher(receipt, user);
  assert.deepEqual((await getVoucherBillReferences(user, 'Customer', '2026-27')).map((bill) => bill.outstanding), [50, 100]);
  await assert.rejects(createAccountingVoucher({ ...receipt, lines: [line('Bank', 'debit', 51), line('Customer', 'credit', 51, 'Against Reference', 'BILL-1')] }, user), /insufficient outstanding/);
  await assert.rejects(sale('BILL-1', 100), /already exists/);
  await assert.rejects(createAccountingVoucher({ ...receipt, lines: [line('Bank', 'credit', 10), line('Customer', 'debit', 10, 'Against Reference', 'BILL-1')] }, user), /wrong debit/);
  await assert.rejects(cancelAccountingVoucher(data.vouchers[0]._id, { reason: 'Remove settled invoice' }, user), /settled bill/);
  await reverseAccountingVoucher(saved._id, { reason: 'Reopen payment' }, user);
  assert.deepEqual((await getVoucherBillReferences(user, 'Customer', '2026-27')).map((bill) => bill.outstanding), [100, 200]);
  await cancelAccountingVoucher(data.vouchers[0]._id, { reason: 'Settlement reversed first' }, user);
  assert.equal(data.vouchers[0].status, 'Cancelled');
});

test('advance and on-account allocations post, and allocation sums must match line amounts', async () => {
  accountingStore(accounts);
  const saved = await createAccountingVoucher({ ...body, voucherType: 'Receipt', entryMode: 'bill', lines: [line('Bank', 'debit', 250), { ...line('Customer', 'credit', 250), allocations: [{ type: 'Advance', reference: 'ADV-1', amount: 100 }, { type: 'On Account', amount: 150 }] }] }, user);
  assert.equal(saved.lines[1].allocations[1].reference, '');
  assert.equal((await getVoucherBillReferences(user, 'Customer', '2026-27'))[0].balance, -100);
  assert.throws(() => normalizeVoucherLines([line('Bank', 'debit', 100), { ...line('Customer', 'credit', 100), allocations: [{ type: 'On Account', amount: 10 }] }]), /must equal/);
  assert.deepEqual(billBalances([{ status: 'Draft', lines: saved.lines }], 'Customer'), []);
});

test('company and owner scopes prevent access to another company voucher or its bill references', async () => {
  accountingStore(accounts);
  const voucher = await createAccountingVoucher(body, user);
  await assert.rejects(updateAccountingVoucher(voucher._id, {}, { ...user, businessId: 'another-company' }), /not found/);
  await assert.rejects(deleteAccountingVoucher(voucher._id, { ...user, id: 'another-user' }), /not found/);
  assert.deepEqual(await getVoucherBillReferences({ ...user, id: 'another-user' }, 'Customer', '2026-27'), []);
});
