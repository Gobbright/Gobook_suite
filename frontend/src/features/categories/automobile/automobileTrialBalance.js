const number = (value) => Number(value) || 0;
export const trialMoney = (value) => Math.round(number(value) * 100) / 100;
export function financialPeriod(day, fyStart = '01 April') {
  const parsed = new Date(`${fyStart}, 2000`); const month = Number.isFinite(parsed.getTime()) ? parsed.getMonth() + 1 : 4; const startDay = Number.isFinite(parsed.getTime()) ? parsed.getDate() : 1;
  const suffix = `${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const year = Number(day.slice(0, 4)) - (day.slice(5) < suffix ? 1 : 0);
  const from = `${year}-${suffix}`; const end = new Date(`${year + 1}-${suffix}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  return { year, from, to: end.toISOString().slice(0, 10) };
}
export function previousTrialPeriod(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`); const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  const duration = end - start + 86400000;
  return { from: new Date(start - duration).toISOString().slice(0, 10), to: new Date(start - 86400000).toISOString().slice(0, 10) };
}
export function calculateTrialBalance(accounts, vouchers, filters) {
  const rows = new Map();
  accounts.forEach((account) => {
    // Opening balances belong to the account's recorded branch. Unassigned
    // openings are included only when reporting the whole workspace.
    if (filters.branch && account.branch !== filters.branch) return;
    rows.set(account.name, { name: account.name, code: account.code || '', group: account.group || 'Unspecified', opening: number(account.opening), debit: 0, credit: 0, closing: number(account.opening), issues: [] });
  });
  let posted = 0; let unposted = 0; const issues = [];
  const accountMap = new Map(accounts.map((account) => [account.name, account]));
  vouchers.forEach((voucher) => {
    if (filters.branch && voucher.branch !== filters.branch) return;
    if (filters.to && voucher.date > filters.to) return;
    const inPeriod = !filters.from || voucher.date >= filters.from;
    if (voucher.status !== 'Posted') { if (voucher.status === 'Draft' && inPeriod) unposted++; return; }
    if (inPeriod) posted++;
    let dr = 0; let cr = 0;
    const touched = new Set();
    for (const line of voucher.lines || []) {
      if (!line.ledgerName || !['debit', 'credit'].includes(line.side)) continue;
      const amount = trialMoney(line.amount); const movement = line.side === 'debit' ? amount : -amount;
      const master = accountMap.get(line.ledgerName);
      const row = rows.get(line.ledgerName) || { name: line.ledgerName, code: master?.code || '', group: master?.group || line.ledgerGroup || 'Unspecified', opening: 0, debit: 0, credit: 0, closing: 0, issues: [] };
      if (line.side === 'debit') dr = trialMoney(dr + amount); else cr = trialMoney(cr + amount);
      row.closing = trialMoney(row.closing + movement);
      if (!inPeriod) row.opening = trialMoney(row.opening + movement);
      else row[line.side] = trialMoney(row[line.side] + amount);
      rows.set(row.name, row); touched.add(row.name);
    }
    if (dr !== cr) {
      const issue = { voucherNo: voucher.voucherNo, date: voucher.date, difference: trialMoney(dr - cr), accounts: [...touched] };
      issues.push(issue); touched.forEach((name) => rows.get(name).issues.push(issue));
    }
  });
  const result = [...rows.values()].map((row) => ({ ...row, opening: trialMoney(row.opening), closing: trialMoney(row.closing), closingDebit: Math.max(trialMoney(row.closing), 0), closingCredit: Math.max(-trialMoney(row.closing), 0) }));
  const debit = trialMoney(result.reduce((sum, row) => sum + row.closingDebit, 0)); const credit = trialMoney(result.reduce((sum, row) => sum + row.closingCredit, 0));
  return { rows: result, debit, credit, difference: trialMoney(debit - credit), posted, unposted, issues };
}
