import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AppUser } from '../src/models/AppUser.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { LedgerGroup } from '../src/models/LedgerGroup.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { VoucherSequence } from '../src/models/VoucherSequence.js';
import { createAccountingVoucher, cancelAccountingVoucher } from '../src/services/accountingVouchers.js';
import { buildLedgerStatement } from '../src/services/ledgerManagement.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/unused-test-db';
process.env.JWT_SECRET ||= 'trial-balance-test';
const { getTrialBalance, getLedgerStatement, listLedgerAccounts } = await import('../src/modules/retail/accounting/accountingController.js');

test('trial balance derives scoped period balances from real posted journals', { skip: !process.env.TRIAL_BALANCE_TEST_MONGODB_URI }, async (context) => {
  const dbName = `gobook_trial_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.TRIAL_BALANCE_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const user = { id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString(), accountType: 'owner' };
  const other = { ...user, id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString() };
  async function report(query = {}, actor = user) {
    let result, error;
    await getTrialBalance({ user: actor, query, body: {} }, { json(value) { result = value; } }, (failure) => { error = failure; });
    if (error) throw error;
    return result;
  }
  const post = (date, debitName, creditName, amount, extra = {}) => createAccountingVoucher({ voucherType: 'Journal', numberingMode: 'auto', date, branch: 'A', ...extra, lines: [{ ledgerName: debitName, side: 'debit', amount, costCenter: 'HQ' }, { ledgerName: creditName, side: 'credit', amount, costCenter: 'HQ' }] }, user);
  try {
    await Promise.all([AppUser.init(), LedgerAccount.init(), LedgerGroup.init(), BusinessSettings.init(), AccountingVoucher.init(), JournalEntry.init(), VoucherSequence.init()]);
    await AppUser.create({ _id: user.id, businessId: user.businessId, accountType: 'owner', name: 'Trial Test Owner', email: 'trial-owner@example.test' });
    await AppUser.create({ _id: other.id, businessId: other.businessId, accountType: 'owner', name: 'Other Owner', email: 'other-trial@example.test' });
    await BusinessSettings.create({ userId: user.id, fyStart: '01 April' });
    await LedgerAccount.insertMany([{ name: 'Bank', group: 'Bank Accounts', opening: 100, branch: 'A' }, { name: 'Capital', group: 'Capital Account', opening: -100, branch: 'A' }, { name: 'Expense', group: 'Indirect Expenses', branch: 'A' }, { name: 'Receivable', group: 'Sundry Debtors', opening: -50 }, { name: 'Payable', group: 'Sundry Creditors', opening: 50 }, { name: 'Zero', group: 'Current Assets' }].map((ledger) => ({ ...ledger, userId: user.id, businessId: user.businessId })));
    await LedgerAccount.create({ userId: other.id, businessId: other.businessId, name: 'Bank', group: 'Bank Accounts', opening: 99999 });
    await post('2026-03-31', 'Bank', 'Capital', 20);
    await post('2026-04-02', 'Expense', 'Bank', 150);
    await post('2026-04-03', 'Bank', 'Expense', 60);
    await post('2026-04-04', 'Bank', 'Capital', 900, { status: 'Draft' });
    const cancelled = await post('2026-04-05', 'Bank', 'Capital', 300);
    await cancelAccountingVoucher(cancelled._id, { reason: 'Test exclusion' }, user);
    await post('2027-04-01', 'Bank', 'Capital', 999);
    await LedgerAccount.updateOne({ name: 'Bank', userId: user.id }, { $set: { debit: 999999 } });
    await JournalEntry.create({ userId: user.id, businessId: user.businessId, date: '2026-04-02', entryNo: 'LEGACY-SUMMARY', particulars: 'Never double-count this summary', debit: 999999, credit: 999999, status: 'Posted' });
    await context.test('opening, movements and both Dr/Cr transitions agree with the existing Ledger Book engine', async () => {
      for (const to of ['2026-04-02', '2026-04-03']) {
        const result = await report({ from: '2026-04-01', to, financialYear: '2026-27' });
        const vouchers = await AccountingVoucher.find({ userId: user.id }).lean();
        for (const account of await LedgerAccount.find({ userId: user.id }).lean()) {
          const statement = buildLedgerStatement(account, vouchers, { from: '2026-04-01', to });
          const row = result.rows.find((item) => String(item._id) === String(account._id));
          assert.equal(row.opening, statement.totals.opening);
          assert.equal(row.periodDebit, statement.totals.debitTotal);
          assert.equal(row.periodCredit, statement.totals.creditTotal);
          assert.equal(row.closing, statement.totals.closing);
        }
        assert.equal(result.totals.balanced, true); assert.equal(result.totals.difference, 0);
        assert.equal(result.rows.find((row) => row.name === 'Bank').closing, to === '2026-04-02' ? -30 : 30);
        assert.ok(!result.rows.some((row) => String(row.userId) === other.id));
      }
    });
    await context.test('branch and cost centre openings include only attributable balances and retain available filters', async () => {
      const branch = await report({ financialYear: '2026-27', to: '2026-04-03', branch: 'A' });
      assert.equal(branch.rows.find((row) => row.name === 'Receivable').opening, 0);
      assert.equal(branch.totals.balanced, true);
      const allocated = await report({ financialYear: '2026-27', to: '2026-04-03', costCenter: 'HQ' });
      assert.equal(allocated.rows.find((row) => row.name === 'Bank').opening, 20);
      assert.equal(allocated.rows.find((row) => row.name === 'Bank').closing, -70);
      assert.equal(allocated.totals.balanced, true);
      assert.deepEqual(allocated.options.costCenters, ['HQ']);
    });
    await context.test('previous periods carry earlier years and invalid financial windows fail explicitly', async () => {
      const comparison = await report({ from: '2026-04-02', to: '2026-04-03', financialYear: '2026-27', comparison: 'previous' });
      assert.deepEqual(comparison.period.previous, { from: '2026-03-31', to: '2026-04-01' });
      assert.equal(comparison.rows.find((row) => row.name === 'Bank').previous.closing, 120);
      await assert.rejects(report({ financialYear: '2026-27', to: '2027-04-02' }), /outside/);
      await assert.rejects(report({ from: '2026-02-30', to: '2026-04-03' }), /valid voucher date/);
      await assert.rejects(report({ from: '2026-04-03', to: '2026-04-01' }), /on or before/);
      await assert.rejects(report({ comparison: 'previous' }), /Select From Date/);
    });
    await context.test('same-name company staff ledgers stay separate, and unbalanced historical journals remain visible', async () => {
      const staff = await AppUser.create({ businessId: user.businessId, accountType: 'member', name: 'Trial Staff', email: 'trial-staff@example.test', branch: 'B' });
      const staffLedger = await LedgerAccount.create({ userId: staff._id, businessId: user.businessId, branch: 'B', name: 'Bank', group: 'Bank Accounts', opening: 10 });
      await post('2026-04-03', 'Bank', 'Expense', 5, { branch: 'B' });
      const all = await report({ financialYear: '2026-27', to: '2026-04-03' });
      assert.equal(all.rows.filter((row) => row.name === 'Bank').length, 2);
      assert.equal(all.rows.find((row) => String(row._id) === String(staffLedger._id)).closingDebit, 10);
      const staffOnly = await report({ financialYear: '2026-27', to: '2026-04-03' }, { id: String(staff._id), businessId: user.businessId, branch: 'B', accountType: 'member' });
      assert.equal(staffOnly.rows.length, 1);
      assert.equal(staffOnly.rows[0].closing, 10);
      assert.equal(all.totals.balanced, false);
      assert.equal(all.totals.difference, 10);
      const branchReport = await report({ financialYear: '2026-27', to: '2026-04-03', branch: 'B' });
      const ownerBank = branchReport.rows.find((row) => row.name === 'Bank' && String(row.userId) === user.id);
      assert.equal(ownerBank.closing, 5);
      const query = { branch: 'B', ledgerId: String(ownerBank._id), financialYear: '2026-27', to: '2026-04-03' };
      let statement, list, failure;
      await getLedgerStatement({ user, query, body: {} }, { json(value) { statement = value; } }, (error) => { failure = error; });
      assert.equal(failure, undefined); assert.equal(statement.totals.closing, 5);
      await listLedgerAccounts({ user, query: { ...query, balances: 'posted' }, body: {} }, { json(value) { list = value; } }, (error) => { failure = error; });
      assert.equal(failure, undefined); assert.equal(list.accounts.find((account) => String(account._id) === String(ownerBank._id)).currentBalance, 5);
      await AccountingVoucher.create({ userId: user.id, businessId: user.businessId, voucherNo: 'HISTORICAL-UNBALANCED', voucherType: 'Journal', financialYear: '2026-27', date: '2026-04-03', status: 'Posted', lines: [{ ledgerName: 'Bank', side: 'debit', amount: 7 }] });
      const unbalanced = await report({ financialYear: '2026-27', to: '2026-04-03' });
      assert.equal(unbalanced.totals.difference, 17);
      assert.equal(unbalanced.totals.balanced, false);
    });
    await context.test('company members inherit the company fiscal calendar instead of an unrelated personal default', async () => {
      await BusinessSettings.updateOne({ userId: user.id }, { $set: { fyStart: '15 July' } });
      const staff = await AppUser.findOne({ email: 'trial-staff@example.test' }).lean();
      const result = await report({ initialize: 'true' }, { id: String(staff._id), businessId: user.businessId, branch: 'B', accountType: 'member' });
      assert.equal(result.fyStart, '15 July');
      assert.equal(result.period.from.slice(5), '07-15');
      await assert.rejects(report({ financialYear: '2026-27', from: '2026-04-01', to: '2026-08-01' }), /outside/);
    });
  } finally {
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_trial_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
