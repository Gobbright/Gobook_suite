import { previousTrialPeriod, trialMoney } from './automobileTrialBalance.js';
export function pnlCategory(group, name = '') {
  const text = String(group || '').toLowerCase();
  if (/indirect income|other income|non.operating income/.test(text)) return 'otherIncome';
  if (/income|revenue|sales account/.test(text) || (!text && /^(sales|sales returns)$/i.test(name))) return 'revenue';
  if (/indirect expense|operating expense|administrative|overhead/.test(text)) return 'expenses';
  if (/direct expense|cost of goods|cost of sales|purchase account|^cogs$/.test(text) || (!text && /^(purchases|purchase returns)$/i.test(name))) return 'directCosts';
  if (/expense/.test(text)) return 'expenses';
  return '';
}
export function pnlComparison(from, to, mode) {
  if (mode === 'period') return previousTrialPeriod(from, to);
  const shift = (value) => {
    const day = new Date(`${value}T00:00:00Z`); if (!Number.isFinite(day.getTime())) return '';
    const year = day.getUTCFullYear() - 1; const month = day.getUTCMonth();
    return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate()))).toISOString().slice(0, 10);
  };
  return from && to && from <= to ? { from: shift(from), to: shift(to) } : null;
}
export function pnlChange(current, previous) { return previous === 0 ? null : (current - previous) / Math.abs(previous) * 100; }
const emptyTotals = () => ({ revenue: 0, directCosts: 0, expenses: 0, otherIncome: 0 });
const finishTotals = (totals) => {
  for (const key of Object.keys(totals)) totals[key] = trialMoney(totals[key]);
  const grossProfit = trialMoney(totals.revenue - totals.directCosts); const netProfit = trialMoney(grossProfit - totals.expenses + totals.otherIncome);
  return { ...totals, grossProfit, netProfit, grossMargin: totals.revenue > 0 ? grossProfit / totals.revenue * 100 : null, netMargin: totals.revenue > 0 ? netProfit / totals.revenue * 100 : null };
};
export function calculatePnl(accounts, vouchers, filters, interval = 'monthly') {
  const accountGroups = new Map(accounts.map((account) => [account.name, account.group]));
  const totals = emptyTotals(); const groups = { revenue: new Map(), directCosts: new Map(), expenses: new Map(), otherIncome: new Map() }; const branches = new Map(); const periods = new Map(); const unclassified = new Set(); let posted = 0;
  // Include empty months in the selected range so gaps remain visible.
  const start = new Date(`${filters.from}T00:00:00Z`); const end = new Date(`${filters.to}T00:00:00Z`);
  if (Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && start <= end) {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    for (let i = 0; cursor <= end && i < 1200; i++) { const key = cursor.toISOString().slice(0, 7); periods.set(key, emptyTotals()); cursor.setUTCMonth(cursor.getUTCMonth() + 1); }
  }
  for (const voucher of vouchers) {
    if (voucher.status !== 'Posted' || (filters.from && voucher.date < filters.from) || (filters.to && voucher.date > filters.to) || (filters.branch && voucher.branch !== filters.branch)) continue;
    posted++;
    for (const line of voucher.lines || []) {
      if (!['debit', 'credit'].includes(line.side)) continue;
      const category = pnlCategory(accountGroups.get(line.ledgerName) || line.ledgerGroup, line.ledgerName);
      if (!category) { if (!/asset|liabil|capital|equity|cash|bank|debtor|creditor|receiv|payab|tax|gst|duties|loan|stock|inventory|deposit|advance|reserve|provision|contra|suspense/i.test(accountGroups.get(line.ledgerName) || line.ledgerGroup || '')) unclassified.add(line.ledgerName); continue; }
      const amount = trialMoney(Number(line.amount) * (line.side === 'debit' ? 1 : -1) * (['revenue', 'otherIncome'].includes(category) ? -1 : 1));
      totals[category] += amount; groups[category].set(line.ledgerName, trialMoney((groups[category].get(line.ledgerName) || 0) + amount));
      const branch = voucher.branch || 'Unassigned'; const branchTotals = branches.get(branch) || emptyTotals(); branchTotals[category] += amount; branches.set(branch, branchTotals);
      const key = voucher.date.slice(0, 7); const period = periods.get(key) || emptyTotals(); period[category] += amount; periods.set(key, period);
    }
  }
  let trend = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => ({ key, label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }), ...finishTotals(values) }));
  if (interval === 'quarterly') {
    const quarters = new Map();
    for (const point of trend) { const [year, month] = point.key.split('-').map(Number); const key = `${year}-Q${Math.ceil(month / 3)}`; const entry = quarters.get(key) || emptyTotals(); for (const category of Object.keys(groups)) entry[category] += point[category]; quarters.set(key, entry); }
    trend = [...quarters].map(([key, values]) => ({ key, label: key, ...finishTotals(values) }));
  }
  return { totals: finishTotals(totals), accounts: Object.fromEntries(Object.entries(groups).map(([key, map]) => [key, [...map].map(([name, amount]) => ({ name, amount })).sort((a, b) => a.name.localeCompare(b.name))])), branches: [...branches].map(([name, values]) => ({ name, ...finishTotals(values) })).sort((a, b) => b.netProfit - a.netProfit), trend, posted, unclassified: [...unclassified] };
}
