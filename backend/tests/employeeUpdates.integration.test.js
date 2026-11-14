import assert from 'node:assert/strict';
import test, { before, after, mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { apiRouter } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { EmployeeWork } from '../src/models/EmployeeWork.js';
import { EmployeePermission } from '../src/models/EmployeePermission.js';
import { Attendance } from '../src/models/Attendance.js';
import { AttendanceCorrection } from '../src/models/AttendanceCorrection.js';
import { Leave } from '../src/models/Leave.js';
import { EmployeeNotification } from '../src/models/EmployeeNotification.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { createSecuritySession } from '../src/services/securitySessions.js';
import { employeeCredential } from '../src/services/employeeAccess.js';
import { signPortalToken } from '../src/services/employeePortalSession.js';
import { signToken } from '../src/modules/auth/authController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_updates_test_${process.pid}_${Date.now()}`;
const businesses = [];
const nativeFetch = globalThis.fetch;
let server, base, savedLeave, savedPermission;
async function startServer() {
  const app = express(); app.use(express.json()); app.use('/api', apiRouter); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
}
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await nativeFetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  if (!uri) return;
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ address: {}, display_name: 'Fixture location' }) }));
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map(Model => Model.init()));
  for (const name of ['alpha', 'beta']) {
    const owner = await AppUser.create({ name, businessName: `${name} business`, email: `${name}@example.test`, password: await bcrypt.hash('Owner@123', 4), role: 'Super Admin', accountType: 'owner', businessId: new mongoose.Types.ObjectId(), status: 'Active', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), paymentMethodVerified: true, onboardingCompleted: true });
    const ownerSession = await createLoginSession(owner, { headers: {}, ip: '127.0.0.1' });
    const employee = await Employee.create({ userId: owner._id, employeeId: 'EMP-001', name: `${name} employee`, email: `${name}-employee@example.test`, loginAccess: true });
    const login = await EmployeeLogin.create({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, passwordHash: await bcrypt.hash('Employee@123', 4), role: 'employee', loginEnabled: true, status: 'Active' });
    const sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, employee), '1d');
    const employeeToken = signPortalToken({ id: login._id, ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, role: 'employee' }, sid);
    businesses.push({ owner, employee, ownerToken: signToken(owner, ownerSession.sessionId), employeeToken });
  }
  await startServer();
});
after(async () => {
  mock.restoreAll();
  if (server) await new Promise(resolve => server.close(resolve));
  if (uri && mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName); assert.match(dbName, /^gobook_employee_updates_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});

test('employee writes persist in MongoDB and reach the correct owner across all update types', options, async () => {
  const a = businesses[0];
  const leave = await call('/employee/leave/apply', a.employeeToken, { type: 'Casual Leave', from: '2026-12-10', to: '2026-12-11', reason: 'Family appointment', ownerUserId: String(businesses[1].owner._id) });
  assert.equal(leave.status, 201, JSON.stringify(leave.data)); savedLeave = leave.data;
  const permission = await call('/employee/permissions', a.employeeToken, { date: '2026-12-09', fromTime: '10:00', toTime: '11:00', reason: 'Personal appointment' });
  assert.equal(permission.status, 201); savedPermission = permission.data;
  const location = { latitude: 13.08, longitude: 80.27, accuracy: 10, capturedAt: new Date().toISOString() };
  assert.equal((await call('/employee/attendance/check-in', a.employeeToken, { location })).status, 201);
  assert.equal((await call('/employee/attendance/break', a.employeeToken, { action: 'start' })).status, 200);
  assert.equal((await call('/employee/attendance/break', a.employeeToken, { action: 'end' })).status, 200);
  assert.equal((await call('/employee/attendance/check-out', a.employeeToken, { location })).status, 200);
  const correction = await call('/employee/attendance/correction', a.employeeToken, { date: '2026-12-08', checkIn: '09:00', checkOut: '18:00', reason: 'Clock correction' });
  assert.equal(correction.status, 201);
  assert.equal((await call('/admin/employee-work', a.ownerToken, { title: 'Stock count', description: 'Count stock', employeeIds: [String(a.employee._id)], requestId: randomUUID() })).status, 201);
  const work = await EmployeeWork.findOne({ ownerUserId: a.owner._id }).lean();
  const progress = await call(`/employee/work/${work._id}`, a.employeeToken, { version: work.__v, status: 'Completed', note: 'All shelves counted' }, 'PUT');
  assert.equal(progress.status, 200);
  const notification = await EmployeeNotification.create({ ownerUserId: a.owner._id, employeeObjectId: a.employee._id, employeeId: a.employee.employeeId, employeeName: a.employee.name, requestKey: randomUUID(), title: 'Team notice', message: 'Please read this notice' });
  assert.equal((await call(`/employee/notifications/${notification._id}/read`, a.employeeToken, {}, 'PUT')).status, 200);
  assert.equal((await Leave.findById(leave.data._id).lean()).userId.toString(), String(a.owner._id));
  assert.equal((await EmployeePermission.findById(permission.data._id).lean()).reason, 'Personal appointment');
  assert.equal((await AttendanceCorrection.findById(correction.data._id).lean()).reason, 'Clock correction');
  const attendance = await Attendance.findOne({ userId: a.owner._id, employeeId: 'EMP-001' }).lean();
  assert.notEqual(attendance.checkOut, '--'); assert.equal(attendance.breaks.length, 1);
  assert.equal((await EmployeeWork.findById(work._id).lean()).note, 'All shelves counted');
  const feed = await call('/admin/employee-updates', a.ownerToken);
  assert.equal(feed.status, 200);
  assert.deepEqual(new Set(feed.data.data.map(row => row.kind)), new Set(['leave', 'permission', 'attendance', 'correction', 'work', 'receipt']));
  assert.ok(feed.data.data.every(row => row.employeeName === a.employee.name));
  assert.ok(feed.data.data.find(row => row.kind === 'leave').href.endsWith('?month=2026-12'));
  assert.ok(feed.data.data.find(row => row.kind === 'work').message.includes('All shelves counted'));
});

test('owner approvals are saved and returned to the employee, including after an API restart', options, async () => {
  const a = businesses[0];
  assert.equal((await call(`/admin/leaves/${savedLeave._id}/status`, a.ownerToken, { status: 'Approved' }, 'PUT')).status, 200);
  assert.equal((await call(`/admin/permissions/${savedPermission._id}/status`, a.ownerToken, { status: 'Approved' }, 'PUT')).status, 200);
  await new Promise(resolve => server.close(resolve)); await startServer();
  const leaves = await call('/employee/leave/status?month=2026-12', a.employeeToken);
  const permissions = await call('/employee/permissions?month=2026-12', a.employeeToken);
  assert.equal(leaves.data.data.find(row => row._id === savedLeave._id).status, 'Approved');
  assert.equal(permissions.data.data.find(row => row._id === savedPermission._id).status, 'Approved');
  const feed = await call('/admin/employee-updates?kind=permission', a.ownerToken);
  assert.equal(feed.data.data[0].status, 'Approved');
  assert.equal((await call('/admin/leaves?month=2026-12', a.ownerToken)).data.data.find(row => row._id === savedLeave._id).status, 'Approved');
});

test('foreign businesses and employee tokens cannot read or review another owner updates', options, async () => {
  const [a, b] = businesses;
  assert.equal((await call('/admin/employee-updates', a.employeeToken)).status, 403);
  const foreign = await call(`/admin/employee-updates?ownerUserId=${a.owner._id}`, b.ownerToken);
  assert.equal(foreign.status, 200); assert.deepEqual(foreign.data.data, []);
  assert.equal((await call(`/admin/permissions/${savedPermission._id}/status`, b.ownerToken, { status: 'Rejected' }, 'PUT')).status, 404);
  const count = await EmployeePermission.countDocuments({ ownerUserId: a.owner._id });
  assert.equal((await call('/employee/permissions', a.employeeToken, { date: '2026-12-09', fromTime: '11:00', toTime: '10:00', reason: 'Invalid range' })).status, 400);
  assert.equal(await EmployeePermission.countDocuments({ ownerUserId: a.owner._id }), count);
});

test('update pagination retains every persisted record, including identical timestamps', options, async () => {
  const a = businesses[0];
  const rows = await EmployeePermission.insertMany(Array.from({ length: 125 }, (_, i) => ({ ownerUserId: a.owner._id, employeeObjectId: a.employee._id, employeeId: a.employee.employeeId, name: a.employee.name, date: '2026-12-09', fromTime: '10:00', toTime: '11:00', reason: `Page fixture ${i}` })));
  await EmployeePermission.updateMany({ _id: { $in: rows.map(r => r._id) } }, { $set: { updatedAt: new Date('2040-01-01T00:00:00Z') } }, { timestamps: false });
  const ids = []; let before = '';
  do {
    const result = await call(`/admin/employee-updates?kind=permission&before=${before}`, a.ownerToken);
    assert.equal(result.status, 200);
    ids.push(...result.data.data.map(row => row.recordId)); before = result.data.nextCursor || '';
  } while (before);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 126);
  for (const row of rows) assert.ok(ids.includes(String(row._id)));
  assert.equal((await call('/admin/employee-updates?before=invalid', a.ownerToken)).status, 400);
  assert.equal((await call('/admin/employee-updates?kind=unknown', a.ownerToken)).status, 400);
});
