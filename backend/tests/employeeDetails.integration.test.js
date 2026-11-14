import assert from 'node:assert/strict';
import test, { before, after, mock } from 'node:test';
import { once } from 'node:events';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { apiRouter } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppUser } from '../src/models/AppUser.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { Attendance } from '../src/models/Attendance.js';
import { Employee } from '../src/models/Employee.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { createSecuritySession } from '../src/services/securitySessions.js';
import { employeeCredential } from '../src/services/employeeAccess.js';
import { signPortalToken } from '../src/services/employeePortalSession.js';
import { signToken } from '../src/modules/auth/authController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_details_test_${process.pid}_${Date.now()}`;
let server, base;
const nativeFetch = globalThis.fetch;
const businesses = [];
const date = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await nativeFetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
  for (const name of ['alpha', 'beta']) {
    const owner = await AppUser.create({ name, businessName: name, email: `${name}@example.test`, password: await bcrypt.hash('Owner@123', 4), role: 'Super Admin', accountType: 'owner', businessId: new mongoose.Types.ObjectId(), status: 'Active', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), paymentMethodVerified: true, onboardingCompleted: true });
    const session = await createLoginSession(owner, { headers: {}, ip: '127.0.0.1' });
    const ownerToken = signToken(owner, session.sessionId);
    await BusinessSettings.create({ userId: owner._id, emailSmtpUser: `${name}@gmail.com`, emailSmtpPass: 'fixture-password', emailSmtpHost: 'smtp.gmail.com', emailSmtpVerifiedAt: new Date() });
    businesses.push({ owner, ownerToken });
  }
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  mock.restoreAll();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (uri && mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName);
    assert.match(dbName, /^gobook_employee_details_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('employee details persist, partial updates retain family, and another owner cannot view or edit them', options, async () => {
  const [alpha, beta] = businesses;
  for (const business of businesses) {
    const result = await call('/admin/employees', business.ownerToken, { employeeId: 'EMP-001', name: `${business.owner.name} employee`, email: `${business.owner.name}-employee@example.test`, mobileNumber: '9000012345', loginAccess: true, password: 'Employee@123', statutoryDetails: { uan: '001234567890', esiNumber: '001234' }, bankDetails: { accountNumber: '000123' }, familyMembers: [{ name: 'Parent', relationship: 'Mother', phone: '9000012346', isEmergencyContact: true }], basicSalary: 20000, salaryStructure: { pf: 1234, esi: 150 } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    business.employee = result.data;
    const login = await EmployeeLogin.findOne({ ownerUserId: business.owner._id }).select('+passwordHash').lean();
    business.sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, business.employee), '1d');
    business.token = signPortalToken({ id: login._id, ownerUserId: business.owner._id, employeeObjectId: business.employee._id, employeeId: 'EMP-001', role: 'employee' }, business.sid);
  }
  assert.equal((await call(`/admin/employees/${alpha.employee._id}`, beta.ownerToken, { name: 'forged' }, 'PUT')).status, 404);
  assert.equal((await call(`/admin/employees/${alpha.employee._id}/overview`, beta.ownerToken)).status, 404);
  const update = await call(`/admin/employees/${alpha.employee._id}`, alpha.ownerToken, { name: 'Updated employee' }, 'PUT');
  assert.equal(update.status, 200);
  assert.equal(update.data.familyMembers[0].name, 'Parent');
  assert.equal(update.data.statutoryDetails.uan, '001234567890');
  assert.equal(update.data.salaryStructure.pf, 1234);
  const profile = await call('/employee/me?employeeId=forged', alpha.token);
  assert.equal(profile.data.employee._id, alpha.employee._id);
  assert.equal(profile.data.employee.bankDetails.accountNumber, '000123');
  assert.equal((await call('/admin/employees/presence', alpha.token)).status, 403);
});

test('admin-entered in/out and break times are visible only to the correct employee with net hours', options, async () => {
  const [alpha, beta] = businesses;
  const result = await call('/admin/attendance/mark', alpha.ownerToken, { employeeId: 'EMP-001', date: date(), checkIn: '09:00', checkOut: '18:00', breaks: [{ start: '11:00', end: '11:15' }, { start: '13:00', end: '13:45' }] });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.breakMinutes, 60);
  assert.equal(result.data.hours, '8h 0m');
  const mine = await call(`/employee/attendance/monthly?month=${date().slice(0, 7)}&employeeId=EMP-002`, alpha.token);
  assert.equal(mine.data.data[0].checkIn, '09:00');
  assert.equal(mine.data.data[0].breakMinutes, 60);
  const other = await call(`/employee/attendance/monthly?month=${date().slice(0, 7)}`, beta.token);
  assert.equal(other.data.data.length, 0);
  assert.equal((await call('/employee/attendance/break', alpha.token, { action: 'start' })).status, 409);
});

test('break lifecycle rejects duplicates and parallel starts, and cannot alter another tenant', options, async () => {
  const [alpha, beta] = businesses;
  await Attendance.findOneAndUpdate({ userId: alpha.owner._id, employeeId: 'EMP-001', date: date() }, { $set: { checkOut: '--', checkIn: '00:00', breaks: [], breakMinutes: 0 } });
  const starts = await Promise.all([call('/employee/attendance/break', alpha.token, { action: 'start' }), call('/employee/attendance/break', alpha.token, { action: 'start' })]);
  assert.deepEqual(starts.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await call('/employee/attendance/break', beta.token, { action: 'end', employeeId: 'EMP-001', ownerUserId: String(alpha.owner._id) })).status, 409);
  const end = await call('/employee/attendance/break', alpha.token, { action: 'end' });
  assert.equal(end.status, 200);
  assert.ok(end.data.breaks[0].end);
  assert.equal((await call('/employee/attendance/break', alpha.token, { action: 'end' })).status, 409);
});

