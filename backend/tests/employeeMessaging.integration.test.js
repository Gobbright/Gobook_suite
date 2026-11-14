import assert from 'node:assert/strict';
import test, { before, after, mock } from 'node:test';
import { once } from 'node:events';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import { apiRouter } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { EmployeeNotification } from '../src/models/EmployeeNotification.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Payroll } from '../src/models/Payroll.js';
import { Attendance } from '../src/models/Attendance.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { createSecuritySession } from '../src/services/securitySessions.js';
import { employeeCredential } from '../src/services/employeeAccess.js';
import { signPortalToken } from '../src/services/employeePortalSession.js';
import { signToken } from '../src/modules/auth/authController.js';
import { dispatchEmployeeNotifications } from '../src/services/employeeNotifications.js';
import { storeBuffer } from '../src/services/gridfsStorage.js';
import { employeeMailBranding } from '../src/services/employeeMailBranding.js';
import { employeeMonth } from '../src/services/employeeMonth.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_messaging_test_${process.pid}_${Date.now()}`;
const businesses = [], mails = [];
const month = employeeMonth().month;
let server, base, failMail = false;
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, type, data: type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
  mock.method(nodemailer, 'createTransport', (transport) => ({ verify: async () => true, sendMail: async (mail) => { if (failMail) throw new Error('Private SMTP credentials must not leak'); mails.push({ ...mail, smtp: transport.auth }); return { accepted: [mail.to], rejected: [], messageId: 'fixture-message' }; } }));
  for (const name of ['alpha', 'beta']) {
    const owner = await AppUser.create({ name, businessName: `${name} business`, email: `${name}@example.test`, password: await bcrypt.hash('Owner@123', 4), role: 'Super Admin', accountType: 'owner', businessId: new mongoose.Types.ObjectId(), status: 'Active', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), paymentMethodVerified: true, onboardingCompleted: true });
    const session = await createLoginSession(owner, { headers: {}, ip: '127.0.0.1' });
    const logo = await storeBuffer({ buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6e8AAAAASUVORK5CYII=', 'base64'), filename: `${name}-logo.png`, contentType: 'image/png', metadata: { kind: 'business-logo', userId: owner._id } });
    const settings = await BusinessSettings.create({ userId: owner._id, businessName: owner.businessName, logoFileId: logo.id, logoUrl: `/api/files/logos/${logo.id}`, emailSmtpUser: `${name}-sender@gmail.com`, emailSmtpPass: 'fixture-app-password', emailSmtpHost: 'smtp.gmail.com', emailSmtpVerifiedAt: new Date() });
    const employees = [];
    for (const number of [1, 2]) {
      const employee = await Employee.create({ userId: owner._id, employeeId: `EMP-00${number}`, name: `${name} employee ${number}`, email: `${name}-employee${number}@example.test`, dept: number === 1 ? 'Sales' : 'Office', loginAccess: true, basicSalary: 20000, salaryStructure: { pf: 1200, esi: 150, tds: 0 } });
      const login = await EmployeeLogin.create({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, passwordHash: await bcrypt.hash('Employee@123', 4), role: 'employee', loginEnabled: true, status: 'Active' });
      const sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, employee), '1d');
      const token = signPortalToken({ id: login._id, ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, role: 'employee' }, sid);
      employees.push({ employee, token });
    }
    businesses.push({ owner, settings, ownerToken: signToken(owner, session.sessionId), employees });
  }
  const app = express(); app.use(express.json()); app.use('/api', apiRouter); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  mock.restoreAll(); if (server) await new Promise((resolve) => server.close(resolve));
  if (uri && mongoose.connection.readyState === 1) { assert.equal(mongoose.connection.name, dbName); assert.match(dbName, /^gobook_employee_messaging_test_\d+_\d+$/); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});
