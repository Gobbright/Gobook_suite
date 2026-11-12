import assert from 'node:assert/strict';
import test, { before, after, mock } from 'node:test';
import { once } from 'node:events';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { apiRouter } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { HRDocument } from '../src/models/Document.js';
import { EmployeePermission } from '../src/models/EmployeePermission.js';
import { Attendance } from '../src/models/Attendance.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { signToken } from '../src/modules/auth/authController.js';
import { employeeAccessView } from '../src/services/employeeAccess.js';
import { storeBuffer } from '../src/services/gridfsStorage.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_access_test_${process.pid}_${Date.now()}`;
const nativeFetch = globalThis.fetch;
let server, base, owner, employee, otherEmployee, ownerToken, employeeToken, link;
let password = 'EmployeeOnly@123';
async function call(path, { token, body, method = 'GET', form } = {}) {
  const response = await nativeFetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!form && body ? { 'Content-Type': 'application/json' } : {}) }, ...(form ? { body: form } : body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, data: type.includes('application/json') ? await response.json() : await response.text() };
}
function credentials(view = link) {
  const url = new URL(view.loginPath, 'https://example.test');
  return { ownerUserId: String(owner._id), employeeId: employee.employeeId, businessSlug: view.businessSlug, code: url.searchParams.get('code'), password };
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
  owner = await AppUser.create({ name: 'Portal owner', businessName: 'Anbu Retail Store', email: 'portal-owner@example.test', password: await bcrypt.hash('OwnerOnly@123', 4), role: 'Super Admin', accountType: 'owner', businessId: new mongoose.Types.ObjectId(), status: 'Active', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), paymentMethodVerified: true, onboardingCompleted: true });
  employee = await Employee.create({ userId: owner._id, employeeId: 'EMP-001', name: 'Employee One', email: 'one@example.test', category: 'retail', status: 'Active', loginAccess: false });
  otherEmployee = await Employee.create({ userId: owner._id, employeeId: 'EMP-002', name: 'Employee Two', email: 'two@example.test', category: 'retail', status: 'Active' });
  const session = await createLoginSession(owner, { headers: { 'user-agent': 'Portal integration test' }, ip: '127.0.0.1' });
  ownerToken = signToken(owner, session.sessionId);
  link = employeeAccessView(employee, owner);
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
    assert.match(dbName, /^gobook_employee_access_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('main owner sets the password; employee ID is prefilled from a verified business URL', options, async () => {
  const list = await call('/admin/employees', { token: ownerToken });
  assert.equal(list.status, 200);
  assert.ok(list.data.data.every((row) => row.portalAccess.loginPath.endsWith('/' + row.employeeId) && !row.portalAccess.loginPath.includes(String(owner._id))));
  const values = credentials();
  const context = await call('/employee/auth/link-context?' + new URLSearchParams({ ...values, password: undefined }));
  assert.equal(context.status, 200);
  assert.equal(context.data.employeeId, 'EMP-001');
  assert.equal(context.data.loginEnabled, false);
  assert.equal((await call('/employee/auth/login', { method: 'POST', body: values })).status, 401);
  const saved = await call(`/admin/employees/${employee._id}/access`, { method: 'PUT', token: ownerToken, body: { loginEnabled: true, password } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.passwordConfigured, true);
  assert.equal(saved.data.password, undefined);
  assert.equal(saved.data.passwordHash, undefined);
  const login = await call('/employee/auth/login', { method: 'POST', body: values });
  assert.equal(login.status, 200);
  employeeToken = login.data.token;
  assert.equal(login.data.user.employeeId, 'EMP-001');
  assert.ok(login.data.user.loginPath.includes('anbu-retail-store'));
  assert.match(login.data.user.portalBasePath, /^\/employee\/anbu-retail-store-[a-f0-9]{8}\/EMP-001$/);
  const stored = await EmployeeLogin.findOne({ employeeObjectId: employee._id }).select('+passwordHash +loginPassword').lean();
  assert.equal(await bcrypt.compare(password, stored.passwordHash), true);
  assert.equal(stored.loginPassword, undefined);
});
test('employee profile is private/read-only and management endpoints require the main user', options, async () => {
  const profile = await call('/employee/me', { token: employeeToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.employee.employeeId, employee.employeeId);
  assert.equal((await call(`/admin/employees/${employee._id}`, { method: 'PUT', token: employeeToken, body: { name: 'Unauthorized change' } })).status, 403);
  assert.equal((await call('/hr-payroll/employees', { token: employeeToken })).status, 401);
  assert.equal((await call('/employee/me')).status, 401);
  assert.equal((await Employee.findById(employee._id)).name, 'Employee One');
  const member = await AppUser.create({ name: 'Restricted sub-user', email: 'member@example.test', businessId: owner.businessId, parentUserId: owner._id, role: 'Accountant', accountType: 'member', status: 'Active', permissions: { modules: ['employee-management'] }, subscriptionStatus: 'active', subscriptionExpiresAt: new Date(Date.now() + 86400000) });
  const session = await createLoginSession(member, { headers: { 'user-agent': 'Restricted member test' }, ip: '127.0.0.1' });
  const token = signToken(member, session.sessionId);
  assert.equal((await call('/hr-payroll/employees', { token, method: 'POST', body: { name: 'Forbidden create' } })).status, 403);
});
test('owner uploads employee documents; employee can view only their own private files', options, async () => {
  for (const person of [employee, otherEmployee]) {
    const form = new FormData();
    form.set('name', `Private note ${person.employeeId}`); form.set('category', 'Other Documents'); form.set('empId', String(person._id));
    form.set('file', new Blob(['%PDF-1.4\n% Employee portal test\n%%EOF'], { type: 'application/pdf' }), 'employee-note.pdf');
    const result = await call('/hr-payroll/documents', { token: ownerToken, method: 'POST', form });
    assert.equal(result.status, 201, result.data.message);
  }
  const list = await call('/employee/documents', { token: employeeToken });
  assert.equal(list.status, 200); assert.equal(list.data.data.length, 1);
  const ownDoc = list.data.data[0];
  assert.equal((await call(`/employee/documents/${ownDoc._id}/file`, { token: employeeToken })).status, 200);
  assert.equal((await call(`/employee/documents/${ownDoc._id}/file`)).status, 401);
  const other = await HRDocument.findOne({ empId: String(otherEmployee._id) }).lean();
  assert.equal((await call(`/employee/documents/${other._id}/file`, { token: employeeToken })).status, 404);
  assert.equal((await call(`/hr-payroll/documents/${ownDoc._id}`, { token: employeeToken, method: 'DELETE' })).status, 401);
});
test('employee photos and leave attachments require authentication and exact ownership', options, async () => {
  for (const person of [employee, otherEmployee]) {
    const file = await storeBuffer({ buffer: Buffer.from('89504e470d0a1a0a00000000', 'hex'), filename: 'photo.png', contentType: 'image/png', metadata: { kind: 'employee-photo', userId: owner._id } });
    await Employee.updateOne({ _id: person._id }, { $set: { photo: { gridFsFileId: file.id, url: `/api/files/employee-assets/${file.id}` } } });
    assert.equal((await call(`/files/employee-assets/${file.id}`)).status, 401);
    assert.equal((await call(`/files/employee-assets/${file.id}`, { token: ownerToken })).status, 200);
    assert.equal((await call(`/files/employee-assets/${file.id}`, { token: employeeToken })).status, String(person._id) === String(employee._id) ? 200 : 404);
  }
});
test('employee can request leave/permission but only the owner can approve it', options, async () => {
  const date = new Date().toISOString().slice(0, 10);
  const requested = await call('/employee/permissions', { token: employeeToken, method: 'POST', body: { date, fromTime: '10:00', toTime: '11:00', reason: 'Personal appointment', status: 'Approved', employeeObjectId: otherEmployee._id } });
  assert.equal(requested.status, 201);
  assert.equal(requested.data.status, 'Pending');
  assert.equal(requested.data.employeeObjectId, String(employee._id));
  assert.equal((await call(`/admin/permissions/${requested.data._id}/status`, { token: employeeToken, method: 'PUT', body: { status: 'Approved' } })).status, 403);
  assert.equal((await call(`/admin/permissions/${requested.data._id}/status`, { token: ownerToken, method: 'PUT', body: { status: 'Approved' } })).status, 200);
  const leave = await call('/employee/leave/apply', { token: employeeToken, method: 'POST', body: { from: date, to: date, reason: 'Family appointment', status: 'Approved', empId: otherEmployee.employeeId } });
  assert.equal(leave.status, 201); assert.equal(leave.data.status, 'Pending'); assert.equal(leave.data.empId, employee.employeeId);
});
test('attendance uses the signed-in employee and prevents duplicate check-ins', options, async () => {
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: {}, display_name: 'Test location' }) }));
  const location = { latitude: 13.08, longitude: 80.27, accuracy: 10, capturedAt: new Date().toISOString() };
  const result = await call('/employee/attendance/check-in', { token: employeeToken, method: 'POST', body: { location, employeeId: otherEmployee.employeeId } });
  assert.equal(result.status, 201, result.data.message);
  assert.equal(result.data.employeeId, employee.employeeId);
  assert.equal((await call('/employee/attendance/check-in', { token: employeeToken, method: 'POST', body: { location } })).status, 409);
  assert.equal(await Attendance.countDocuments({ employeeId: otherEmployee.employeeId }), 0);
  mock.restoreAll();
});
test('only the owner resets employee passwords, invalidating previous passwords and sessions', options, async () => {
  const previousPassword = password;
  const nextPassword = 'NewEmployeeOnly@456';
  const path = `/admin/employees/${employee._id}/access`;
  assert.equal((await call(path, { token: employeeToken, method: 'PUT', body: { loginEnabled: true, password: nextPassword } })).status, 403);
  const reset = await call(path, { token: ownerToken, method: 'PUT', body: { loginEnabled: true, password: nextPassword } });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.password, undefined);
  assert.equal((await call('/employee/me', { token: employeeToken })).status, 401);
  assert.equal((await call('/employee/auth/login', { method: 'POST', body: { ...credentials(), password: previousPassword } })).status, 401);
  password = nextPassword;
  const login = await call('/employee/auth/login', { method: 'POST', body: credentials() });
  assert.equal(login.status, 200);
  employeeToken = login.data.token;
});
test('QR reset invalidates previous links and sessions while retaining the admin-set password', options, async () => {
  const old = credentials();
  const result = await call(`/admin/employees/${employee._id}/qr/reset`, { token: ownerToken, method: 'POST', body: {} });
  assert.equal(result.status, 200);
  assert.notEqual(result.data.loginPath, link.loginPath);
  assert.equal((await call('/employee/auth/login', { method: 'POST', body: old })).status, 404);
  assert.equal((await call('/employee/me', { token: employeeToken })).status, 401);
  const next = credentials(result.data);
  const login = await call('/employee/auth/login', { method: 'POST', body: next });
  assert.equal(login.status, 200);
  employeeToken = login.data.token;
  await call(`/admin/employees/${employee._id}/access`, { token: ownerToken, method: 'PUT', body: { loginEnabled: false } });
  assert.equal((await call('/employee/me', { token: employeeToken })).status, 401);
});
test('resetting a legacy employee QR without a stored version invalidates the old link', options, async () => {
  await Employee.updateOne({ _id: otherEmployee._id }, { $unset: { portalVersion: 1 } });
  const legacy = await Employee.findById(otherEmployee._id).lean();
  const old = employeeAccessView(legacy, owner);
  const reset = await call(`/admin/employees/${otherEmployee._id}/qr/reset`, { token: ownerToken, method: 'POST', body: {} });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.data.loginPath, old.loginPath);
  const url = new URL(old.loginPath, 'https://example.test');
  assert.equal((await call('/employee/auth/link-context?' + new URLSearchParams({ ownerUserId: String(owner._id), employeeId: otherEmployee.employeeId, businessSlug: old.businessSlug, code: url.searchParams.get('code') }))).status, 404);
});
