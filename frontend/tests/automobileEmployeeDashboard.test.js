import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceForDay, attendanceTrend, departmentSummary, employeeActivities, employeeDayStats, employeeLeaveSummary, employeePayrollTrend, loadEmployeePages } from '../src/features/categories/automobile/automobileEmployeeDashboard.js';

const employees = [{ employeeId: 'a', status: 'Active', dept: 'Sales' }, { employeeId: 'b', status: 'Probation', dept: 'Service' }, { employeeId: 'c', status: 'On Leave', dept: 'Sales' }, { employeeId: 'd', status: 'Inactive' }, { employeeId: 'e', status: 'Active' }];
test('attendance separates unmarked from absent and weights half days without double-counting leave', () => {
  const rows = [{ employeeId: 'a', date: '2026-10-24', status: 'Half Day' }, { employeeId: 'b', date: '2026-10-24', status: 'Absent' }, { employeeId: 'c', date: '2026-10-24', status: 'On Leave' }];
  const leaves = [{ empId: 'c', status: 'Approved', from: '2026-10-24', to: '2026-10-25' }, { empId: 'a', status: 'Approved', from: '2026-10-24', to: '2026-10-24' }];
  assert.deepEqual(employeeDayStats(employees, rows, leaves, '2026-10-24'), { total: 5, active: 4, present: 1, halfDay: 1, absent: 1, onLeave: 1, notMarked: 1, rate: 13 });
});
test('approved leave overrides absent and pending leave does not imply absence or leave', () => {
  const rows = [{ employeeId: 'a', date: '2026-10-24', status: 'Absent' }];
  const leaves = [{ empId: 'a', status: 'Approved', from: '2026-10-23', to: '2026-10-25' }, { empId: 'b', status: 'Pending', from: '2026-10-24', to: '2026-10-24' }];
  const stats = employeeDayStats(employees, rows, leaves, '2026-10-24');
  assert.equal(stats.absent, 0); assert.equal(stats.onLeave, 1); assert.equal(stats.notMarked, 3);
});
test('latest employee-day record wins while historical dates do not count future joiners', () => {
  const records = attendanceForDay([{ employeeId: 'a', date: '2026-10-24', status: 'Absent', updatedAt: '2026-10-24T08:00:00Z' }, { employeeId: 'a', date: '2026-10-24', status: 'Present', updatedAt: '2026-10-24T09:00:00Z' }], '2026-10-24');
  assert.equal(records.length, 1); assert.equal(records[0].status, 'Present');
  assert.equal(employeeDayStats([{ employeeId: 'new', status: 'Active', joinDate: '2026-11-01' }], [], [], '2026-10-24').active, 0);
});
test('trend covers full leap month and omits percentage line for missing or future data', () => {
  const rows = attendanceTrend(employees, [{ employeeId: 'a', date: '2024-02-28', status: 'Present' }, { employeeId: 'a', date: '2024-02-29', status: 'Present' }], [], '2024-02', '2024-02-28');
  assert.equal(rows.length, 29); assert.equal(rows[0].rateRecorded, false); assert.equal(rows[27].rateRecorded, true); assert.equal(rows[28].rateRecorded, false);
});
test('payroll groups stored net values by year and supports legacy month labels', () => {
  const trend = employeePayrollTrend([{ month: '2026-01', net: 500 }, { month: 'Jan 2026', net: 300 }, { month: '2025-01', net: 900 }, { month: '2026-02', net: 200 }], '2026');
  assert.equal(trend[0].total, 800); assert.equal(trend[0].count, 2); assert.equal(trend[1].total, 200); assert.equal(trend.length, 12);
});
test('leave summary includes approved fractional days and clips cross-year requests', () => {
  const result = employeeLeaveSummary([{ type: 'Casual Leave', status: 'Approved', from: '2025-12-31', to: '2026-01-02', days: 3 }, { type: 'Sick Leave', status: 'Approved', from: '2026-10-24', to: '2026-10-24', days: 0.5 }, { type: 'Casual Leave', status: 'Pending', from: '2026-10-24', to: '2026-10-24', days: 1 }], '2026');
  assert.deepEqual(result, [{ label: 'Casual Leave', days: 2 }, { label: 'Sick Leave', days: 0.5 }]);
});
test('department totals include all master records, with explicit unassigned grouping', () => {
  const groups = departmentSummary(employees);
  assert.equal(groups.reduce((sum, row) => sum + row.value, 0), 5);
  assert.equal(departmentSummary(employees, 'Sales')[0].value, 2);
});
test('activities use persisted timestamps and describe records rather than inventing check-in events', () => {
  const activities = employeeActivities([{ _id: 'a', name: 'A', createdAt: '2026-10-23T00:00:00Z' }], [{ _id: 'b', name: 'B', status: 'Present', updatedAt: '2026-10-24T00:00:00Z' }, { _id: 'legacy', name: 'Old', status: 'Present' }], [], []);
  assert.equal(activities.length, 2); assert.equal(activities[0].name, 'B'); assert.equal(activities[0].text, 'Attendance recorded: Present');
});
test('loader reads all API pages instead of reporting first-page employee counts', async () => {
  const pages = [];
  const rows = await loadEmployeePages(async ({ page, limit }) => { pages.push(page); assert.equal(limit, 200); return { data: page === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'c' }], total: 3 }; });
  assert.equal(rows.length, 3); assert.deepEqual(pages, [1, 2]);
});