test('bulk messages persist per employee, reject foreign recipients and deduplicate retried submissions', options, async () => {
  const [alpha, beta] = businesses;
  const body = { title: 'Team update', message: 'Please review the business update.', allEmployees: true, requestId: 'notification-batch-0001' };
  assert.equal((await call('/admin/employee-notifications', alpha.ownerToken, body)).status, 202);
  assert.equal((await call('/admin/employee-notifications', alpha.ownerToken, body)).status, 202);
  assert.equal(await EmployeeNotification.countDocuments({ ownerUserId: alpha.owner._id }), 2);
  assert.equal((await call('/admin/employee-notifications', alpha.ownerToken, { ...body, message: 'Different content' })).status, 409);
  assert.equal((await call('/admin/employee-notifications', alpha.ownerToken, { ...body, requestId: 'notification-batch-foreign', allEmployees: false, employeeIds: [String(beta.employees[0].employee._id)] })).status, 404);
  assert.equal((await call('/admin/employee-notifications', alpha.employees[0].token, body)).status, 403);
});
test('inbox identity cannot be overridden; only the intended employee can record a read receipt', options, async () => {
  const [alpha, beta] = businesses;
  const first = await call('/employee/notifications?employee=' + alpha.employees[1].employee._id, alpha.employees[0].token);
  assert.equal(first.data.total, 1);
  assert.equal(first.data.data[0].employeeId, 'EMP-001');
  const id = first.data.data[0]._id;
  assert.equal((await call(`/employee/notifications/${id}/read`, alpha.employees[1].token, {}, 'PUT')).status, 404);
  assert.equal((await call(`/employee/notifications/${id}/read`, beta.employees[0].token, {}, 'PUT')).status, 404);
  const viewed = await call(`/employee/notifications/${id}/read`, alpha.employees[0].token, {}, 'PUT');
  assert.equal(viewed.status, 200); assert.ok(viewed.data.readAt);
  assert.equal((await call(`/employee/notifications/${id}/read`, alpha.employees[0].token, {}, 'PUT')).data.readAt, viewed.data.readAt);
  const owner = await call('/admin/employee-notifications?read=read', alpha.ownerToken);
  assert.equal(owner.data.total, 1);
  assert.equal((await call('/admin/employee-notifications', beta.ownerToken)).data.total, 0);
});
test('mail dispatch uses the connected owner mailbox and inline owner logo, including parallel workers', options, async () => {
  const [alpha] = businesses;
  await Promise.all([dispatchEmployeeNotifications(), dispatchEmployeeNotifications()]);
  assert.equal(mails.length, 2);
  for (const mail of mails) {
    assert.equal(mail.smtp.user, alpha.settings.emailSmtpUser);
    assert.equal(mail.from.address, alpha.settings.emailSmtpUser);
    assert.equal(mail.from.name, alpha.owner.businessName);
    assert.ok(mail.html.includes('cid:employee-business-logo@gobook'));
    assert.equal(mail.html.includes('cid:gobook-logo-full@gobook'), false);
    assert.equal(mail.attachments[0].filename, 'alpha-logo.png');
  }
  assert.equal(await EmployeeNotification.countDocuments({ emailStatus: 'Accepted' }), 2);
});
test('failed email remains recoverable in the inbox and retry preserves its read receipt', options, async () => {
  const [alpha] = businesses;
  const employee = alpha.employees[0];
  await call('/admin/employee-notifications', alpha.ownerToken, { title: 'Retry example', message: 'Saved even when mail fails', employeeIds: [String(employee.employee._id)], requestId: 'notification-retry-0001' });
  failMail = true; await dispatchEmployeeNotifications(); failMail = false;
  const row = await EmployeeNotification.findOne({ requestKey: 'notification-retry-0001' }).lean();
  assert.equal(row.emailStatus, 'Failed'); assert.doesNotMatch(row.lastError, /Private SMTP/);
  const viewed = await call(`/employee/notifications/${row._id}/read`, employee.token, {}, 'PUT');
  assert.equal((await call(`/admin/employee-notifications/${row._id}/retry`, alpha.ownerToken, {})).status, 200);
  await dispatchEmployeeNotifications();
  const saved = await EmployeeNotification.findById(row._id).lean();
  assert.equal(saved.emailStatus, 'Accepted'); assert.equal(saved.readAt.toISOString(), viewed.data.readAt);
  assert.equal(saved.attempts, 2);
});
test('another business logo is never attached to this owner email', options, async () => {
  const [alpha, beta] = businesses;
  const brand = await employeeMailBranding(alpha.owner._id, { businessName: 'Alpha', logoFileId: beta.settings.logoFileId });
  assert.equal(brand.attachments.length, 0); assert.equal(brand.branding.name, 'Alpha');
});
test('payroll reports, PDFs and true Excel files use saved records and enforce tenant and employee scope', options, async () => {
  const [alpha, beta] = businesses;
  const generated = await call('/admin/payroll/generate', alpha.ownerToken, { month });
  assert.equal(generated.status, 201);
  await Payroll.create({ userId: beta.owner._id, employeeId: 'EMP-001', name: 'Other business secret', month, basic: 99999, net: 99999 });
  await Attendance.create({ userId: alpha.owner._id, employeeId: 'EMP-001', name: alpha.employees[0].employee.name, date: `${month}-01`, checkIn: '09:00', checkOut: '18:00', breakMinutes: 60, hours: '8h 0m' });
  const result = await call(`/admin/employee-reports/all/xlsx?month=${month}`, alpha.ownerToken);
  assert.equal(result.status, 200); assert.match(result.type, /spreadsheetml/);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.data);
  assert.equal(workbook.worksheets.length, 10);
  let contents = ''; workbook.eachSheet((sheet) => sheet.eachRow((row) => { contents += JSON.stringify(row.values); }));
  assert.ok(contents.includes('alpha employee 1')); assert.equal(contents.includes('Other business secret'), false);
  assert.equal(contents.includes('passwordHash'), false);
  const own = await call(`/employee/reports/payroll/xlsx?month=${month}&employeeId=EMP-002`, alpha.employees[0].token);
  const ownBook = new ExcelJS.Workbook(); await ownBook.xlsx.load(own.data);
  assert.equal(ownBook.worksheets[0].rowCount, 4);
  assert.equal(ownBook.worksheets[0].getCell('A4').value, 'EMP-001');
  assert.equal((await call(`/employee/reports/all/xlsx?month=${month}`, alpha.employees[0].token)).status, 403);
  const pdf = await call(`/admin/employee-reports/attendance/pdf?month=${month}`, alpha.ownerToken);
  assert.equal(pdf.status, 200); assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
  const pf = await call(`/admin/employee-reports/statutory/xlsx?month=${month}`, alpha.ownerToken);
  const pfBook = new ExcelJS.Workbook(); await pfBook.xlsx.load(pf.data);
  assert.equal(pfBook.worksheets[0].getCell('H4').value, 1200);
});
test('emailing a payslip queues a real PDF for that employee and exposes its history', options, async () => {
  const [alpha] = businesses;
  const payroll = await Payroll.findOne({ userId: alpha.owner._id, employeeId: 'EMP-001', month }).lean();
  assert.equal((await call(`/admin/payroll/${payroll._id}/email`, alpha.ownerToken, { requestId: 'payslip-request-0001' })).status, 202);
  await dispatchEmployeeNotifications();
  const mail = mails.findLast((item) => item.subject.includes('Payslip for'));
  assert.equal(mail.to, alpha.employees[0].employee.email);
  const pdf = mail.attachments.find((item) => item.contentType === 'application/pdf');
  assert.equal(pdf.content.subarray(0, 5).toString(), '%PDF-');
  assert.equal(await EmployeeNotification.countDocuments({ kind: 'payslip', emailStatus: 'Accepted' }), 1);
});

