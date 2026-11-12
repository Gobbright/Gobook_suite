import { trialMoney } from '../../../automobile/automobileTrialBalance.js';

export const pnlSections = [
  { key: 'revenue', label: 'Operating Income', side: 'income' },
  { key: 'otherIncome', label: 'Non-Operating Income', side: 'income' },
  { key: 'directCosts', label: 'Direct Expenses', side: 'expenses' },
  { key: 'expenses', label: 'Indirect Expenses', side: 'expenses' },
];

export function pnlReportTotals(totals) {
  const income = trialMoney(totals.revenue + totals.otherIncome);
  const expenses = trialMoney(totals.directCosts + totals.expenses);
  const operatingProfit = trialMoney(totals.grossProfit - totals.expenses);
  return { income, expenses, grossProfit: totals.grossProfit, operatingProfit, netProfit: totals.netProfit, netMargin: income > 0 ? totals.netProfit / income * 100 : null };
}

export function pnlDetailRows(report, previous = null) {
  return pnlSections.flatMap((section) => {
    const current = new Map(report.accounts[section.key].map((row) => [row.name, row.amount]));
    const before = new Map((previous?.accounts[section.key] || []).map((row) => [row.name, row.amount]));
    return [...new Set([...current.keys(), ...before.keys()])].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, group: section.label, side: section.side, current: current.get(name) || 0, previous: before.get(name) || 0, variance: trialMoney((current.get(name) || 0) - (before.get(name) || 0)) }));
  });
}
