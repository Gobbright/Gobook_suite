import { isFinanciallyActive } from './salesLifecycle.js';
import { createHash } from 'node:crypto';
import { inInventoryTransaction, inventoryTransaction } from './inventoryTransaction.js';
import { AccountingPosting } from '../models/AccountingPosting.js';
import { BankBookEntry } from '../models/BankBookEntry.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { CashBookEntry } from '../models/CashBookEntry.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { LedgerAccount } from '../models/LedgerAccount.js';
import { httpError } from '../utils/httpError.js';
import {
  reverseSourceVoucher,
  upsertSourceVoucher,
} from './accountingVouchers.js';

const ACCOUNT_GROUPS = {
  bank: 'Bank Accounts',
  cash: 'Cash-In-Hand',
  customer: 'Sundry Debtors',
  inputGst: 'Current Assets',
  outputGst: 'Current Liabilities',
  purchase: 'Direct Expenses',
  sales: 'Direct Incomes',
  vendor: 'Sundry Creditors',
};

function cleanName(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function money(value) {
  const amount = Number(value) || 0;
  return Math.round(amount * 100) / 100;
}

function sourceVoucherNo(sourceType, sourceNumber, sourceId) {
  const cleanNumber = String(sourceNumber || '').replace(/[^a-z0-9-]/gi, '').slice(0, 18);
  const idSuffix = String(sourceId).slice(-6);
  return `AUTO-${sourceType.toUpperCase()}-${cleanNumber || 'DOC'}-${idSuffix}`;
}

function lineTotal(item, includeGst = true) {
  const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
  const discountValue = Number(item.discount) || 0;
  const discount = item.discountType === 'amount'
    ? Math.min(gross, discountValue)
    : gross * (discountValue / 100);
  const taxable = gross - discount;
  const gst = includeGst ? taxable * ((Number(item.gstRate) || 0) / 100) : 0;
  return { taxable: money(taxable), gst: money(gst), total: money(taxable + gst) };
}

function netBeforeTax(total, gst, tds = 0, tcs = 0) {
  return money(Math.max(0, money(total) + money(tds) - money(tcs) - money(gst)));
}

function settlementTaxLines(amounts, purchase, reverse, costCenter) {
  return [
    { accountName: purchase ? 'TDS Payable' : 'TDS Receivable', group: purchase ? 'Current Liabilities' : 'Current Assets', side: purchase !== reverse ? 'credit' : 'debit', amount: amounts.tds, costCenter },
    { accountName: purchase ? 'TCS Receivable' : 'TCS Payable', group: purchase ? 'Current Assets' : 'Current Liabilities', side: purchase !== reverse ? 'debit' : 'credit', amount: amounts.tcs, costCenter },
  ];
}

export function calcDocumentAmounts(doc = {}, includeGst = true) {
  const savedFinal = Number(doc.totals?.finalTotal);
  let taxable = 0;
  let gst = 0;

  for (const item of doc.items || []) {
    const line = lineTotal(item, includeGst);
    taxable += line.taxable;
    gst += line.gst;
  }
  const itemTaxable = taxable;

  for (const charge of doc.charges || []) {
    const amount = Number(charge.amount) || 0;
    taxable += amount;
    if (includeGst) gst += amount * ((Number(charge.gstRate) || 0) / 100);
  }

  taxable = money(taxable);
  gst = money(gst);
  const calculatedTotal = money(taxable + gst);
  const additional = Math.max(0, Number(doc.additionalDiscount?.value) || 0);
  const discount = money(doc.additionalDiscount?.type === 'amount' ? Math.min(calculatedTotal, additional) : calculatedTotal * additional / 100);
  const invoiceTotal = money(calculatedTotal - discount);
  // The document-level discount applies to the whole taxable supply. Split it
  // proportionally between value and GST so the tax ledger plus income/expense
  // ledger always equals the amount due.
  if (discount > 0 && calculatedTotal > 0) {
    const ratio = invoiceTotal / calculatedTotal;
    gst = money(gst * ratio);
    taxable = money(invoiceTotal - gst);
  }
  const savedTax = (key, calculated) => doc.totals?.[key] !== undefined && Number.isFinite(Number(doc.totals[key])) ? Math.max(0, money(doc.totals[key])) : Math.max(0, money(calculated));
  const tds = savedTax('tdsAmt', doc.tds?.enabled ? itemTaxable * Number(doc.tds.rate || 0) / 100 : 0);
  const tcs = savedTax('tcsAmt', doc.tcs?.enabled ? invoiceTotal * Number(doc.tcs.rate || 0) / 100 : 0);
  const hasSavedTotal = doc.totals?.finalTotal !== undefined && doc.totals?.finalTotal !== null && doc.totals?.finalTotal !== '' && Number.isFinite(savedFinal) && savedFinal >= 0;
  const total = hasSavedTotal ? money(savedFinal) : money(invoiceTotal - tds + tcs);

  return { taxable, gst, total, tds, tcs };
}

async function ensureLedger(userId, businessId, branch, name, group) {
  await LedgerAccount.updateOne(
    { userId, name },
    { $setOnInsert: { userId, businessId, branch, name, group, opening: 0, debit: 0, credit: 0, color: '#2563eb' } },
    { upsert: true },
  );
}

async function applyLine(userId, businessId, branch, line, multiplier = 1) {
  if (!line.amount || line.amount <= 0) return;
  await ensureLedger(userId, businessId, branch, line.accountName, line.group);
  await LedgerAccount.updateOne(
    { userId, name: line.accountName },
    { $inc: { [line.side]: money(line.amount * multiplier) } },
  );
}

async function reverseExistingPosting({ userId, sourceType, sourceId, preserveVoucher = false }) {
  const existing = await AccountingPosting.findOne({ userId, sourceType, sourceId }).lean();
  if (!existing) return;

  for (const line of existing.lines || []) {
    await applyLine(userId, existing.businessId, existing.branch, line, -1);
  }

  if (existing.journalEntryNos?.length) {
    await JournalEntry.deleteMany({ userId, entryNo: { $in: existing.journalEntryNos } });
  }
  if (existing.cashBookVchNos?.length) {
    await CashBookEntry.deleteMany({ userId, vchNo: { $in: existing.cashBookVchNos }, isAuto: true });
  }
  if (existing.bankBookVchNos?.length) {
    await BankBookEntry.deleteMany({ userId, vchNo: { $in: existing.bankBookVchNos }, isAuto: true });
  }
  if (!preserveVoucher) await reverseSourceVoucher({ userId, sourceType, sourceId, postToLedger: false });
  await AccountingPosting.deleteOne({ _id: existing._id, userId });
}

async function savePosting(payload) {
  return inventoryTransaction(() => savePostingInTransaction(payload));
}

async function savePostingInTransaction({ userId, businessId, branch = '', sourceType, sourceId, sourceNumber, referenceNo, billReference, date, narration, lines, bookEntries = [], voucherType = 'Journal', partyName = '' }) {
  const validLines = lines.filter((line) => line.amount > 0).map((line) => ({ ...line, amount: money(line.amount) }));
  const debitTotal = money(validLines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0));
  const creditTotal = money(validLines.filter((line) => line.side === 'credit').reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(debitTotal - creditTotal) >= 0.01) throw httpError(400, 'Document accounting debit and credit totals must match');
  const contentHash = createHash('sha256').update(JSON.stringify({ businessId, branch, sourceNumber, referenceNo, billReference, date, narration, lines: validLines, bookEntries, voucherType, partyName })).digest('hex');
  const previous = await AccountingPosting.findOne({ userId, sourceType, sourceId }).lean();
  if (previous?.contentHash === contentHash) return previous;
  await reverseExistingPosting({ userId, sourceType, sourceId, preserveVoucher: validLines.length > 0 });
  if (validLines.length === 0) return null;
  const voucherNo = sourceVoucherNo(sourceType, sourceNumber, sourceId);
  const appliedLines = [];

  try {
    for (const line of validLines) {
      await applyLine(userId, businessId, branch, line, 1);
      appliedLines.push(line);
    }

    await JournalEntry.create({
      userId,
      businessId,
      branch,
      date: date || new Date().toISOString().slice(0, 10),
      entryNo: voucherNo,
      particulars: narration,
      debit: debitTotal,
      credit: creditTotal,
      status: 'Posted',
    });

    const cashBookVchNos = [];
    const bankBookVchNos = [];
    for (const entry of bookEntries) {
      const vchNo = entry.vchNo || voucherNo;
      const common = {
        userId,
        businessId,
        branch,
        sourceType,
        sourceId,
        isAuto: true,
        date: date || new Date().toISOString().slice(0, 10),
        particulars: narration,
        vchNo,
        balance: 0,
      };

      if (entry.book === 'cash') {
        await CashBookEntry.create({
          ...common,
          vchType: entry.vchType || 'Receipt',
          receipt: money(entry.receipt),
          payment: money(entry.payment),
        });
        cashBookVchNos.push(vchNo);
      }

      if (entry.book === 'bank') {
        await BankBookEntry.create({
          ...common,
          bank: entry.bank || 'Bank',
          accountNo: entry.accountNo || '',
          ifsc: entry.ifsc || '',
          accountType: entry.accountType || 'Current Account',
          bankReference: entry.bankReference || '',
          vchType: entry.vchType || 'Deposit',
          deposit: money(entry.deposit),
          withdrawal: money(entry.withdrawal),
        });
        bankBookVchNos.push(vchNo);
      }
    }

    const voucher = await upsertSourceVoucher({
      businessId,
      branch,
      voucherType,
      voucherNo,
      date: date || new Date().toISOString().slice(0, 10),
      partyName,
      referenceNo: referenceNo ?? sourceNumber ?? '',
      narration,
      status: 'Posted',
      sourceType,
      sourceId,
      sourceNumber,
      lines: validLines.map((line) => ({
        ledgerName: line.accountName,
        ledgerGroup: line.group,
        side: line.side,
        amount: line.amount,
        billRef: billReference || sourceNumber || '',
        costCenter: line.costCenter || '',
      })),
    }, { id: userId, businessId }, { postToLedger: false });

    return await AccountingPosting.create({
      userId,
      businessId,
      branch,
      sourceType,
      sourceId,
      sourceNumber,
      contentHash,
      date,
      narration,
      journalEntryNos: [voucherNo],
      cashBookVchNos,
      bankBookVchNos,
      voucherIds: voucher ? [voucher._id] : [],
      lines: validLines,
    });
  } catch (err) {
    if (inInventoryTransaction()) throw err;
    for (const line of appliedLines) {
      await applyLine(userId, businessId, branch, line, -1);
    }
    await JournalEntry.deleteOne({ userId, entryNo: voucherNo });
    await CashBookEntry.deleteMany({ userId, vchNo: voucherNo, isAuto: true });
    await BankBookEntry.deleteMany({ userId, vchNo: voucherNo, isAuto: true });
    await reverseSourceVoucher({ userId, sourceType, sourceId, postToLedger: false });
    throw err;
  }
}

