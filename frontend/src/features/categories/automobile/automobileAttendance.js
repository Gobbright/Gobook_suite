import { attendanceForDay, workingEmployee } from './automobileEmployeeDashboard.js';
export const ATTENDANCE_STATUSES = ['Present', 'Late', 'Absent', 'Half Day', 'On Leave', 'WFH', 'On Duty', 'Weekly Off', 'Holiday'];
export function attendanceMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]); const period = match[3]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (period === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}
export function attendanceTimeInput(value) {
  const minutes = attendanceMinutes(value); return minutes === null ? '' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function averageCheckIn(rows) {
  const times = rows.filter((row) => !['Absent', 'On Leave', 'Weekly Off', 'Holiday', 'Not Marked'].includes(row.status)).map((row) => attendanceMinutes(row.checkIn)).filter((value) => value !== null);
  if (!times.length) return '—';
  const average = Math.round(times.reduce((sum, value) => sum + value, 0) / times.length); const hour = Math.floor(average / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(average % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
export function dailyAttendanceRows(employees, attendance, date) {
  const records = attendanceForDay(attendance, date); const map = new Map(records.map((row) => [row.employeeId, row]));
  const team = employees.filter((employee) => (workingEmployee(employee) && (!employee.joinDate || employee.joinDate <= date)) || map.has(employee.employeeId));
  const knownIds = new Set(team.map((employee) => employee.employeeId));
  return [...team.map((employee) => ({ employeeId: employee.employeeId, name: employee.name, dept: employee.dept, branch: employee.branch, date, status: 'Not Marked', ...map.get(employee.employeeId), employee })), ...records.filter((row) => !knownIds.has(row.employeeId)).map((row) => ({ ...row, employee: null }))].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export function filterAttendanceRows(rows, filters) {
  const search = (filters.search || '').trim().toLowerCase();
  return rows.filter((row) => (!filters.dept || row.dept === filters.dept) && (!filters.branch || row.branch === filters.branch) && (!filters.status || row.status === filters.status) && [row.name, row.employeeId].join(' ').toLowerCase().includes(search));
}
export function attendanceCounts(rows) {
  return { present: rows.filter((row) => ['Present', 'Late', 'WFH', 'On Duty'].includes(row.status)).length, absent: rows.filter((row) => row.status === 'Absent').length, halfDay: rows.filter((row) => row.status === 'Half Day').length, late: rows.filter((row) => row.status === 'Late').length, onLeave: rows.filter((row) => row.status === 'On Leave').length, notMarked: rows.filter((row) => row.status === 'Not Marked').length };
}
