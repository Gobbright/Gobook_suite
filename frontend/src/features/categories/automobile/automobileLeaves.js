import { employeeDay, employeeLeaveSummary } from './automobileEmployeeDashboard.js';
export const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Annual Leave', 'Unpaid Leave', 'Comp Off', 'Maternity Leave', 'Paternity Leave'];
// Existing Leave Balance page defaults; these are estimates, not stored entitlements.
export const STANDARD_LEAVE_ALLOWANCES = { 'Casual Leave': 12, 'Sick Leave': 10, 'Annual Leave': 18, 'Comp Off': 0 };
export function leaveDays(from, to = from) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || to < from) return 0;
  return Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1) || 0;
}
export function filterLeaveRequests(rows, filters) {
  return rows.filter((row) => (!filters.type || row.type === filters.type) && (!filters.status || row.status === filters.status) && (!filters.empId || row.empId === filters.empId) && (!filters.dept || row.dept === filters.dept) && (!filters.from || (row.to || row.from) >= filters.from) && (!filters.to || row.from <= filters.to));
}
export function leaveBalanceEstimate(leaves, empId, year) {
  const approved = employeeLeaveSummary(leaves.filter((row) => row.empId === empId), year);
  return Object.entries(STANDARD_LEAVE_ALLOWANCES).map(([type, allowance]) => { const used = approved.find((row) => row.label === type)?.days || 0; return { type, allowance, used, remaining: allowance - used }; });
}
export function leaveDashboardStats(leaves, employees, now = new Date()) {
  const date = employeeDay(now); const month = date.slice(0, 7); const [year, number] = month.split('-').map(Number); const end = `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
  const currentMonth = leaves.filter((row) => row.from <= end && (row.to || row.from) >= `${month}-01`);
  const totalAllowance = employees.length * Object.values(STANDARD_LEAVE_ALLOWANCES).reduce((sum, value) => sum + value, 0);
  const employeeIds = new Set(employees.map((row) => row.employeeId));
  const used = employeeLeaveSummary(leaves.filter((row) => employeeIds.has(row.empId) && Object.hasOwn(STANDARD_LEAVE_ALLOWANCES, row.type)), String(year)).reduce((sum, row) => sum + row.days, 0);
  return { pending: leaves.filter((row) => row.status === 'Pending').length, approved: currentMonth.filter((row) => row.status === 'Approved').length, rejected: currentMonth.filter((row) => row.status === 'Rejected').length,
    onLeave: new Set(leaves.filter((row) => row.status === 'Approved' && row.from <= date && (row.to || row.from) >= date).map((row) => row.empId)).size, utilization: totalAllowance ? Math.round(used / totalAllowance * 100) : null };
}