test('checkout closes the ongoing break and subtracts it from working hours', options, async () => {
  const [alpha] = businesses;
  assert.equal((await call('/employee/attendance/break', alpha.token, { action: 'start' })).status, 200);
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: { city: 'Fixture Chennai' } }) }));
  const result = await call('/employee/attendance/check-out', alpha.token, { location: { latitude: 13.08, longitude: 80.27 } });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.breaks.at(-1).end, result.data.checkOut);
  assert.match(result.data.hours, /^\d+h \d+m$/);
  assert.equal((await call('/employee/attendance/break', alpha.token, { action: 'start' })).status, 409);
  mock.restoreAll();
});

test('photo replacement accepts multipart family, emergency, bank and PF/ESI details', options, async () => {
  const [alpha] = businesses;
  const body = new FormData();
  body.set('photo', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/png' }), 'fixture.png');
  body.set('emergencyContact', JSON.stringify({ name: 'Updated Parent', phone: '9000012347', relationship: 'Father' }));
  body.set('familyMembers', JSON.stringify([{ name: 'Updated Parent', relationship: 'Father', phone: '9000012347', isEmergencyContact: true }]));
  body.set('statutoryDetails', JSON.stringify({ uan: '001234567891' }));
  body.set('bankDetails', JSON.stringify({ accountNumber: '000124' }));
  const response = await nativeFetch(`${base}/admin/employees/${alpha.employee._id}`, { method: 'PUT', headers: { Authorization: `Bearer ${alpha.ownerToken}` }, body });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.ok(result.photo.gridFsFileId);
  assert.equal(result.emergencyContact.name, 'Updated Parent');
  assert.equal(result.familyMembers[0].name, 'Updated Parent');
  assert.equal(result.statutoryDetails.uan, '001234567891');
  assert.equal(result.bankDetails.accountNumber, '000124');
});

test('presence belongs to the authenticated tenant and expires or revokes per session', options, async () => {
  const [alpha, beta] = businesses;
  await SecuritySession.updateMany({}, { $set: { lastSeenAt: new Date(0) } });
  assert.equal((await call('/admin/employees/presence', alpha.ownerToken)).data.data[0].online, false);
  assert.equal((await call('/employee/presence', alpha.token, {})).status, 200);
  const online = await call('/admin/employees/presence', alpha.ownerToken);
  assert.equal(online.data.data[0].online, true);
  assert.equal(online.data.data[0].employeeObjectId, alpha.employee._id);
  const other = await call('/admin/employees/presence', beta.ownerToken);
  assert.equal(other.data.data.length, 1);
  assert.equal(other.data.data[0].employeeObjectId, beta.employee._id);
  assert.equal(other.data.data[0].online, false);
  await call('/employee/auth/logout', alpha.token, {});
  assert.equal((await call('/admin/employees/presence', alpha.ownerToken)).data.data[0].online, false);
  assert.equal((await call('/employee/presence', alpha.token, {})).status, 401);
});

test('employee add/edit/delete persist, stay owner scoped and revoke deleted employee access', options, async () => {
  const [alpha, beta] = businesses;
  const created = await call('/admin/employees', alpha.ownerToken, { employeeId: 'EMP-CRUD', name: 'CRUD employee', email: 'crud@example.test', mobileNumber: '9000012345', loginAccess: true, password: 'Employee@123', department: 'Sales' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data._id;
  assert.equal((await Employee.findById(id).lean()).dept, 'Sales');
  assert.equal((await call(`/admin/employees/${id}`, beta.ownerToken, undefined, 'DELETE')).status, 404);
  assert.ok(await Employee.findById(id));
  const updated = await call(`/admin/employees/${id}`, alpha.ownerToken, { name: 'Edited employee', department: 'Accounts', mobileNumber: '9000012346' }, 'PUT');
  assert.equal(updated.status, 200);
  assert.equal((await Employee.findById(id).lean()).name, 'Edited employee');
  assert.equal((await Employee.findById(id).lean()).dept, 'Accounts');
  const login = await EmployeeLogin.findOne({ employeeObjectId: id }).select('+passwordHash').lean();
  const sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, updated.data), '1d');
  const token = signPortalToken({ id: login._id, ownerUserId: alpha.owner._id, employeeObjectId: id, employeeId: 'EMP-CRUD', role: 'employee' }, sid);
  assert.equal((await call('/employee/me', token)).status, 200);
  assert.equal((await call(`/admin/employees/${id}`, alpha.ownerToken, undefined, 'DELETE')).status, 200);
  assert.equal(await Employee.findById(id), null);
  assert.equal(await EmployeeLogin.countDocuments({ employeeObjectId: id }), 0);
  assert.equal((await call('/employee/me', token)).status, 401);
  assert.equal((await call(`/admin/employees/${id}`, alpha.ownerToken, undefined, 'DELETE')).status, 404);
  assert.ok(await Employee.findById(beta.employee._id));
});
