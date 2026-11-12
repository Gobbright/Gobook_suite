import { calculateCashBook } from './automobileCashBook.js';
import { trialMoney } from './automobileTrialBalance.js';
export const isBankAccount = (account) => /bank|overdraft/i.test(account.group || '') && !/loan/i.test(account.group || '');
export function bankBookSources(accounts, vouchers, legacy) {
  const bankNames = new Set(accounts.filter(isBankAccount).map((account) => account.name));
  legacy.forEach((row) => bankNames.add(row.bank));
  vouchers.forEach((voucher) => (voucher.lines || []).forEach((line) => { if (isBankAccount({ group: line.ledgerGroup })) bankNames.add(line.ledgerName); }));
  const events = [];
  for (const voucher of vouchers) {
    if (voucher.status !== 'Posted') continue;
    for (const bank of bankNames) {
      const own = (voucher.lines || []).filter((line) => line.ledgerName === bank);
      const net = trialMoney(own.reduce((sum, line) => sum + Number(line.amount || 0) * (line.side === 'debit' ? 1 : line.side === 'credit' ? -1 : 0), 0));
      if (!net) continue;
      const other = (voucher.lines || []).filter((line) => line.ledgerName !== bank);
      const transfer = voucher.voucherType === 'Contra' || other.some((line) => bankNames.has(line.ledgerName) || /cash/i.test(line.ledgerGroup || ''));
      const match = legacy.find((row) => row.bank === bank && !['OB', 'CB'].includes(row.vchType) && (row.vchNo === voucher.voucherNo || row.sourceId && row.sourceType && String(row.sourceId) === String(voucher.sourceId) && row.sourceType === voucher.sourceType));
      const clearing = match || (voucher.bankReconciliations || []).find((row) => row.bank === bank);
      events.push({ ...voucher, key: `voucher-${voucher._id}-${bank}`, voucherId: voucher._id, bank, vchNo: voucher.voucherNo, vchType: voucher.voucherType, particulars: [...new Set(other.map((line) => line.ledgerName))].join(', ') || voucher.partyName || 'Bank movement', receipt: Math.max(net, 0), payment: Math.max(-net, 0), transfer, reconciled: Boolean(clearing?.reconciled), narration: voucher.narration || '', legacy: false });
    }
  }
  for (const row of legacy) {
    const duplicate = !['OB', 'CB'].includes(row.vchType) && events.some((event) => event.bank === row.bank && (event.vchNo === row.vchNo || row.sourceId && row.sourceType && String(event.sourceId) === String(row.sourceId) && event.sourceType === row.sourceType));
    if (duplicate) continue;
    events.push({ ...row, key: `legacy-${row._id}`, receipt: Number(row.deposit) || 0, payment: Number(row.withdrawal) || 0, transfer: row.vchType === 'Contra' || row.vchType === 'Transfer', opening: ['OB', 'CB'].includes(row.vchType), reconciled: Boolean(row.reconciled), legacy: true, narration: row.reconciliationNotes || '' });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.vchType === 'OB' ? 0 : a.vchType === 'CB' ? 2 : 1) - (b.vchType === 'OB' ? 0 : b.vchType === 'CB' ? 2 : 1) || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.key.localeCompare(b.key));
  return { banks: [...bankNames].filter(Boolean).sort(), events };
}
export function calculateBankBook(accounts, events, bank, filters) {
  const masters = accounts.filter((account) => account.name === bank && isBankAccount(account)).map((account) => ({ ...account, group: 'Cash-In-Hand' }));
  const report = calculateCashBook(masters, events.filter((row) => row.bank === bank), filters);
  const transfers = trialMoney(report.rows.filter((row) => row.transfer && !row.opening).reduce((sum, row) => sum + row.receipt - row.payment, 0));
  const receipts = trialMoney(report.rows.filter((row) => !row.transfer).reduce((sum, row) => sum + row.receipt, 0));
  const payments = trialMoney(report.rows.filter((row) => !row.transfer).reduce((sum, row) => sum + row.payment, 0));
  const uncleared = trialMoney(report.rows.filter((row) => !row.opening && row.reconciled === false).reduce((sum, row) => sum + row.receipt + row.payment, 0));
  return { ...report, receipts, payments, transfers, uncleared, untracked: report.rows.filter((row) => !row.opening && row.reconciled === null).length };
}