export async function reverseAccountingPosting({ userId, sourceType, sourceId }) {
  await inventoryTransaction(() => reverseExistingPosting({ userId, sourceType, sourceId }));
}

export async function postInvoiceAccounting(invoice, user) {
  if (!isFinanciallyActive(invoice)) return null;
  const documentType = invoice.documentType || 'invoice';
  if (!['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice', 'e-way-bill'].includes(documentType)) return null;

  const includeGst = !['bill-of-supply'].includes(documentType);
  const amounts = calcDocumentAmounts(invoice, includeGst);
  const salesAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const customerName = cleanName(invoice.customer?.name, 'Walk-in Customer');
  const date = invoice.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(invoice.extra?.costCenter, '');

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: invoice.branch || user.branch || '',
    sourceType: 'invoice',
    sourceId: invoice._id,
    sourceNumber: invoice.number,
    date,
    partyName: customerName,
    voucherType: 'Sales',
    narration: `Sales invoice ${invoice.number} - ${customerName}`,
    lines: [
      { accountName: customerName, group: ACCOUNT_GROUPS.customer, side: 'debit', amount: amounts.total, costCenter },
      { accountName: 'Sales', group: ACCOUNT_GROUPS.sales, side: 'credit', amount: salesAmount, costCenter },
      { accountName: 'Output GST', group: ACCOUNT_GROUPS.outputGst, side: 'credit', amount: amounts.gst, costCenter },
      ...settlementTaxLines(amounts, false, false, costCenter),
    ],
  });
}

