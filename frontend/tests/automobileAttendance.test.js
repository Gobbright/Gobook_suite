import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceCounts, attendanceMinutes, attendanceTimeInput, averageCheckIn, dailyAttendanceRows, filterAttendanceRows } from '../src/features/categories/automobile/automobileAttendance.js';

test('check-in parsing supports saved 12-hour and 24-hour times while rejecting placeholders', () => {
  assert.equal(attendanceMinutes('09:05 AM'), 545); assert.equal(attendanceMinutes('18:10'), 1090);
  assert.equal(attendanceMinutes('12:00 AM'), 0); assert.equal(attendanceMinutes('12:00 PM'), 720);
  assert.equal(attendanceMinutes('--'), null); assert.equal(attendanceMinutes('25:00'), null); assert.equal(attendanceMinutes('9:99'), null);
  assert.equal(attendanceTimeInput('06:10 PM'), '18:10'); assert.equal(attendanceTimeInput('--'), '');
});
test('average check-in uses actual timed working records and does not invent a time for missing data', () => {
  assert.equal(averageCheckIn([{ checkIn: '09:00', status: 'Present' }, { checkIn: '09:30 AM', status: 'Late' }, { checkIn: '00:00', status: 'Absent' }, { checkIn: '--', status: 'Present' }]), '09:15 AM');
  assert.equal(averageCheckIn([]), '—');
});
test('daily rows include unmarked active employees and historical attendance without marking absences', () => {
  const employees = [{ employeeId: 'a', name: 'Arun', status: 'Active', branch: 'Main' }, { employeeId: 'b', name: 'Priya', status: 'Probation' }, { employeeId: 'c', name: 'Old', status: 'Inactive' }, { employeeId: 'future', name: 'Future', status: 'Active', joinDate: '2026-11-01' }];
  const rows = dailyAttendanceRows(employees, [{ employeeId: 'a', date: '2026-10-24', name: 'Arun', status: 'Present' }, { employeeId: 'historic', date: '2026-10-24', name: 'Former', status: 'Absent' }], '2026-10-24');
  assert.equal(rows.length, 3); assert.equal(rows.find((row) => row.employeeId === 'b').status, 'Not Marked');
  assert.equal(rows.find((row) => row.employeeId === 'a').branch, 'Main'); assert.equal(rows.find((row) => row.employeeId === 'historic').employee, null);
  assert.equal(attendanceCounts(rows).notMarked, 1); assert.equal(attendanceCounts(rows).absent, 1);
});
test('attendance filters combine branch and department with employee name or ID and status', () => {
  const rows = [{ employeeId: 'EMP-1', name: 'Arun', dept: 'Sales', branch: 'Main', status: 'Present' }, { employeeId: 'EMP-2', name: 'Priya', dept: 'Accounts', branch: 'North', status: 'Late' }];
  assert.equal(filterAttendanceRows(rows, { search: 'emp-1', dept: 'Sales', branch: 'Main', status: 'Present' }).length, 1);
  assert.equal(filterAttendanceRows(rows, { branch: 'North', status: 'Present' }).length, 0);
});
test('summary keeps half days separate and counts late arrivals among present staff once', () => {
  assert.deepEqual(attendanceCounts(['Present', 'Late', 'WFH', 'On Duty', 'Absent', 'Half Day', 'On Leave', 'Not Marked', 'Holiday'].map((status) => ({ status }))), { present: 4, absent: 1, halfDay: 1, late: 1, onLeave: 1, notMarked: 1 });
});
