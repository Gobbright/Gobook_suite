import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AppUser } from '../src/models/AppUser.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { LedgerGroup } from '../src/models/LedgerGroup.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Customer } from '../src/models/Customer.js';
import { Vendor } from '../src/models/Vendor.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { VoucherSequence } from '../src/models/VoucherSequence.js';
import { createAccountingVoucher, cancelAccountingVoucher } from '../src/services/accountingVouchers.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/unused-test-db';
process.env.JWT_SECRET ||= 'ledger-integration-test';
const { createLedgerAccount, updateLedgerAccount, getLedgerStatement, listLedgerAccounts, importLedgerAccounts } = await import('../src/modules/retail/accounting/accountingController.js');
const { createLedgerGroup, getManagedLedger } = await import('../src/modules/retail/accounting/ledgerManagementController.js');

test('ledger management against a real MongoDB replica set', { skip: !process.env.LEDGER_TEST_MONGODB_URI }, async (context) => {
  const dbName = `gobook_ledger_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.LEDGER_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const user = { id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString(), accountType: 'owner', isSuperAdmin: true };
  const other = { ...user, id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString() };
  async function call(handler, body = {}, params = {}, query = {}, actor = user) {
    let result, error;
    const response = { status() { return this; }, json(value) { result = value; return this; } };
    await handler({ user: actor, body, params, query }, response, (failure) => { error = failure; });
    if (error) throw error;
    return result;
  }
  const posting = (date, debitName, creditName, amount, status = 'Posted') => createAccountingVoucher({ date, voucherType: 'Journal', numberingMode: 'auto', status, lines: [{ ledgerName: debitName, side: 'debit', amount }, { ledgerName: creditName, side: 'credit', amount }] }, user);
  try {
    await Promise.all([AppUser.init(), LedgerAccount.init(), LedgerGroup.init(), AccountingVoucher.init(), BusinessSettings.init(), Customer.init(), Vendor.init(), AuditLog.init(), VoucherSequence.init()]);
    await AppUser.create({ _id: user.id, businessId: user.businessId, accountType: 'owner', name: 'Ledger Test Owner', email: 'ledger-owner@example.test' });
    await AppUser.create({ _id: other.id, businessId: other.businessId, accountType: 'owner', name: 'Other Owner', email: 'other-owner@example.test' });
    await BusinessSettings.create({ userId: user.id, fyStart: '01 April' });
    await Customer.create({ userId: user.id, name: 'Customer', gstin: '33AAAAA0000A1Z5', phone: '9876543210', creditLimit: 500 });
    const customer = (await call(createLedgerAccount, { name: 'Customer', group: 'Customer', code: 'CUS-1', opening: -100 })).account;
    await call(createLedgerAccount, { name: 'Bank', group: 'Bank Accounts' });
    await call(createLedgerAccount, { name: 'Sales', group: 'Direct Incomes' });
    await posting('2026-03-31', 'Customer', 'Sales', 150);
    await posting('2026-04-02', 'Bank', 'Customer', 100);
    await posting('2026-04-03', 'Customer', 'Bank', 80);
    await posting('2026-04-04', 'Customer', 'Sales', 900, 'Draft');
    const cancelled = await posting('2026-04-05', 'Customer', 'Sales', 500);
    await cancelAccountingVoucher(cancelled._id, { reason: 'Excluded test cancellation' }, user);

    await context.test('period reports carry the prior opening and exclude drafts, cancellations and foreign ledgers', async () => {
      const foreign = (await call(createLedgerAccount, { name: 'Customer', group: 'Customer', opening: 700 }, {}, {}, other)).account;
      const staffId = new mongoose.Types.ObjectId();
      await AppUser.create({ _id: staffId, businessId: user.businessId, name: 'Staff', email: 'ledger-staff@example.test' });
      await LedgerAccount.create({ userId: staffId, businessId: user.businessId, name: 'Customer', group: 'Sundry Debtors', opening: 9000 });
      const report = await call(getLedgerStatement, {}, {}, { ledgerId: String(customer._id), financialYear: '2026-27' });
      assert.deepEqual(report.totals, { opening: 50, debitTotal: 80, creditTotal: 100, closing: 30 });
      assert.deepEqual(report.entries.map((entry) => entry.balance), [-50, 30]);
      assert.ok(report.entries.every((entry) => entry.financialYear === '2026-27' && entry.status === 'Posted'));
      await assert.rejects(call(getLedgerStatement, {}, {}, { ledgerId: String(foreign._id) }), /not found/);
      await assert.rejects(call(getManagedLedger, {}, { id: String(customer._id) }, {}, other), /not found/);
      await LedgerAccount.updateOne({ _id: customer._id }, { $set: { debit: 99999 } });
      const listed = await call(listLedgerAccounts, {}, {}, { balances: 'posted', financialYear: '2026-27' });
      const projected = listed.accounts.find((account) => String(account._id) === String(customer._id));
      assert.equal(projected.currentBalance, 30);
      assert.equal(projected.debit, 80);
      assert.equal(projected.periodOpening, 50);
      assert.ok(!listed.accounts.some((account) => String(account._id) === String(foreign._id)));
    });

    await context.test('contact and credit edits are audited without changing posted entries or their opening', async () => {
      const before = JSON.stringify(await AccountingVoucher.find({ userId: user.id }).sort({ _id: 1 }).lean());
      const detail = await call(getManagedLedger, {}, { id: String(customer._id) }, { financialYear: '2026-27' });
      assert.equal(detail.account.gstin, '33AAAAA0000A1Z5');
      assert.equal(detail.account.phone, '9876543210');
      const updated = await call(updateLedgerAccount, { phone: '9123456780', creditLimit: 10, creditDays: 15, revision: customer.revision, changeReason: 'Reviewed credit policy' }, { id: String(customer._id) });
      assert.equal(updated.account.auditHistory.at(-1).reason, 'Reviewed credit policy');
      assert.equal((await Customer.findOne({ userId: user.id, name: 'Customer' })).creditLimit, 10);
      const after = await call(getManagedLedger, {}, { id: String(customer._id) }, { financialYear: '2026-27' });
      assert.equal(after.credit.exposure, 30); assert.equal(after.credit.exceeded, true);
      assert.equal(after.account.creditDays, 15);
      await assert.rejects(call(updateLedgerAccount, { opening: 0, changeReason: 'Overwrite' }, { id: String(customer._id) }), /cannot be overwritten/);
      await assert.rejects(call(updateLedgerAccount, { name: 'Renamed' }, { id: String(customer._id) }), /cannot be renamed/);
      await assert.rejects(call(updateLedgerAccount, { debit: 1 }, { id: String(customer._id) }), /posted vouchers/);
      assert.equal(JSON.stringify(await AccountingVoucher.find({ userId: user.id }).sort({ _id: 1 }).lean()), before);
      await call(updateLedgerAccount, { active: false }, { id: String(customer._id) });
      assert.equal((await call(getLedgerStatement, {}, {}, { ledgerId: String(customer._id), financialYear: '2026-27' })).totals.closing, 30);
      await call(updateLedgerAccount, { active: true }, { id: String(customer._id) });
    });

    await context.test('new groups inherit their accounting classification and retain voucher/report integration', async () => {
      const group = (await call(createLedgerGroup, { name: 'Local Customers', parent: 'Sundry Debtors' })).group;
      assert.equal(group.accountingGroup, 'Sundry Debtors');
      const ledger = (await call(createLedgerAccount, { name: 'Local Customer', group: group.name, opening: 0, code: 'CUS-2', creditLimit: 200, creditDays: 15 })).account;
      assert.equal(ledger.accountingGroup, 'Sundry Debtors');
      const staff = await AppUser.findOne({ email: 'ledger-staff@example.test' });
      const staffActor = { id: String(staff._id), businessId: user.businessId, accountType: 'member', permissions: { modules: ['accounting'], actions: { create: true, edit: true, view: true } } };
      const staffLedger = (await call(createLedgerAccount, { name: 'Staff Customer', group: group.name }, {}, {}, staffActor)).account;
      assert.equal(staffLedger.accountingGroup, 'Sundry Debtors');
      await assert.rejects(call(createLedgerGroup, { name: group.name, parent: 'Sundry Debtors' }, {}, {}, staffActor), /already exists/);
      const bill = await createAccountingVoucher({ date: '2026-04-01', voucherType: 'Sales', numberingMode: 'auto', lines: [{ ledgerName: ledger.name, side: 'debit', amount: 100, allocations: [{ type: 'New Reference', reference: 'BILL-1', amount: 100 }] }, { ledgerName: 'Sales', side: 'credit', amount: 100 }] }, user);
      assert.equal(bill.lines[0].ledgerGroup, 'Sundry Debtors');
      await createAccountingVoucher({ date: '2026-04-02', voucherType: 'Receipt', numberingMode: 'auto', lines: [{ ledgerName: 'Bank', side: 'debit', amount: 40 }, { ledgerName: ledger.name, side: 'credit', amount: 40, allocations: [{ type: 'Against Reference', reference: 'BILL-1', amount: 40 }] }] }, user);
      const detail = await call(getManagedLedger, {}, { id: String(ledger._id) }, { from: '2026-04-01', to: '2026-05-01' });
      assert.equal(detail.outstanding[0].outstanding, 60);
      assert.equal(detail.outstanding[0].dueDate, '2026-04-16');
      assert.equal(detail.outstanding[0].overdue, true);
      await assert.rejects(call(createLedgerGroup, { name: 'Invalid', parent: 'Missing group' }), /existing parent/);
    });

    await context.test('unposted opening corrections require reasons and duplicate codes roll back all edits', async () => {
      const ledger = (await call(createLedgerAccount, { name: 'Setup Ledger', group: 'Bank Accounts', code: 'SETUP' })).account;
      await assert.rejects(call(updateLedgerAccount, { opening: -25 }, { id: String(ledger._id) }), /reason is required/);
      const changed = (await call(updateLedgerAccount, { opening: -25, changeReason: 'Initial setup correction' }, { id: String(ledger._id) })).account;
      assert.equal(changed.openingHistory.at(-1).after, -25);
      const auditCount = changed.auditHistory.length;
      await assert.rejects(call(updateLedgerAccount, { code: 'cus-1', phone: '9123456780' }, { id: String(ledger._id) }), /already exists/);
      const retained = await LedgerAccount.findById(ledger._id);
      assert.equal(retained.code, 'SETUP'); assert.equal(retained.phone, ''); assert.equal(retained.auditHistory.length, auditCount);
      await call(updateLedgerAccount, { code: '' }, { id: String(ledger._id) });
      assert.equal((await LedgerAccount.findById(ledger._id)).codeKey, undefined);
    });

    await context.test('ledger imports use the same audit and posted-history protection as editing', async () => {
      let result, error;
      await importLedgerAccounts({ user, query: {}, params: {}, body: {}, file: { originalname: 'ledgers.csv', buffer: Buffer.from('Account Name,Group,Opening,Debit,Credit\nCustomer,Sundry Debtors,9999,,\nImported Bank,Bank Accounts,-10,,\nCounter Injection,Bank Accounts,0,20,0') } }, { json: (body) => { result = body; } }, (failure) => { error = failure; });
      assert.equal(error, undefined);
      assert.equal(result.imported, 1); assert.equal(result.skipped, 2);
      assert.equal((await LedgerAccount.findById(customer._id)).opening, -100);
      assert.equal(await LedgerAccount.countDocuments({ name: 'Counter Injection' }), 0);
      const imported = await LedgerAccount.findOne({ name: 'Imported Bank' });
      assert.equal(imported.opening, -10);
      assert.equal(imported.auditHistory[0].action, 'Created');
    });
  } finally {
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_ledger_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
