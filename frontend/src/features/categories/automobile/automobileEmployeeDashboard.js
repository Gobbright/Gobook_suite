import { leadDay } from './automobileLeads.js';

export const employeeDay = leadDay;
export const workingEmployee = (row) => ['Active', 'Probation', 'On Leave'].includes(row.status || 'Active');
export const presentStatus = (status) => ['Present', 'Late', 'WFH', 'On Duty', 'Half Day'].includes(status);
export function payrollMonth(value = '') {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const date = new Date(`1 ${value}`);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
export async function loadEmployeePages(fetchPage, params = {}) {
  const rows = []; let page = 1;
  while (true) {
    const response = await fetchPage({ ...params, page, limit: 200 });
    const batch = response.data || []; rows.push(...batch);
    if (!batch.length || rows.length >= Number(response.total ?? rows.length)) return rows;
    page++;
  }
}
export function attendanceForDay(attendance, date) {
  const byEmployee = new Map();
  [...attendance].sort((a, b) => String(a.updatedAt || a.createdAt || '').localeCompare(String(b.updatedAt || b.createdAt || ''))).filter((row) => row.date === date).forEach((row) => byEmployee.set(row.employeeId, row));
  return [...byEmployee.values()];
}
export function employeeDayStats(employees, attendance, leaves, date) {
  const team = employees.filter((row) => workingEmployee(row) && (!row.joinDate || row.joinDate <= date));
  const ids = new Set(team.map((row) => row.employeeId));
  const records = attendanceForDay(attendance, date).filter((row) => ids.has(row.employeeId));
  const present = records.filter((row) => presentStatus(row.status));
  const presentIds = new Set(present.map((row) => row.employeeId));
  const onLeaveIds = new Set([...records.filter((row) => row.status === 'On Leave').map((row) => row.employeeId), ...leaves.filter((row) => row.status === 'Approved' && row.from <= date && (row.to || row.from) >= date).map((row) => row.empId)].filter((id) => ids.has(id) && !presentIds.has(id)));
  const absent = records.filter((row) => row.status === 'Absent' && !onLeaveIds.has(row.employeeId)).length;
  const marked = new Set([...records.map((row) => row.employeeId), ...onLeaveIds]);
  const attendanceUnits = present.reduce((sum, row) => sum + (row.status === 'Half Day' ? 0.5 : 1), 0);
  return { total: employees.length, active: team.length, present: present.length, halfDay: present.filter((row) => row.status === 'Half Day').length, absent, onLeave: onLeaveIds.size, notMarked: Math.max(0, team.length - marked.size), rate: team.length ? Math.round(attendanceUnits / team.length * 100) : null };
}
export function attendanceTrend(employees, attendance, leaves, month, today = employeeDay(new Date())) {
  const [year, number] = month.split('-').map(Number); const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    const hasRecords = attendance.some((row) => row.date === date);
    return { date, day: index + 1, future: date > today, ...employeeDayStats(employees, attendance, leaves, date), rateRecorded: hasRecords && date <= today };
  });
}
export function departmentSummary(employees, department = '') {
  const map = new Map(); employees.filter((row) => !department || (row.dept || 'Unassigned') === department).forEach((row) => { const label = row.dept || 'Unassigned'; map.set(label, (map.get(label) || 0) + 1); });
  return [...map].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
export function employeePayrollTrend(payroll, year) {
  return Array.from({ length: 12 }, (_, index) => { const month = `${year}-${String(index + 1).padStart(2, '0')}`; const records = payroll.filter((row) => payrollMonth(row.month) === month); return { month, total: records.reduce((sum, row) => sum + (Number(row.net) || 0), 0), count: records.length }; });
}
export function employeeLeaveSummary(leaves, year) {
  const start = `${year}-01-01`; const end = `${year}-12-31`; const groups = new Map();
  leaves.filter((row) => row.status === 'Approved' && row.from <= end && (row.to || row.from) >= start).forEach((row) => {
    const from = row.from < start ? start : row.from; const to = (row.to || row.from) > end ? end : (row.to || row.from);
    const overlap = Math.max(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1);
    const full = Math.max(1, (Date.parse(`${row.to || row.from}T00:00:00Z`) - Date.parse(`${row.from}T00:00:00Z`)) / 86400000 + 1);
    const days = Number.isFinite(Number(row.days)) ? Number(row.days) * overlap / full : overlap;
    const type = row.type || 'Other'; groups.set(type, (groups.get(type) || 0) + days);
  });
  return [...groups].map(([label, days]) => ({ label, days: Math.round(days * 10) / 10 }));
}
export function employeeActivities(employees, attendance, leaves, payroll) {
  return [
    ...employees.map((row) => ({ id: `employee-${row._id}`, date: row.createdAt, name: row.name, text: 'Employee profile created', kind: 'employee', to: '/employee-management/employees' })),
    ...attendance.map((row) => ({ id: `attendance-${row._id}`, date: row.updatedAt || row.createdAt, name: row.name, text: `Attendance recorded: ${row.status}`, kind: 'attendance', to: '/employee-management/attendance' })),
    ...leaves.map((row) => ({ id: `leave-${row._id}`, date: row.updatedAt || row.createdAt, name: row.name, text: `${row.type} · ${row.status}`, kind: 'leave', to: '/employee-management/leave' })),
    ...payroll.map((row) => ({ id: `payroll-${row._id}`, date: row.updatedAt || row.createdAt, name: row.name, text: `Payroll ${row.month} · ${row.status}`, kind: 'payroll', to: '/employee-management/payroll/processing' })),
  ].filter((row) => row.date && Number.isFinite(Date.parse(row.date))).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);
}