test('employee OTP uses the same owner logo and sender and records verification without storing the code', options, async () => {
  const [alpha] = businesses;
  const started = await call('/employee/auth/login', '', { username: alpha.owner.email, employeeId: 'EMP-001', password: 'Employee@123' });
  assert.equal(started.status, 202, JSON.stringify(started.data));
  const mail = mails.at(-1);
  assert.equal(mail.from.address, alpha.settings.emailSmtpUser);
  assert.ok(mail.html.includes('cid:employee-business-logo@gobook'));
  assert.equal(mail.attachments[0].filename, 'alpha-logo.png');
  const otp = mail.html.match(/>([0-9]{6})</)[1];
  const verified = await call('/employee/auth/verify-otp', '', { challengeId: started.data.challengeId, otp });
  assert.equal(verified.status, 200);
  const log = await EmployeeNotification.findOne({ ownerUserId: alpha.owner._id, kind: 'login-otp' }).lean();
  assert.equal(log.emailStatus, 'Accepted'); assert.ok(log.verifiedAt);
  assert.equal(JSON.stringify(log).includes(otp), false);
});

test('employee mark all read is scoped to its own inbox and preserves owner read state', options, async () => {
  const [alpha, beta] = businesses;
  const key = 'employee-read-all-' + Date.now();
  const fixtures = [];
  for (const [business, number] of [[alpha, 0], [alpha, 0], [alpha, 1], [beta, 0]]) {
    const employee = business.employees[number].employee;
    fixtures.push(await EmployeeNotification.create({ ownerUserId: business.owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name, requestKey: key + '-' + fixtures.length, title: 'Read all fixture', message: 'Saved fixture', emailStatus: 'Accepted' }));
  }
  const result = await call('/employee/notifications/read-all?employee=' + alpha.employees[1].employee._id + '&ownerUserId=' + beta.owner._id, alpha.employees[0].token, {}, 'PUT');
  assert.equal(result.status, 200);
  assert.equal((await call('/employee/notifications/count', alpha.employees[0].token)).data.unread, 0);
  for (const row of fixtures.slice(0, 2)) {
    const saved = await EmployeeNotification.findById(row._id).lean();
    assert.ok(saved.readAt); assert.equal(saved.ownerReadAt, null);
  }
  for (const row of fixtures.slice(2)) assert.equal((await EmployeeNotification.findById(row._id).lean()).readAt, null);
  const firstRead = (await EmployeeNotification.findById(fixtures[0]._id).lean()).readAt.toISOString();
  assert.equal((await call('/employee/notifications/read-all', alpha.employees[0].token, {}, 'PUT')).status, 200);
  assert.equal((await EmployeeNotification.findById(fixtures[0]._id).lean()).readAt.toISOString(), firstRead);
});

