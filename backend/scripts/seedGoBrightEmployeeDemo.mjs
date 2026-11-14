import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import { env } from '../src/config/env.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { Payroll } from '../src/models/Payroll.js';
import { Holiday } from '../src/models/Holiday.js';
import { EmployeePermission } from '../src/models/EmployeePermission.js';
import { AttendanceCorrection } from '../src/models/AttendanceCorrection.js';
import { HRDocument } from '../src/models/Document.js';
import { employeeAccessView } from '../src/services/employeeAccess.js';
import { storeBuffer, findStoredFile, GRIDFS_BUCKET } from '../src/services/gridfsStorage.js';

// Explicitly authorized, account-scoped sample data in the active local checkout.
// No existing record, password, mailbox, owner setting or authentication rule is replaced.
const EMAIL = 'gobright.growth@gmail.com';
const OWNER_ID = '6ae078d0374390c8a7f40989';
const DATABASE = 'gobook_live_local';
const MARKER = '[DEMO:GBRIGHT-30D-20261113]';
const end = DateTime.fromISO('2026-11-13', { zone: 'Asia/Kolkata' });
const start = end.minus({ days: 29 });
const dates = Array.from({ length: 30 }, (_, index) => start.plus({ days: index }));
const months = [...new Set(dates.map(day => day.toFormat('yyyy-MM')))];
const apply = process.argv.includes('--apply');
const verifyOnly = process.argv.includes('--verify');
const output = path.resolve('runtime/gobright-employee-demo');
const profiles = [
  ['Arun Kumar', 'Sales', 'Sales Executive', 26000, 'Male'],
  ['Divya S', 'Billing', 'Billing Executive', 24000, 'Female'],
  ['Karthik Raj', 'Inventory', 'Inventory Coordinator', 28000, 'Male'],
  ['Meena Priya', 'Accounts', 'Accounts Executive', 32000, 'Female'],
  ['Suresh Babu', 'HR', 'HR Executive', 30000, 'Male'],
  ['Prakash S', 'Sales', 'Sales Associate', 23000, 'Male'],
  ['Nithya R', 'Billing', 'Billing Associate', 25000, 'Female'],
  ['Vignesh M', 'Inventory', 'Store Executive', 27000, 'Male'],
  ['Kavitha R', 'Accounts', 'Accounts Associate', 29000, 'Female'],
  ['Saravanan K', 'HR', 'HR Associate', 26000, 'Male'],
];
const leaveDates = ['2026-11-04', '2026-11-06', '2026-11-11', '2026-11-13'];
const requestDates = ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12'];
const states = ['Approved', 'Pending', 'Rejected', 'Pending'];
const holidayRows = [
  ['2026-10-23', 'Sample company holiday', 'Company'],
  ['2026-11-09', 'Sample office holiday', 'Company'],
  ['2026-11-12', 'Sample optional holiday', 'Optional'],
];
const nonWorkingHolidays = new Set(holidayRows.filter(row => row[2] !== 'Optional').map(row => row[0]));
const documentTypes = [
  ['ID Proof', 'Sample ID proof placeholder'],
  ['Address Proof', 'Sample address proof placeholder'],
  ['Certificates', 'Sample training certificate'],
  ['Contracts', 'Sample employment terms'],
  ['Other Documents', 'Sample onboarding checklist'],
];
const models = [
  [Employee, 'userId'], [EmployeeLogin, 'ownerUserId'], [Attendance, 'userId'],
  [Leave, 'userId'], [Payroll, 'userId'], [EmployeePermission, 'ownerUserId'],
  [AttendanceCorrection, 'ownerUserId'], [Holiday, 'ownerUserId'], [HRDocument, 'userId'],
];

function assertLocalTarget() {
  assert.ok(/^mongodb:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(env.mongodbUri), 'Only loopback MongoDB is allowed');
  assert.equal(env.mongodbDbName, DATABASE, 'Refusing an unexpected database');
  assert.notEqual(env.nodeEnv, 'production', 'Refusing a production process');
  assert.ok(end.toISODate() <= DateTime.now().setZone('Asia/Kolkata').toISODate(), 'Attendance must not be in the future');
}

async function counts(ownerId, other = false) {
  return Object.fromEntries(await Promise.all(models.map(async ([Model, key]) => [Model.collection.name, await Model.countDocuments({ [key]: other ? { $ne: ownerId } : ownerId })])));
}

