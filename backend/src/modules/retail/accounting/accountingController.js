import { BankBookEntry } from '../../../models/BankBookEntry.js';
import { Types } from 'mongoose';
import { LedgerGroup } from '../../../models/LedgerGroup.js';
import { AppUser } from '../../../models/AppUser.js';
import { CashBookEntry } from '../../../models/CashBookEntry.js';
import { AccountingPosting } from '../../../models/AccountingPosting.js';
import { AccountingVoucher } from '../../../models/AccountingVoucher.js';
import { parseVoucherBankEntryId, voucherBankEntries } from '../../../services/bankVoucherReconciliation.js';
import { Invoice } from '../../../models/Invoice.js';
import { JournalEntry } from '../../../models/JournalEntry.js';
import { LedgerAccount } from '../../../models/LedgerAccount.js';
import { Payment } from '../../../models/Payment.js';
import { postInvoiceAccounting, postPaymentAccounting, postPurchaseEntryAccounting, postSupplierReturnAccounting, postSalesReturnAccounting, postCreditNoteAccounting, postDebitNoteAccounting } from '../../../services/accountingPostings.js';
import { branchForNewRecord, branchScopedQuery, branchScopedAggregateMatch, resolveBranchScope } from '../../../utils/branchScope.js';
import { httpError } from '../../../utils/httpError.js';
import { asNumber, asText, enumValue, importSummary, parseExcelRows } from '../../../utils/excelImport.js';
import { BusinessSettings } from '../../../models/BusinessSettings.js';
import { buildLedgerStatement, canonicalLedgerGroup, ledgerCompanyScope, ledgerPeriodBounds } from '../../../services/ledgerManagement.js';
import { createAccountingVoucher as createJournalVoucher } from '../../../services/accountingVouchers.js';
import { voucherFinancialYear } from '../../../services/voucherRules.js';
import { createManagedLedger, updateManagedLedger } from './ledgerManagementController.js';

const closingOf = (account) => Number(account.opening ?? 0) + Number(account.debit ?? 0) - Number(account.credit ?? 0);

const LEDGER_IMPORT_COLUMNS = {
  name: 'name',
  account: 'name',
  'account name': 'name',
  ledger: 'name',
  'ledger name': 'name',
  group: 'group',
  'account group': 'group',
  'ledger group': 'group',
  opening: 'opening',
  'opening balance': 'opening',
  balance: 'opening',
  ob: 'opening',
  debit: 'debit',
  dr: 'debit',
  credit: 'credit',
  cr: 'credit',
  color: 'color',
};

const JOURNAL_IMPORT_COLUMNS = {
  date: 'date',
  'entry no': 'entryNo',
  entryno: 'entryNo',
  'journal no': 'entryNo',
  'voucher no': 'entryNo',
  'voucher number': 'entryNo',
  'vch no': 'entryNo',
  voucher: 'entryNo',
  particulars: 'particulars',
  narration: 'particulars',
  description: 'particulars',
  details: 'particulars',
  note: 'particulars',
  notes: 'particulars',
  debit: 'debit',
  dr: 'debit',
  credit: 'credit',
  cr: 'credit',
  status: 'status',
};

function normalizeAmountFields(body, fields) {
  return fields.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = Number(body[field]);
    return payload;
  }, { ...body });
}

function withCashRunningBalances(entries) {
  let running = 0;
  return entries.map((entry) => {
    if (entry.vchType === 'OB') {
      running = Number(entry.balance) || 0;
      return { ...entry, balance: running };
    }

    running += Number(entry.receipt) || 0;
    running -= Number(entry.payment) || 0;
    return { ...entry, balance: running };
  });
}

function withBankRunningBalances(entries) {
  let running = 0;
  return entries.map((entry) => {
    if (entry.vchType === 'OB') {
      running = Number(entry.balance) || 0;
      return { ...entry, balance: running };
    }

    running += Number(entry.deposit) || 0;
    running -= Number(entry.withdrawal) || 0;
    if (entry.vchType === 'CB') running = Number(entry.balance) || 0;
    return { ...entry, balance: running };
  });
}

async function voucherReportFilter(req) {
  const { from, to, voucherType } = req.query;
  const filter = await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' });
  if (req.user.businessId) filter.businessId = req.user.businessId;
  if (req.query.financialYear) filter.financialYear = req.query.financialYear;
  filter.status = 'Posted';
  if (voucherType && voucherType !== 'All') filter.voucherType = voucherType;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  return filter;
}

