import { httpError } from '../utils/httpError.js';
import { voucherFinancialYear, voucherMoney as money } from './voucherRules.js';

export const STANDARD_LEDGER_GROUPS = ['Bank Accounts', 'Cash-In-Hand', 'Fixed Assets', 'Current Assets', 'Current Liabilities', 'Capital Account', 'Sundry Debtors', 'Sundry Creditors', 'Direct Incomes', 'Indirect Incomes', 'Direct Expenses', 'Indirect Expenses', 'Contra'];
export function ledgerCompanyScope(filter, businessId) {
  return businessId ? { ...filter, $and: [...(filter.$and || []), { $or: [{ businessId }, { businessId: { $exists: false } }] }] } : filter;
}
export const canonicalLedgerGroup = (group) => ({ customer: 'Sundry Debtors', customers: 'Sundry Debtors', supplier: 'Sundry Creditors', suppliers: 'Sundry Creditors' }[String(group).toLowerCase()] || group);
export function ledgerCategory(group) {
  group = canonicalLedgerGroup(group);
  if (/debtor|receivable/i.test(group)) return 'Customer';
  if (/creditor|payable/i.test(group)) return 'Supplier';
  if (/income|revenue/i.test(group)) return 'Income';
  if (/expense/i.test(group)) return 'Expenses';
  if (/liabilit|capital|loan/i.test(group)) return 'Liabilities';
  return 'Assets';
}

export function ledgerPeriodBounds(query = {}, fyStart = '01 April') {
  let from = String(query.from || '');
  let to = String(query.to || '');
  if (from) voucherFinancialYear(from, fyStart);
  if (to) voucherFinancialYear(to, fyStart);
  const financialYear = String(query.financialYear || '');
  if (financialYear) {
    if (!/^\d{4}-\d{2}$/.test(financialYear) || Number(financialYear.slice(-2)) !== (Number(financialYear.slice(0, 4)) + 1) % 100) throw httpError(400, 'Select a valid financial year');
    const start = new Date(`${fyStart} ${financialYear.slice(0, 4)} 12:00:00 GMT`);
    if (!Number.isFinite(start.getTime())) throw httpError(400, 'Invalid financial year start');
    const end = new Date(start); end.setUTCFullYear(end.getUTCFullYear() + 1); end.setUTCDate(end.getUTCDate() - 1);
    const firstDay = start.toISOString().slice(0, 10), lastDay = end.toISOString().slice(0, 10);
    if (from && (from < firstDay || from > lastDay) || to && (to < firstDay || to > lastDay)) throw httpError(400, 'Date range falls outside the selected financial year');
    from ||= firstDay; to ||= lastDay;
  }
  if (from && to && from > to) throw httpError(400, 'From Date must be on or before To Date');
  return { from, to, financialYear };
}

export function ledgerSnapshot(account) {
  return Object.fromEntries(['name', 'group', 'accountingGroup', 'code', 'opening', 'active', 'gstin', 'contact', 'phone', 'email', 'address', 'creditLimit', 'creditDays', 'branch'].map((key) => [key, account[key]]));
}

export function ledgerPayload(body, existing = null) {
  const result = {};
  for (const key of ['name', 'group', 'code', 'gstin', 'contact', 'phone', 'email', 'address', 'color']) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string' || body[key].trim().length > (key === 'address' ? 2000 : 200)) throw httpError(400, `Invalid ledger ${key}`);
      result[key] = body[key].trim();
    }
  }
  if (!existing && (!result.name || !result.group) || result.name === '' || result.group === '') throw httpError(400, 'Ledger name and account group are required');
  if (result.group) result.group = canonicalLedgerGroup(result.group);
  if (result.gstin) result.gstin = result.gstin.toUpperCase();
  if (result.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(result.gstin)) throw httpError(400, 'Enter a valid GSTIN');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw httpError(400, 'Enter a valid email address');
  if (result.phone && !/^[+\d\s()-]{5,25}$/.test(result.phone)) throw httpError(400, 'Enter a valid phone number');
  if (result.code !== undefined) result.codeKey = result.code ? result.code.toLowerCase() : undefined;
  for (const key of ['opening', 'creditLimit', 'creditDays']) {
    if (body[key] === undefined) continue;
    if (key === 'creditDays' && body[key] === null) { result[key] = null; continue; }
    const value = Number(body[key]);
    if (!Number.isFinite(value) || Math.abs(value) > 1e12 || key !== 'opening' && value < 0 || key === 'creditDays' && (!Number.isInteger(value) || value > 3650)) throw httpError(400, `Invalid ledger ${key}`);
    result[key] = money(value);
  }
  for (const key of ['debit', 'credit']) if (body[key] !== undefined && Number(body[key]) !== Number(existing?.[key] || 0)) throw httpError(400, 'Debit and credit movements must be created using posted vouchers');
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw httpError(400, 'Ledger active status must be true or false');
    result.active = body.active;
  }
  return result;
}

