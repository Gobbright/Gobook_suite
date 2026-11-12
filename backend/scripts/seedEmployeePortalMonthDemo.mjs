import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { env } from '../src/config/env.js';
import { Employee } from '../src/models/Employee.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { Payroll } from '../src/models/Payroll.js';
import { EmployeePermission } from '../src/models/EmployeePermission.js';
import { AttendanceCorrection } from '../src/models/AttendanceCorrection.js';
import { Holiday } from '../src/models/Holiday.js';

if (env.nodeEnv === 'production' || !/^mongodb:\/\/(127\.0\.0\.1|localhost):27018\//.test(env.mongodbUri) || env.mongodbDbName !== 'gobook_local_demo') throw new Error('Demo data can only be added to the local gobook_local_demo database on port 27018.');
const dateArgument = process.argv.find((arg) => arg.startsWith('--as-of='))?.split('=')[1];
const asOf = dateArgument ? DateTime.fromISO(dateArgument, { zone: 'Asia/Kolkata' }) : DateTime.now().setZone('Asia/Kolkata');
if (!asOf.isValid) throw new Error('Choose a valid --as-of=YYYY-MM-DD date');
const days = Array.from({ length: 30 }, (_, index) => asOf.startOf('day').minus({ days: 30 - index }));
const workDays = days.filter((date) => date.weekday !== 7);
const apply = process.argv.includes('--apply');
try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const employees = await Employee.find({ email: /@gobook\.(local|test)$/, status: { $in: ['Active', 'Probation', 'On Leave'] } }).sort({ employeeId: 1 }).lean();
  console.log(JSON.stringify({ database: mongoose.connection.name, apply, employees: employees.length, from: days[0].toISODate(), to: days.at(-1).toISODate(), plannedAttendance: employees.length * days.length, existingRowsPreserved: true, passwordsUnchanged: true }));
  if (apply) {
    const counts = { attendance: 0, leaves: 0, payroll: 0, permissions: 0, corrections: 0, holidays: 0 };
    for (const [index, employee] of employees.entries()) {
      const leaveDate = workDays[(index * 3 + 5) % workDays.length].toISODate();
      const leaveStatus = ['Approved', 'Pending', 'Rejected'][index % 3];
      for (const [dayIndex, day] of days.entries()) {
        const date = day.toISODate();
        const status = date === workDays.at(-1).toISODate() ? 'Holiday' : day.weekday === 7 ? 'Weekly Off' : date === leaveDate && leaveStatus === 'Approved' ? 'On Leave' : (dayIndex + index) % 13 === 0 ? 'Absent' : (dayIndex + index) % 7 === 0 ? 'Late' : 'Present';
        const worked = ['Present', 'Late'].includes(status);
        const late = status === 'Late';
        const result = await Attendance.updateOne({ userId: employee.userId, employeeId: employee.employeeId, date }, { $setOnInsert: { userId: employee.userId, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, date, status, checkIn: worked ? late ? '09:25' : '08:55' : '--', checkOut: worked ? '17:35' : '--', hours: worked ? late ? '8h 10m' : '8h 40m' : '--', shift: employee.shift, remarks: '[DEMO] One-month employee attendance sample' } }, { upsert: true, runValidators: true });
        counts.attendance += result.upsertedCount || 0;
      }
      const leave = await Leave.updateOne({ userId: employee.userId, leaveId: `DEMO-MONTH-${employee.employeeId}-${leaveDate}` }, { $setOnInsert: { userId: employee.userId, leaveId: `DEMO-MONTH-${employee.employeeId}-${leaveDate}`, empId: employee.employeeId, name: employee.name, dept: employee.dept, type: index % 2 ? 'Sick Leave' : 'Casual Leave', from: leaveDate, to: leaveDate, days: 1, status: leaveStatus, applied: days[0].toISODate(), reason: '[DEMO] Sample leave request', recordedBy: 'Local Demo' } }, { upsert: true, runValidators: true });
      counts.leaves += leave.upsertedCount || 0;
      const structure = employee.salaryStructure || {};
      const allowances = ['hra', 'specialAllowance', 'conveyanceAllowance', 'medicalAllowance', 'otherAllowances'].reduce((sum, key) => sum + Number(structure[key] || 0), 0);
      const deductions = ['pf', 'esi', 'professionalTax', 'tds', 'otherDeduction', 'loanDeduction'].reduce((sum, key) => sum + Number(structure[key] || 0), 0);
      const payroll = await Payroll.updateOne({ userId: employee.userId, employeeId: employee.employeeId, month: asOf.toFormat('yyyy-MM') }, { $setOnInsert: { userId: employee.userId, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, month: asOf.toFormat('yyyy-MM'), basic: employee.basicSalary, allowances, deductions, net: Math.max(0, Number(employee.basicSalary || 0) + allowances - deductions), status: 'Pending' } }, { upsert: true, runValidators: true });
      counts.payroll += payroll.upsertedCount || 0;
      const permissionDate = workDays[(index * 2 + 7) % workDays.length].toISODate();
      const permission = await EmployeePermission.updateOne({ ownerUserId: employee.userId, employeeObjectId: employee._id, date: permissionDate, reason: '[DEMO] Sample personal appointment' }, { $setOnInsert: { ownerUserId: employee.userId, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, date: permissionDate, fromTime: '10:00', toTime: '11:00', reason: '[DEMO] Sample personal appointment', status: ['Pending', 'Approved', 'Rejected'][index % 3] } }, { upsert: true, runValidators: true });
      counts.permissions += permission.upsertedCount || 0;
      const correction = await AttendanceCorrection.updateOne({ ownerUserId: employee.userId, employeeId: employee.employeeId, date: permissionDate, reason: '[DEMO] Missing punch correction' }, { $setOnInsert: { ownerUserId: employee.userId, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, date: permissionDate, checkIn: '09:00', checkOut: '17:35', reason: '[DEMO] Missing punch correction', status: 'Pending' } }, { upsert: true, runValidators: true });
      counts.corrections += correction.upsertedCount || 0;
    }
    for (const ownerUserId of [...new Set(employees.map((row) => String(row.userId)))]) {
      const holiday = await Holiday.updateOne({ ownerUserId, date: workDays.at(-1).toISODate() }, { $setOnInsert: { ownerUserId, date: workDays.at(-1).toISODate(), name: '[DEMO] Company Holiday', description: 'Local demo calendar entry', type: 'Company' } }, { upsert: true, runValidators: true });
      counts.holidays += holiday.upsertedCount || 0;
      await Attendance.updateMany({ userId: ownerUserId, date: workDays.at(-1).toISODate(), remarks: '[DEMO] One-month employee attendance sample' }, { $set: { status: 'Holiday', checkIn: '--', checkOut: '--', hours: '--' } });
    }
    console.log(JSON.stringify({ inserted: counts, employeeCount: employees.length, attendanceDays: days.length }));
  }
} finally { await mongoose.disconnect(); }