function rounded(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const DOCUMENT_POSTERS = { invoice: postInvoiceAccounting, 'bill-of-supply': postInvoiceAccounting, 'pharmacy-bill': postInvoiceAccounting, 'e-invoice': postInvoiceAccounting, 'e-way-bill': postInvoiceAccounting, 'purchase-entry': postPurchaseEntryAccounting, 'supplier-return': postSupplierReturnAccounting, 'sales-return': postSalesReturnAccounting, 'credit-note': postCreditNoteAccounting, 'debit-note': postDebitNoteAccounting };
const CURRENT_BILL_DOCUMENT_TYPES = Object.keys(DOCUMENT_POSTERS);

async function ledgerAccountsFilter(req, extra = {}) {
  return ledgerCompanyScope(await branchScopedQuery(req, { model: LedgerAccount, ownerField: 'userId' }, extra), req.user.businessId);
}

async function journalEntriesFilter(req, extra = {}) {
  return branchScopedQuery(req, { model: JournalEntry, ownerField: 'userId' }, extra);
}

async function cashBookFilter(req, extra = {}) {
  return branchScopedQuery(req, { model: CashBookEntry, ownerField: 'userId' }, extra);
}

async function bankBookFilter(req, extra = {}) {
  return branchScopedQuery(req, { model: BankBookEntry, ownerField: 'userId' }, extra);
}

async function branchValueForRecord(req) {
  return branchForNewRecord(req, req.body?.branch || req.query?.branch || req.user.branch || '');
}

async function ledgerBalancesFromVouchers(req, period) {
  if (period) {
    const branch = (await resolveBranchScope(req)).branch;
    const match = await branchScopedAggregateMatch({ ...req, query: { ...req.query, branch: '' } }, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted' });
    if (req.user.businessId) match.businessId = new Types.ObjectId(req.user.businessId);
    if (branch) match.branch = branch;
    if (period.to) match.date = { $lte: period.to };
    const costCenter = String(req.query.costCenter || '').trim();
    const group = { _id: { owner: '$userId', name: '$lines.ledgerName' }, ledgerId: { $first: '$lines.ledgerId' }, group: { $first: '$lines.ledgerGroup' } };
    const ranges = [{ key: '', ...period }, ...(period.previous ? [{ key: 'previous', ...period.previous }] : [])];
    for (const range of ranges) {
      const inPeriod = { $and: [...(range.from ? [{ $gte: ['$date', range.from] }] : []), ...(range.to ? [{ $lte: ['$date', range.to] }] : [])] };
      const signed = { $cond: [{ $eq: ['$lines.side', 'debit'] }, '$lines.amount', { $multiply: ['$lines.amount', -1] }] };
      group[`${range.key}OpeningMovement`] = { $sum: { $cond: [range.from ? { $lt: ['$date', range.from] } : false, signed, 0] } };
      for (const side of ['debit', 'credit']) group[`${range.key}${side}`] = { $sum: { $cond: [{ $and: [inPeriod, { $eq: ['$lines.side', side] }] }, '$lines.amount', 0] } };
    }
    const metadataMatch = await branchScopedAggregateMatch({ ...req, query: { ...req.query, branch: '' } }, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted' });
    if (req.user.businessId) metadataMatch.businessId = new Types.ObjectId(req.user.businessId);
    const [aggregation, accounts, definitions, metadata] = await Promise.all([
      AccountingVoucher.aggregate([{ $match: match }, { $unwind: '$lines' }, { $match: { 'lines.side': { $in: ['debit', 'credit'] }, ...(costCenter ? { 'lines.costCenter': costCenter } : {}) } }, { $group: group }]).allowDiskUse(true),
      LedgerAccount.find(await ledgerAccountsFilter({ ...req, query: { ...req.query, branch: '' } })).select('userId businessId branch name group accountingGroup code opening active').lean(),
      LedgerGroup.find(req.user.businessId ? { businessId: req.user.businessId } : { userId: req.user.id }).select('name parent accountingGroup category').lean(),
      AccountingVoucher.aggregate([{ $match: metadataMatch }, { $unwind: '$lines' }, { $group: { _id: null, branches: { $addToSet: '$branch' }, costCenters: { $addToSet: '$lines.costCenter' }, financialYears: { $addToSet: '$financialYear' } } }]),
    ]);
    const keyOf = (owner, name) => `${owner}:${name}`;
    const movements = new Map(aggregation.map((row) => [keyOf(row._id.owner, row._id.name), row]));
    const masters = new Map(accounts.map((account) => [keyOf(account.userId, account.name), account]));
    const keys = new Set([...masters.keys(), ...movements.keys()]);
    const rows = [...keys].map((key) => {
      const master = masters.get(key), movement = movements.get(key);
      const opening = !costCenter && (!branch || master?.branch === branch) ? rounded(master?.opening || 0) : 0;
      const result = { _id: master?._id || movement?.ledgerId, userId: master?.userId || movement?._id.owner, name: master?.name || movement?._id.name, code: master?.code || '', group: master?.group || canonicalLedgerGroup(movement?.group || 'Unspecified'), accountingGroup: master?.accountingGroup || canonicalLedgerGroup(master?.group || movement?.group || ''), active: master?.active !== false };
      for (const range of ranges) {
        const carried = rounded(opening + (movement?.[`${range.key}OpeningMovement`] || 0));
        const debit = rounded(movement?.[`${range.key}debit`] || 0), credit = rounded(movement?.[`${range.key}credit`] || 0);
        const closing = rounded(carried + debit - credit);
        const values = { opening: carried, openingDebit: Math.max(carried, 0), openingCredit: Math.max(-carried, 0), debit, credit, periodDebit: debit, periodCredit: credit, closing, closingDebit: Math.max(closing, 0), closingCredit: Math.max(-closing, 0) };
        if (range.key) result.previous = values; else Object.assign(result, values);
      }
      return result;
    }).sort((first, second) => first.name.localeCompare(second.name));
    return { rows, groups: definitions, options: { branches: [...new Set([...(metadata[0]?.branches || []), ...accounts.map((account) => account.branch)])].filter(Boolean).sort(), costCenters: metadata[0]?.costCenters.filter(Boolean).sort() || [], financialYears: metadata[0]?.financialYears.filter(Boolean).sort().reverse() || [] }, branch, costCenter };
  }
  const vouchers = await AccountingVoucher.find(await voucherReportFilter(req)).sort({ date: 1, createdAt: 1 }).lean();
  const map = new Map();
  for (const voucher of vouchers) {
    for (const line of voucher.lines || []) {
      const key = line.ledgerName;
      const current = map.get(key) || {
        name: line.ledgerName,
        group: line.ledgerGroup,
        opening: 0,
        debit: 0,
        credit: 0,
      };
      current.group = canonicalLedgerGroup(current.group || line.ledgerGroup);
      if (line.side === 'debit') current.debit = rounded(current.debit + line.amount);
      if (line.side === 'credit') current.credit = rounded(current.credit + line.amount);
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

export async function listLedgerAccounts(req, res, next) {
  try {
    const { search, group } = req.query;
    const readScope = req.query.balances === 'posted' ? { ...req, query: { ...req.query, branch: '' } } : req;
    const filter = await ledgerAccountsFilter(readScope);
    if (search) filter.name = new RegExp(search, 'i');
    if (group && group !== 'All Groups') filter.group = group;

    let accounts = await LedgerAccount.find(filter).sort({ name: 1 }).lean();
    if (req.query.balances === 'posted') {
      const voucherFilter = await branchScopedQuery(readScope, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted' });
      if (req.user.businessId) voucherFilter.businessId = req.user.businessId;
      const settings = req.query.financialYear ? await BusinessSettings.findOne({ userId: req.user.id }).lean() : null;
      const bounds = { ...ledgerPeriodBounds(req.query, settings?.fyStart), branch: (await resolveBranchScope(req)).branch };
      if (bounds.branch) voucherFilter.branch = bounds.branch;
      const vouchers = await AccountingVoucher.find(voucherFilter).sort({ date: 1, createdAt: 1 }).lean();
      accounts = accounts.map((account) => {
        const history = vouchers.filter((voucher) => String(voucher.userId) === String(account.userId));
        const statement = buildLedgerStatement(account, history, bounds);
        return { ...account, debit: statement.totals.debitTotal, credit: statement.totals.creditTotal, currentBalance: statement.totals.closing, periodOpening: statement.totals.opening, hasHistory: history.some((voucher) => voucher.lines.some((line) => line.ledgerName === account.name)) };
      });
    }
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
}

export async function createLedgerAccount(req, res, next) {
  return createManagedLedger(req, res, next);
}

export async function importLedgerAccounts(req, res, next) {
  try {
    const userId = req.user.id;
    const branch = await branchValueForRecord(req);
    const rows = await parseExcelRows(req.file, LEDGER_IMPORT_COLUMNS, 'Account Name, Group, Opening, Debit, Credit');
    const summary = importSummary();

    for (const { rowNumber, record } of rows) {
      const name = asText(record.name);
      const group = asText(record.group);
      if (!name || !group) {
        summary.skipped++;
        summary.errors.push(`Row ${rowNumber}: account name and group are required`);
        continue;
      }

        try {
          const existing = await LedgerAccount.findOne(await ledgerAccountsFilter(req, { userId, name })).lean();
          const data = { name, group, changeReason: 'Ledger import' };
          for (const field of ['opening', 'debit', 'credit']) if (record[field] !== undefined && record[field] !== '') data[field] = asNumber(record[field], NaN);
          if (asText(record.color)) data.color = asText(record.color);
          if (!existing) data.branch = branch;
          const response = { status() { return this; }, json() { return this; } };
          const request = { ...req, body: data, params: existing ? { id: String(existing._id) } : {} };
          await (existing ? updateManagedLedger : createManagedLedger)(request, response, (error) => { throw error; });
          if (existing) summary.updated++; else summary.imported++;
        } catch (error) {
          summary.skipped++;
          summary.errors.push(`Row ${rowNumber}: ${error.message || 'Unable to save ledger'}`);
        }
    }

    res.json(summary);
  } catch (err) {
    if (err.code === 11000) return next(httpError(409, 'Duplicate ledger account name found in import'));
    next(err);
  }
}

export async function updateLedgerAccount(req, res, next) {
  return updateManagedLedger(req, res, next);
}

export async function deleteLedgerAccount(req, res, next) {
  try {
    const filter = await ledgerAccountsFilter(req, { _id: req.params.id });
    const existing = await LedgerAccount.findOne(filter).lean();
    if (!existing) throw httpError(404, 'Ledger account not found');
    if (Number(existing.opening) || Number(existing.debit) || Number(existing.credit) || await ledgerHasHistory(existing)) throw httpError(409, 'A ledger with balances or accounting history cannot be deleted. Deactivate it to preserve its history.');
    const account = await LedgerAccount.findOneAndDelete(filter).lean();
    if (!account) return next(httpError(404, 'Ledger account not found'));
    res.json({ message: 'Ledger account deleted' });
  } catch (err) {
    next(err);
  }
}

async function ledgerHasHistory(account) {
  return Boolean(await AccountingVoucher.exists({ userId: account.userId, 'lines.ledgerName': account.name })
    || await AccountingPosting.exists({ userId: account.userId, 'lines.accountName': account.name }));
}

export async function listJournalEntries(req, res, next) {
  try {
    const { status } = req.query;
    const filter = await journalEntriesFilter(req);
    if (status && status !== 'All') filter.status = status;
    const entries = await JournalEntry.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

export async function createJournalEntry(req, res, next) {
  try {
    if (!Array.isArray(req.body?.lines)) throw httpError(400, 'Journal entries require ledger lines. Use the journal voucher editor');
    const voucher = await createJournalVoucher({ ...req.body, voucherType: 'Journal' }, req.user);
    res.status(201).json({ entry: voucher, voucher });
  } catch (error) { next(error); }
}

export async function importJournalEntries(req, res, next) {
  try {
    const columns = { ...JOURNAL_IMPORT_COLUMNS, ledger: 'ledgerName', 'ledger name': 'ledgerName', account: 'ledgerName', side: 'side', amount: 'amount', narration: 'narration', 'cost centre': 'costCenter', 'cost center': 'costCenter', reference: 'referenceNo' };
    const rows = await parseExcelRows(req.file, columns, 'Date, Entry No, Ledger, Side, Amount');
    const groups = new Map(), summary = importSummary();
    for (const { rowNumber, record } of rows) {
      const key = asText(record.entryNo);
      if (!key) { summary.skipped++; summary.errors.push(`Row ${rowNumber}: Entry No is required`); continue; }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ record, rowNumber });
    }
    for (const [entryNo, group] of groups) {
      try {
        const first = group[0].record;
        if (group.some(({ record }) => asText(record.date) !== asText(first.date) || asText(record.status) !== asText(first.status))) throw httpError(400, 'All lines must have the same date and status');
        if (await JournalEntry.exists(await journalEntriesFilter(req, { entryNo }))) throw httpError(409, 'Historical journal number already exists; import cannot overwrite history');
        const status = asText(first.status) || 'Draft';
        const voucher = { voucherType: 'Journal', numberingMode: 'manual', voucherNo: entryNo, date: asText(first.date), status, narration: asText(first.narration || first.particulars), referenceNo: asText(first.referenceNo), lines: group.map(({ record }) => ({ ledgerName: asText(record.ledgerName), side: asText(record.side).toLowerCase(), amount: asNumber(record.amount, Number.NaN), costCenter: asText(record.costCenter), narration: asText(record.narration) })) };
        await createJournalVoucher(voucher, req.user);
        summary.imported++;
      } catch (error) {
        summary.skipped++;
        summary.errors.push(`Entry ${entryNo}: ${error.code === 11000 ? 'Journal number already exists' : error.message}`);
      }
    }
    res.json(summary);
  } catch (error) { next(error); }
}

export async function updateJournalEntry(req, res, next) {
  try {
    const entry = await JournalEntry.findOne(await journalEntriesFilter(req, { _id: req.params.id })).lean();
    if (!entry) throw httpError(404, 'Journal entry not found');
    throw httpError(409, 'Historical journals are read-only. Create a balanced journal voucher for a traceable correction');
  } catch (error) { next(error); }
}

export async function deleteJournalEntry(req, res, next) {
  try {
    const entry = await JournalEntry.findOne(await journalEntriesFilter(req, { _id: req.params.id })).lean();
    if (!entry) throw httpError(404, 'Journal entry not found');
    throw httpError(409, 'Historical journals cannot be deleted. Use a correction journal');
  } catch (error) { next(error); }
}

export async function getTrialBalance(req, res, next) {
  try {
    const owner = req.user.businessId ? await AppUser.findOne({ businessId: req.user.businessId, accountType: 'owner' }).select('_id').lean() : null;
    const settings = await BusinessSettings.findOne({ userId: owner?._id || req.user.id }).select('fyStart').lean();
    const fyStart = settings?.fyStart || '01 April';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const initial = req.query.initialize === 'true' ? { financialYear: voucherFinancialYear(today, fyStart), to: today } : {};
    const bounds = ledgerPeriodBounds({ ...req.query, ...initial, to: initial.to || req.query.asOn || req.query.to }, fyStart);
    if (req.query.comparison === 'previous') {
      if (!bounds.from || !bounds.to) throw httpError(400, 'Select From Date and To Date for period comparison');
      const start = Date.parse(`${bounds.from}T00:00:00Z`), end = Date.parse(`${bounds.to}T00:00:00Z`);
      bounds.previous = { from: new Date(start - (end - start + 86400000)).toISOString().slice(0, 10), to: new Date(start - 86400000).toISOString().slice(0, 10) };
    } else if (req.query.comparison && req.query.comparison !== 'none') throw httpError(400, 'Select a supported comparison period');
    const report = await ledgerBalancesFromVouchers(req, bounds);
    const totals = Object.fromEntries(['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'].map((field) => [field, rounded(report.rows.reduce((sum, row) => sum + row[field], 0))]));
    totals.debit = totals.closingDebit; totals.credit = totals.closingCredit; totals.difference = rounded(totals.debit - totals.credit); totals.balanced = totals.difference === 0;
    res.json({ ...report, totals, period: bounds, fyStart, accounts: report.rows.map((row) => ({ ...row, account: row.name, debit: row.closingDebit, credit: row.closingCredit })) });
  } catch (err) {
    next(err);
  }
}

export async function getPnlStatement(req, res, next) {
  try {
    const accounts = await ledgerBalancesFromVouchers(req);
    const income = accounts
      .filter((account) => /income|sales/i.test(account.group))
      .map((account) => ({ label: account.name, amount: Math.abs(closingOf(account)) }));
    const expenses = accounts
      .filter((account) => /expense|purchase/i.test(account.group))
      .map((account) => ({ label: account.name, amount: Math.abs(closingOf(account)) }));

    res.json({ income, expenses });
  } catch (err) {
    next(err);
  }
}

export async function getBalanceSheet(req, res, next) {
  try {
    const accounts = await ledgerBalancesFromVouchers(req);
    const assets = accounts
      .filter((account) => /asset|cash|bank|debtor|stock/i.test(account.group))
      .map((account) => ({ label: account.name, amount: Math.abs(closingOf(account)) }));
    const liabilities = accounts
      .filter((account) => /liabilit|creditor|capital|loan/i.test(account.group))
      .map((account) => ({ label: account.name, amount: Math.abs(closingOf(account)) }));

    res.json({ liabilities, assets });
  } catch (err) {
    next(err);
  }
}

export async function getDayBook(req, res, next) {
  try {
    const filter = await voucherReportFilter(req);
    const vouchers = await AccountingVoucher.find(filter).sort({ date: 1, createdAt: 1 }).lean();
    const summaryByType = new Map();

    for (const voucher of vouchers) {
      const current = summaryByType.get(voucher.voucherType) || {
        voucherType: voucher.voucherType,
        count: 0,
        debitTotal: 0,
        creditTotal: 0,
      };
      current.count += 1;
      current.debitTotal = rounded(current.debitTotal + voucher.debitTotal);
      current.creditTotal = rounded(current.creditTotal + voucher.creditTotal);
      summaryByType.set(voucher.voucherType, current);
    }

    res.json({
      vouchers,
      summary: Array.from(summaryByType.values()),
      totals: {
        count: vouchers.length,
        debitTotal: rounded(vouchers.reduce((sum, row) => sum + row.debitTotal, 0)),
        creditTotal: rounded(vouchers.reduce((sum, row) => sum + row.creditTotal, 0)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getLedgerStatement(req, res, next) {
  try {
    const ledgerName = String(req.query.ledgerName || '').trim();
    if (!ledgerName && !req.query.ledgerId) throw httpError(400, 'ledgerName or ledgerId is required');
    const readScope = { ...req, query: { ...req.query, branch: '' } };
    const ledger = await LedgerAccount.findOne(await ledgerAccountsFilter(readScope, req.query.ledgerId ? { _id: req.query.ledgerId } : { name: ledgerName })).lean();
    if (!ledger) throw httpError(404, 'Ledger account not found');
    if (req.user.businessId && ledger.businessId && String(req.user.businessId) !== String(ledger.businessId)) throw httpError(404, 'Ledger account not found');
    const filter = await branchScopedQuery(readScope, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted', 'lines.ledgerName': ledger.name });
    if (ledger.userId) filter.userId = ledger.userId;
    if (req.user.businessId) filter.businessId = req.user.businessId;
    const settings = req.query.financialYear ? await BusinessSettings.findOne({ userId: ledger.userId || req.user.id }).lean() : null;
    const bounds = { ...ledgerPeriodBounds(req.query, settings?.fyStart), branch: (await resolveBranchScope(req)).branch };
    if (bounds.branch) filter.branch = bounds.branch;
    const vouchers = await AccountingVoucher.find(filter).sort({ date: 1, createdAt: 1, _id: 1 }).lean();
    res.json(buildLedgerStatement(ledger, vouchers, bounds));
  } catch (error) { next(error); }
}

export async function getVoucherRegister(req, res, next) {
  try {
    const filter = await voucherReportFilter(req);
    const vouchers = await AccountingVoucher.find(filter).sort({ voucherType: 1, date: 1 }).lean();
    const rows = [];
    const byType = new Map();

    for (const voucher of vouchers) {
      const row = byType.get(voucher.voucherType) || {
        voucherType: voucher.voucherType,
        count: 0,
        debitTotal: 0,
        creditTotal: 0,
      };
      row.count += 1;
      row.debitTotal = rounded(row.debitTotal + voucher.debitTotal);
      row.creditTotal = rounded(row.creditTotal + voucher.creditTotal);
      byType.set(voucher.voucherType, row);
    }

    for (const row of byType.values()) rows.push(row);
    res.json({ rows, vouchers });
  } catch (err) {
    next(err);
  }
}

export async function getOutstandingStatement(req, res, next) {
  try {
    const type = req.query.type === 'payables' ? 'payables' : 'receivables';
    const groupPattern = type === 'payables' ? /sundry creditors|creditor/i : /sundry debtors|debtor/i;
    const accounts = await ledgerBalancesFromVouchers(req);
    const rows = accounts
      .filter((account) => groupPattern.test(account.group || ''))
      .map((account) => {
        const closing = closingOf(account);
        const outstanding = type === 'payables' ? Math.max(0, -closing) : Math.max(0, closing);
        return {
          ledgerName: account.name,
          group: account.group,
          opening: rounded(account.opening),
          debit: rounded(account.debit),
          credit: rounded(account.credit),
          outstanding: rounded(outstanding),
        };
      })
      .filter((row) => row.outstanding > 0);

    res.json({
      type,
      rows,
      totalOutstanding: rounded(rows.reduce((sum, row) => sum + row.outstanding, 0)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getBillWiseStatement(req, res, next) {
  try {
    const type = req.query.type === 'payables' ? 'payables' : 'receivables';
    const groupPattern = type === 'payables' ? /sundry creditors|creditor/i : /sundry debtors|debtor/i;
    const accounts = await ledgerBalancesFromVouchers(req);
    const partyNames = new Set(accounts.filter((account) => groupPattern.test(account.group || '')).map((account) => account.name));
    const vouchers = await AccountingVoucher.find(await voucherReportFilter(req)).sort({ date: 1, createdAt: 1 }).lean();
    const billMap = new Map();

    for (const voucher of vouchers) {
      for (const line of voucher.lines || []) {
        if (!partyNames.has(line.ledgerName)) continue;
        const allocations = line.allocations?.length ? line.allocations : [{ reference: line.billRef || voucher.referenceNo || voucher.sourceNumber || voucher.voucherNo, amount: line.amount }];
        for (const allocation of allocations) {
          const billRef = allocation.type === 'On Account' ? 'On Account' : allocation.reference;
          const key = `${line.ledgerName}::${billRef}`;
          const current = billMap.get(key) || {
            partyName: line.ledgerName,
            ledgerGroup: line.ledgerGroup,
            billRef,
            firstDate: voucher.date,
            lastDate: voucher.date,
            debit: 0,
            credit: 0,
            vouchers: [],
          };
          current.firstDate = current.firstDate < voucher.date ? current.firstDate : voucher.date;
          current.lastDate = current.lastDate > voucher.date ? current.lastDate : voucher.date;
          if (line.side === 'debit') current.debit = rounded(current.debit + allocation.amount);
          if (line.side === 'credit') current.credit = rounded(current.credit + allocation.amount);
          if (!current.vouchers.includes(voucher.voucherNo)) current.vouchers.push(voucher.voucherNo);
          billMap.set(key, current);
        }
      }
    }

    const rows = Array.from(billMap.values())
      .map((row) => {
        const net = rounded(row.debit - row.credit);
        return {
          ...row,
          outstanding: type === 'payables' ? rounded(Math.max(0, -net)) : rounded(Math.max(0, net)),
          voucherCount: row.vouchers.length,
        };
      })
      .filter((row) => row.outstanding > 0)
      .sort((a, b) => a.partyName.localeCompare(b.partyName) || a.billRef.localeCompare(b.billRef));

    res.json({
      type,
      rows,
      totalOutstanding: rounded(rows.reduce((sum, row) => sum + row.outstanding, 0)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCostCenterStatement(req, res, next) {
  try {
    const vouchers = await AccountingVoucher.find(await voucherReportFilter(req)).sort({ date: 1, createdAt: 1 }).lean();
    const centerMap = new Map();

    for (const voucher of vouchers) {
      for (const line of voucher.lines || []) {
        const costCenter = String(line.costCenter || '').trim();
        if (!costCenter) continue;
        const current = centerMap.get(costCenter) || {
          costCenter,
          debit: 0,
          credit: 0,
          voucherCount: 0,
          lines: [],
        };
        if (line.side === 'debit') current.debit = rounded(current.debit + line.amount);
        if (line.side === 'credit') current.credit = rounded(current.credit + line.amount);
        current.voucherCount += 1;
        current.lines.push({
          date: voucher.date,
          voucherType: voucher.voucherType,
          voucherNo: voucher.voucherNo,
          ledgerName: line.ledgerName,
          side: line.side,
          amount: rounded(line.amount),
          narration: line.narration || voucher.narration,
        });
        centerMap.set(costCenter, current);
      }
    }

    const rows = Array.from(centerMap.values())
      .map((row) => ({ ...row, net: rounded(row.debit - row.credit) }))
      .sort((a, b) => a.costCenter.localeCompare(b.costCenter));

    res.json({
      rows,
      totals: {
        debit: rounded(rows.reduce((sum, row) => sum + row.debit, 0)),
        credit: rounded(rows.reduce((sum, row) => sum + row.credit, 0)),
        net: rounded(rows.reduce((sum, row) => sum + row.net, 0)),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function listCashBookEntries(req, res, next) {
  try {
    const entries = await CashBookEntry.find(await cashBookFilter(req)).sort({ date: 1, createdAt: 1 }).lean();
    res.json({ entries: withCashRunningBalances(entries) });
  } catch (err) {
    next(err);
  }
}

export async function createCashBookEntry(req, res, next) {
  try {
    const payload = normalizeAmountFields(req.body ?? {}, ['receipt', 'payment', 'balance']);
    const entry = await CashBookEntry.create({
      ...payload,
      userId: req.user.id,
      businessId: req.user.businessId,
      branch: await branchValueForRecord(req),
    });
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
}

export async function updateCashBookEntry(req, res, next) {
  try {
    const payload = normalizeAmountFields(req.body ?? {}, ['receipt', 'payment', 'balance']);
    if (req.body?.branch !== undefined) payload.branch = await branchValueForRecord(req);
    const entry = await CashBookEntry.findOneAndUpdate(
      await cashBookFilter(req, { _id: req.params.id }),
      { $set: payload },
      { new: true, runValidators: true },
    ).lean();
    if (!entry) return next(httpError(404, 'Cash book entry not found'));
    res.json({ entry });
  } catch (err) {
    next(err);
  }
}

export async function deleteCashBookEntry(req, res, next) {
  try {
    const entry = await CashBookEntry.findOneAndDelete(await cashBookFilter(req, { _id: req.params.id })).lean();
    if (!entry) return next(httpError(404, 'Cash book entry not found'));
    res.json({ message: 'Cash book entry deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listBankBookEntries(req, res, next) {
  try {
    const baseFilter = await bankBookFilter(req);
    const banks = await BankBookEntry.distinct('bank', baseFilter);
    const bank = req.query.bank || banks[0] || '';
    const filter = { ...baseFilter, ...(bank ? { bank } : {}) };
    const entries = await BankBookEntry.find(filter).sort({ date: 1, createdAt: 1 }).lean();
    const first = entries[0] ?? {};

    res.json({
      banks,
      bank,
      accountNo: first.accountNo ?? '',
      ifsc: first.ifsc ?? '',
      accountType: first.accountType ?? '',
      entries: withBankRunningBalances(entries),
    });
  } catch (err) {
    next(err);
  }
}

export async function getBankReconciliation(req, res, next) {
  try {
    const baseFilter = await bankBookFilter(req);
    const bankNames = await BankBookEntry.distinct('bank', baseFilter);
    const vouchers = await AccountingVoucher.find(await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted' })).lean();
    const banks = [...new Set([...bankNames, ...voucherBankEntries(vouchers).map((row) => row.bank)])].sort();
    const bank = req.query.bank || banks[0] || '';
    const { from, to, status = 'All' } = req.query;
    const filter = { ...baseFilter, ...(bank ? { bank } : {}) };
    const legacy = await BankBookEntry.find(filter).sort({ date: 1, createdAt: 1 }).lean();
    const entries = [...legacy, ...voucherBankEntries(vouchers, legacy)]
      .filter((row) => (!bank || row.bank === bank) && (!from || row.date >= from) && (!to || row.date <= to)
        && (status !== 'Cleared' || row.reconciled) && (status !== 'Uncleared' || !row.reconciled))
      .sort((a, b) => a.date.localeCompare(b.date) || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
    const activeEntries = entries.filter((entry) => !['OB', 'CB'].includes(entry.vchType));
    const first = entries[0] ?? {};
    const bookBalance = rounded(activeEntries.reduce((sum, entry) => sum + Number(entry.deposit || 0) - Number(entry.withdrawal || 0), 0));
    const clearedBalance = rounded(activeEntries
      .filter((entry) => entry.reconciled)
      .reduce((sum, entry) => sum + Number(entry.deposit || 0) - Number(entry.withdrawal || 0), 0));

    res.json({
      banks,
      bank,
      accountNo: first.accountNo ?? '',
      ifsc: first.ifsc ?? '',
      accountType: first.accountType ?? '',
      entries,
      summary: {
        totalEntries: activeEntries.length,
        clearedEntries: activeEntries.filter((entry) => entry.reconciled).length,
        unclearedEntries: activeEntries.filter((entry) => !entry.reconciled).length,
        bookBalance,
        clearedBalance,
        difference: rounded(bookBalance - clearedBalance),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateBankReconciliation(req, res, next) {
  try {
    const reconciled = Boolean(req.body?.reconciled);
    const payload = {
      reconciled,
      bankDate: reconciled ? String(req.body?.bankDate || '').trim() : '',
      bankReference: reconciled ? String(req.body?.bankReference || '').trim() : '',
      reconciliationNotes: String(req.body?.reconciliationNotes || '').trim(),
      reconciledAt: reconciled ? new Date() : null,
    };
    if (reconciled && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.bankDate) || !Number.isFinite(Date.parse(payload.bankDate)) || new Date(payload.bankDate).toISOString().slice(0, 10) !== payload.bankDate)) {
      throw httpError(400, 'Enter a valid bank cleared date');
    }
    if (String(req.params.id).startsWith('voucher:')) {
      const parsed = parseVoucherBankEntryId(req.params.id);
      if (!parsed) throw httpError(400, 'Invalid bank voucher reference');
      const filter = await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' }, { _id: parsed.voucherId, status: 'Posted' });
      const voucher = await AccountingVoucher.findOne(filter).lean();
      if (!voucher || !voucherBankEntries([voucher]).some((row) => row.bank === parsed.bank)) throw httpError(404, 'Posted bank voucher not found');
      const bankReconciliations = [...(voucher.bankReconciliations || []).filter((row) => row.bank !== parsed.bank), { bank: parsed.bank, ...payload }];
      const saved = await AccountingVoucher.findOneAndUpdate(
        { ...filter, updatedAt: voucher.updatedAt, ...(voucher.__v === undefined ? {} : { __v: voucher.__v }) },
        { $set: { bankReconciliations }, $inc: { __v: 1 } }, { new: true, runValidators: true },
      ).lean();
      if (!saved) throw httpError(409, 'Voucher changed while reconciling. Refresh and try again.');
      return res.json({ entry: voucherBankEntries([saved]).find((row) => row.bank === parsed.bank) });
    }
    const entry = await BankBookEntry.findOneAndUpdate(
      await bankBookFilter(req, { _id: req.params.id }),
      { $set: payload },
      { new: true, runValidators: true },
    ).lean();
    if (!entry) return next(httpError(404, 'Bank book entry not found'));
    res.json({ entry });
  } catch (err) {
    next(err);
  }
}

export async function createBankBookEntry(req, res, next) {
  try {
    const payload = normalizeAmountFields(req.body ?? {}, ['deposit', 'withdrawal', 'balance']);
    const entry = await BankBookEntry.create({
      ...payload,
      userId: req.user.id,
      businessId: req.user.businessId,
      branch: await branchValueForRecord(req),
    });
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
}

export async function updateBankBookEntry(req, res, next) {
  try {
    const payload = normalizeAmountFields(req.body ?? {}, ['deposit', 'withdrawal', 'balance']);
    if (req.body?.branch !== undefined) payload.branch = await branchValueForRecord(req);
    const entry = await BankBookEntry.findOneAndUpdate(
      await bankBookFilter(req, { _id: req.params.id }),
      { $set: payload },
      { new: true, runValidators: true },
    ).lean();
    if (!entry) return next(httpError(404, 'Bank book entry not found'));
    res.json({ entry });
  } catch (err) {
    next(err);
  }
}

export async function deleteBankBookEntry(req, res, next) {
  try {
    const entry = await BankBookEntry.findOneAndDelete(await bankBookFilter(req, { _id: req.params.id })).lean();
    if (!entry) return next(httpError(404, 'Bank book entry not found'));
    res.json({ message: 'Bank book entry deleted' });
  } catch (err) {
    next(err);
  }
}

export async function resetAccountingFromInvoices(req, res, next) {
  try {
    const posted = await AccountingVoucher.findOne(await branchScopedQuery(req, { model: AccountingVoucher, ownerField: 'userId' }, { status: 'Posted' })).lean();
    if (posted) throw httpError(409, 'Accounting reset cannot delete posted vouchers. Correct or reverse their source documents to preserve accounting history');
    const postingFilter = await branchScopedQuery(req, { model: AccountingPosting, ownerField: 'userId' });
    const voucherFilter = await voucherReportFilter({ ...req, query: { ...req.query, status: 'All' } });
    const journalFilter = await journalEntriesFilter(req);
    const cashFilter = await cashBookFilter(req);
    const bankFilter = await bankBookFilter(req);
    const ledgerFilter = await ledgerAccountsFilter(req);

    const [
      postingResult,
      voucherResult,
      journalResult,
      cashBookResult,
      bankBookResult,
      ledgerResult,
    ] = await Promise.all([
      AccountingPosting.deleteMany(postingFilter),
      AccountingVoucher.deleteMany(voucherFilter),
      JournalEntry.deleteMany(journalFilter),
      CashBookEntry.deleteMany(cashFilter),
      BankBookEntry.deleteMany(bankFilter),
      LedgerAccount.deleteMany(ledgerFilter),
    ]);

    const invoices = await Invoice.find(await branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }, {
      documentType: { $in: CURRENT_BILL_DOCUMENT_TYPES },
    })).sort({ createdAt: 1, _id: 1 });

    const invoiceMap = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const rebuildErrors = [];
    let invoicesPosted = 0;
    let paymentsPosted = 0;

    for (const invoice of invoices) {
      try {
        const posting = await DOCUMENT_POSTERS[invoice.documentType](invoice, req.user);
        if (posting) invoicesPosted += 1;
      } catch (err) {
        rebuildErrors.push({
          source: 'invoice',
          number: invoice.number,
          message: err.message || 'Unable to post invoice',
        });
      }
    }

    if (invoiceIds.length) {
      const payments = await Payment.find(await branchScopedQuery(req, { model: Payment, ownerField: 'userId' }, {
        invoiceId: { $in: invoiceIds },
      })).sort({ createdAt: 1, _id: 1 });
      for (const payment of payments) {
        try {
          const posting = await postPaymentAccounting(payment, invoiceMap.get(String(payment.invoiceId)), req.user);
          if (posting) paymentsPosted += 1;
        } catch (err) {
          rebuildErrors.push({
            source: 'payment',
            number: payment.invoiceNumber || String(payment._id),
            message: err.message || 'Unable to post payment',
          });
        }
      }
    }

    res.json({
      message: rebuildErrors.length
        ? 'Accounting reset completed with some skipped records'
        : 'Accounting reset and rebuilt from current invoices',
      deleted: {
        postings: postingResult.deletedCount || 0,
        vouchers: voucherResult.deletedCount || 0,
        journalEntries: journalResult.deletedCount || 0,
        cashBookEntries: cashBookResult.deletedCount || 0,
        bankBookEntries: bankBookResult.deletedCount || 0,
        ledgers: ledgerResult.deletedCount || 0,
      },
      rebuilt: {
        invoices: invoicesPosted,
        payments: paymentsPosted,
      },
      errors: rebuildErrors,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAccountingSummary(req, res, next) {
  try {
    const [ledgerCount, journalCount, voucherCount, cashBookCount, bankBookCount] = await Promise.all([
      LedgerAccount.countDocuments(await ledgerAccountsFilter(req)),
      JournalEntry.countDocuments(await journalEntriesFilter(req)),
      AccountingVoucher.countDocuments(await voucherReportFilter({ ...req, query: { ...req.query, status: 'All' } })),
      CashBookEntry.countDocuments(await cashBookFilter(req)),
      BankBookEntry.countDocuments(await bankBookFilter(req)),
    ]);

    res.json({
      module: 'Accounting',
      counts: {
        ledgers: ledgerCount,
        journalEntries: journalCount,
        vouchers: voucherCount,
        cashBookEntries: cashBookCount,
        bankBookEntries: bankBookCount,
      },
      endpoints: [
        '/vouchers',
        '/vouchers/types',
        '/vouchers/next-number',
        '/ledger',
        '/journal-entries',
        '/trial-balance',
        '/pnl',
        '/balance-sheet',
        '/cash-book',
        '/bank-book',
      ],
    });
  } catch (err) {
    next(err);
  }
}
