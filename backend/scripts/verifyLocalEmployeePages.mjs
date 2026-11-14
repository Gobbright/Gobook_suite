// Verify the actual development server, with temporary records owned solely by
// this run. Never run against a hosted API or delete an existing database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import { AppUser } from '../src/models/AppUser.js';
import { AppSession } from '../src/models/AppSession.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { EmployeeWork } from '../src/models/EmployeeWork.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { createLoginSession } from '../src/services/appSessions.js';
import { createSecuritySession } from '../src/services/securitySessions.js';
import { employeeCredential } from '../src/services/employeeAccess.js';
import { signPortalToken } from '../src/services/employeePortalSession.js';
import { signToken } from '../src/modules/auth/authController.js';

assert.equal(env.nodeEnv, 'development', 'This check is restricted to local development');
assert.ok(/^mongodb:\/\/(?:localhost|127\.0\.0\.1):\d+\//i.test(env.mongodbUri), 'A local MongoDB connection is required');
const origin = `http://localhost:${env.port}`;
const frontend = new URL(env.clientUrl);
assert.ok(['localhost', '127.0.0.1'].includes(frontend.hostname), 'Frontend must be local');
let health;
for (let attempt = 0; attempt < 40; attempt++) {
  try { health = await (await fetch(origin + '/health/ready', { signal: AbortSignal.timeout(2000) })).json(); if (health.status === 'ready') break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(health, 'Start the local backend before running this check');
assert.equal(health.service, 'gobook-backend'); assert.equal(health.environment, 'development'); assert.equal(health.status, 'ready');
const ownerId = new mongoose.Types.ObjectId(), employeeId = new mongoose.Types.ObjectId(), businessId = new mongoose.Types.ObjectId();
const runId = randomUUID();
const apiChecks = [], pageChecks = [], apiFailures = [], errors = [];
const artifacts = path.resolve('runtime/local-employee-routes-check');
let loginId, browser, socket, profileRoot, bootstrap, serial = 0;
const pending = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) { const end = Date.now() + 20000; while (Date.now() < end) { if (await check()) return; await delay(100); } throw new Error(message); }
async function api(route, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(origin + '/api' + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const value = await response.json();
  apiChecks.push({ method, route, status: response.status });
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${value.message || ''}`);
  return value;
}
function send(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser timeout: ' + method)); }, 20000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
async function session(values) {
  if (bootstrap) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
  bootstrap = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear(); ${Object.entries(values).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))});`).join(' ')}` });
}
async function page(route) {
  const start = apiFailures.length;
  await send('Page.navigate', { url: frontend.origin + route });
  await until(() => evaluate(`location.pathname === ${JSON.stringify(route)} && Boolean(document.querySelector('h1, #employee-login-directory-title')) && !document.querySelector('.employee-management, .employee-workspace .content, .aem-page, .aed-page, .employee-login-directory')?.innerText.includes('Loading')`), 'Page did not load: ' + route);
  await delay(100);
  for (const width of [1440, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await delay(100);
    const layout = await evaluate('({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, title: document.querySelector("h1, #employee-login-directory-title")?.textContent })');
    assert.ok(layout.documentWidth <= width + 1, `${route} overflows at ${width}px`);
    pageChecks.push({ route, ...layout });
  }
  assert.deepEqual(apiFailures.slice(start), [], 'API error while loading ' + route);
}

try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const owner = await AppUser.create({ _id: ownerId, businessId, name: 'Local Route Verification', businessName: `Local Route Check ${runId.slice(0, 8)}`, email: `route-check-${runId}@example.test`, password: await bcrypt.hash(randomUUID(), 4), role: 'Super Admin', accountType: 'owner', category: 'retail', retailSubcategory: 'electronics-technology', status: 'Active', emailVerified: true, onboardingCompleted: true, subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', paymentMethodVerified: true, subscriptionExpiresAt: new Date(Date.now() + 86400000) });
  const mainSession = await createLoginSession(owner, { headers: {}, ip: '127.0.0.1' });
  const ownerToken = signToken(owner, mainSession.sessionId);
  const employee = await Employee.create({ _id: employeeId, userId: ownerId, category: 'retail', employeeId: 'ROUTE-001', name: 'Local Route Employee', email: `employee-${runId}@example.test`, loginAccess: true });
  const login = await EmployeeLogin.create({ ownerUserId: ownerId, employeeObjectId: employeeId, employeeId: employee.employeeId, name: employee.name, email: employee.email, passwordHash: await bcrypt.hash(randomUUID(), 4), role: 'employee', loginEnabled: true, status: 'Active' });
  loginId = login._id;
  const sid = await createSecuritySession(login._id, 'employee-portal', employeeCredential(login.passwordHash, employee), '1h');
  const employeeToken = signPortalToken({ id: login._id, ownerUserId: ownerId, employeeObjectId: employeeId, employeeId: employee.employeeId, role: 'employee' }, sid);
  for (const route of ['/admin/employee-work?page=1', '/admin/employee-dashboard', '/admin/employees', '/admin/employees/presence', `/admin/employees/${employeeId}/access`, `/admin/employees/${employeeId}/overview`, '/admin/attendance/today', '/admin/attendance/monthly', '/admin/attendance/corrections', '/admin/leaves', '/admin/permissions', '/admin/payroll', '/admin/holidays', '/admin/employee-email-settings', '/admin/employee-notifications?month=all&page=1']) await api(route, ownerToken);
  for (const route of ['/employee/me', '/employee/dashboard', '/employee/work?page=1', '/employee/attendance/monthly', '/employee/leave/status', '/employee/leave/history', '/employee/payslips', '/employee/holidays', '/employee/documents', '/employee/permissions', '/employee/notifications', '/employee/notifications/count']) await api(route, employeeToken);
  await api('/admin/employee-work', ownerToken, { title: 'Verify the running work route', description: 'Temporary local verification assignment.', employeeIds: [String(employeeId)], requestId: runId });
  const assigned = await api('/employee/work?page=1', employeeToken);
  assert.equal(assigned.data.length, 1);
  await api(`/employee/work/${assigned.data[0]._id}`, employeeToken, { status: 'Completed', note: 'Verified on the running backend.', version: assigned.data[0].__v }, 'PUT');
  assert.equal((await api('/admin/employee-work?page=1&status=Completed', ownerToken)).summary.completed, 1);
  const employeeContext = (await api('/employee/me', employeeToken)).user;
  const ownerContext = await api('/auth/me', ownerToken);
  await fs.mkdir(artifacts, { recursive: true });
  profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gobook-local-routes-'));
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileRoot}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(async () => { try { await fs.access(path.join(profileRoot, 'DevToolsActivePort')); return true; } catch { return false; } }, 'Chrome did not start');
  const port = (await fs.readFile(path.join(profileRoot, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) { const task = pending.get(event.id); pending.delete(event.id); if (event.error) task?.reject(new Error(event.error.message)); else task?.resolve(event.result); }
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
    else if (event.method === 'Network.responseReceived') { const response = event.params.response; if (response.url.startsWith(origin + '/api/') && response.status >= 400) apiFailures.push({ path: new URL(response.url).pathname, status: response.status }); }
    else if (event.method === 'Fetch.requestPaused') { const url = new URL(event.params.request.url); send(['localhost', '127.0.0.1'].includes(url.hostname) ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: event.params.requestId, ...(!['localhost', '127.0.0.1'].includes(url.hostname) ? { errorReason: 'Aborted' } : {}) }).catch(() => {}); }
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await session({ 'gobook.token': ownerToken, 'gobook.user': ownerContext });
  for (const route of ['dashboard', 'employees', 'work', 'departments', 'designations', 'attendance', 'attendance/monthly', 'attendance/corrections', 'attendance/reports', 'leave', 'leave/types', 'leave/balance', 'leave/calendar', 'leave/reports', 'leave/permissions', 'payroll', 'payroll/salary', 'payroll/payslips', 'payroll/deductions', 'payroll/reports', 'holidays', 'settings', 'login-links', 'notifications', 'reports']) await page('/employee-management/' + route);
  await session({ employee_portal_token: employeeToken, employee_portal_user: employeeContext });
  for (const route of ['', '/work', '/attendance', '/attendance/monthly', '/attendance/correction', '/leave/apply', '/leave/status', '/leave/history', '/permissions', '/payslips', '/holidays', '/documents', '/notifications', '/profile']) await page(employeeContext.portalBasePath + route);
  assert.deepEqual(errors, []);
  const report = { ok: true, realBackend: origin, realFrontend: frontend.origin, apiChecks, pageChecks, browserErrors: errors, apiFailures, temporaryRecordsOnly: true };
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, apiChecks: apiChecks.length, pages: pageChecks.length / 2, layoutChecks: pageChecks.length, workAssignedAndCompleted: true, report: path.join(artifacts, 'report.json') }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, apiFailures, errors, lastPage: pageChecks.at(-1)?.route, page: socket?.readyState === WebSocket.OPEN ? await evaluate('document.body.innerText.slice(0, 1200)').catch(() => '') : '' }, null, 2)); throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  browser?.kill();
  if (profileRoot) { const target = path.resolve(profileRoot); if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('gobook-local-routes-')) throw new Error('Unexpected browser profile directory'); await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); }
  if (mongoose.connection.readyState === 1) {
    // Every delete is scoped to IDs generated above; existing user data is never selected.
    await EmployeeWork.deleteMany({ ownerUserId: ownerId });
    await AppSession.deleteMany({ userId: ownerId });
    if (loginId) await SecuritySession.deleteMany({ subject: String(loginId), scope: 'employee-portal' });
    await EmployeeLogin.deleteMany({ ownerUserId: ownerId });
    await Employee.deleteMany({ userId: ownerId });
    for (const collection of ['businesssettings', 'auditlogs', 'employeenotifications']) {
      await mongoose.connection.db.collection(collection).deleteMany({ $or: [{ userId: ownerId }, { ownerUserId: ownerId }, { businessId }] });
    }
    await AppUser.deleteOne({ _id: ownerId });
    await mongoose.disconnect();
  }
}
