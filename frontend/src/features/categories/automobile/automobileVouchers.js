export function voucherAmounts(voucher) {
  const sums = (voucher.lines || []).reduce((result, line) => { if (line.side === 'debit') result.debit += Number(line.amount) || 0; if (line.side === 'credit') result.credit += Number(line.amount) || 0; return result; }, { debit: 0, credit: 0 });
  return { debit: Math.round(Number(voucher.debitTotal ?? sums.debit) * 100) / 100, credit: Math.round(Number(voucher.creditTotal ?? sums.credit) * 100) / 100 };
}
export function filterVouchers(vouchers, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  return vouchers.filter((voucher) => (!filters.from || voucher.date >= filters.from) && (!filters.to || voucher.date <= filters.to) && (!filters.financialYear || voucher.financialYear === filters.financialYear) && (!filters.type || voucher.voucherType === filters.type) && (!filters.status || voucher.status === filters.status) && (!filters.account || voucher.lines?.some((line) => line.ledgerName === filters.account)) && [voucher.voucherNo, voucher.partyName, voucher.narration, voucher.referenceNo, voucher.sourceNumber, ...(voucher.lines || []).flatMap((line) => [line.ledgerName, line.narration, line.billRef, ...(line.allocations || []).map((allocation) => allocation.reference)])].join(' ').toLowerCase().includes(query));
}
export function sourceVoucherLink(voucher) {
  const sources = { invoice: 'invoice', 'purchase-entry': 'purchase-entry', 'sales-return': 'sales-return', 'supplier-return': 'supplier-return', 'credit-note': 'credit-note', 'debit-note': 'debit-note' };
  return voucher.sourceId && sources[voucher.sourceType] ? `/billing/${sources[voucher.sourceType]}/${encodeURIComponent(voucher.sourceId)}/view` : '';
}
