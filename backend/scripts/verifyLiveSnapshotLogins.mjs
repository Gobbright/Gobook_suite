// Exercise every copied account's login/session/data flow in a disposable
// database. Only this disposable fixture gets a known test password; the
// downloaded backups and the website's local snapshot retain live hashes.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { apiRouter } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { rememberEmployeeAccess } from '../src/services/employeeAccess.js';

assert.equal(env.nodeEnv, 'development');
assert.equal(env.mongodbDbName, 'gobook_live_local');
assert.match(env.mongodbUri, /^mongodb:\/\/127\.0\.0\.1:27018\//);
const dbName = `gobook_live_login_test_${process.pid}_${Date.now()}`;
const directory = fileURLToPath(new URL('../runtime/live-account-backups/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(directory + 'manifest.json', 'utf8'));
const skip = new Set(['appsessions', 'securitysessions', 'securityratelimits', 'pendingemaillogins', 'pendingsignups', 'emailotprequestlimits']);
let server;
const report = { accounts: manifest.accountCount, activeLogins: 0, deletedAccountsRejected: 0, dataChecks: 0, subscriptionRestrictions: 0, employeeLogins: 0, adminLogins: 0, failures: [] };

try {
  await mongoose.connect(env.mongodbUri, { dbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  for (const item of manifest.backups) {
    const backup = mongoose.mongo.BSON.EJSON.parse(await fs.readFile(directory + item.filename, 'utf8'), { relaxed: false });
    for (const collection of backup.collections) {
      if (skip.has(collection.name) || !collection.documents.length) continue;
      await db.collection(collection.name).insertMany(collection.documents);
    }
  }
  // Convert legacy BSON dates/numbers through MongoDB before using Mongoose.
  const users = await AppUser.find({}).lean();
  const fixturePassword = 'LocalVerificationOnly@2026';
  await db.collection('appusers').updateMany({}, { $set: { password: await bcrypt.hash(fixturePassword, 4) } });
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(route, { body, token, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(base + route, {
      method, headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'live-snapshot-fixture', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }
  assert.equal((await call('/auth/me')).status, 401);
  for (const user of users) {
    const result = await call('/auth/login', { body: { email: user.email, password: fixturePassword } });
    if (user.status !== 'Active') {
      assert.equal(result.status, 403, 'Non-active account must remain blocked');
      report.deletedAccountsRejected++;
      continue;
    }
    assert.equal(result.status, 200, `Active account login returned HTTP ${result.status}`);
    assert.ok(result.data.token, 'Successful login must return a token');
    report.activeLogins++;
    const me = await call('/auth/me', { token: result.data.token });
    assert.equal(me.status, 200, 'Issued login session must authenticate');
    assert.equal(String(me.data.id), String(user._id), 'Session returned a different account');
    for (const route of ['/settings', '/inventory/products?limit=200', '/sales/invoices?limit=200', '/hr-payroll/employees?limit=200', '/dashboard/retail-summary']) {
      const response = await call(route, { token: result.data.token });
      if (response.status === 402) { report.subscriptionRestrictions++; continue; }
      if (response.status !== 200) report.failures.push({ accountId: String(user._id), route, status: response.status, message: response.data.message || '' });
      else report.dataChecks++;
    }
    assert.equal((await call('/auth/logout', { token: result.data.token, body: {} })).status, 200);
    assert.equal((await call('/auth/me', { token: result.data.token })).status, 401);
  }
  const active = users.find((user) => user.status === 'Active');
  assert.equal((await call('/auth/login', { body: { email: active.email, password: 'DeliberatelyWrong@2026' } })).status, 401);
  for (const account of env.adminAccounts) {
    const result = await call('/admin/login', { body: { adminId: account.id, password: account.password } });
    assert.equal(result.status, 200, 'Configured administrator must be able to sign in');
    const dashboard = await call('/admin/dashboard', { token: result.data.token });
    assert.equal(dashboard.status, 200, `Admin dashboard: HTTP ${dashboard.status}, ${dashboard.data.message || ''}`);
    assert.equal((await call('/admin/logout', { token: result.data.token, body: {} })).status, 200);
    report.adminLogins++;
  }
  for (const login of await EmployeeLogin.find({ loginEnabled: true, status: 'Active' }).select('+passwordHash +loginPassword').lean()) {
    const employee = await Employee.findById(login.employeeObjectId).lean();
    const owner = await AppUser.findById(login.ownerUserId).lean();
    assert.ok(employee && owner, 'Employee login references must resolve');
    const password = login.loginPassword || employee.loginPassword;
    assert.ok(password && await bcrypt.compare(password, login.passwordHash), 'Stored employee credential must match its existing hash');
    const access = await rememberEmployeeAccess(employee, owner);
    const result = await call('/employee/auth/login', { body: { ownerUserId: String(owner._id), employeeId: employee.employeeId, businessSlug: access.businessSlug, password } });
    assert.equal(result.status, 200, 'Existing employee credentials must sign in');
    assert.equal((await call('/employee/me', { token: result.data.token })).status, 200);
    assert.equal((await call('/employee/auth/logout', { token: result.data.token, body: {} })).status, 200);
    report.employeeLogins++;
  }
  console.log(JSON.stringify(report, null, 2));
  await fs.writeFile(directory + 'login-verification.json', JSON.stringify(report, null, 2));
  assert.equal(report.failures.length, 0, 'Account data routes failed');
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : `Local verification failed: ${error.name}`);
  console.error(error.stack?.split('\n').find((line) => line.includes('verifyLiveSnapshotLogins.mjs:')) || '');
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName);
    assert.match(dbName, /^gobook_live_login_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
}