test('presence requires a visible portal tab, isolates owners, supports multiple tabs and expires disconnected tabs', options, async () => {
  const [alpha, beta] = businesses;
  const { employee, token } = alpha.employees[0];
  const status = async () => (await call('/admin/employees/presence', alpha.ownerToken)).data.data.find((row) => row.employeeObjectId === String(employee._id));
  assert.equal((await status()).online, false, 'Authentication alone must not show online');
  assert.equal((await call('/employee/presence', token, { active: true, clientId: 'tab-one' })).status, 200);
  assert.equal((await status()).online, true);
  const foreign = await call('/admin/employees/presence', beta.ownerToken);
  assert.equal(foreign.data.data.some((row) => row.employeeObjectId === String(employee._id)), false);
  await call('/employee/presence', token, { active: true, clientId: 'tab-two' });
  await call('/employee/presence', token, { active: false, clientId: 'tab-one' });
  assert.equal((await status()).online, true, 'Another visible tab keeps the employee online');
  await call('/employee/presence', token, { active: false, clientId: 'tab-two' });
  assert.equal((await status()).online, false);
  assert.equal((await call('/employee/presence', token, { active: 'yes', clientId: 'invalid' })).status, 400);
  assert.equal((await call('/employee/presence', token, { active: true, clientId: '$invalid' })).status, 400);
  await call('/employee/presence', token, { active: true, clientId: 'tab-three' });
  const login = await EmployeeLogin.findOne({ employeeObjectId: employee._id });
  await SecuritySession.updateMany({ subject: String(login._id) }, { $set: { portalPresence: [{ clientId: 'tab-three', seenAt: new Date(Date.now() - 61000) }] } });
  assert.equal((await status()).online, false, 'A stale heartbeat must expire');
  await call('/employee/presence', token, { active: true, clientId: 'tab-three' });
  await call('/employee/auth/logout', token, {});
  assert.equal((await status()).online, false, 'A revoked session must not show online');
});