export async function postCreditNoteAccounting(note, user) {
  if (!isFinanciallyActive(note)) return null;
  if (note.documentType !== 'credit-note') return null;

  const amounts = calcDocumentAmounts(note, true);
  const salesReturnAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const customerName = cleanName(note.customer?.name, 'Walk-in Customer');
  const date = note.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(note.extra?.costCenter, '');

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: note.branch || user.branch || '',
    sourceType: 'credit-note',
    sourceId: note._id,
    sourceNumber: note.number,
    date,
    partyName: customerName,
    voucherType: 'Credit Note',
    narration: `Credit note ${note.number} - ${customerName}`,
    lines: [
      { accountName: 'Sales Returns', group: ACCOUNT_GROUPS.sales, side: 'debit', amount: salesReturnAmount, costCenter },
      { accountName: 'Output GST', group: ACCOUNT_GROUPS.outputGst, side: 'debit', amount: amounts.gst, costCenter },
      { accountName: customerName, group: ACCOUNT_GROUPS.customer, side: 'credit', amount: amounts.total, costCenter },
      ...settlementTaxLines(amounts, false, true, costCenter),
    ],
  });
}

export async function postSalesReturnAccounting(note, user) {
  if (!isFinanciallyActive(note)) return null;
  if (note.documentType !== 'sales-return') return null;

  const amounts = calcDocumentAmounts(note, true);
  const salesReturnAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const customerName = cleanName(note.customer?.name, 'Walk-in Customer');
  const date = note.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(note.extra?.costCenter, '');

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: note.branch || user.branch || '',
    sourceType: 'sales-return',
    sourceId: note._id,
    sourceNumber: note.number,
    date,
    partyName: customerName,
    voucherType: 'Sales Return',
    narration: `Sales return ${note.number} - ${customerName}`,
    lines: [
      { accountName: 'Sales Returns', group: ACCOUNT_GROUPS.sales, side: 'debit', amount: salesReturnAmount, costCenter },
      { accountName: 'Output GST', group: ACCOUNT_GROUPS.outputGst, side: 'debit', amount: amounts.gst, costCenter },
      { accountName: customerName, group: ACCOUNT_GROUPS.customer, side: 'credit', amount: amounts.total, costCenter },
      ...settlementTaxLines(amounts, false, true, costCenter),
    ],
  });
}

