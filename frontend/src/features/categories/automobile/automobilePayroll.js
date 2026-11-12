export function filterAutomobilePayroll(rows, employees, filters) {
  const byId = new Map(employees.map((row) => [row.employeeId, row])); const search = String(filters.search || '').trim().toLowerCase();
  return rows.map((row) => ({ ...row, branch: byId.get(row.employeeId)?.branch || '' })).filter((row) => (!filters.branch || row.branch === filters.branch) && (!filters.dept || row.dept === filters.dept) && (!filters.status || row.status === filters.status) && [row.name, row.employeeId].join(' ').toLowerCase().includes(search));
}
export function automobilePayrollTotals(rows) {
  const totals = rows.reduce((sum, row) => ({ ...sum, basic: sum.basic + (Number(row.basic) || 0), allowances: sum.allowances + (Number(row.allowances) || 0), deductions: sum.deductions + (Number(row.deductions) || 0), net: sum.net + (Number(row.net) || 0), paid: sum.paid + (row.status === 'Paid' ? 1 : 0), pendingNet: sum.pendingNet + (row.status === 'Pending' ? Number(row.net) || 0 : 0) }), { basic: 0, allowances: 0, deductions: 0, net: 0, paid: 0, pendingNet: 0 });
  return { ...totals, employees: new Set(rows.map((row) => row.employeeId)).size, records: rows.length, gross: totals.basic + totals.allowances, pending: rows.filter((row) => row.status === 'Pending').length };
}
