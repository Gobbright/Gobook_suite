import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import mongoose from 'mongoose';
import { Attendance } from '../src/models/Attendance.js';
import { AttendanceCorrection } from '../src/models/AttendanceCorrection.js';
import { Holiday } from '../src/models/Holiday.js';
import { Leave } from '../src/models/Leave.js';
import { Payroll } from '../src/models/Payroll.js';
import { adminMonthlyAttendance, employeeMonthlyAttendance, adminLeaves, employeeLeaveStatus, employeeLeaveHistory, adminCorrections, adminPayroll, employeePayslips, adminHolidays, employeeHolidays } from '../src/modules/employee-portal/portalController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_month_test_${process.pid}_${Date.now()}`;
const owner = new mongoose.Types.ObjectId();
const otherOwner = new mongoose.Types.ObjectId();
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([Attendance.init(), AttendanceCorrection.init(), Holiday.init(), Leave.init(), Payroll.init()]);
  for (const userId of [owner, otherOwner]) {
    for (const date of ['2026-10-31', '2026-11-01', '2026-11-30', '2026-12-01']) {
      await Attendance.create({ userId, employeeId: 'EMP-1', name: 'Month test', date, status: 'Present' });
      await AttendanceCorrection.create({ ownerUserId: userId, employeeId: 'EMP-1', name: 'Month test', date, reason: 'Test correction' });
      await Holiday.create({ ownerUserId: userId, name: 'Test holiday', date });
    }
    for (const month of ['2026-10', '2026-11', '2026-12']) await Payroll.create({ userId, employeeId: 'EMP-1', name: 'Month test', month, basic: 20000, net: 20000 });
    for (const [index, [from, to]] of [['2026-10-30', '2026-11-02'], ['2026-11-10', '2026-11-10'], ['2026-11-30', '2026-12-02'], ['2026-10-10', '2026-10-10']].entries()) {
      await Leave.create({ userId, empId: 'EMP-1', name: 'Month test', leaveId: `LV-${index}`, from, to, days: (Date.parse(to) - Date.parse(from)) / 86400000 + 1, type: 'Casual Leave', status: 'Approved' });
    }
  }
  await Attendance.create({ userId: owner, employeeId: 'EMP-2', name: 'Other employee', date: '2026-11-15', status: 'Present' });
  await Leave.create({ userId: owner, empId: 'EMP-2', name: 'Other employee', leaveId: 'LV-other', from: '2026-11-15', to: '2026-11-15', days: 1 });
});
after(async () => {
  if (!uri || mongoose.connection.readyState !== 1) return;
  assert.equal(mongoose.connection.name, dbName);
  assert.match(dbName, /^gobook_employee_month_test_\d+_\d+$/);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
async function invoke(handler, query = { month: '2026-11' }) {
  let data;
  let error;
  await handler({ employeeUser: { ownerUserId: owner, employeeId: 'EMP-1' }, query }, { json: (value) => { data = value; } }, (value) => { error = value; });
  return { data, error };
}

test('attendance and corrections exclude adjacent months and other tenants/employees', options, async () => {
  for (const [handler, count] of [[adminMonthlyAttendance, 3], [employeeMonthlyAttendance, 2], [adminCorrections, 2]]) {
    const result = await invoke(handler);
    assert.ifError(result.error);
    assert.equal(result.data.data.length, count);
    assert.ok(result.data.data.every((row) => row.date.startsWith('2026-11')));
    assert.ok(result.data.data.every((row) => String(row.userId || row.ownerUserId) === String(owner)));
  }
});
test('leave lists include overlapping requests but never other months or employees', options, async () => {
  for (const [handler, count] of [[adminLeaves, 4], [employeeLeaveStatus, 3], [employeeLeaveHistory, 3]]) {
    const result = await invoke(handler);
    assert.ifError(result.error);
    assert.equal(result.data.data.length, count);
    assert.ok(result.data.data.every((row) => row.from <= '2026-11-30' && row.to >= '2026-11-01'));
    assert.ok(result.data.data.every((row) => String(row.userId) === String(owner)));
  }
  const result = await invoke(adminLeaves, { month: '2026-11', includeAnnualBalances: 'true' });
  assert.equal(result.data.data.length, 4);
  assert.equal(result.data.balances.find((row) => row.empId === 'EMP-1').used, 9);
});
test('payroll, payslips and holidays return only the selected month', options, async () => {
  for (const [handler, count] of [[adminPayroll, 1], [employeePayslips, 1], [adminHolidays, 2], [employeeHolidays, 2]]) {
    const result = await invoke(handler);
    assert.ifError(result.error);
    assert.equal(result.data.data.length, count);
    assert.ok(result.data.data.every((row) => (row.month || row.date).startsWith('2026-11')));
    assert.ok(result.data.data.every((row) => String(row.userId || row.ownerUserId) === String(owner)));
  }
});
test('changing months retrieves that month and malformed/all-month requests are rejected', options, async () => {
  assert.equal((await invoke(adminPayroll, { month: '2026-10' })).data.data[0].month, '2026-10');
  for (const handler of [adminMonthlyAttendance, adminLeaves, adminPayroll, employeeHolidays]) {
    assert.equal((await invoke(handler, { month: 'all' })).error.statusCode, 400);
    assert.equal((await invoke(handler, { month: '2026-13' })).error.statusCode, 400);
  }
});
