import { trialMoney } from '../../../automobile/automobileTrialBalance.js';

export const balanceSections = [
  { key: 'liabilities', label: 'Liabilities', side: 'left', buckets: [{ key: 'currentLiabilities', label: 'Current Liabilities' }, { key: 'longTermLiabilities', label: 'Non-Current Liabilities' }] },
  { key: 'equity', label: 'Equity', side: 'left', buckets: [{ key: 'capital', label: "Owner's Capital" }, { key: 'retained', label: 'Retained Earnings (Surplus)' }, { key: 'unclosed', label: 'Unclosed Profit / Loss' }] },
  { key: 'currentAssets', label: 'Current Assets', side: 'right', buckets: [{ key: 'cash', label: 'Cash & Bank Balances' }, { key: 'inventory', label: 'Inventory' }, { key: 'receivables', label: 'Trade Receivables (Sundry Debtors)' }, { key: 'otherCurrent', label: 'Other Current Assets' }] },
  { key: 'nonCurrentAssets', label: 'Non-Current Assets', side: 'right', buckets: [{ key: 'tangible', label: 'Fixed Assets (Tangible)' }, { key: 'intangible', label: 'Intangible Assets' }, { key: 'investments', label: 'Investments' }, { key: 'otherNonCurrent', label: 'Other Non-Current Assets' }] },
];
export const balanceRootKeys = balanceSections.map((section) => section.key);
export const balanceAllKeys = balanceSections.flatMap((section) => [section.key, ...section.buckets.map((bucket) => bucket.key)]);

export function balanceReportGroups(report, accounts, vouchers = []) {
  const groups = new Map(accounts.map((account) => [account.name, account.group || '']));
  for (const voucher of vouchers) for (const line of voucher.lines || []) if (!groups.get(line.ledgerName)) groups.set(line.ledgerName, line.ledgerGroup || '');
  const buckets = Object.fromEntries(balanceSections.flatMap((section) => section.buckets.map((bucket) => [bucket.key, []])));
  for (const [category, rows] of Object.entries(report.groups)) for (const row of rows) {
    const text = String(groups.get(row.name) || '').toLowerCase();
    let bucket;
    if (category === 'equity') bucket = row.derived ? 'unclosed' : /reserve|retained|surplus|profit.*loss/.test(`${text} ${row.name.toLowerCase()}`) ? 'retained' : 'capital';
    else if (['currentLiabilities', 'longTermLiabilities'].includes(category)) bucket = category;
    else if (category === 'fixedAssets') bucket = /intangible|goodwill|patent|trademark|software/.test(text) ? 'intangible' : /investment/.test(text) ? 'investments' : /fixed asset|tangible asset/.test(text) ? 'tangible' : 'otherNonCurrent';
    else bucket = /cash|bank/.test(text) ? 'cash' : /inventory|stock/.test(text) ? 'inventory' : /debtor|receivable/.test(text) ? 'receivables' : 'otherCurrent';
    buckets[bucket].push({ ...row, group: groups.get(row.name) || '' });
  }
  return balanceSections.map((section) => {
    const children = section.buckets.map((bucket) => ({ ...bucket, accounts: buckets[bucket.key].sort((a, b) => a.name.localeCompare(b.name)), amount: trialMoney(buckets[bucket.key].reduce((sum, row) => sum + row.amount, 0)) }));
    return { ...section, buckets: children, amount: trialMoney(children.reduce((sum, bucket) => sum + bucket.amount, 0)) };
  });
}

export function balanceReportDetails(current, previous = []) {
  return current.flatMap((section) => section.buckets.flatMap((bucket) => {
    const before = previous.find((row) => row.key === section.key)?.buckets.find((row) => row.key === bucket.key);
    const now = new Map(bucket.accounts.map((row) => [row.name, row]));
    const old = new Map((before?.accounts || []).map((row) => [row.name, row]));
    return [...new Set([...now.keys(), ...old.keys()])].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, section: section.label, group: bucket.label, current: now.get(name)?.amount || 0, previous: old.get(name)?.amount || 0, variance: trialMoney((now.get(name)?.amount || 0) - (old.get(name)?.amount || 0)), derived: now.get(name)?.derived || old.get(name)?.derived }));
  }));
}