export function buildLedgerStatement(ledger, vouchers, bounds = {}) {
  const masterOpening = money(ledger.opening || 0);
  let running = bounds.branch && ledger.branch !== bounds.branch ? 0 : masterOpening;
  let opening = running;
  let debitTotal = 0, creditTotal = 0;
  const entries = [];
  const posted = [...vouchers].filter((voucher) => voucher.status === 'Posted' && (!bounds.branch || voucher.branch === bounds.branch)).sort((first, second) => String(first.date).localeCompare(String(second.date)) || (Date.parse(first.createdAt) || 0) - (Date.parse(second.createdAt) || 0) || String(first._id).localeCompare(String(second._id)));
  for (const voucher of posted) {
    if (bounds.to && voucher.date > bounds.to) continue;
    for (const line of voucher.lines || []) {
      if (line.ledgerName !== ledger.name) continue;
      const debit = line.side === 'debit' ? money(line.amount) : 0, credit = line.side === 'credit' ? money(line.amount) : 0;
      running = money(running + debit - credit);
      if (bounds.from && voucher.date < bounds.from) { opening = running; continue; }
      debitTotal = money(debitTotal + debit); creditTotal = money(creditTotal + credit);
      const bank = (voucher.bankReconciliations || []).find((record) => record.bank === ledger.name);
      entries.push({
        voucherId: voucher._id, lineId: line._id, date: voucher.date, financialYear: voucher.financialYear,
        voucherNo: voucher.voucherNo, voucherType: voucher.voucherType, status: 'Posted', branch: voucher.branch || '',
        referenceNo: voucher.referenceNo, billRef: line.billRef || '', allocations: line.allocations || [], costCenter: line.costCenter || '',
        partyName: voucher.partyName, sourceType: voucher.sourceType, sourceId: voucher.sourceId, sourceNumber: voucher.sourceNumber,
        createdAt: voucher.createdAt, particulars: voucher.lines.filter((other) => other.ledgerName !== ledger.name).map((other) => other.ledgerName).join(', '),
        narration: line.narration || voucher.narration || '', voucherNarration: voucher.narration || '',
        debit, credit, balance: running, reconciled: bank?.reconciled === true,
        reconciliationApplicable: /bank/i.test(ledger.accountingGroup || ledger.group), bankDate: bank?.bankDate || '', bankReference: bank?.bankReference || '',
        lines: voucher.lines.map((other) => ({ ledgerName: other.ledgerName, side: other.side, amount: other.amount, narration: other.narration, costCenter: other.costCenter, billRef: other.billRef })),
      });
    }
  }
  return { ledger: { ...ledger, masterOpening, opening }, entries, period: bounds, totals: { opening, debitTotal, creditTotal, closing: running } };
}

export function ledgerOutstanding(vouchers, ledgerName, asOf, creditDays) {
  const comparisonDate = asOf || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const references = new Map();
  for (const voucher of [...vouchers].sort((first, second) => first.date.localeCompare(second.date))) {
    if (voucher.status !== 'Posted' || asOf && voucher.date > asOf) continue;
    for (const line of voucher.lines || []) {
      if (line.ledgerName !== ledgerName) continue;
      const allocations = line.allocations?.length ? line.allocations : [{ reference: line.billRef || voucher.referenceNo || voucher.sourceNumber || voucher.voucherNo, amount: line.amount }];
      for (const allocation of allocations) {
        const reference = allocation.type === 'On Account' ? 'On Account' : allocation.reference;
        if (!reference) continue;
        const current = references.get(reference) || { reference, date: voucher.date, financialYear: voucher.financialYear, balance: 0, vouchers: [] };
        current.balance = money(current.balance + allocation.amount * (line.side === 'debit' ? 1 : -1));
        if (!current.vouchers.some((entry) => String(entry.id) === String(voucher._id))) current.vouchers.push({ id: voucher._id, number: voucher.voucherNo, date: voucher.date });
        references.set(reference, current);
      }
    }
  }
  return [...references.values()].filter((reference) => reference.balance !== 0).map((reference) => {
    let dueDate = '';
    if (Number.isInteger(creditDays) && reference.reference !== 'On Account') { const due = new Date(`${reference.date}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + creditDays); dueDate = due.toISOString().slice(0, 10); }
    return { ...reference, outstanding: Math.abs(reference.balance), side: reference.balance < 0 ? 'Cr' : 'Dr', dueDate, overdue: Boolean(dueDate && dueDate < comparisonDate) };
  });
}
