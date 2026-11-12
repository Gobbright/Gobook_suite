import { ledgerType } from '../../../automobile/automobileLedger.js';
import { trialMoney } from '../../../automobile/automobileTrialBalance.js';

export function trialCategory(account) {
  const type = ledgerType(account);
  if (['Cash', 'Bank', 'Assets', 'Customers'].includes(type)) return 'Assets';
  if (['Liabilities', 'Suppliers'].includes(type)) return 'Liabilities';
  if (type === 'Income') return 'Income';
  if (type === 'Expense') return 'Expenses';
  const group = String(account.group || '').toLowerCase();
  if (/stock|inventory|deposit|investment|advance|receivable/.test(group)) return 'Assets';
  if (/equity|reserve|capital|provision|payable|tax|duties/.test(group)) return 'Liabilities';
  if (/purchase|cost/.test(group)) return 'Expenses';
  return 'Other Accounts';
}
export const trialBalanceFields = ['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'];
export function trialReportGroups(rows, filter = '', definitions = [], options = {}) {
  const definitionMap = new Map(definitions.map((group) => [group.name, group]));
  function ancestry(row) {
    const parents = new Set([row.group]);
    let current = row.group;
    while (definitionMap.has(current)) {
      const parent = definitionMap.get(current).parent;
      if (!parent || parents.has(parent)) break;
      parents.add(parent); current = parent;
    }
    return parents;
  }
  function category(row) { return trialCategory({ ...row, accountingGroup: row.accountingGroup || definitionMap.get(row.group)?.accountingGroup }); }
  const query = String(options.search || '').trim().toLowerCase();
  const filtered = rows.filter((row) => (!filter || ancestry(row).has(filter) || category(row) === filter) && (!query || [row.name, row.code, row.group].join(' ').toLowerCase().includes(query)) && (options.showZero !== false || row.closingDebit !== 0 || row.closingCredit !== 0)).map((row) => ({
    ...row,
    openingDebit: row.openingDebit ?? Math.max(row.opening || 0, 0),
    openingCredit: row.openingCredit ?? Math.max(-(row.opening || 0), 0),
    periodDebit: row.periodDebit ?? row.debit ?? 0,
    periodCredit: row.periodCredit ?? row.credit ?? 0,
  }));
  const field = options.sort || 'name', direction = options.direction === 'desc' ? -1 : 1;
  filtered.sort((first, second) => direction * (['name', 'group', 'code'].includes(field) ? String(first[field] || '').localeCompare(String(second[field] || ''), undefined, { numeric: true }) : Number(first[field] || 0) - Number(second[field] || 0)) || String(first._id || first.name).localeCompare(String(second._id || second.name)));
  function totals(accounts) {
    const result = Object.fromEntries(trialBalanceFields.map((key) => [key, trialMoney(accounts.reduce((sum, row) => sum + Number(row[key] || 0), 0))]));
    result.debit = result.closingDebit; result.credit = result.closingCredit;
    result.difference = trialMoney(result.debit - result.credit);
    result.previousDebit = trialMoney(accounts.reduce((sum, row) => sum + Number(row.previous?.closingDebit || 0), 0));
    result.previousCredit = trialMoney(accounts.reduce((sum, row) => sum + Number(row.previous?.closingCredit || 0), 0));
    return result;
  }
  const groups = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Other Accounts'].map((name) => {
    const accounts = filtered.filter((row) => category(row) === name);
    const root = { name, key: `category:${name}`, accounts, children: [], directAccounts: [], ...totals(accounts) };
    function add(node, row, path) {
      if (!path.length) { node.directAccounts.push(row); return; }
      const childName = path[0];
      let child = node.children.find((item) => item.name === childName);
      if (!child) { child = { name: childName, key: `${node.key}/${childName}`, accounts: [], children: [], directAccounts: [] }; node.children.push(child); }
      child.accounts.push(row);
      add(child, row, path.slice(1));
    }
    for (const row of accounts) add(root, row, [...ancestry(row)].reverse().filter((parent) => parent && parent !== name));
    function finalize(node) { Object.assign(node, totals(node.accounts)); node.children.forEach(finalize); }
    root.children.forEach(finalize);
    return root;
  }).filter((group) => group.accounts.length);
  return { groups, accounts: filtered, ...totals(filtered) };
}

