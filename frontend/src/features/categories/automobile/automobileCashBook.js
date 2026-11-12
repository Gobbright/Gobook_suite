import { trialMoney } from './automobileTrialBalance.js';
export const isCashAccount = (account) => /cash/i.test(account.group || '');
export function cashBookEvents(accounts, vouchers, legacy) {
  const cashNames = new Set(accounts.filter(isCashAccount).map((account) => account.name));
  const events = [];
  for (const voucher of vouchers) {
    if (voucher.status !== 'Posted') continue;
    const cashLines = (voucher.lines || []).filter((line) => cashNames.has(line.ledgerName) || /cash/i.test(line.ledgerGroup || ''));
    const net = trialMoney(cashLines.reduce((sum, line) => sum + Number(line.amount || 0) * (line.side === 'debit' ? 1 : line.side === 'credit' ? -1 : 0), 0));
    if (!net) continue;
    events.push({ ...voucher, key: `voucher-${voucher._id}`, voucherId: voucher._id, vchNo: voucher.voucherNo, vchType: voucher.voucherType, receipt: Math.max(net, 0), payment: Math.max(-net, 0), particulars: [...new Set((voucher.lines || []).filter((line) => !cashLines.includes(line)).map((line) => line.ledgerName))].join(', ') || voucher.partyName || 'Cash movement', narration: voucher.narration || '', legacy: false });
  }
  const numbers = new Set(events.map((row) => row.vchNo)); const sources = new Set(events.filter((row) => row.sourceType && row.sourceId).map((row) => `${row.sourceType}:${row.sourceId}`));
  for (const row of legacy) {
    if (row.vchType !== 'OB' && (numbers.has(row.vchNo) || row.sourceType && row.sourceId && sources.has(`${row.sourceType}:${row.sourceId}`))) continue;
    events.push({ ...row, key: `legacy-${row._id}`, legacy: true, receipt: Number(row.receipt) || 0, payment: Number(row.payment) || 0, narration: '', opening: row.vchType === 'OB' });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(b.opening)) - Number(Boolean(a.opening)) || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.key.localeCompare(b.key));
}
export function calculateCashBook(accounts, events, filters) {
  const balances = new Map();
  accounts.filter(isCashAccount).forEach((account) => { const branch = account.branch || ''; if (!filters.branch || branch === filters.branch) balances.set(branch, trialMoney((balances.get(branch) || 0) + Number(account.opening || 0))); });
  const sumBalances = () => trialMoney([...balances.values()].reduce((sum, amount) => sum + amount, 0));
  let opening = sumBalances(); let receipts = 0; let payments = 0; let adjustments = 0; const rows = []; const daily = new Map();
  for (const event of events) {
    if (filters.branch && event.branch !== filters.branch || filters.to && event.date > filters.to) continue;
    const before = sumBalances(); const branch = event.branch || ''; let adjustment = 0;
    if (event.opening) { adjustment = trialMoney(Number(event.balance || 0) - (balances.get(branch) || 0)); balances.set(branch, trialMoney(event.balance)); }
    else balances.set(branch, trialMoney((balances.get(branch) || 0) + event.receipt - event.payment));
    const balance = sumBalances();
    if (filters.from && event.date < filters.from) { opening = balance; continue; }
    const receipt = event.opening ? 0 : event.receipt; const payment = event.opening ? 0 : event.payment;
    receipts = trialMoney(receipts + receipt); payments = trialMoney(payments + payment); adjustments = trialMoney(adjustments + adjustment);
    const row = { ...event, receipt, payment, balance, adjustment }; rows.push(row);
    const day = daily.get(event.date) || { date: event.date, opening: before, receipts: 0, payments: 0, adjustments: 0, receiptCount: 0, paymentCount: 0, closing: before };
    day.receipts = trialMoney(day.receipts + receipt); day.payments = trialMoney(day.payments + payment); day.adjustments = trialMoney(day.adjustments + adjustment); day.closing = balance; if (receipt) day.receiptCount++; if (payment) day.paymentCount++; daily.set(event.date, day);
  }
  const heads = new Map(); rows.filter((row) => row.payment > 0).forEach((row) => heads.set(row.particulars, trialMoney((heads.get(row.particulars) || 0) + row.payment)));
  return { rows, opening, receipts, payments, adjustments, closing: sumBalances(), daily: [...daily.values()], heads: [...heads].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount) };
}
export function cashDaySummary(report, date) {
  const before = report.rows.filter((row) => row.date < date).at(-1)?.balance ?? report.opening;
  return report.daily.find((day) => day.date === date) || { date, opening: before, receipts: 0, payments: 0, adjustments: 0, closing: before, receiptCount: 0, paymentCount: 0 };
}
