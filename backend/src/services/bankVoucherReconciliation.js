const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const isBank = (line) => /bank|overdraft/i.test(line.ledgerGroup || '') && !/loan/i.test(line.ledgerGroup || '');

export function parseVoucherBankEntryId(value) {
  const match = /^voucher:([a-f\d]{24}):(.+)$/i.exec(String(value || ''));
  if (!match) return null;
  try { return { voucherId: match[1], bank: decodeURIComponent(match[2]) }; } catch { return null; }
}

// Derive reconciliation rows from posted vouchers; reading never creates book
// entries or ledger movements. Each side of a bank transfer has its own status.
export function voucherBankEntries(vouchers, legacy = []) {
  const entries = [];
  for (const voucher of vouchers) {
    if (voucher.status !== 'Posted') continue;
    const banks = [...new Set((voucher.lines || []).filter(isBank).map((line) => line.ledgerName))];
    for (const bank of banks) {
      const duplicate = legacy.some((row) => row.bank === bank && !['OB', 'CB'].includes(row.vchType) && (
        row.vchNo === voucher.voucherNo || row.sourceId && row.sourceType && String(row.sourceId) === String(voucher.sourceId) && row.sourceType === voucher.sourceType
      ));
      if (duplicate) continue;
      const amount = money((voucher.lines || []).filter((line) => line.ledgerName === bank)
        .reduce((sum, line) => sum + Number(line.amount || 0) * (line.side === 'debit' ? 1 : -1), 0));
      if (!amount) continue;
      const saved = (voucher.bankReconciliations || []).find((row) => row.bank === bank);
      entries.push({
        _id: `voucher:${voucher._id}:${encodeURIComponent(bank)}`,
        bank, date: voucher.date, branch: voucher.branch || '',
        vchNo: voucher.voucherNo, vchType: voucher.voucherType,
        particulars: [...new Set((voucher.lines || []).filter((line) => line.ledgerName !== bank).map((line) => line.ledgerName))].join(', ') || voucher.partyName || 'Bank movement',
        deposit: Math.max(0, amount), withdrawal: Math.max(0, -amount),
        sourceType: 'accounting-voucher', sourceId: voucher._id,
        reconciled: Boolean(saved?.reconciled), bankDate: saved?.bankDate || '',
        bankReference: saved?.bankReference || '', reconciliationNotes: saved?.reconciliationNotes || '',
        reconciledAt: saved?.reconciledAt || null, createdAt: voucher.createdAt,
      });
    }
  }
  return entries;
}
