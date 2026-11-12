import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { VoucherSequence } from '../src/models/VoucherSequence.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { createAccountingVoucher, updateAccountingVoucher, cancelAccountingVoucher, reverseAccountingVoucher, getVoucherBillReferences } from '../src/services/accountingVouchers.js';
import { storeBuffer } from '../src/services/gridfsStorage.js';
import { AccountingPosting } from '../src/models/AccountingPosting.js';
import { JournalEntry } from '../src/models/JournalEntry.js';
import { CashBookEntry } from '../src/models/CashBookEntry.js';
import { BankBookEntry } from '../src/models/BankBookEntry.js';
import { postInvoiceAccounting, postPaymentAccounting, reverseAccountingPosting } from '../src/services/accountingPostings.js';

test('voucher posting on a real MongoDB replica set', { skip: !process.env.VOUCHER_TEST_MONGODB_URI }, async (context) => {
  const dbName = `gobook_voucher_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.VOUCHER_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  const user = { id: new mongoose.Types.ObjectId().toString(), businessId: new mongoose.Types.ObjectId().toString(), accountType: 'owner' };
  const lines = [{ ledgerName: 'Rent', side: 'debit', amount: 100 }, { ledgerName: 'Bank', side: 'credit', amount: 100 }];
  const payload = { voucherType: 'Journal', date: '2026-11-10', numberingMode: 'auto', status: 'Posted', lines };
  const reset = async () => {
    await AccountingVoucher.deleteMany({}); await VoucherSequence.deleteMany({}); await LedgerAccount.updateMany({}, { $set: { debit: 0, credit: 0 } });
  };
  try {
    await Promise.all([AccountingVoucher.init(), VoucherSequence.init(), BusinessSettings.init(), LedgerAccount.init(), AccountingPosting.init(), JournalEntry.init(), CashBookEntry.init(), BankBookEntry.init()]);
    await BusinessSettings.create({ userId: user.id });
    await LedgerAccount.insertMany([{ name: 'Rent', group: 'Indirect Expenses' }, { name: 'Bank', group: 'Bank Accounts' }, { name: 'Customer', group: 'Sundry Debtors' }].map((account) => ({ ...account, userId: user.id, businessId: user.businessId })));
    context.beforeEach(reset);
    await context.test('all eight voucher types preserve drafts and post balanced double entries', async () => {
      for (const voucherType of ['Contra', 'Payment', 'Receipt', 'Journal', 'Sales', 'Purchase', 'Credit Note', 'Debit Note']) {
        const draft = await createAccountingVoucher({ ...payload, voucherType, status: 'Draft' }, user);
        assert.equal(draft.postedAt, undefined);
        const posted = await updateAccountingVoucher(draft._id, { status: 'Posted', revision: 1 }, user);
        assert.equal(posted.debitTotal, 100); assert.equal(posted.creditTotal, 100);
      }
      assert.equal((await LedgerAccount.findOne({ name: 'Rent' })).debit, 800);
      await reset();
    });
    await context.test('a persistence failure rolls back actual ledger writes and sequence reservation', async () => {
      mock.method(AccountingVoucher, 'create', async () => { throw new Error('Injected write failure'); });
      try { await assert.rejects(createAccountingVoucher(payload, user), /Injected write failure/); }
      finally { mock.restoreAll(); }
      assert.equal((await LedgerAccount.findOne({ name: 'Rent' })).debit, 0);
      assert.equal(await AccountingVoucher.countDocuments({}), 0);
      assert.equal(await VoucherSequence.countDocuments({}), 0);
    });
    await context.test('concurrent auto-numbered postings have distinct numbers and exact ledger totals', async () => {
      const results = await Promise.allSettled([createAccountingVoucher(payload, user), createAccountingVoucher(payload, user)]);
      assert.ok(results.every((result) => result.status === 'fulfilled'), results.map((result) => result.reason?.stack).join('\n'));
      assert.equal(new Set(results.map((result) => result.value.voucherNo)).size, 2);
      assert.equal((await LedgerAccount.findOne({ name: 'Rent' })).debit, 200);
      await reset();
    });
    await context.test('concurrent bill settlements cannot overpay a shared reference', async () => {
      const original = await createAccountingVoucher({ ...payload, lines: [{ ledgerName: 'Customer', side: 'debit', amount: 100, allocations: [{ type: 'New Reference', reference: 'BILL-1', amount: 100 }] }, { ledgerName: 'Bank', side: 'credit', amount: 100 }] }, user);
      const settlement = { ...payload, voucherType: 'Receipt', lines: [{ ledgerName: 'Bank', side: 'debit', amount: 75 }, { ledgerName: 'Customer', side: 'credit', amount: 75, allocations: [{ type: 'Against Reference', reference: 'BILL-1', amount: 75 }] }] };
      const results = await Promise.allSettled([createAccountingVoucher(settlement, user), createAccountingVoucher(settlement, user)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal((await getVoucherBillReferences(user, 'Customer', '2026-27'))[0].outstanding, 25);
      await assert.rejects(cancelAccountingVoucher(original._id, { reason: 'Invalid cancellation' }, user), /settled bill/);
      const receipt = results.find((result) => result.status === 'fulfilled').value;
      const reversal = await reverseAccountingVoucher(receipt._id, { reason: 'Reopen settlement' }, user);
      assert.equal(String(reversal.reversalOf), String(receipt._id));
      assert.equal((await getVoucherBillReferences(user, 'Customer', '2026-27'))[0].outstanding, 100);
      assert.equal(await AccountingVoucher.countDocuments({}), 3);
      await reset();
    });
    await context.test('concurrent retries of one request post only one voucher', async () => {
      const request = { ...payload, requestKey: randomUUID() };
      const results = await Promise.all([createAccountingVoucher(request, user), createAccountingVoucher(request, user)]);
      assert.equal(String(results[0]._id), String(results[1]._id));
      assert.equal(await AccountingVoucher.countDocuments({}), 1);
      assert.equal((await LedgerAccount.findOne({ name: 'Rent' })).debit, 100);
      await reset();
    });
    await context.test('attachments must be stored voucher files owned by the current account', async () => {
      const file = await storeBuffer({ buffer: Buffer.from('%PDF-1.4 test'), filename: 'receipt.pdf', contentType: 'application/pdf', metadata: { kind: 'module-record-file', moduleKey: 'accounting-vouchers', userId: user.id, businessId: user.businessId } });
      const saved = await createAccountingVoucher({ ...payload, attachments: [{ id: file.id }] }, user);
      assert.equal(saved.attachments[0].filename, 'receipt.pdf');
      await assert.rejects(createAccountingVoucher({ ...payload, attachments: [{ id: new mongoose.Types.ObjectId() }] }, user), /attachment was not found/);
      const foreignFile = await storeBuffer({ buffer: Buffer.from('%PDF-1.4 foreign'), filename: 'foreign.pdf', contentType: 'application/pdf', metadata: { kind: 'module-record-file', moduleKey: 'accounting-vouchers', userId: new mongoose.Types.ObjectId() } });
      await assert.rejects(createAccountingVoucher({ ...payload, attachments: [{ id: foreignFile.id }] }, user), /another account/);
      await reset();
    });
    await context.test('source postings remain idempotent and preserve audit history through paid invoice corrections and cancellation', async () => {
      const invoice = { _id: new mongoose.Types.ObjectId(), number: 'INV-TRANSACTION', documentType: 'invoice', customer: { name: 'Customer' }, meta: { date: '2026-11-10' }, totals: { finalTotal: 1180 }, items: [{ qty: 1, rate: 1000, gstRate: 18 }] };
      await postInvoiceAccounting(invoice, user); await postInvoiceAccounting(invoice, user);
      const original = await AccountingVoucher.findOne({ sourceId: invoice._id });
      assert.equal(await AccountingVoucher.countDocuments({}), 1);
      assert.equal(original.auditHistory.length, 1);
      const payment = { _id: new mongoose.Types.ObjectId(), invoiceNumber: invoice.number, customerName: 'Customer', amount: 200, method: 'Cash', date: '2026-11-10' };
      await postPaymentAccounting(payment, invoice, user);
      assert.equal((await getVoucherBillReferences(user, 'Customer', '2026-27'))[0].outstanding, 980);
      const corrected = { ...invoice, customer: { name: 'Alternate Customer' } };
      await postInvoiceAccounting(corrected, user);
      await postPaymentAccounting({ ...payment, customerName: 'Alternate Customer' }, corrected, user);
      const altered = await AccountingVoucher.findOne({ sourceId: invoice._id });
      assert.equal(String(altered._id), String(original._id));
      assert.equal(altered.auditHistory.length, 2);
      assert.equal((await getVoucherBillReferences(user, 'Alternate Customer', '2026-27'))[0].outstanding, 980);
      const customer = await LedgerAccount.findOne({ name: 'Customer' });
      assert.equal(customer.debit - customer.credit, 0);
      await reverseAccountingPosting({ userId: user.id, sourceType: 'payment', sourceId: payment._id });
      await reverseAccountingPosting({ userId: user.id, sourceType: 'invoice', sourceId: invoice._id });
      assert.equal(await AccountingVoucher.countDocuments({ status: 'Posted' }), 0);
      assert.equal(await AccountingVoucher.countDocuments({ status: 'Cancelled' }), 2);
      const retained = await AccountingVoucher.findById(original._id);
      assert.equal(retained.auditHistory.at(-1).action, 'Cancelled');
    });
  } finally {
    mock.restoreAll();
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_voucher_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
