export const ledgerGroupName = (group) => ({ customer: 'Sundry Debtors', customers: 'Sundry Debtors', supplier: 'Sundry Creditors', suppliers: 'Sundry Creditors' }[String(group).toLowerCase()] || group);

export function filterLedgerRows(rows, filters) {
  return rows.filter((row) => {
    if (row.openingRow) return true;
    if (row.status && row.status !== 'Posted') return false;
    if (filters.type && row.voucherType !== filters.type) return false;
    if (filters.reference && ![row.referenceNo, row.billRef, row.sourceNumber, ...(row.allocations || []).map((allocation) => allocation.reference)].includes(filters.reference)) return false;
    if (filters.costCenter && row.costCenter !== filters.costCenter) return false;
    if (filters.branch && row.branch !== filters.branch) return false;
    if (filters.transactionStatus === 'Reconciled' && !row.reconciled) return false;
    if (filters.transactionStatus === 'Unreconciled' && (!row.reconciliationApplicable || row.reconciled)) return false;
    const amount = Math.max(Number(row.debit) || 0, Number(row.credit) || 0);
    if (filters.minAmount !== '' && filters.minAmount !== undefined && amount < Number(filters.minAmount)) return false;
    if (filters.maxAmount !== '' && filters.maxAmount !== undefined && amount > Number(filters.maxAmount)) return false;
    return true;
  });
}

export function ledgerYearOptions(fyStart = '01 April', years = [], date = new Date()) {
  const start = new Date(`${fyStart} 2000 12:00:00 GMT`);
  const month = Number.isFinite(start.getTime()) ? start.getUTCMonth() : 3;
  const day = Number.isFinite(start.getTime()) ? start.getUTCDate() : 1;
  const startYear = date.getFullYear() - Number(date.getMonth() < month || date.getMonth() === month && date.getDate() < day);
  return [...new Set([...years, ...[startYear - 1, startYear, startYear + 1].map((year) => `${year}-${String(year + 1).slice(-2)}`)])].sort().reverse();
}

export function ledgerYearDateRange(year, fyStart = '01 April') {
  if (!/^\d{4}-\d{2}$/.test(year || '')) return {};
  const from = new Date(`${fyStart} ${year.slice(0, 4)} 12:00:00 GMT`);
  if (!Number.isFinite(from.getTime())) return {};
  const to = new Date(from); to.setUTCFullYear(to.getUTCFullYear() + 1); to.setUTCDate(to.getUTCDate() - 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function sortLedgerRows(rows, field = 'date', descending = false) {
  const positions = new Map(rows.map((row, index) => [row, index]));
  return [...rows].sort((first, second) => {
    const compared = ['debit', 'credit', 'balance'].includes(field) ? Number(first[field] || 0) - Number(second[field] || 0) : String(first[field] || '').localeCompare(String(second[field] || ''), undefined, { numeric: true });
    return (compared || positions.get(first) - positions.get(second)) * (descending ? -1 : 1);
  });
}
