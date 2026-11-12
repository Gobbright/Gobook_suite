import { trialMoney } from './automobileTrialBalance.js';
export function reconciliationRows(entries, changes, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  return entries.filter((row) => !['OB', 'CB'].includes(row.vchType)).map((row) => ({ ...row, ...(changes[row._id] || {}) })).filter((row) => (!filters.from || row.date >= filters.from) && (!filters.to || row.date <= filters.to) && (!filters.status || (filters.status === 'cleared') === Boolean(row.reconciled)) && [row.particulars, row.vchNo, row.bankReference, row.reconciliationNotes, row.deposit, row.withdrawal].join(' ').toLowerCase().includes(query));
}
export function reconciliationTotals(rows) {
  const total = (subset, field) => trialMoney(subset.reduce((sum, row) => sum + Number(row[field] || 0), 0));
  const cleared = rows.filter((row) => row.reconciled); const uncleared = rows.filter((row) => !row.reconciled);
  return { cleared: cleared.length, uncleared: uncleared.length, credits: total(rows, 'deposit'), debits: total(rows, 'withdrawal'), clearedAmount: trialMoney(total(cleared, 'deposit') + total(cleared, 'withdrawal')), unclearedAmount: trialMoney(total(uncleared, 'deposit') + total(uncleared, 'withdrawal')), outstandingNet: trialMoney(total(uncleared, 'deposit') - total(uncleared, 'withdrawal')) };
}
export function reconciliationPayload(row) {
  if (row.reconciled && (!/^\d{4}-\d{2}-\d{2}$/.test(row.bankDate || '') || !Number.isFinite(Date.parse(row.bankDate)))) throw new Error(`Enter a bank date for ${row.vchNo}.`);
  return { reconciled: Boolean(row.reconciled), bankDate: row.reconciled ? row.bankDate : '', bankReference: row.reconciled ? String(row.bankReference || '').trim() : '', reconciliationNotes: String(row.reconciliationNotes || '').trim() };
}