function employeeData(owner, index) {
  const [name, dept, designation, basicSalary, gender] = profiles[index];
  return {
    userId: owner._id, category: owner.category, employeeId: `EMP-${String(index + 1).padStart(3, '0')}`,
    name, dept, designation, basicSalary, gender, status: 'Active', employeeRole: 'employee',
    email: `gobright.growth+emp${String(index + 1).padStart(3, '0')}@gmail.com`,
    phone: `90000010${String(index + 1).padStart(2, '0')}`,
    address: `${index + 1}, Sample Staff Street, Chennai [DEMO]`, branch: 'Chennai',
    joinDate: '2026-10-01', dateOfBirth: `${1990 + index}-01-15`, bloodGroup: ['O+', 'A+', 'B+', 'O+', 'AB+'][index % 5],
    reportingManager: 'GoBright', employmentType: 'Full Time', shift: 'General (09:00–18:00)', workLocation: 'Chennai Office [DEMO]',
    emergencyContact: { name: `Sample contact ${index + 1}`, relationship: 'Family', phone: `90000020${String(index + 1).padStart(2, '0')}` },
    loginAccess: true,
    salaryStructure: { hra: 4000 + index * 500, specialAllowance: 1500, conveyanceAllowance: 1600, medicalAllowance: 1000, otherAllowances: 500, pf: 1500 + index * 100, esi: 0, professionalTax: 200, tds: index > 2 ? 500 : 0, otherDeduction: 100, loanDeduction: index === 2 ? 500 : 0 },
  };
}

async function insert(Model, filter, values) {
  assert.equal(String(values.userId || values.ownerUserId), OWNER_ID, 'Write escaped the authorized owner');
  await new Model(values).validate();
  const result = await Model.updateOne(filter, { $setOnInsert: values }, { upsert: true, runValidators: true });
  return result.upsertedCount || 0;
}

async function pdfFor(employee, title, category) {
  const doc = new PDFDocument({ size: 'A4', margin: 54, info: { Title: `${title} - ${employee.employeeId}`, Author: 'GoBright demo seed' } });
  const chunks = [];
  const done = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.fontSize(12).fillColor('#2563eb').text('GoBright | Employee sample document');
  doc.moveDown().fontSize(21).fillColor('#172b4d').text(title);
  doc.moveDown().fontSize(13).fillColor('#b45309').text('SAMPLE ONLY - NOT A VALID ID, CERTIFICATE OR CONTRACT');
  doc.moveDown().fontSize(12).fillColor('#334155');
  for (const line of [`Employee: ${employee.name}`, `Employee ID: ${employee.employeeId}`, `Department: ${employee.dept}`, `Designation: ${employee.designation}`, `Category: ${category}`, `Sample period: ${start.toISODate()} to ${end.toISODate()}`, `Data marker: ${MARKER}`]) doc.text(line).moveDown(.5);
  doc.moveDown().text('This file is generated solely to demonstrate document viewing and downloading in employee management. It does not verify identity, qualifications, employment terms or any legal entitlement.');
  doc.end();
  return done;
}

