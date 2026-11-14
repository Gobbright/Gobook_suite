import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
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
import { EmployeeNotification } from '../src/models/EmployeeNotification.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { createSecuritySession } from '../src/services/securitySessions.js';
import { employeeCredential } from '../src/services/employeeAccess.js';
import { signPortalToken } from '../src/services/employeePortalSession.js';
import { signToken } from '../src/modules/auth/authController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_work_test_${process.pid}_${Date.now()}`;
const businesses = [];
let server, base;
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map((Model) => Model.init()));
  for (const name of ['alpha', 'beta']) {
    const owner = await AppUser.create({ name, businessName: `${name} business`, email: `${name}@example.test`, password: await bcrypt.hash('Owner@123', 4), role: 'Super Admin', accountType: 'owner', businessId: new mongoose.Types.ObjectId(), status: 'Active', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), paymentMethodVerified: true, onboardingCompleted: true });
    const session = await createLoginSession(owner, { headers: {}, ip: '127.0.0.1' });
    const employees = [];
    for (const number of [1, 2]) {
      const employee = await Employee.create({ userId: owner._id, employeeId: `EMP-00${number}`, name: `${name} Employee ${number}`, email: `${name}-employee${number}@example.test`, loginAccess: true });
      const login = await EmployeeLogin.create({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, passwordHash: await bcrypt.hash('Employee@123', 4), role: 'employee', loginEnabled: true, status: 'Active' });
      const sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, employee), '1d');
      const token = signPortalToken({ id: login._id, ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, role: 'employee' }, sid);
      employees.push({ employee, token });
    }
    const inactive = await Employee.create({ userId: owner._id, employeeId: 'EMP-003', name: 'Inactive employee', status: 'Inactive' });
    businesses.push({ owner, ownerToken: signToken(owner, session.sessionId), employees, inactive });
  }
  const app = express(); app.use(express.json()); app.use('/api', apiRouter); app.use(errorHandler);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (uri && mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName); assert.match(dbName, /^gobook_employee_work_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
function assignment(business, title, extra = {}) { return { title, description: 'Fixture instructions', dueDate: '2026-11-20', priority: 'High', employeeIds: [String(business.employees[0].employee._id)], requestId: randomUUID(), ...extra }; }
async function create(business, title, extra) {
  const body = assignment(business, title, extra);
  const result = await call('/admin/employee-work', business.ownerToken, body);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return EmployeeWork.findOne({ ownerUserId: business.owner._id, requestId: body.requestId }).lean();
}

test('main navigation badge counts unread owner messages and reading persists without changing employee receipts', options, async () => {
  const [alpha, beta] = businesses;
  await create(alpha, 'Pending work is not an unread notification');
  async function message(business, kind = 'announcement', extra = {}) {
    const employee = business.employees[0].employee;
    return EmployeeNotification.create({ ownerUserId: business.owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name, requestKey: randomUUID(), title: 'Badge fixture', message: 'Fixture only', kind, emailStatus: 'Accepted', ...extra });
  }
  const first = await message(alpha, 'announcement', { emailStatus: 'Failed' });
  await EmployeeNotification.updateOne({ _id: first._id }, { $unset: { ownerReadAt: '' } }); // Existing records also count as unread.
  const employeeRead = await message(alpha, 'announcement', { readAt: new Date('2026-11-14T01:00:00Z') });
  await message(alpha);
  await message(alpha, 'login-otp');
  const foreign = await message(beta);
  const counts = () => call('/admin/employee-navigation-counts', alpha.ownerToken);
  assert.deepEqual((await counts()).data, { unread: 3 });
  assert.deepEqual((await call('/admin/employee-navigation-counts?ownerUserId=' + beta.owner._id, alpha.ownerToken)).data, { unread: 3 });
  assert.deepEqual((await call('/admin/employee-navigation-counts', beta.ownerToken)).data, { unread: 1 });
  assert.equal((await call('/admin/employee-navigation-counts', alpha.employees[0].token)).status, 403);
  assert.equal((await call('/admin/employee-notifications/' + foreign._id + '/read', alpha.ownerToken, {}, 'PUT')).status, 404);
  assert.equal((await call('/admin/employee-notifications/not-an-id/read', alpha.ownerToken, {}, 'PUT')).status, 404);
  assert.equal((await call('/admin/employee-notifications/' + first._id + '/read', alpha.employees[0].token, {}, 'PUT')).status, 403);
  assert.equal((await call('/admin/employee-notifications/read-all', alpha.employees[0].token, {}, 'PUT')).status, 403);
  const viewed = await call('/admin/employee-notifications/' + first._id + '/read', alpha.ownerToken, {}, 'PUT');
  assert.equal(viewed.status, 200); assert.ok(viewed.data.ownerReadAt); assert.equal(viewed.data.readAt, null);
  assert.equal((await call('/admin/employee-notifications/' + first._id + '/read', alpha.ownerToken, {}, 'PUT')).data.ownerReadAt, viewed.data.ownerReadAt);
  assert.deepEqual((await counts()).data, { unread: 2 });
  const history = await call('/admin/employee-notifications?month=all', alpha.ownerToken);
  assert.equal(history.data.ownerUnread, 2);
  assert.equal(history.data.data.find(row => row._id === String(first._id)).ownerReadAt, viewed.data.ownerReadAt);
  const employeeHistory = await call('/employee/notifications?month=all', alpha.employees[0].token);
  assert.equal(employeeHistory.data.unread, 3);
  assert.equal('ownerReadAt' in employeeHistory.data.data[0], false);
  assert.equal((await call('/admin/employee-notifications/read-all', alpha.ownerToken, {}, 'PUT')).status, 200);
  assert.deepEqual((await counts()).data, { unread: 0 });
  assert.deepEqual((await counts()).data, { unread: 0 }); // A fresh request retains read state.
  assert.equal((await EmployeeNotification.findById(first._id).lean()).readAt, null);
  assert.equal((await EmployeeNotification.findById(employeeRead._id).lean()).readAt.toISOString(), employeeRead.readAt.toISOString());
  assert.equal((await EmployeeNotification.findById(foreign._id).lean()).ownerReadAt, null);
  await message(alpha);
  assert.deepEqual((await counts()).data, { unread: 1 });
});

test('owner assignments persist and only the assigned employee can read them, including forged query identity', options, async () => {
  const [alpha, beta] = businesses;
  const task = await create(alpha, 'Private assigned task');
  assert.equal(task.status, 'Assigned'); assert.equal(task.__v, 0);
  const mine = await call('/employee/work', alpha.employees[0].token);
  assert.equal(mine.data.data.some((row) => row._id === String(task._id)), true);
  const other = await call(`/employee/work?employee=${alpha.employees[0].employee._id}&ownerUserId=${alpha.owner._id}`, alpha.employees[1].token);
  assert.equal(other.data.data.some((row) => row._id === String(task._id)), false);
  const foreign = await call('/admin/employee-work', beta.ownerToken);
  assert.equal(foreign.data.data.some((row) => row._id === String(task._id)), false);
  assert.equal((await call('/admin/employee-work', alpha.employees[0].token)).status, 403);
  assert.equal((await call('/admin/employee-work', alpha.employees[0].token, assignment(alpha, 'Forged assignment'))).status, 403);
});
test('assign all creates independent work for active employees and retries cannot duplicate it or reset progress', options, async () => {
  const [alpha] = businesses;
  const body = assignment(alpha, 'All staff work', { allEmployees: true, employeeIds: [] });
  assert.equal((await call('/admin/employee-work', alpha.ownerToken, body)).data.count, 2);
  const tasks = await EmployeeWork.find({ ownerUserId: alpha.owner._id, requestId: body.requestId }).lean();
  assert.equal(tasks.length, 2); assert.equal(tasks.some((task) => String(task.employeeObjectId) === String(alpha.inactive._id)), false);
  const first = tasks.find((task) => String(task.employeeObjectId) === String(alpha.employees[0].employee._id));
  assert.equal((await call(`/employee/work/${first._id}`, alpha.employees[0].token, { status: 'Completed', version: 0, note: 'Finished my part' }, 'PUT')).status, 200);
  await call('/admin/employee-work', alpha.ownerToken, body);
  assert.equal(await EmployeeWork.countDocuments({ requestId: body.requestId }), 2);
  const saved = await EmployeeWork.findById(first._id).lean(); assert.equal(saved.status, 'Completed');
  assert.equal((await EmployeeWork.findOne({ requestId: body.requestId, _id: { $ne: first._id } }).lean()).status, 'Assigned');
});
test('employee progress, completion notes and timestamps appear in owner filters; only owner can reopen', options, async () => {
  const [alpha] = businesses;
  const task = await create(alpha, 'Completion lifecycle');
  const path = `/employee/work/${task._id}`;
  const started = await call(path, alpha.employees[0].token, { status: 'In Progress', note: 'Started', version: 0 }, 'PUT');
  assert.equal(started.status, 200); assert.equal(started.data.completedAt, null);
  const done = await call(path, alpha.employees[0].token, { status: 'Completed', note: 'All checks done', version: 1 }, 'PUT');
  assert.equal(done.status, 200); assert.ok(done.data.completedAt); assert.equal(done.data.note, 'All checks done');
  const report = await call('/admin/employee-work?status=Completed&q=Completion%20lifecycle', alpha.ownerToken);
  assert.equal(report.data.total, 1); assert.equal(report.data.summary.completed, 1); assert.equal(report.data.summary.assigned, 0);
  assert.equal((await call(path, alpha.employees[0].token, { status: 'Assigned', version: 2 }, 'PUT')).status, 400);
  const reopened = await call(`/admin/employee-work/${task._id}`, alpha.ownerToken, { status: 'Assigned', version: 2 }, 'PUT');
  assert.equal(reopened.status, 200); assert.equal(reopened.data.completedAt, null);
});
test('foreign, malformed, unauthorized fields and stale or concurrent work updates are rejected', options, async () => {
  const [alpha, beta] = businesses;
  const task = await create(alpha, 'Protected updates');
  assert.equal((await call(`/employee/work/${task._id}`, alpha.employees[1].token, { status: 'Completed', version: 0 }, 'PUT')).status, 404);
  assert.equal((await call(`/admin/employee-work/${task._id}`, beta.ownerToken, { title: 'Forged', version: 0 }, 'PUT')).status, 404);
  for (const body of [{ title: 'Forged title', version: 0 }, { employeeObjectId: String(beta.employees[0].employee._id), version: 0 }, { status: 'Unknown', version: 0 }, { status: 'Completed' }]) assert.equal((await call(`/employee/work/${task._id}`, alpha.employees[0].token, body, 'PUT')).status, 400);
  assert.equal((await call('/employee/work/not-an-id', alpha.employees[0].token, { status: 'Completed', version: 0 }, 'PUT')).status, 400);
  const results = await Promise.all(['In Progress', 'Completed'].map((status) => call(`/employee/work/${task._id}`, alpha.employees[0].token, { status, version: 0 }, 'PUT')));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
});
test('assignment validation rejects foreign/inactive employees, invalid calendar dates and query injection', options, async () => {
  const [alpha, beta] = businesses;
  const invalid = [{ title: '' }, { dueDate: '2026-02-30' }, { priority: { $ne: '' } }, { allEmployees: 'true' }, { employeeIds: [] }, { employeeIds: [{ $ne: '' }] }];
  for (const body of invalid) assert.equal((await call('/admin/employee-work', alpha.ownerToken, assignment(alpha, 'Invalid work', body))).status, 400);
  for (const id of [beta.employees[0].employee._id, alpha.inactive._id]) assert.equal((await call('/admin/employee-work', alpha.ownerToken, assignment(alpha, 'Foreign work', { employeeIds: [String(id)] }))).status, 404);
  for (const query of ['status=Unknown', 'status[$ne]=Completed', 'page=0', 'page=bad', 'employee[$ne]=bad']) assert.equal((await call('/admin/employee-work?' + query, alpha.ownerToken)).status, 400);
});
test('pagination, exact text search and overdue summaries include the complete saved work set', options, async () => {
  const [alpha] = businesses;
  for (let index = 0; index < 7; index++) await create(alpha, `Pagination fixture ${index}`, { allEmployees: true, employeeIds: [], dueDate: '2000-01-01' });
  const first = await call('/admin/employee-work?q=Pagination%20fixture', alpha.ownerToken);
  const second = await call('/admin/employee-work?q=Pagination%20fixture&page=2', alpha.ownerToken);
  assert.equal(first.data.total, 14); assert.equal(first.data.data.length, 12); assert.equal(second.data.data.length, 2); assert.equal(first.data.summary.overdue, 14);
  assert.equal(new Set([...first.data.data, ...second.data.data].map((task) => task._id)).size, 14);
  await create(alpha, 'Literal [A].* task');
  assert.equal((await call('/admin/employee-work?q=' + encodeURIComponent('[A].*'), alpha.ownerToken)).data.total, 1);
});