export async function postDebitNoteAccounting(note, user) {
  if (!isFinanciallyActive(note)) return null;
  if (note.documentType !== 'debit-note') return null;

  const amounts = calcDocumentAmounts(note, true);
  const salesAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const customerName = cleanName(note.customer?.name, 'Walk-in Customer');
  const date = note.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(note.extra?.costCenter, '');

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: note.branch || user.branch || '',
    sourceType: 'debit-note',
    sourceId: note._id,
    sourceNumber: note.number,
    date,
    partyName: customerName,
    voucherType: 'Debit Note',
    narration: `Debit note ${note.number} - ${customerName}`,
    lines: [
      { accountName: customerName, group: ACCOUNT_GROUPS.customer, side: 'debit', amount: amounts.total, costCenter },
      { accountName: 'Sales', group: ACCOUNT_GROUPS.sales, side: 'credit', amount: salesAmount, costCenter },
      { accountName: 'Output GST', group: ACCOUNT_GROUPS.outputGst, side: 'credit', amount: amounts.gst, costCenter },
      ...settlementTaxLines(amounts, false, false, costCenter),
    ],
  });
}

export async function postPurchaseEntryAccounting(invoice, user) {
  if (!isFinanciallyActive(invoice)) return null;
  if (invoice.documentType !== 'purchase-entry') return null;

  const amounts = calcDocumentAmounts(invoice, true);
  const purchaseAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const vendorName = cleanName(invoice.customer?.name, 'Unknown Vendor');
  const date = invoice.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(invoice.extra?.costCenter, '');
  const vendorInvoice = invoice.extra?.vendorInvoiceNo ? ` / Vendor Inv ${invoice.extra.vendorInvoiceNo}` : '';

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: invoice.branch || user.branch || '',
    sourceType: 'purchase-entry',
    sourceId: invoice._id,
    sourceNumber: invoice.number,
    date,
    partyName: vendorName,
    voucherType: 'Purchase',
    narration: `Purchase entry ${invoice.number}${vendorInvoice} - ${vendorName}`,
    lines: [
      { accountName: 'Purchases', group: ACCOUNT_GROUPS.purchase, side: 'debit', amount: purchaseAmount, costCenter },
      { accountName: 'Input GST', group: ACCOUNT_GROUPS.inputGst, side: 'debit', amount: amounts.gst, costCenter },
      { accountName: vendorName, group: ACCOUNT_GROUPS.vendor, side: 'credit', amount: amounts.total, costCenter },
      ...settlementTaxLines(amounts, true, false, costCenter),
    ],
  });
}