async function readViews(owner, employees) {
  const portal = await import('../src/modules/employee-portal/portalController.js');
  const self = await import('../src/modules/employee-portal/selfServiceController.js');
  const access = await import('../src/modules/employee-portal/accessController.js');
  async function read(handler, employee, month = '2026-11') {
    let body;
    const req = { query: { month, date: end.toISODate() }, params: { id: employee?._id }, employeeUser: { ownerUserId: owner._id, role: employee ? 'employee' : 'admin', employeeId: employee?.employeeId, employeeObjectId: employee?._id } };
    await handler(req, { json(value) { body = value; } }, error => { throw error; });
    assert.ok(body, 'Read controller must return data');
    return body;
  }
  const dashboard = await read(portal.adminDashboard);
  assert.equal(dashboard.employees, 10);
  const admin = {};
  for (const [name, handler, expected] of [
    ['employees', portal.listAdminEmployees, 10], ['todayAttendance', portal.adminTodayAttendance, 10],
    ['monthlyAttendance', portal.adminMonthlyAttendance, 130], ['leaveRequests', portal.adminLeaves, 40],
    ['correctionRequests', portal.adminCorrections, 40], ['payroll', portal.adminPayroll, 10],
    ['holidays', portal.adminHolidays, 2], ['permissionRequests', self.listEmployeePermissions, 40],
  ]) {
    const result = await read(handler);
    assert.equal(result.data.length, expected, `${name} must show the seeded records in November`);
    admin[name] = result.data.length;
  }
  const employeeViews = [];
  for (const employee of employees) {
    const dashboard = await read(portal.employeeDashboard, employee);
    const documents = await read(self.employeeDocuments, employee);
    const attendance = await read(portal.employeeMonthlyAttendance, employee);
    const leaves = await read(portal.employeeLeaveStatus, employee);
    const history = await read(portal.employeeLeaveHistory, employee);
    const permissions = await read(self.listEmployeePermissions, employee);
    const payslips = await read(portal.employeePayslips, employee);
    const overview = await read(access.getEmployeeOverview, employee);
    assert.equal(dashboard.attendance, 13);
    assert.equal(dashboard.documents, 4);
    assert.equal(documents.data.length, 4);
    assert.equal(attendance.data.length, 13);
    assert.equal(leaves.data.length, 4);
    assert.equal(history.data.length, 4);
    assert.equal(permissions.data.length, 4);
    assert.equal(payslips.data.length, 1);
    assert.equal(overview.documents, 4);
    for (const row of attendance.data) assert.equal(row.employeeId, employee.employeeId);
    for (const row of leaves.data) assert.equal(row.empId, employee.employeeId);
    for (const row of permissions.data) assert.equal(String(row.employeeObjectId), String(employee._id));
    for (const row of payslips.data) assert.equal(row.employeeId, employee.employeeId);
    employeeViews.push({ employeeId: employee.employeeId, attendance: attendance.data.length, leaveRequests: leaves.data.length, permissions: permissions.data.length, documents: documents.data.length, payslips: payslips.data.length });
  }
  return { month: '2026-11', admin, employeeViews, departmentCount: new Set(employees.map(employee => employee.dept)).size, designationCount: new Set(employees.map(employee => employee.designation)).size };
}

async function verify(owner) {
  const totals = await counts(owner._id);
  assert.deepEqual(totals, { employees: 10, employeelogins: 10, attendances: 300, leaves: 40, payrolls: 20, employeepermissions: 40, attendancecorrections: 40, holidays: 3, hrdocuments: 40 });
  const employees = await Employee.find({ userId: owner._id }).sort({ employeeId: 1 }).lean();
  const documents = await HRDocument.find({ userId: owner._id }).lean();
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: GRIDFS_BUCKET });
  for (const employee of employees) {
    assert.equal(await Attendance.countDocuments({ userId: owner._id, employeeId: employee.employeeId, date: { $gte: start.toISODate(), $lte: end.toISODate() } }), 30);
    assert.equal(await HRDocument.countDocuments({ userId: owner._id, empId: String(employee._id) }), 4);
    assert.equal(await EmployeeLogin.countDocuments({ ownerUserId: owner._id, employeeObjectId: employee._id, loginEnabled: true }), 1);
    assert.equal(employee.portalAlias, employeeAccessView(employee, owner).businessSlug);
  }
  for (const document of documents) {
    const file = await findStoredFile(document.gridFsFileId, { 'metadata.userId': owner._id, 'metadata.kind': 'hr-document' });
    assert.ok(file, 'Document must point to a readable file owned by this business');
    const chunks = [];
    for await (const chunk of bucket.openDownloadStream(document.gridFsFileId)) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), '%PDF-');
  }
  const rows = await Payroll.find({ userId: owner._id }).lean();
  for (const row of rows) assert.equal(row.net, row.basic + row.allowances - row.deductions);
  const approved = await Leave.find({ userId: owner._id, status: 'Approved' }).lean();
  for (const leave of approved) assert.equal((await Attendance.findOne({ userId: owner._id, employeeId: leave.empId, date: leave.from }).lean())?.status, 'On Leave');
  for (const [index, employee] of employees.entries()) {
    assert.equal(employee.name, profiles[index][0]);
    assert.equal(employee.basicSalary, profiles[index][3]);
  }
  assert.equal(await Attendance.countDocuments({ userId: owner._id, date: { $gt: end.toISODate() } }), 0);
  const views = await readViews(owner, employees);
  const report = { verified: true, database: DATABASE, account: EMAIL, from: start.toISODate(), to: end.toISODate(), months, totals, views,
    documentCategories: await HRDocument.distinct('category', { userId: owner._id }),
    employees: employees.map(employee => ({ employeeId: employee.employeeId, name: employee.name, department: employee.dept, loginPath: employeeAccessView(employee, owner).loginPath })),
    passwords: 'Random passwords are stored as hashes only. Set a chosen password in employee Login Settings before manual login.',
    emailDelivery: 'No emails sent; OTP sender configuration and email verification were not changed.' };
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}

