import test from 'node:test';
import assert from 'node:assert/strict';
import { filterLeaveRequests, leaveBalanceEstimate, leaveDashboardStats, leaveDays } from '../src/features/categories/automobile/automobileLeaves.js';

test('leave duration includes both dates and rejects reversed or empty ranges', () => {
  assert.equal(leaveDays('2026-10-24', '2026-10-26'), 3);
  assert.equal(leaveDays('2024-02-28', '2024-03-01'), 3);
  assert.equal(leaveDays('2026-10-26', '2026-10-24'), 0);
  assert.equal(leaveDays('', ''), 0);
});
test('date filtering uses overlapping leave ranges and composes employee, department, type and status', () => {
  const rows = [{ empId: 'one', dept: 'Sales', type: 'Sick Leave', status: 'Approved', from: '2026-09-30', to: '2026-10-02' }, { empId: 'two', dept: 'Accounts', type: 'Casual Leave', status: 'Pending', from: '2026-11-01', to: '2026-11-01' }];
  assert.equal(filterLeaveRequests(rows, { from: '2026-10-01', to: '2026-10-31', empId: 'one', dept: 'Sales', type: 'Sick Leave', status: 'Approved' }).length, 1);
  assert.equal(filterLeaveRequests(rows, { from: '2026-10-03', to: '2026-10-31' }).length, 0);
});
test('estimated balances use approved leave for the selected employee and clip cross-year usage', () => {
  const rows = [{ empId: 'one', type: 'Casual Leave', from: '2025-12-31', to: '2026-01-02', days: 3, status: 'Approved' }, { empId: 'one', type: 'Casual Leave', from: '2026-10-24', to: '2026-10-24', days: 1, status: 'Pending' }, { empId: 'other', type: 'Casual Leave', from: '2026-10-24', to: '2026-10-24', days: 1, status: 'Approved' }];
  const balances = leaveBalanceEstimate(rows, 'one', '2026');
  assert.equal(balances[0].used, 2); assert.equal(balances[0].remaining, 10);
  assert.equal(balances.find((row) => row.type === 'Comp Off').allowance, 0);
});
test('dashboard counts unique employees on leave and scopes estimated utilization to known employee IDs', () => {
  const rows = [{ empId: 'one', type: 'Sick Leave', from: '2026-10-24', to: '2026-10-25', days: 2, status: 'Approved' }, { empId: 'one', type: 'Casual Leave', from: '2026-10-24', to: '2026-10-24', days: 1, status: 'Approved' }, { empId: 'two', type: 'Casual Leave', from: '2026-10-26', to: '2026-10-26', days: 1, status: 'Rejected' }, { empId: 'one', type: 'Casual Leave', from: '2026-11-01', to: '2026-11-01', days: 1, status: 'Pending' }];
  const result = leaveDashboardStats(rows, [{ employeeId: 'one' }], new Date('2026-10-24T10:00:00Z'));
  assert.deepEqual(result, { pending: 1, approved: 2, rejected: 1, onLeave: 1, utilization: 8 });
  assert.equal(leaveDashboardStats([], [], new Date('2026-10-24T10:00:00Z')).utilization, null);
});
