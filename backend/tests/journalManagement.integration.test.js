import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { VoucherSequence } from '../src/models/VoucherSequence.js';
import { RecurringJournal } from '../src/models/RecurringJournal.js';
import { AppUser } from '../src/models/AppUser.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { createAccountingVoucher, updateAccountingVoucher, reverseAccountingVoucher } from '../src/services/accountingVouchers.js';
import { createRecurringJournal, generateRecurringJournal } from '../src/services/recurringJournals.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/unused-test-db';
process.env.JWT_SECRET ||= 'journal-integration-test';
const { createJournalEntry, updateJournalEntry, deleteJournalEntry, importJournalEntries } = await import('../src/modules/retail/accounting/accountingController.js');

test('journal management uses atomic, isolated real database postings and recurring drafts', { skip: !process.env.JOURNAL_TEST_MONGODB_URI }, async (context) => {
  const dbName = `gobook_journal_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.JOURNAL_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const user = { id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString(), accountType: 'owner' };
  const body = { voucherType: 'Journal', date: '2026-01-31', numberingMode: 'auto', narration: 'Monthly adjustment', lines: [{ ledgerName: 'Expense', side: 'debit', amount: 100, costCenter: 'Head Office' }, { ledgerName: 'Accrual', side: 'credit', amount: 100 }] };
  async function call(handler, payload = {}, params = {}, file) {
    let result, error;
    const response = { status() { return this; }, json(value) { result = value; return this; } };
    await handler({ user, body: payload, params, query: {}, file }, response, (failure) => { error = failure; });
    if (error) throw error;
    return result;
  }
  try {
    await Promise.all([AccountingVoucher.init(), LedgerAccount.init(), BusinessSettings.init(), VoucherSequence.init(), RecurringJournal.init(), AppUser.init(), JournalEntry.init()]);
    await AppUser.create({ _id: user.id, businessId: user.businessId, accountType: 'owner', name: 'Journal Test Owner', email: 'journal-owner@example.test' });
    await BusinessSettings.create({ userId: user.id });
    await LedgerAccount.insertMany([{ name: 'Expense', group: 'Indirect Expenses' }, { name: 'Accrual', group: 'Current Liabilities' }].map((ledger) => ({ ...ledger, userId: user.id, businessId: user.businessId })));
    const draft = await createAccountingVoucher({ ...body, status: 'Draft' }, user);
    await context.test('drafts have no ledger effect and posted journals can only be corrected by reversal', async () => {
      assert.equal((await LedgerAccount.findOne({ name: 'Expense' })).debit, 0);
      const posted = await updateAccountingVoucher(draft._id, { status: 'Posted', revision: 1 }, user);
      const before = await AccountingVoucher.findById(posted._id).lean();
      await assert.rejects(updateAccountingVoucher(posted._id, { alterationReason: 'Even with owner authorization', revision: 2, narration: 'Overwrite history' }, user), /immutable/);
      assert.deepEqual(await AccountingVoucher.findById(posted._id).lean(), before);
      const reversal = await reverseAccountingVoucher(posted._id, { date: '2026-02-01', reason: 'Correction' }, user);
      assert.equal(String(reversal.reversalOf), String(posted._id));
      assert.equal((await LedgerAccount.findOne({ name: 'Expense' })).debit - (await LedgerAccount.findOne({ name: 'Expense' })).credit, 0);
    });
    const schedule = await createRecurringJournal({ name: 'Monthly accrual', sourceVoucher: draft._id, frequency: 'Monthly', nextDate: '2026-02-28', endDate: '2026-04-30' }, user);
    await context.test('concurrent generation and retries create exactly one draft occurrence without ledger effects', async () => {
      const before = await LedgerAccount.find({}).sort({ name: 1 }).lean();
      const generated = await Promise.all([generateRecurringJournal(schedule._id, '2026-02-28', user), generateRecurringJournal(schedule._id, '2026-02-28', user)]);
      assert.equal(String(generated[0]._id), String(generated[1]._id));
      assert.equal(generated[0].status, 'Draft');
      assert.equal(String(generated[0].recurringJournalId), String(schedule._id));
      assert.equal(generated[0].lines[0].costCenter, 'Head Office');
      assert.equal(await AccountingVoucher.countDocuments({ requestKey: `recurring_${schedule._id}_2026-02-28` }), 1);
      assert.deepEqual(await LedgerAccount.find({}).sort({ name: 1 }).lean(), before);
      assert.equal((await RecurringJournal.findById(schedule._id)).nextDate, '2026-03-28');
    });
    await context.test('foreign companies, inactive accounts and failed saves cannot advance the schedule', async () => {
      await assert.rejects(generateRecurringJournal(schedule._id, '2026-03-28', { ...user, businessId: new mongoose.Types.ObjectId().toString() }), /not found/);
      await LedgerAccount.updateOne({ name: 'Expense' }, { $set: { active: false } });
      await assert.rejects(generateRecurringJournal(schedule._id, '2026-03-28', user), /active ledger/);
      await LedgerAccount.updateOne({ name: 'Expense' }, { $set: { active: true } });
      mock.method(RecurringJournal.prototype, 'save', async () => { throw new Error('Schedule write failed'); });
      try { await assert.rejects(generateRecurringJournal(schedule._id, '2026-03-28', user), /Schedule write failed/); }
      finally { mock.restoreAll(); }
      assert.equal((await RecurringJournal.findById(schedule._id)).nextDate, '2026-03-28');
      assert.equal(await AccountingVoucher.countDocuments({ requestKey: `recurring_${schedule._id}_2026-03-28` }), 0);
    });
    await context.test('legacy endpoints cannot bypass posting and imports validate complete balanced groups atomically', async () => {
      await assert.rejects(call(createJournalEntry, { date: '2026-01-31', entryNo: 'LEGACY-NEW', debit: 100, credit: 100 }), /ledger lines/);
      const historical = await JournalEntry.create({ userId: user.id, businessId: user.businessId, date: '2026-01-31', entryNo: 'HISTORICAL', particulars: 'Preserve this source record', debit: 100, credit: 100, status: 'Posted' });
      await assert.rejects(call(updateJournalEntry, { debit: 999 }, { id: historical._id }), /read-only/);
      await assert.rejects(call(deleteJournalEntry, {}, { id: historical._id }), /cannot be deleted/);
      const csv = 'Date,Entry No,Ledger,Side,Amount,Status\n2026-01-31,IMPORT-OK,Expense,debit,20,Posted\n2026-01-31,IMPORT-OK,Accrual,credit,20,Posted\n2026-01-31,IMPORT-BAD,Expense,debit,20,Posted\n2026-01-31,IMPORT-BAD,Accrual,credit,10,Posted';
      const file = { originalname: 'journals.csv', buffer: Buffer.from(csv) };
      const summary = await call(importJournalEntries, {}, {}, file);
      assert.equal(summary.imported, 1); assert.equal(summary.skipped, 1);
      assert.match(summary.errors[0], /totals must match/);
      assert.equal(await AccountingVoucher.countDocuments({ voucherNo: 'IMPORT-BAD' }), 0);
      const retry = await call(importJournalEntries, {}, {}, file);
      assert.equal(retry.imported, 0); assert.equal(retry.skipped, 2);
      assert.equal((await LedgerAccount.findOne({ name: 'Expense' })).debit, 120);
      assert.equal((await JournalEntry.findById(historical._id)).debit, 100);
    });
  } finally {
    mock.restoreAll();
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_journal_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
