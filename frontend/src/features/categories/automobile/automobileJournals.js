export const roundJournal = (value) => Math.round((Number(value) || 0) * 100) / 100;
export const newJournalLine = () => ({ key: crypto.randomUUID(), ledgerName: '', debit: '', credit: '', costCenter: '', narration: '', billRef: '' });
export function journalTotals(lines) {
  const debit = roundJournal(lines.reduce((sum, line) => sum + roundJournal(line.debit), 0));
  const credit = roundJournal(lines.reduce((sum, line) => sum + roundJournal(line.credit), 0));
  return { debit, credit, difference: roundJournal(debit - credit), balanced: debit > 0 && debit === credit };
}
export function journalError(form, accounts, status) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isFinite(Date.parse(form.date))) return 'Select a posting date.';
  if (!form.narration.trim()) return 'Enter a narration for this journal.';
  if (form.lines.length < 2) return 'Add at least two journal lines.';
  for (let i = 0; i < form.lines.length; i++) {
    const line = form.lines[i];
    if (!accounts.some((account) => account.name === line.ledgerName)) return `Select an account for line ${i + 1}.`;
    const dr = Number(line.debit || 0); const cr = Number(line.credit || 0);
    if (![dr, cr].every((amount) => Number.isFinite(amount) && amount >= 0) || (roundJournal(dr) > 0) === (roundJournal(cr) > 0)) return `Enter either a debit or a credit greater than zero on line ${i + 1}.`;
    if (Math.abs(dr - roundJournal(dr)) > 0.000001 || Math.abs(cr - roundJournal(cr)) > 0.000001) return `Use at most two decimal places on line ${i + 1}.`;
  }
  if (status === 'Posted' && !journalTotals(form.lines).balanced) return 'Debit and credit totals must match before posting.';
  return '';
}
export function journalPayload(form, accounts, status) {
  return { voucherType: 'Journal', voucherNo: form.voucherNo, date: form.date, branch: form.branch, referenceNo: form.referenceNo.trim(), narration: form.narration.trim(), status, lines: form.lines.map((line) => {
    const account = accounts.find((row) => row.name === line.ledgerName);
    return { ledgerName: line.ledgerName, ledgerGroup: account?.group || '', ledgerId: account?._id, side: roundJournal(line.debit) > 0 ? 'debit' : 'credit', amount: roundJournal(line.debit) || roundJournal(line.credit), costCenter: line.costCenter.trim(), narration: line.narration.trim(), billRef: line.billRef || '' };
  }) };
}
export function journalForm(voucher) {
  return { voucherNo: voucher.voucherNo || '', date: voucher.date, branch: voucher.branch || '', referenceNo: voucher.referenceNo || '', narration: voucher.narration || '', lines: (voucher.lines || []).map((line) => ({ ...newJournalLine(), ledgerName: line.ledgerName, debit: line.side === 'debit' ? line.amount : '', credit: line.side === 'credit' ? line.amount : '', costCenter: line.costCenter || '', narration: line.narration || '', billRef: line.billRef || '' })) };
}
export function journalHistory(vouchers, legacy) {
  const identity = (row, number) => JSON.stringify([String(row.userId || ''), number, row.date]);
  const numbers = new Set(vouchers.map((row) => identity(row, row.voucherNo)));
  return [...vouchers.map((row) => ({ ...row, key: `voucher-${row._id}` })), ...legacy.filter((row) => !numbers.has(identity(row, row.entryNo))).map((row) => ({ ...row, legacy: true, key: `legacy-${row._id}`, voucherNo: row.entryNo, narration: row.particulars }))].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}
