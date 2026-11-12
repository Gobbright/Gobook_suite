import { calculateTrialBalance, financialPeriod, trialMoney } from './automobileTrialBalance.js';
import { pnlCategory, pnlComparison } from './automobilePnl.js';
export function balanceCategory(group, name = '') {
  const text = String(group || '').toLowerCase();
  if (/investment/.test(text)) return /short.term|current asset|current investment/.test(text) && !/non.current/.test(text) ? 'currentAssets' : 'fixedAssets';
  if (/long.term.*(deposit|advance)|capital work|work.in.progress/.test(text)) return 'fixedAssets';
  if (/fixed asset|non.current asset|tangible asset|intangible asset/.test(text)) return 'fixedAssets';
  if (/overdraft|bank.*loan|bank.*borrowing/.test(text) && !/asset|receivable|advance/.test(text)) return /long.term|non.current|term loan/.test(text) ? 'longTermLiabilities' : 'currentLiabilities';
  if (/asset|cash|bank|debtor|receivable|inventory|stock.in.hand|advance.*asset/.test(text)) return 'currentAssets';
  if (/capital|equity|reserve|retained earning|surplus/.test(text)) return 'equity';
  if (/long.term|non.current liabilit|secured loan|unsecured loan|term loan/.test(text)) return 'longTermLiabilities';
  if (/liabilit|creditor|payable|duties|tax|gst|loan|borrowing/.test(text)) return 'currentLiabilities';
  if (pnlCategory(group, name)) return 'profit';
  return '';
}
export function balanceComparisonDate(asOn, mode, fyStart) {
  if (mode === 'year') return pnlComparison(asOn, asOn, 'year')?.to || '';
  const start = financialPeriod(asOn, fyStart).from;
  return new Date(Date.parse(`${start}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
export function calculateBalanceSheet(accounts, vouchers, asOn, branch = '') {
  const trial = calculateTrialBalance(accounts, vouchers, { from: '', to: asOn, branch });
  const groups = { currentAssets: [], fixedAssets: [], currentLiabilities: [], longTermLiabilities: [], equity: [] }; const unclassified = []; let unclosedProfit = 0;
  for (const row of trial.rows) {
    const category = balanceCategory(row.group, row.name);
    if (category === 'profit') { unclosedProfit = trialMoney(unclosedProfit - row.closing); continue; }
    if (!category) { if (row.closing !== 0) unclassified.push(row); continue; }
    groups[category].push({ name: row.name, amount: trialMoney(row.closing * (['currentAssets', 'fixedAssets'].includes(category) ? 1 : -1)), issues: row.issues.length });
  }
  if (unclosedProfit !== 0) groups.equity.push({ name: 'Unclosed Profit / Loss', amount: unclosedProfit, derived: true });
  for (const rows of Object.values(groups)) rows.sort((a, b) => a.name.localeCompare(b.name));
  const totals = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, trialMoney(rows.reduce((sum, row) => sum + row.amount, 0))]));
  totals.assets = trialMoney(totals.currentAssets + totals.fixedAssets); totals.liabilities = trialMoney(totals.currentLiabilities + totals.longTermLiabilities); totals.liabilitiesEquity = trialMoney(totals.liabilities + totals.equity); totals.difference = trialMoney(totals.assets - totals.liabilitiesEquity); totals.workingCapital = trialMoney(totals.currentAssets - totals.currentLiabilities);
  const ratios = { current: totals.currentLiabilities > 0 ? totals.currentAssets / totals.currentLiabilities : null, debtEquity: totals.equity > 0 ? totals.liabilities / totals.equity : null, fixedAsset: totals.assets > 0 ? totals.fixedAssets / totals.assets : null, netWorth: totals.assets > 0 ? totals.equity / totals.assets * 100 : null };
  return { groups, totals, ratios, unclassified, issues: trial.issues, unclosedProfit };
}
export function balanceTrend(accounts, vouchers, asOn, branch = '') {
  if (!asOn || !Number.isFinite(Date.parse(asOn))) return [];
  const [year, month] = asOn.split('-').map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = index === 5 ? asOn : new Date(Date.UTC(year, month - 5 + index, 0)).toISOString().slice(0, 10);
    return { date, label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }), ...calculateBalanceSheet(accounts, vouchers, date, branch).totals };
  });
}
