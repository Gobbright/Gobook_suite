export function journalEntryError(form, ledgers, posting = true) {
  const date = new Date(`${form.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== form.date) return 'Select a valid journal date.';
  if (form.financialYear) {
    const start = new Date(`${form.fyStart || '01 April'} 2000 12:00:00 GMT`);
    const before = date.getUTCMonth() < start.getUTCMonth() || date.getUTCMonth() === start.getUTCMonth() && date.getUTCDate() < start.getUTCDate();
    const year = date.getUTCFullYear() - Number(before);
    if (`${year}-${String(year + 1).slice(-2)}` !== form.financialYear) return 'Journal date is outside the selected financial year.';
  }
  const lines = form.lines.filter((line) => line.ledgerName?.trim() || line.amount !== '' && line.amount != null || line.narration?.trim() || line.costCenter?.trim() || line.billRef?.trim() || line.allocations?.length);
  if (lines.length < 2 || lines.length > 200) return 'Enter between two and 200 valid journal lines.';
  for (const line of lines) {
    if (!ledgers.some((ledger) => ledger.active !== false && ledger.name === line.ledgerName && (!line.ledgerId || ledger._id === line.ledgerId))) return 'Select an active ledger for every journal line.';
    const amount = Number(line.amount);
    if (!['debit', 'credit'].includes(line.side) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12 || Math.abs(Math.round(amount * 100) / 100 - amount) > 0.000001) return 'Enter positive amounts with at most two decimal places.';
    if (line.allocations?.length && (line.allocations.some((allocation) => !['New Reference', 'Against Reference', 'Advance', 'On Account'].includes(allocation.type) || !Number.isFinite(Number(allocation.amount)) || Number(allocation.amount) <= 0 || allocation.type !== 'On Account' && !allocation.reference?.trim()) || Math.round(line.allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0) * 100) !== Math.round(amount * 100))) return 'Bill allocations must have valid references and total the line amount.';
  }
  if (new Set(lines.map((line) => line.ledgerName)).size < 2) return 'Use at least two different ledger accounts.';
  const difference = lines.reduce((sum, line) => sum + Math.round(Number(line.amount) * 100) * (line.side === 'debit' ? 1 : -1), 0);
  return posting && difference !== 0 ? 'Debit and credit totals must match before posting.' : '';
}

export function journalLedgerOption(ledger) {
  const balance = Number(ledger.currentBalance ?? Number(ledger.opening || 0) + Number(ledger.debit || 0) - Number(ledger.credit || 0));
  const group = ledger.accountingGroup || ledger.group || '';
  return { value: ledger.name, label: ledger.name, searchText: `${ledger.name} ${group}`, badge: `${group} · ${Math.abs(balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${balance < 0 ? 'Cr' : 'Dr'}` };
}
