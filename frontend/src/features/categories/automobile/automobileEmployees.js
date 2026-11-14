import { employeeDay } from './automobileEmployeeDashboard.js';
export const EMPLOYEE_STATUSES = ['Active', 'Probation', 'On Leave', 'Inactive', 'Resigned', 'Terminated'];
export function employeeDirectoryStats(rows, now = new Date()) {
  const month = employeeDay(now).slice(0, 7);
  return { total: rows.length, active: rows.filter((row) => (row.status || 'Active') === 'Active').length, departments: new Set(rows.map((row) => row.dept).filter(Boolean)).size,
    newJoiners: rows.filter((row) => row.joinDate?.startsWith(month) && row.joinDate <= employeeDay(now)).length, exited: rows.filter((row) => ['Inactive', 'Resigned', 'Terminated'].includes(row.status)).length };
}
export function filterEmployeeDirectory(rows, filters) {
  const query = (filters.search || '').trim().toLowerCase();
  return rows.filter((row) => [row.name, row.employeeId, row.phone, row.email].join(' ').toLowerCase().includes(query) && (!filters.dept || (filters.dept === '__unassigned__' ? !row.dept?.trim() : row.dept === filters.dept)) && (!filters.designation || (filters.designation === '__unassigned__' ? !row.designation?.trim() : row.designation === filters.designation)) && (!filters.branch || row.branch === filters.branch) && (!filters.status || (row.status || 'Active') === filters.status));
}
export function employeeSalary(employee) {
  const structure = employee.salaryStructure || {};
  const earnings = [['Basic Salary', employee.basicSalary], ['HRA', structure.hra], ['Special Allowance', structure.specialAllowance], ['Conveyance Allowance', structure.conveyanceAllowance], ['Medical Allowance', structure.medicalAllowance], ['Other Allowances', structure.otherAllowances]].map(([label, value]) => [label, Number(value) || 0]);
  const deductions = [['PF', structure.pf], ['ESI', structure.esi], ['Professional Tax', structure.professionalTax], ['TDS', structure.tds], ['Other Deduction', structure.otherDeduction], ['Loan Deduction', structure.loanDeduction]].map(([label, value]) => [label, Number(value) || 0]);
  const gross = earnings.reduce((sum, [, amount]) => sum + amount, 0); const totalDeductions = deductions.reduce((sum, [, amount]) => sum + amount, 0);
  return { earnings, deductions, gross, totalDeductions, net: gross - totalDeductions };
}