export async function postSupplierReturnAccounting(note, user) {
  if (!isFinanciallyActive(note)) return null;
  if (note.documentType !== 'supplier-return') return null;

  const amounts = calcDocumentAmounts(note, true);
  const purchaseReturnAmount = netBeforeTax(amounts.total, amounts.gst, amounts.tds, amounts.tcs);
  const vendorName = cleanName(note.customer?.name, 'Unknown Vendor');
  const date = note.meta?.date || new Date().toISOString().slice(0, 10);
  const costCenter = cleanName(note.extra?.costCenter, '');

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: note.branch || user.branch || '',
    sourceType: 'supplier-return',
    sourceId: note._id,
    sourceNumber: note.number,
    date,
    partyName: vendorName,
    voucherType: 'Purchase Return',
    narration: `Supplier return ${note.number} - ${vendorName}`,
    lines: [
      { accountName: vendorName, group: ACCOUNT_GROUPS.vendor, side: 'debit', amount: amounts.total, costCenter },
      { accountName: 'Purchase Returns', group: ACCOUNT_GROUPS.purchase, side: 'credit', amount: purchaseReturnAmount, costCenter },
      { accountName: 'Input GST', group: ACCOUNT_GROUPS.inputGst, side: 'credit', amount: amounts.gst, costCenter },
      ...settlementTaxLines(amounts, true, true, costCenter),
    ],
  });
}

export async function postPaymentAccounting(payment, invoice, user) {
  if (!invoice || !isFinanciallyActive(invoice)) return null;
  if (!['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice', 'purchase-entry'].includes(invoice.documentType || 'invoice')) {
    throw httpError(400, 'Payments require a sales invoice or purchase entry');
  }
  const purchase = invoice.documentType === 'purchase-entry';
  const customerName = cleanName(payment.customerName || invoice?.customer?.name, 'Walk-in Customer');
  const isCash = payment.method === 'Cash';
  const receiptGroup = isCash ? ACCOUNT_GROUPS.cash : ACCOUNT_GROUPS.bank;
  const date = payment.date || new Date().toISOString().slice(0, 10);
  const amount = Number(payment.amount) || 0;
  const bankSettings = isCash ? null : await BusinessSettings.findOne({ userId: user.id }).lean();
  const receiptAccount = isCash ? 'Cash' : cleanName(bankSettings?.bankName, 'Bank');
  const costCenter = cleanName(invoice?.extra?.costCenter, '');
  const voucherNo = sourceVoucherNo('payment', `${payment.invoiceNumber || invoice?.number || 'PAY'}-${String(payment._id).slice(-6)}`, payment._id);

  return savePosting({
    userId: user.id,
    businessId: user.businessId,
    branch: payment.branch || invoice?.branch || user.branch || '',
    sourceType: 'payment',
    sourceId: payment._id,
    sourceNumber: `${payment.invoiceNumber || invoice?.number || 'PAY'}-${String(payment._id).slice(-6)}`,
    date,
    partyName: customerName,
    referenceNo: payment.reference || payment.invoiceNumber || invoice.number || '',
    billReference: payment.invoiceNumber || invoice.number || '',
    voucherType: purchase ? 'Payment' : 'Receipt',
    narration: `${purchase ? 'Payment against purchase' : 'Receipt against invoice'} ${payment.invoiceNumber || invoice?.number || ''} - ${customerName}`,
    lines: [
      { accountName: receiptAccount, group: receiptGroup, side: purchase ? 'credit' : 'debit', amount, costCenter },
      { accountName: customerName, group: purchase ? ACCOUNT_GROUPS.vendor : ACCOUNT_GROUPS.customer, side: purchase ? 'debit' : 'credit', amount, costCenter },
    ],
    bookEntries: isCash
      ? [{ book: 'cash', vchNo: voucherNo, vchType: purchase ? 'Payment' : 'Receipt', receipt: purchase ? 0 : amount, payment: purchase ? amount : 0 }]
      : [{
          book: 'bank',
          vchNo: voucherNo,
          vchType: purchase ? 'Withdrawal' : 'Deposit',
          deposit: purchase ? 0 : amount,
          withdrawal: purchase ? amount : 0,
          bank: receiptAccount,
          bankReference: payment.reference || '',
          accountNo: bankSettings?.accountNumber || '',
          ifsc: bankSettings?.ifscCode || '',
          accountType: bankSettings?.accountType || 'Current Account',
        }],
  });
}
