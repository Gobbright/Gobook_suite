import { calculateCashBook, cashBookEvents, isCashAccount } from '../../../automobile/automobileCashBook.js';

export { isCashAccount };
export function calculateCashReport(accounts, vouchers, legacy, filters) {
  const cashAccounts = accounts.filter(isCashAccount);
  const posted = vouchers.filter((voucher) => voucher.status === 'Posted');
  const cashVouchers = posted.filter((voucher) => (voucher.lines || []).some((line) => cashAccounts.some((account) => account.name === line.ledgerName) || /cash/i.test(line.ledgerGroup || '')));
  const numbers = new Set(cashVouchers.map((row) => row.voucherNo));
  const sources = new Set(cashVouchers.filter((row) => row.sourceType && row.sourceId).map((row) => `${row.sourceType}:${row.sourceId}`));
  const historical = legacy.filter((row) => row.vchType === 'OB' || !numbers.has(row.vchNo) && !(row.sourceType && row.sourceId && sources.has(`${row.sourceType}:${row.sourceId}`)));
  if (!filters.account) return calculateCashBook(cashAccounts, cashBookEvents(cashAccounts, posted, historical), filters);
  if (filters.account === '__legacy') return calculateCashBook([], cashBookEvents([], [], historical), filters);
  const selected = cashAccounts.filter((account) => account.name === filters.account);
  // Keep counterpart lines for particulars, but only the selected cash ledger affects its balance.
  const scoped = posted.map((voucher) => ({ ...voucher, lines: (voucher.lines || []).map((line) => ({ ...line, ledgerGroup: line.ledgerName === filters.account ? 'Cash-In-Hand' : '' })) }));
  return calculateCashBook(selected, cashBookEvents(selected, scoped, []), filters);
}

export function cashPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  return [...new Set([1, ...[current - 1, current, current + 1].filter((value) => value > 1 && value < total), total])].flatMap((value, index, values) => index && value - values[index - 1] > 1 ? ['…', value] : [value]);
}
