const number = (value) => Number(value) || 0;
const rounded = (value) => Math.round(number(value) * 100) / 100;
export function ledgerType(account) {
  const group = String(account.accountingGroup || account.group || '').toLowerCase();
  if (/^customers?$/.test(group)) return 'Customers';
  if (/^suppliers?$/.test(group)) return 'Suppliers';
  if (/debtor|receivable/.test(group)) return 'Customers';
  if (/creditor|payable/.test(group)) return 'Suppliers';
  if (/cash/.test(group)) return 'Cash';
  if (/bank/.test(group)) return 'Bank';
  if (/income|revenue|sales account/.test(group)) return 'Income';
  if (/expense|purchase account/.test(group)) return 'Expense';
  if (/asset/.test(group)) return 'Assets';
  if (/liabilit|capital|loan/.test(group)) return 'Liabilities';
  return 'Other';
}
export function ledgerClosing(account) { return Number.isFinite(Number(account.currentBalance)) ? rounded(account.currentBalance) : rounded(number(account.opening) + number(account.debit) - number(account.credit)); }
export function statementPeriod(statement, filters) {
  const entries = [...(statement.entries || [])].filter((entry) => !entry.status || entry.status === 'Posted').sort((a, b) => String(a.date).localeCompare(String(b.date)) || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
  let running = rounded(statement.ledger?.opening); let opening = running; let closing = running; let debit = 0; let credit = 0;
  const periodRows = [];
  entries.forEach((entry, index) => {
    const dr = rounded(entry.debit); const cr = rounded(entry.credit);
    running = rounded(running + dr - cr);
    if (filters.from && entry.date < filters.from) opening = running;
    if (!filters.to || entry.date <= filters.to) closing = running;
    if ((!filters.from || entry.date >= filters.from) && (!filters.to || entry.date <= filters.to)) {
      debit = rounded(debit + dr); credit = rounded(credit + cr);
      periodRows.push({ ...entry, debit: dr, credit: cr, balance: running, key: `${entry.voucherId || 'entry'}-${entry.lineId || index}` });
    }
  });
  if (opening !== 0) periodRows.unshift({ key: 'opening', date: filters.from || '', voucherNo: 'Opening Balance', particulars: 'Opening Balance', debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance: opening, openingRow: true });
  const query = String(filters.search || '').trim().toLowerCase();
  const rows = periodRows.filter((row) => [row.voucherNo, row.particulars, row.narration, row.partyName, row.referenceNo, row.sourceNumber, row.billRef, ...(row.allocations || []).map((allocation) => allocation.reference)].join(' ').toLowerCase().includes(query));
  return { rows, opening, closing, debit, credit, transactions: periodRows.filter((row) => !row.openingRow).length };
}