assertLocalTarget();
try {
  await mongoose.connect(env.mongodbUri, { dbName: DATABASE, serverSelectionTimeoutMS: 5000, autoIndex: false });
  const owner = await AppUser.findOne({ _id: OWNER_ID, email: EMAIL }).select('name email businessName category status').lean();
  assert.ok(owner, 'The exact authorized account must exist');
  assert.equal(owner.status, 'Active');
  if (verifyOnly) { console.log(JSON.stringify(await verify(owner), null, 2)); }
  else {
    const existing = await Employee.find({ userId: owner._id }).select('employeeId name email').lean();
    assert.ok(existing.length === 0 || existing.length <= profiles.length && existing.every((employee, index) => profiles.some((profile, i) => profile[0] === employee.name && employee.employeeId === `EMP-${String(i + 1).padStart(3, '0')}` && employee.email === employeeData(owner, i).email)), 'Existing employees differ from this demo; refusing to change them');
    for (let i = 0; i < profiles.length; i++) await new Employee(employeeData(owner, i)).validate();
    const before = await counts(owner._id);
    console.log(JSON.stringify({ apply, database: DATABASE, account: EMAIL, from: start.toISODate(), to: end.toISODate(), before, planned: { employees: 10, attendance: 300, leaves: 40, permissions: 40, corrections: 40, documents: 40, payroll: 20, holidays: 3 }, preservesExistingRecords: true }, null, 2));
    if (apply) {
      await fs.mkdir(output, { recursive: true });
      const snapshot = path.join(output, 'before.json');
      try { await fs.writeFile(snapshot, JSON.stringify({ database: DATABASE, account: EMAIL, ownerId: OWNER_ID, before, capturedAt: new Date().toISOString() }, null, 2), { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const otherBefore = await counts(owner._id, true);
      const ownerBefore = createHash('sha256').update(JSON.stringify(await AppUser.collection.findOne({ _id: owner._id }))).digest('hex');
      for (let i = 0; i < profiles.length; i++) {
        const data = employeeData(owner, i);
        await insert(Employee, { userId: owner._id, employeeId: data.employeeId }, data);
        const employee = await Employee.findOne({ userId: owner._id, employeeId: data.employeeId }).lean();
        const access = employeeAccessView(employee, owner);
        if (!employee.portalAlias) await Employee.updateOne({ _id: employee._id, userId: owner._id, portalAlias: { $exists: false } }, { $set: { portalAlias: access.businessSlug } });
        if (!await EmployeeLogin.exists({ ownerUserId: owner._id, employeeId: employee.employeeId })) {
          await insert(EmployeeLogin, { ownerUserId: owner._id, employeeId: employee.employeeId }, { ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, category: owner.category, role: 'employee', loginSlug: access.businessSlug, passwordHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 12), loginEnabled: true, status: 'Active' });
        }
        const approvedDates = new Set();
        for (let j = 0; j < 4; j++) {
          const status = states[(i + j) % states.length];
          const date = leaveDates[j];
          if (status === 'Approved') approvedDates.add(date);
          const leaveId = `DEMO-GB-${employee.employeeId}-${j + 1}`;
          await insert(Leave, { userId: owner._id, leaveId }, { userId: owner._id, leaveId, empId: employee.employeeId, name: employee.name, dept: employee.dept, type: ['Casual Leave', 'Sick Leave', 'Annual Leave', 'Unpaid Leave'][(i + j) % 4], from: date, to: date, days: 1, status, applied: '2026-11-01', reason: `${MARKER} Sample leave request ${j + 1}`, recordedBy: 'GoBright Demo' });
          const requestDate = requestDates[j];
          const reviewed = status === 'Pending' ? {} : { reviewedBy: EMAIL, reviewedAt: new Date(`${requestDate}T10:00:00+05:30`) };
          await insert(EmployeePermission, { ownerUserId: owner._id, employeeObjectId: employee._id, date: requestDate, reason: `${MARKER} Sample permission ${j + 1}` }, { ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, date: requestDate, fromTime: '15:00', toTime: '16:00', reason: `${MARKER} Sample permission ${j + 1}`, status, ...reviewed });
          await insert(AttendanceCorrection, { ownerUserId: owner._id, employeeId: employee.employeeId, date: requestDate, reason: `${MARKER} Sample correction ${j + 1}` }, { ownerUserId: owner._id, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, date: requestDate, checkIn: '09:00', checkOut: '18:00', reason: `${MARKER} Sample correction ${j + 1}`, status, ...reviewed });
          const [category, title] = documentTypes[(i + j) % documentTypes.length];
          const name = `${MARKER} ${title}.pdf`;
          const filter = { userId: owner._id, empId: String(employee._id), name };
          if (!await HRDocument.exists(filter)) {
            const buffer = await pdfFor(employee, title, category);
            const stored = await storeBuffer({ buffer, filename: `DEMO-${employee.employeeId}-${j + 1}.pdf`, contentType: 'application/pdf', metadata: { kind: 'hr-document', userId: owner._id, empId: String(employee._id), category, employee: employee.name, demo: MARKER } });
            await insert(HRDocument, filter, { ...filter, employee: employee.name, category, uploadedBy: 'GoBright Demo', uploadedOn: requestDate, size: `${(buffer.length / 1024).toFixed(1)} KB`, gridFsFileId: stored.id, mimeType: 'application/pdf' });
          }
        }
        for (const [dayIndex, day] of dates.entries()) {
          const date = day.toISODate();
          let status = nonWorkingHolidays.has(date) ? 'Holiday' : day.weekday >= 6 ? 'Weekly Off' : approvedDates.has(date) ? 'On Leave' : (i + dayIndex) % 17 === 0 ? 'Absent' : (i + dayIndex) % 9 === 0 ? 'Late' : (i + dayIndex) % 11 === 0 ? 'WFH' : 'Present';
          if (date === end.toISODate() && !approvedDates.has(date)) status = ['Present', 'Late', 'Absent', 'Present', 'Present'][i % 5];
          const approvedCorrection = requestDates.some((requestDate, j) => requestDate === date && states[(i + j) % states.length] === 'Approved');
          if (approvedCorrection) status = 'Present';
          const worked = ['Present', 'Late', 'WFH'].includes(status);
          await insert(Attendance, { userId: owner._id, employeeId: employee.employeeId, date }, { userId: owner._id, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, date, status, checkIn: worked ? status === 'Late' ? '09:25' : '09:00' : '--', checkOut: worked ? '18:00' : '--', hours: worked ? status === 'Late' ? '8h 35m' : '9h 0m' : '--', shift: employee.shift, remarks: `${MARKER} Sample attendance` });
        }
        const structure = employee.salaryStructure;
        const allowances = ['hra', 'specialAllowance', 'conveyanceAllowance', 'medicalAllowance', 'otherAllowances'].reduce((total, key) => total + Number(structure[key] || 0), 0);
        const deductions = ['pf', 'esi', 'professionalTax', 'tds', 'otherDeduction', 'loanDeduction'].reduce((total, key) => total + Number(structure[key] || 0), 0);
        for (const month of months) await insert(Payroll, { userId: owner._id, employeeId: employee.employeeId, month }, { userId: owner._id, employeeId: employee.employeeId, name: employee.name, dept: employee.dept, month, basic: employee.basicSalary, allowances, deductions, net: employee.basicSalary + allowances - deductions, status: month === end.toFormat('yyyy-MM') ? 'Pending' : 'Paid' });
      }
      for (const [date, name, type] of holidayRows) await insert(Holiday, { ownerUserId: owner._id, date }, { ownerUserId: owner._id, date, name: `${MARKER} ${name}`, type, description: 'Demonstration calendar entry; not an official holiday declaration.' });
      assert.deepEqual(await counts(owner._id, true), otherBefore, 'Another account changed during this seed; inspect before reporting success');
      assert.equal(createHash('sha256').update(JSON.stringify(await AppUser.collection.findOne({ _id: owner._id }))).digest('hex'), ownerBefore, 'Owner account must remain unchanged');
      console.log(JSON.stringify(await verify(owner), null, 2));
    }
  }
} finally { await mongoose.disconnect(); }
