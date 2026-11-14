// Browser QA against the production build. All external requests are intercepted;
// the fixtures below never read or write a live account.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import ZXing from '@zxing/library';

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifacts = path.resolve(process.env.EMPLOYEE_UI_ARTIFACTS || '../backend/runtime/employee-dashboard-preview');
const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gobook-employee-ui-'));
const base = '/employee/anbu-retail-a1b2c3d4/EMP-001';
const user = { id: 'employee-preview', name: 'Bala Ganesh', businessName: 'Anbu Retail', businessLogoUrl: '/api/files/logos/preview-logo', employeeId: 'EMP-001', role: 'employee', ownerUserId: '507f1f77bcf86cd799439011', portalBasePath: base };
const now = Math.floor(Date.now() / 1000);
const token = `header.${Buffer.from(JSON.stringify({ iat: now, exp: now + 3600 })).toString('base64url')}.fixture`;
let app, browser, socket;
const pending = new Map();
const errors = [];
const cancelledInterceptions = [];
const requests = [];
const pageChecks = [];
let serial = 0;
let failDashboard = false;
let failEmployeeSession = '';
let brokenLogo = false;
let dashboardReady = false;
let loginChallenge = 'a'.repeat(64);
let senderVerified = false;
const ownerUser = { id: '507f1f77bcf86cd799439011', name: 'Business Owner', email: 'owner@example.test', businessName: 'Anbu Retail', role: 'Super Admin', accountType: 'owner', category: 'retail', status: 'Active', onboardingCompleted: true, emailVerified: true, needsEmailVerification: false, subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', paymentMethodVerified: true, subscriptionExpiresAt: '2099-01-01T00:00:00Z' };
let qrFields = { photo: true, name: true, employeeId: true, role: true, address: true, phone: true, email: false };
const sampleEmployee = { _id: '507f1f77bcf86cd799439022', employeeId: 'EMP-001', name: 'Bala Ganesh', email: 'bala@example.test', phone: '9000012345', address: '12 Demo Road, Chennai', designation: 'Sales Executive', loginAccess: true, status: 'Active' };
sampleEmployee.familyMembers = [{ name: 'Fixture Mother', relationship: 'Mother', phone: '9000012346', isEmergencyContact: true }];
sampleEmployee.statutoryDetails = { pfNumber: 'PF-FIXTURE', uan: '001234567890', esiNumber: '0012345' };
sampleEmployee.bankDetails = { accountName: sampleEmployee.name, accountNumber: '0012345678', bankName: 'Fixture Bank', ifsc: 'TEST0123456' };
const fixtureDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let fixtureAttendance = { _id: 'fixture-attendance', date: fixtureDate, checkIn: '09:00', checkOut: '--', breaks: [], breakMinutes: 0, status: 'Present' };
let submittedEmployee;
let managedEmployees = null;
let acceptDialogs = false;
let failEmployeeDelete = false;
const passwordUpdates = [];
let notificationViewed = false;
let fixtureOnline = true;
let fixtureUpdates = [];
let ownerLeaveRequests = [];
let ownerPermissions = [];
let submittedNotification;
const fixtureNotification = () => ({ _id: '507f1f77bcf86cd799439077', employeeId: sampleEmployee.employeeId, employeeName: sampleEmployee.name, recipientEmail: sampleEmployee.email, senderEmail: 'owner-fixture@gmail.com', title: 'Fixture business update', message: 'Please review your saved employee update.', emailStatus: 'Accepted', kind: 'announcement', readAt: notificationViewed ? '2026-11-13T04:00:00Z' : null, createdAt: '2026-11-13T03:00:00Z' });
function qrAccess() {
  const identity = { name: sampleEmployee.name, employeeId: sampleEmployee.employeeId, role: sampleEmployee.designation, phone: sampleEmployee.phone, address: sampleEmployee.address, email: sampleEmployee.email, photoUrl: '/api/employee/auth/link-photo?businessSlug=anbu-retail-a1b2c3d4&employeeId=EMP-001' };
  const qrProfile = Object.fromEntries(Object.entries(identity).filter(([key]) => qrFields[key === 'photoUrl' ? 'photo' : key]));
  return { businessName: 'Anbu Retail', businessUsername: 'owner@example.test', ownerUserId: ownerUser.id, employeeId: 'EMP-001', loginPath: '/employee-login/anbu-retail-a1b2c3d4/EMP-001', businessSlug: 'anbu-retail-a1b2c3d4', loginEnabled: true, passwordConfigured: true, emailOtpReady: true, emailVerified: true, qrDisplayFields: qrFields, qrProfile, identity };
}
function directoryEmployees() {
  if (managedEmployees) return managedEmployees;
  return Array.from({ length: 12 }, (_, index) => {
    if (index === 0) return { ...sampleEmployee, portalAccess: qrAccess() };
    const id = `EMP-${String(index + 1).padStart(3, '0')}`;
    return { ...sampleEmployee, _id: `507f1f77bcf86cd79943${9022 + index}`, employeeId: id, name: `Fixture Employee ${index + 1}`, email: `employee${index + 1}@example.test`, portalAccess: { ...qrAccess(), employeeId: id, loginPath: `/employee-login/fixture-business-${String(index).padStart(8, '0')}/${id}` } };
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(message);
}
function send(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function checkPage(origin, route, title, screenshot = '') {
  await send('Page.navigate', { url: origin + route });
  await until(() => evaluate(`document.querySelector('h1')?.textContent === ${JSON.stringify(title)} && !document.querySelector('.employee-workspace .content, .employee-management, .aed-page, .aem-page')?.innerText.includes('Loading')`), `Screen did not load: ${route}`);
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(100);
    const layout = await evaluate(`({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('.employee-management *, .employee-workspace .content *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 5).map(el => el.className || el.tagName) })`);
    assert.ok(layout.documentWidth <= layout.width + 1, `${route} overflows at ${width}px: ${JSON.stringify(layout)}`);
    if (route === '/employee-management/employees' && ownerUser.category === 'retail') {
      assert.ok(await evaluate("document.querySelector('.hr-search').getBoundingClientRect().height <= 56"), `Employee search is stretched at ${width}px`);
    }
    pageChecks.push({ route, category: ownerUser.category, width, documentWidth: layout.documentWidth });
    if (screenshot && [1440, 390].includes(width)) {
      const metrics = await send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
      await fs.writeFile(path.join(artifacts, `${screenshot}-${width}.png`), Buffer.from(shot.data, 'base64'));
      if (route === '/employee-management/employees' && ownerUser.category === 'retail' && width === 390) {
        await evaluate("document.querySelector('.hr-employee-card').scrollIntoView({ block: 'center' })");
        await delay(100);
        assert.equal(await evaluate("(() => { const name = document.querySelector('.hr-employee-card h2'); const rect = name.getBoundingClientRect(); return Boolean(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.hr-employee-card-identity')); })()"), true, 'Employee name is covered by the mobile selection checkbox');
        const rowShot = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(path.join(artifacts, 'employee-record-390.png'), Buffer.from(rowShot.data, 'base64'));
      }
    }
  }
}
async function intercept(event, origin) {
  const url = new URL(event.request.url);
  if (url.origin === origin) return send('Fetch.continueRequest', { requestId: event.requestId });
  // Only fixtures may answer external requests, including requests made by img.
  if (url.origin !== 'https://api.gobooksuite.com') return send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' });
  requests.push({ path: url.pathname, query: url.search, method: event.request.method });
  if (event.request.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type,x-device-id,x-human-verification' }] });
  let responseCode = 200;
  let contentType = 'application/json';
  let body = {};
  const input = event.request.postData ? JSON.parse(event.request.postData) : {};
  if (url.pathname === '/api/auth/security-config') body = { enabled: false };
  else if (url.pathname === '/api/admin/employee-updates') body = { data: fixtureUpdates.filter(row => !url.searchParams.get('kind') || row.kind === url.searchParams.get('kind')), nextCursor: null };
  else if (url.pathname === '/api/admin/leaves') body = { data: ownerLeaveRequests, balances: [] };
  else if (url.pathname === '/api/admin/permissions') body = { data: ownerPermissions };
  else if (url.pathname === '/api/employee/presence') body = { online: true };
  else if (url.pathname === '/api/employee/notifications/count') body = { unread: notificationViewed ? 0 : 1 };
  else if (url.pathname.endsWith('/507f1f77bcf86cd799439077/read')) { notificationViewed = true; body = fixtureNotification(); }
  else if (url.pathname === '/api/admin/employee-notifications' && event.request.method === 'POST') { submittedNotification = input; responseCode = 202; body = { count: 12, message: 'Saved 12 employee notifications. Email delivery is queued.' }; }
  else if (['/api/employee/notifications', '/api/admin/employee-notifications'].includes(url.pathname)) body = { data: [fixtureNotification()], total: 1, unread: notificationViewed ? 0 : 1, page: 1, limit: 50 };
  else if (/\/employee-reports\/all\/(pdf|xlsx)$/.test(url.pathname)) { contentType = url.pathname.endsWith('/pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; body = url.pathname.endsWith('/pdf') ? '%PDF-fixture-only' : 'PK-fixture-only'; }
  else if (url.pathname === '/api/admin/employees/presence') body = { data: directoryEmployees().map((employee, index) => ({ employeeObjectId: employee._id, online: fixtureOnline && index === 0 })) };
  else if (url.pathname === '/api/admin/employees' && event.request.method === 'POST') { submittedEmployee = input; responseCode = 201; body = { ...input, phone: input.mobileNumber || input.phone, dept: input.department || input.dept, _id: '507f1f77bcf86cd799439099' }; if (managedEmployees) managedEmployees.unshift(body); }
  else if (managedEmployees && /^\/api\/admin\/employees\/[a-f\d]{24}$/i.test(url.pathname)) {
    const id = url.pathname.split('/').at(-1); const index = managedEmployees.findIndex(row => row._id === id);
    if (index < 0) { responseCode = 404; body = { message: 'Employee not found' }; }
    else if (event.request.method === 'DELETE') {
      if (failEmployeeDelete) { responseCode = 503; body = { message: 'Fixture delete unavailable. Please retry.' }; }
      else { managedEmployees.splice(index, 1); body = { message: 'Employee deleted' }; }
    } else { managedEmployees[index] = { ...managedEmployees[index], ...input, phone: input.mobileNumber || input.phone, dept: input.department || input.dept }; body = managedEmployees[index]; }
  }
  else if (url.pathname === '/api/admin/employees' || url.pathname === '/api/hr-payroll/employees') body = { data: directoryEmployees(), total: directoryEmployees().length, page: 1 };
  else if (url.pathname === `/api/admin/employees/${sampleEmployee._id}/access`) { if (event.request.method === 'PUT') passwordUpdates.push(input); body = qrAccess(); }
  else if (url.pathname === `/api/admin/employees/${sampleEmployee._id}/qr-display`) { qrFields = { ...input.fields }; body = qrAccess(); }
  else if (url.pathname === '/api/admin/employee-dashboard') body = { employees: 12, activeEmployees: 12, recentEmployees: [sampleEmployee], date: '2026-11-12' };
  else if (url.pathname === '/api/employee/auth/link-context') body = qrAccess();
  else if (url.pathname === '/api/employee/auth/link-photo') {
    if (!qrFields.photo) { responseCode = 404; body = { message: 'Photo hidden' }; }
    else {
      contentType = 'image/svg+xml';
      body = '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><rect width="144" height="144" rx="20" fill="#eaf0ff"/><circle cx="72" cy="52" r="26" fill="#a8bee8"/><path d="M23 143c0-36 20-56 49-56s49 20 49 56" fill="#6b8dc9"/></svg>';
    }
  }
  else if (url.pathname === '/api/employee/auth/login') {
    assert.equal(input.businessName, 'Anbu Retail');
    assert.equal(input.identifier, 'EMP-001');
    assert.equal(input.password, 'FixtureOnly@123');
    body = { otpRequired: true, challengeId: loginChallenge, maskedEmail: 'ba***@example.test', expiresInSeconds: 600, resendAfterSeconds: 60, message: 'OTP sent to your employee email.' };
    responseCode = 202;
  } else if (url.pathname === '/api/employee/auth/resend-otp') {
    assert.equal(input.challengeId, loginChallenge);
    loginChallenge = 'b'.repeat(64);
    body = { otpRequired: true, challengeId: loginChallenge, maskedEmail: 'ba***@example.test', expiresInSeconds: 600, resendAfterSeconds: 60 };
    responseCode = 202;
  } else if (url.pathname === '/api/employee/auth/verify-otp') {
    assert.equal(input.challengeId, loginChallenge);
    if (input.otp === '123456') body = { token, user };
    else { responseCode = 400; body = { message: 'Invalid or expired OTP' }; }
  } else if (url.pathname === '/api/admin/employee-email-settings') {
    if (event.request.method === 'PUT') {
      assert.equal(input.email, 'owner-fixture@gmail.com');
      assert.equal(input.appPassword, 'abcdefghijklmnop');
      senderVerified = true;
    }
    body = { configured: senderVerified, email: senderVerified ? 'owner-fixture@gmail.com' : 'owner@example.test', loginUsername: 'owner@example.test', employeeLoginPath: '/employee-login', message: 'Gmail connected and app password verified.' };
  } else if (url.pathname === '/api/auth/me') body = ownerUser;
  else if (url.pathname === '/api/settings') body = { businessName: 'Anbu Retail', logoUrl: '' };
  else if (url.pathname === '/api/more-modules/email-settings') body = { configured: senderVerified, email: 'owner-fixture@gmail.com' };
  else if (url.pathname === '/api/employee/me') {
    if (failEmployeeSession) { responseCode = failEmployeeSession === 'expired' ? 401 : 503; body = { message: 'Employee session temporarily unavailable' }; }
    else body = { user, employee: { ...sampleEmployee, dept: 'Sales', basicSalary: 25000, salaryStructure: { hra: 0, otherAllowances: 0 } } };
  }
  else if (url.pathname === `/api/admin/employees/${sampleEmployee._id}/overview`) body = { employee: sampleEmployee, attendance: [], leaves: [], payroll: [], permissions: [], documents: 0 };
  else if (url.pathname === '/api/employee/attendance/monthly') body = { data: [fixtureAttendance] };
  else if (url.pathname === '/api/employee/attendance/break') {
    if (input.action === 'start') fixtureAttendance = { ...fixtureAttendance, breaks: [{ start: '11:00', end: '' }] };
    else { assert.equal(input.action, 'end'); fixtureAttendance = { ...fixtureAttendance, breaks: [{ start: '11:00', end: '11:15' }], breakMinutes: 15 }; }
    body = fixtureAttendance;
  }
  else if (['/api/employee/leave/status', '/api/employee/leave/history'].includes(url.pathname)) body = { data: [{ _id: 'fixture-leave', leaveId: 'LV-001', applied: '2026-11-10', from: '2026-11-20', to: '2026-11-20', days: 1, type: 'Casual Leave', reason: 'Personal work', status: 'Pending' }] };
  else if (url.pathname === '/api/employee/permissions') body = { data: [{ _id: 'fixture-permission', date: '2026-11-20', fromTime: '09:00', toTime: '11:00', reason: 'Personal work', status: 'Pending' }] };
  else if (url.pathname === '/api/employee/documents') body = { data: [{ _id: 'fixture-document', name: 'Employment contract.pdf', category: 'Contracts', size: '120 KB', uploadedOn: '2026-11-01' }] };
  else if (url.pathname === '/api/employee/payslips') body = { data: [{ _id: 'fixture-payslip', month: '2026-11', basic: 25000, allowances: 0, deductions: 0, net: 25000, status: 'Paid' }] };
  else if (url.pathname === '/api/employee/dashboard') {
    dashboardReady = true;
    if (failDashboard) { responseCode = 503; body = { message: 'Dashboard temporarily unavailable' }; }
    else {
      const month = url.searchParams.get('month');
      body = { presentDays: 18, pendingLeaves: 2, pendingPermissions: 1, documents: 4, salary: { net: 28500, status: 'Paid' }, recentAttendance: [11, 10, 9, 6, 5].map((day) => ({ date: `${month}-${String(day).padStart(2, '0')}`, checkIn: '09:02', checkOut: '18:05', hours: '9h 3m', status: day === 10 ? 'Late' : 'Present' })) };
    }
  } else if (url.pathname === '/api/files/logos/preview-logo') {
    if (brokenLogo) responseCode = 404;
    else {
      contentType = 'image/svg+xml';
      body = '<svg xmlns="http://www.w3.org/2000/svg" width="185" height="48" viewBox="0 0 185 48"><rect width="43" height="43" y="2" rx="12" fill="#315bd5"/><path d="M10 32L21 12L33 32H27L21 21L15 32Z" fill="white"/><text x="54" y="31" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#243752">ANBU RETAIL</text></svg>';
    }
  } else body = { data: [] };
  return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
}

async function runChecks() {
  await fs.mkdir(artifacts, { recursive: true });
  app = await preview({ ...(process.env.EMPLOYEE_UI_DIST ? { build: { outDir: path.resolve(process.env.EMPLOYEE_UI_DIST) } } : {}), preview: { host: '127.0.0.1', port: 0, open: false } });
  const origin = `http://127.0.0.1:${app.httpServer.address().port}`;
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileRoot}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const activePortFile = path.join(profileRoot, 'DevToolsActivePort');
  await until(async () => { try { await fs.access(activePortFile); return true; } catch { return false; } }, 'Chrome did not start');
  const port = (await fs.readFile(activePortFile, 'utf8')).split('\n')[0];
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
      const task = pending.get(event.id);
      pending.delete(event.id);
      if (event.error) task?.reject(new Error(event.error.message)); else task?.resolve(event.result);
    } else if (event.method === 'Fetch.requestPaused') intercept(event.params, origin).catch((error) => {
      // A page navigation can cancel a request before its fixture is fulfilled.
      // This CDP bookkeeping error is separate from application exceptions.
      if (error.message === 'Invalid InterceptionId.') cancelledInterceptions.push(event.params.request.url);
      else errors.push(error.message);
    });
    else if (event.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: acceptDialogs }).catch(error => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const bootstrap = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('employee_portal_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('employee_portal_token', ${JSON.stringify(token)});` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: origin + base });
  await until(() => evaluate("document.querySelector('.employee-payroll-amount strong')?.textContent.includes('28,500')"), 'Dashboard did not load its fixture data');
  await until(() => evaluate("document.querySelector('.employee-business-logo')?.naturalWidth > 0"), 'Business logo did not load');

  if (process.argv.includes('--employee-updates-only')) {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
    const update = (kind, record, title, message, path) => ({ id: kind + ':' + record._id, recordId: record._id, kind, employeeName: sampleEmployee.name, employeeId: sampleEmployee.employeeId, title, message, status: record.status || 'Pending', at: new Date().toISOString(), href: '/employee-management/' + path + '?month=2026-12' });
    for (const category of ['retail', 'automobile']) {
      ownerUser.category = category; fixtureUpdates = []; ownerLeaveRequests = []; ownerPermissions = [];
      await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.assign('/employee-management/leave?month=2026-12')`);
      await until(() => evaluate("document.querySelector('input[type=month]')?.value === '2026-12'"), 'Leave page lost the requested month');
      await delay(400);
      const leave = { _id: '507f1f77bcf86cd799439081', leaveId: 'LV-SYNC', name: sampleEmployee.name, empId: sampleEmployee.employeeId, type: 'Casual Leave', from: '2026-12-10', to: '2026-12-11', days: 2, reason: 'Synced leave fixture', status: 'Pending', recordedBy: 'Employee Portal' };
      ownerLeaveRequests.push(leave); fixtureUpdates.push(update('leave', leave, 'Leave request', leave.reason, 'leave'));
      await evaluate("window.dispatchEvent(new Event('online'))");
      await until(() => evaluate("[...document.querySelectorAll('.app-toast-copy strong')].some(el => el.textContent.includes('Leave request'))"), 'Owner did not receive the saved leave popup');
      await until(() => evaluate("document.querySelector('.leave-list-card, .alv-list')?.textContent.includes('Bala Ganesh') || [...document.querySelectorAll('tbody')].some(el => el.textContent.includes('Bala Ganesh'))"), category + ' leave list did not refresh automatically');
      await evaluate("document.querySelectorAll('.app-toast > button').forEach(button => button.click())");
      await evaluate("location.assign('/employee-management/leave/permissions?month=2026-12')");
      await until(() => evaluate("document.querySelector('h1')?.textContent === 'Permission Requests' && document.querySelector('input[type=month]')?.value === '2026-12'"), 'Permission page lost its requested month');
      await delay(300);
      const permission = { _id: '507f1f77bcf86cd799439082', name: sampleEmployee.name, employeeId: sampleEmployee.employeeId, date: '2026-12-09', fromTime: '10:00', toTime: '11:00', reason: 'Synced permission fixture', status: 'Pending' };
      ownerPermissions.push(permission); fixtureUpdates.push(update('permission', permission, 'Permission request', permission.reason, 'leave/permissions'));
      await evaluate("window.dispatchEvent(new Event('online'))");
      await until(() => evaluate("document.querySelector('.employee-data-table')?.textContent.includes('Synced permission fixture')"), 'Permission list did not refresh automatically');
      await evaluate("location.assign('/employee-management/updates')");
      await until(() => evaluate("document.querySelectorAll('.employee-updates-list article').length === 2"), 'Employee updates page did not show saved requests');
      for (const width of [1440, 390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await delay(150);
        assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, 'Employee updates overflow at ' + width);
        if (width !== 320) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, category + '-employee-updates-' + width + '.png'), Buffer.from(shot.data, 'base64')); }
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['owner receives employee request popup', 'retail and automobile leave pages refresh automatically', 'permission page refreshes automatically', 'future month links', 'saved updates page', 'desktop and mobile'] })); return;
  }

  if (process.argv.includes('--employee-presence-only')) {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
    for (const category of ['retail', 'automobile']) {
      ownerUser.category = category; fixtureOnline = true; sampleEmployee.loginAccess = true;
      await evaluate(`localStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.assign('/employee-management/employees')`);
      await until(() => evaluate("document.querySelectorAll('.employee-presence-badge').length === 12 && document.querySelectorAll('.employee-presence-badge.is-online').length === 1"), category + ' live presence did not load');
      assert.equal(await evaluate("[...document.querySelectorAll('.employee-presence-badge')].filter(el => el.textContent === 'Offline').length"), 11);
      assert.equal(await evaluate("[...document.querySelectorAll('.hr-employee-card-top')].some(el => el.textContent.includes('Active'))"), false);
      for (const width of [1440, 390]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await delay(200);
        const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, category + '-online-offline-' + width + '.png'), Buffer.from(shot.data, 'base64'));
      }
      fixtureOnline = false;
      await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await until(() => evaluate("[...document.querySelectorAll('.employee-presence-badge')].every(el => el.textContent === 'Offline' && !el.classList.contains('is-online'))"), category + ' disconnected employee stayed green');
      fixtureOnline = true;
      await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      await until(() => evaluate("document.querySelectorAll('.employee-presence-badge.is-online').length === 1"), category + ' reconnected employee did not turn green');
      sampleEmployee.loginAccess = false;
      await send('Page.reload', { ignoreCache: true });
      await until(() => evaluate("document.querySelectorAll('.employee-presence-badge').length === 12"), 'Disabled employee cards did not load');
      assert.equal(await evaluate("document.querySelectorAll('.employee-presence-badge.is-online').length"), 0);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['Active accounts do not imply Online', 'only live employees are green', 'offline employees stay grey', 'disconnect and reconnect refresh', 'disabled login cannot show Online', 'retail and automobile', 'desktop and mobile'] })); return;
  }

  if (process.argv.includes('--employee-tools-crud-only') || process.argv.includes('--employee-menu-only')) {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
    senderVerified = true;
    const fillField = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    for (const category of ['retail', 'automobile']) {
      ownerUser.category = category; managedEmployees = null; managedEmployees = directoryEmployees(); managedEmployees[11].dept = 'Service'; managedEmployees[11].designation = 'Technician';
      await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.assign('/employee-management/employees')`);
      await until(() => evaluate("document.querySelectorAll('.hr-employee-card').length === 12 && document.querySelectorAll('.employee-team-tool').length === 8"), 'Employee tools did not load');
      const destinations = await evaluate("[...document.querySelectorAll('.employee-team-tool')].map(a => a.pathname)");
      for (const width of [1440, 1024, 768, 390, 320]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
        await delay(200);
        await evaluate("document.querySelectorAll('.app-toast > button').forEach(button => button.click()); document.querySelector('.employee-team-tools').scrollIntoView({ block: 'center' })");
        const result = await evaluate("({ overflow: document.documentElement.scrollWidth > innerWidth, dropdown: Boolean(document.querySelector('.employee-team-tools summary')), links: [...document.querySelectorAll('.employee-team-tool')].map(link => { const r = link.getBoundingClientRect(); return { label: link.textContent, visible: link.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) }; }) })");
        assert.equal(result.overflow, false, category + ' tools overflow at ' + width);
        assert.equal(result.dropdown, false);
        assert.ok(result.links.every(link => link.visible), category + ' shortcut is covered at ' + width + ': ' + JSON.stringify(result));
        assert.equal(await evaluate("document.querySelectorAll('.hr-employee-card-secondary-actions a').length === 12 && document.querySelectorAll('.hr-employee-card-secondary-actions button').length === 12"), true);
        if ([1440, 390].includes(width)) { const shot = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, category + '-employee-tools-' + width + '.png'), Buffer.from(shot.data, 'base64')); }
      }
      for (const destination of destinations) {
        await evaluate(`([...document.querySelectorAll('.employee-team-tool')].find(a => a.pathname === ${JSON.stringify(destination)})).click()`);
        await until(() => evaluate(`location.pathname === ${JSON.stringify(destination)} && Boolean(document.querySelector('h1, #employee-login-directory-title'))`), 'Shortcut did not open ' + destination);
        await send('Page.navigate', { url: origin + '/employee-management/employees' });
        await until(() => evaluate("document.querySelectorAll('.employee-team-tool').length === 8"), 'Directory did not return');
      }
      await evaluate("document.querySelector('.employee-team-tool[href=\"/employee-management/departments\"]').click()");
      await until(() => evaluate("document.querySelector('.hr-groups-grid a[href*=\"__unassigned__\"]') !== null"), 'Unassigned department link did not load');
      await evaluate("document.querySelector('.hr-groups-grid a[href*=\"__unassigned__\"]').click()");
      await until(() => evaluate("document.querySelectorAll('.hr-employee-card').length === 11"), 'Department link did not apply the unassigned filter');
      await send('Page.navigate', { url: origin + '/employee-management/designations' });
      await until(() => evaluate("document.querySelector('.hr-groups-grid a[href*=Technician]') !== null"), 'Designation link did not load');
      await evaluate("document.querySelector('.hr-groups-grid a[href*=Technician]').click()");
      await until(() => evaluate("document.querySelectorAll('.hr-employee-card').length === 1"), 'Designation link did not filter the employee directory');
      await send('Page.navigate', { url: origin + '/employee-management/employees' });
      await until(() => evaluate("document.querySelectorAll('.hr-employee-card').length === 12"), 'Directory did not reset its filters');
      await evaluate("document.querySelector('a[href=\"/employee-management/employees/add\"]').click()");
      await until(() => evaluate("document.querySelector('.employee-add-screen') !== null"), 'Add employee did not open');
      await fillField('input[placeholder="EMP-00129"]', 'EMP-UI-NEW');
      await fillField('input[placeholder="Enter full name"]', 'New UI employee');
      await fillField('input[placeholder="Enter mobile number"]', '9000012345');
      await fillField('input[placeholder="Enter email address"]', 'new-ui@example.test');
      await evaluate("document.querySelector('.employee-add-screen').requestSubmit()");
      await until(() => evaluate("location.pathname === '/employee-management/employees' && [...document.querySelectorAll('.hr-employee-card h2')].some(el => el.textContent === 'New UI employee')"), 'New employee did not return visibly to the list');
      assert.equal(managedEmployees.length, 13);
      await evaluate("[...document.querySelectorAll('.hr-employee-card')].find(card => card.textContent.includes('New UI employee')).querySelector('.hr-employee-card-secondary-actions a').click()");
      await until(() => evaluate("document.querySelector('input[placeholder=\"Enter full name\"]')?.value === 'New UI employee'"), 'Edit did not load the saved employee');
      await fillField('input[placeholder="Enter full name"]', 'Updated UI employee');
      await evaluate("document.querySelector('.employee-add-screen').requestSubmit()");
      await until(() => evaluate("location.pathname === '/employee-management/employees' && [...document.querySelectorAll('.hr-employee-card h2')].some(el => el.textContent === 'Updated UI employee')"), 'Updated employee did not appear');
      assert.equal(managedEmployees.length, 13, 'Edit must not create a duplicate employee');
      const deleteClick = () => evaluate("[...document.querySelectorAll('.hr-employee-card')].find(card => card.textContent.includes('Updated UI employee')).querySelector('.hr-employee-card-secondary-actions button').click()");
      acceptDialogs = false; await deleteClick(); await delay(150); assert.equal(managedEmployees.length, 13);
      acceptDialogs = true; failEmployeeDelete = true; await deleteClick();
      await until(() => evaluate("[...document.querySelectorAll('.app-toast p, .hr-alert, .autop-error')].some(el => el.textContent.includes('Fixture delete unavailable'))"), 'Delete failure did not show an error');
      assert.equal(managedEmployees.length, 13);
      await until(() => evaluate("[...document.querySelectorAll('.hr-employee-card')].find(card => card.textContent.includes('Updated UI employee')).querySelector('.hr-employee-card-secondary-actions button').disabled === false"), 'Delete did not unlock after failure');
      failEmployeeDelete = false; await deleteClick();
      await until(() => evaluate("![...document.querySelectorAll('.hr-employee-card h2')].some(el => el.textContent === 'Updated UI employee')"), 'Deleted employee remained in the directory');
      assert.equal(managedEmployees.length, 12);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, checks: ['eight visible top shortcut cards', 'all shortcut destinations open', 'responsive 320?1440px', 'retail and automobile', 'employee add returns to list', 'edit persists without duplicates', 'delete cancellation', 'delete error and retry', 'confirmed deletion removes card'] })); return;
  }

  if (process.argv.includes('--employee-design-only')) {
    const shot = async (name) => { const result = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64')); };
    const resize = width => send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    const popup = message => evaluate(`window.dispatchEvent(new CustomEvent('gobook:notification', { detail: { message: ${JSON.stringify(message)}, tone: 'success' } }))`);
    const dismissAll = () => evaluate("document.querySelectorAll('.app-toast > button').forEach(button => button.click())");
    const fillField = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until(() => evaluate("document.querySelector('.app-toast-copy strong')?.textContent === 'Fixture business update'"), 'Incoming employee message did not show a popup');
    assert.equal(await evaluate("document.fonts.ready.then(() => document.fonts.check('14px Inter'))"), true);
    await shot('employee-dashboard-with-notification');
    await dismissAll();
    await until(() => evaluate("!document.querySelector('.app-toast')"), 'Notifications did not dismiss');
    if (!process.argv.includes('--skip-toast-timing')) {
    await popup('Thirty second duration check');
    await until(() => evaluate("document.querySelector('.app-toast-copy p')?.textContent === 'Thirty second duration check'"), 'Popup did not open');
    await delay(29000);
    assert.equal(await evaluate("document.querySelector('.app-toast-copy p')?.textContent"), 'Thirty second duration check');
    await until(() => evaluate("!document.querySelector('.app-toast')"), 'Popup did not close after thirty seconds');
    }
    for (const message of ['One', 'Two', 'Three', 'Four']) await popup(message);
    await until(() => evaluate("document.querySelectorAll('.app-toast').length === 3"), 'Popup stack is incorrect');
    assert.equal(await evaluate("document.querySelector('.app-toast-queued')?.textContent"), '1 more notifications');
    await evaluate("document.querySelector('.app-toast > button').click()");
    await until(() => evaluate("[...document.querySelectorAll('.app-toast p')].some(el => el.textContent === 'Four')"), 'Queued popup did not become visible');
    await dismissAll();
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
    await evaluate(`localStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.assign('/employee-management/employees')`);
    await until(() => evaluate("document.querySelectorAll('.hr-employee-card').length === 12"), 'Employee cards did not load');
    for (const width of [1440, 1024, 768, 390, 320]) {
      await resize(width); await delay(200);
      const layout = await evaluate("({ overflow: document.documentElement.scrollWidth > innerWidth, columns: getComputedStyle(document.querySelector('.hr-employee-card-grid')).gridTemplateColumns.split(' ').length, cards: document.querySelectorAll('.hr-employee-card').length, passwords: document.querySelectorAll('.hr-employee-card .hr-employee-password').length })");
      assert.equal(layout.overflow, false, 'Employee directory overflow at ' + width);
      assert.equal(layout.cards, 12); assert.equal(layout.passwords, 12);
      if (width >= 1024) assert.ok(layout.columns > 1, 'Desktop cards must share a row');
      if ([1440, 390].includes(width)) await shot('employee-cards-' + width);
      await evaluate("document.querySelector('.hr-employee-view').focus(); document.querySelector('.hr-employee-view').click()");
      await until(() => evaluate("document.querySelector('.employee-details-modal h1')?.textContent === 'Bala Ganesh'"), 'Details drawer did not load');
      await delay(220);
      const drawer = await evaluate("(() => { const el = document.querySelector('.employee-details-modal'); return { right: el.getBoundingClientRect().right, width: el.clientWidth, scroll: el.scrollWidth, overflowing: [...el.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(node => ({ className: node.className, width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right })) }; })()");
      if (drawer.scroll > drawer.width + 1) await shot('drawer-overflow-' + width);
      assert.ok(Math.abs(drawer.right - width) < 2); assert.ok(drawer.scroll <= drawer.width + 1, 'Drawer overflows at ' + width + ': ' + JSON.stringify(drawer));
      if ([1440, 390].includes(width)) await shot('employee-drawer-' + width);
      await evaluate("document.querySelector('.employee-record-password').click()");
      await until(() => evaluate("document.querySelector('.employee-password-dialog form') !== null"), 'Dedicated drawer password action failed');
      await popup('Password settings are ready');
      await until(() => evaluate("document.querySelector('.employee-password-dialog .app-toast') !== null"), 'Popup is hidden behind the native password dialog');
      await dismissAll();
      if (width === 390) {
        await fillField('.employee-password-dialog input[autocomplete=new-password]', 'NewFixtureOnly@123');
        await fillField('.employee-password-dialog label:nth-child(2) input', 'NewFixtureOnly@123');
        await evaluate("document.querySelector('.employee-password-dialog form').requestSubmit()");
        await until(() => evaluate("document.querySelector('.employee-password-success') !== null"), 'Password did not save');
        assert.equal(passwordUpdates.length, 1);
        await shot('employee-password-and-popup');
        await dismissAll();
      }
      await evaluate("document.querySelector('.employee-password-dialog header button').click()");
      await until(() => evaluate("!document.querySelector('.employee-password-dialog')"), 'Password dialog did not close');
      await evaluate("document.querySelector('.employee-details-close').click()");
      await until(() => evaluate("!document.querySelector('.employee-details-modal')"), 'Details drawer did not close');
      assert.equal(await evaluate("document.activeElement.classList.contains('hr-employee-view')"), true, 'Focus did not return to the card');
    }
    ownerUser.category = 'automobile';
    await evaluate(`localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.reload()`);
    await until(() => evaluate("document.querySelectorAll('.aem-page .hr-employee-card').length === 12"), 'Automobile employees must also render cards');
    await resize(1440); await delay(200); await shot('automobile-employee-cards');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await evaluate("document.querySelector('.hr-employee-password').click()");
    await until(() => evaluate("document.querySelector('.employee-password-dialog form') !== null"), 'Automobile password action failed');
    await evaluate("document.querySelector('.employee-password-dialog header button').click()");
    assert.deepEqual(errors, []);
    const report = { ok: true, viewports: [1440, 1024, 768, 390, 320], toastTimingVerified: !process.argv.includes('--skip-toast-timing'), checks: ['incoming employee popup', 'self-hosted Inter', ...(!process.argv.includes('--skip-toast-timing') ? ['thirty-second visible duration and automatic dismissal'] : []), 'queued notifications', 'twelve cards per page', 'desktop card grid', 'separate password action', 'right drawer', 'mobile layout', 'password save', 'toast above native dialogs', 'focus restoration', 'automobile employee cards'], liveAccountAccess: false };
    await fs.writeFile(path.join(artifacts, 'design-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2)); return;
  }

  const viewports = [];
  for (const width of [1440, 1024, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(150);
    const result = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, fullContentReachable: document.documentElement.scrollHeight + 1 >= document.querySelector('.employee-home').getBoundingClientRect().bottom + scrollY, logo: document.querySelector('.employee-business-logo')?.alt, menu: Boolean(document.querySelector('[aria-label="Menu"]')), navIcons: document.querySelector('nav[aria-label="Employee navigation"]').querySelectorAll('svg').length, actions: [...document.querySelectorAll('.employee-shortcuts a')].map(a => ({ href: a.pathname, width: a.getBoundingClientRect().width })), active: [...document.querySelectorAll('nav .nav-link.active')].map(a => a.textContent) })`);
    assert.ok(result.scrollWidth <= result.width + 1, `Page overflows at ${width}px: ${JSON.stringify(result)}`);
    assert.equal(result.fullContentReachable, true, `Dashboard content is clipped at ${width}px`);
    assert.equal(result.logo, 'Anbu Retail logo');
    assert.equal(result.menu, false);
    assert.equal(result.navIcons, 0);
    assert.deepEqual(result.active, ['Dashboard']);
    assert.ok(result.actions.every((item) => item.href.startsWith(base + '/') && item.width >= 44));
    assert.equal(await evaluate("document.querySelectorAll('.employee-nav-trigger').length"), 6);
    assert.equal(await evaluate("document.querySelectorAll('.employee-subnav:not([hidden])').length"), 1);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.employee-workspace-sidebar')).visibility !== 'hidden'"), width > 900);
    if (width <= 900) await evaluate("document.querySelector('.employee-menu-toggle').click()");
    for (const section of ['My Work', 'Attendance', 'Leave & Permissions', 'Payroll', 'My Account', 'Dashboard']) {
      await evaluate(`([...document.querySelectorAll('.employee-nav-trigger')].find(button => button.textContent === ${JSON.stringify(section)})).click()`);
      assert.equal(await evaluate("document.querySelectorAll('.employee-nav-trigger[aria-expanded=true]').length"), 1);
      assert.equal(await evaluate("document.querySelectorAll('.employee-subnav:not([hidden])').length"), 1);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, `Open submenu overflows at ${width}px`);
      assert.ok(await evaluate("[...document.querySelectorAll('.employee-subnav:not([hidden]) a')].every(link => link.getBoundingClientRect().height >= 42)"));
    }
    await send('Page.bringToFront');
    await evaluate("document.querySelector('.employee-nav-trigger').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await until(() => evaluate("document.querySelectorAll('.employee-subnav:not([hidden])').length === 0"), 'Keyboard did not collapse the submenu');
    await evaluate("document.querySelector('.employee-nav-trigger').click()");
    if (width <= 900) await evaluate("document.querySelector('.employee-menu-toggle').click()");
    if ([1440, 390].includes(width)) {
      const layout = await send('Page.getLayoutMetrics');
      const size = layout.cssContentSize || layout.contentSize;
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
      await fs.writeFile(path.join(artifacts, `employee-dashboard-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    viewports.push({ width, documentWidth: result.scrollWidth });
  }

  await evaluate("document.querySelector('.employee-menu-toggle').click()");
  await evaluate("[...document.querySelectorAll('.employee-nav-trigger')].find(button => button.textContent === 'My Account').click()");
  const menuShot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(artifacts, 'employee-navigation-mobile.png'), Buffer.from(menuShot.data, 'base64'));
  await evaluate("document.querySelector('.employee-subnav:not([hidden]) a').click()");
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'My Profile'"), 'Sidebar link did not navigate to profile');
  assert.equal(await evaluate("document.querySelector('.employee-menu-toggle').getAttribute('aria-expanded')"), 'false');
  assert.equal(await evaluate("document.querySelector('.employee-nav-trigger[aria-expanded=true]').textContent"), 'My Account');

  for (const [screen, title, screenshot] of [
    ['attendance', 'Check In / Check Out', 'employee-attendance'],
    ['attendance/monthly', 'Monthly Attendance'], ['attendance/correction', 'Correction Request'],
    ['leave/apply', 'Apply Leave', 'employee-apply-leave'], ['leave/status', 'Leave Status'], ['leave/history', 'Leave History'],
    ['permissions', 'Permission Requests'], ['payslips', 'Payslips'], ['holidays', 'Holidays'],
    ['documents', 'My Documents'], ['notifications', 'My Notifications', 'employee-notifications'], ['profile', 'My Profile', 'employee-profile'],
  ]) await checkPage(origin, `${base}/${screen}`, title, screenshot);
  if (process.argv.includes('--navigation-only')) {
    assert.deepEqual(errors, []);
    const report = { ok: true, viewports, pageChecks, checks: ['six main menus including My Work', 'one expanded submenu', 'keyboard toggle', 'mobile menu toggle', 'scoped sidebar navigation', 'active section opens automatically', 'mobile menu closes after navigation'], liveAccountAccess: false, artifacts };
    await fs.writeFile(path.join(artifacts, 'navigation-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  assert.equal(await evaluate("document.querySelector('.employee-extended-details').textContent.includes('Fixture Mother') && document.querySelector('.employee-extended-details').textContent.includes('001234567890')"), true);
  assert.equal(await evaluate(`document.querySelector('.page-actions a').pathname`), `${base}/documents`);
  await evaluate("document.querySelector('.page-actions a').click()");
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'My Documents'"), 'Profile link did not open scoped documents');
  assert.equal(await evaluate(`document.querySelector('.page-actions a').pathname`), `${base}/profile`);
  await evaluate("document.querySelector('.employee-notification-bell').click()");
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'My Notifications'"), 'Notification bell did not open the scoped inbox');
  await until(() => evaluate("[...document.querySelectorAll('button')].some(button => button.textContent === 'View message')"), 'Notification message did not load');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'View message').click()");
  await until(() => notificationViewed && evaluate("document.querySelector('.employee-notification-detail')?.textContent.includes('Viewed in app:')"), 'Viewing a notification did not record a read receipt');
  await until(() => evaluate("document.querySelector('.employee-notification-bell')?.getAttribute('aria-label') === 'Notifications, 0 unread'"), 'Unread bell did not refresh after viewing');
  await send('Page.navigate', { url: origin + base + '/attendance' });
  await until(() => evaluate("[...document.querySelectorAll('button')].some(button => button.textContent === 'Start Break')"), 'Break controls did not load');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Start Break').click()");
  await until(() => evaluate("document.querySelector('.attendance-status-head b')?.textContent === 'On Break'"), 'Break start did not update attendance');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'End Break').click()");
  await until(() => evaluate("document.querySelector('.employee-break-list')?.textContent.includes('11:15') && document.querySelector('.attendance-punch-grid')?.textContent.includes('15 min')"), 'Break end or total was not displayed');
  await send('Page.navigate', { url: origin + base });
  await until(() => evaluate("document.querySelector('.employee-attendance-shortcut') !== null"), 'Dashboard did not reload');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.employee-home')).animationName"), 'none');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(`document.querySelector('.employee-attendance-shortcut').click()`);
  await until(() => evaluate("location.pathname.endsWith('/attendance') && document.querySelector('.attendance-status-card') !== null"), 'Attendance action did not navigate');
  await until(() => requests.some((req) => req.path === '/api/employee/attendance/monthly' && req.method === 'GET'), 'Attendance data was not requested');
  await evaluate("document.querySelector('.employee-business-brand').click()");
  await until(() => evaluate("document.querySelector('.employee-home') !== null"), 'Business logo did not return home');
  const setMonth = (month) => evaluate(`(() => { const input = document.querySelector('input[type="month"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${month}'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await setMonth('2026-10');
  await until(() => evaluate("document.querySelector('.employee-period-label')?.textContent === 'October 2026'"), 'Month picker did not update');
  await until(() => requests.some((req) => req.query === '?month=2026-10' && req.method === 'GET'), 'Selected month was not requested');
  failDashboard = true;
  await setMonth('2026-09');
  await until(() => evaluate("document.querySelector('[role=alert]')?.textContent.includes('Dashboard temporarily unavailable')"), 'Dashboard error state did not render');
  failDashboard = false;
  await evaluate("document.querySelector('[role=alert] button').click()");
  await until(() => evaluate("!document.querySelector('[role=alert]') && document.querySelector('.employee-payroll-amount strong') !== null"), 'Dashboard retry did not recover');
  brokenLogo = true;
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelector('.employee-business-monogram')?.textContent === 'AR'"), 'Broken business logo did not fall back to its own initials');
  assert.ok(dashboardReady);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
  brokenLogo = false;
  const loginRequestsStart = requests.length;
  await evaluate("localStorage.clear(); location.assign('/employee-login')");
  await until(() => evaluate("document.querySelector('#employee-login-business') !== null"), 'Shared login form did not render');
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Login overflows at ${width}px`);
    if ([1440, 390].includes(width)) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifacts, `employee-login-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await fill('#employee-login-business', 'Anbu Retail');
  await fill('#employee-login-id', 'EMP-001');
  await fill('#employee-login-password', 'FixtureOnly@123');
  await evaluate("document.querySelector('.employee-login-card form').requestSubmit()");
  await until(() => evaluate("document.querySelector('#employee-login-otp') !== null"), 'Password stage did not open OTP verification');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), null);
  assert.equal(requests.slice(loginRequestsStart).some((req) => ['/api/employee/me', '/api/employee/dashboard'].includes(req.path)), false, 'Dashboard data was requested before OTP verification');
  assert.equal(await evaluate("document.querySelector('.employee-login-resend').disabled"), true);
  await fill('#employee-login-otp', '000000');
  await evaluate("document.querySelector('.employee-login-card form').requestSubmit()");
  await until(() => evaluate("document.querySelector('[role=alert]')?.textContent.includes('Invalid or expired OTP')"), 'Wrong OTP did not render an error');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), null);
  await evaluate("window.__fixtureClock = Date.now; Date.now = () => window.__fixtureClock() + 61000");
  await until(() => evaluate("document.querySelector('.employee-login-resend')?.disabled === false"), 'Resend cooldown did not end');
  await evaluate("document.querySelector('.employee-login-resend').click()");
  await until(() => requests.some((req) => req.path === '/api/employee/auth/resend-otp' && req.method === 'POST'), 'Resend did not request a new challenge');
  await until(() => evaluate("document.querySelector('.employee-login-resend').disabled && !document.querySelector('[role=alert]')"), 'Resend did not rotate the challenge');
  await fill('#employee-login-otp', '123456');
  await evaluate("document.querySelector('.employee-login-card form').requestSubmit()");
  await until(() => evaluate(`location.pathname === '${base}' && document.querySelector('.employee-home') !== null`), 'Verified OTP did not open the employee dashboard');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), token);

  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate(`location.pathname === '${base}' && document.querySelector('.employee-home') !== null`), 'Reload did not restore the employee dashboard');
  await send('Page.navigate', { url: origin + base.replace('EMP-001', 'EMP-002') });
  await until(() => evaluate(`location.pathname === '${base}' && document.querySelector('.employee-home') !== null`), 'A different employee URL must return to the signed-in employee dashboard');
  failEmployeeSession = 'unavailable';
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelector('[role=alert]')?.textContent.includes('Employee session temporarily unavailable')"), 'A temporary profile failure did not offer a retry');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), token, 'A temporary failure must retain the verified session');
  assert.equal(await evaluate('location.pathname'), base);
  failEmployeeSession = '';
  await evaluate("document.querySelector('[role=alert] button').click()");
  await until(() => evaluate("document.querySelector('.employee-home') !== null"), 'Retry did not restore the employee dashboard');
  failEmployeeSession = 'expired';
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("location.pathname === '/employee-login' && document.querySelector('#employee-login-password') !== null"), 'A revoked session did not return to employee login');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), null);
  failEmployeeSession = '';

  await evaluate(`localStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))}); location.assign('/employee-management/settings')`);
  await until(() => evaluate("document.querySelector('#employee-sender-app-password') !== null"), 'Business email setup did not render');
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"Shared employee login URL\"]').value"), origin + '/employee-login');
  await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__sharedEmployeeUrl = value; } } }); document.querySelector('.employee-email-copy button').click()");
  await until(() => evaluate('Boolean(window.__sharedEmployeeUrl)'), 'Shared login URL did not copy');
  assert.equal(await evaluate('window.__sharedEmployeeUrl'), origin + '/employee-login');
  await fill('.employee-email-form input[type=email]', 'owner-fixture@gmail.com');
  await fill('#employee-sender-app-password', 'abcdefghijklmnop');
  await evaluate("document.querySelector('.employee-email-form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.employee-email-status')?.textContent.includes('App password verified')"), 'Business mailbox did not become verified');
  assert.equal(await evaluate("document.querySelector('#employee-sender-app-password').value"), '');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Owner email setup overflows on mobile');

  await evaluate("location.assign('/employee-management/dashboard')");
  await until(() => evaluate("document.querySelector('.employee-dashboard-access summary') !== null"), 'Dashboard employee access section did not render');
  assert.equal(await evaluate("document.querySelector('.employee-dashboard-access').open"), false);
  await evaluate("document.querySelector('.employee-dashboard-access summary').click()");
  await until(() => evaluate("document.querySelector('.employee-directory-table-wrap')?.textContent.includes('EMP-001')"), 'The employee management dashboard did not show employee login URLs');
  assert.equal(await evaluate("document.querySelector('.employee-directory-table-wrap a').href"), origin + '/employee-login/anbu-retail-a1b2c3d4/EMP-001');
  for (const [screen, title, screenshot] of [
    ['dashboard', 'Employee Management Dashboard', 'employee-admin-dashboard'], ['employees', 'Employees', 'employee-directory'],
    ['employees/add', 'Add New Employee'], [`employees/${sampleEmployee._id}`, sampleEmployee.name], [`employees/${sampleEmployee._id}/documents`, 'Employee Documents'],
    ['departments', 'Departments'], ['designations', 'Designations'],
    ['attendance', 'Attendance'], ['attendance/monthly', 'Attendance Register'], ['attendance/corrections', 'Attendance Corrections'], ['attendance/reports', 'Attendance Reports'],
    ['leave', 'Leave Requests'], ['leave/types', 'Leave Types'], ['leave/balance', 'Leave Balance'], ['leave/calendar', 'Leave Calendar'], ['leave/reports', 'Leave Reports'], ['leave/permissions', 'Permission Requests'],
    ['payroll/processing', 'Payroll'], ['payroll/salary', 'Salary Structure'], ['payroll/payslips', 'Payslips'], ['payroll/deductions', 'Deductions'], ['payroll/reports', 'Payroll Reports'],
    ['holidays', 'Holiday List'], ['holidays/add', 'Add Holiday'], ['settings', 'Employee login settings'], ['reports', 'Employee Reports', 'employee-reports'], ['notifications', 'Employee Notifications', 'employee-notification-history'],
  ]) await checkPage(origin, `/employee-management/${screen}`, title, screenshot);
  await checkPage(origin, '/employee-management/employees', 'Employees');
  assert.equal(await evaluate("document.querySelectorAll('.hr-employee-card').length"), 12);
  assert.equal(await evaluate("document.querySelectorAll('.employee-details-modal').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.employee-presence.is-online').length"), 1);
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await evaluate("document.querySelector('.hr-employee-view').click()");
    await until(() => evaluate("document.querySelector('.employee-details-modal[open] h1') !== null"), 'Employee details did not open');
    const drawer = await evaluate("(() => { const el = document.querySelector('.employee-details-modal'); const r = el.getBoundingClientRect(); return { right: r.right, width: r.width, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }; })()");
    assert.ok(Math.abs(drawer.right - width) < 2, `Details are not anchored right at ${width}px`);
    assert.ok(drawer.scrollWidth <= drawer.clientWidth + 1, `Details overflow at ${width}px`);
    if (width < 600) assert.ok(Math.abs(drawer.width - width) < 2);
    if ([1440, 390].includes(width)) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifacts, `employee-details-drawer-${width}.png`), Buffer.from(shot.data, 'base64'));
    }
    await evaluate("document.querySelector('.employee-details-heading button').click()");
    await until(() => evaluate("document.querySelector('.hr-employee-card .hr-menu-cell button') !== null && !document.querySelector('.employee-details-modal')"), 'Employee cards did not return after closing details');
    await evaluate("document.querySelector('.hr-employee-card .hr-menu-cell button').click()");
    await until(() => evaluate("document.querySelector('.hr-row-menu') !== null"), 'Employee actions menu did not open');
    await evaluate("[...document.querySelectorAll('.hr-row-menu button')].find(el => el.textContent === 'Reset password').click()");
    await until(() => evaluate("document.querySelector('.employee-password-dialog form') !== null"), 'Password form did not open');
    assert.equal(await evaluate("document.querySelector('.employee-password-dialog').scrollWidth <= document.querySelector('.employee-password-dialog').clientWidth + 1"), true);
    if (width === 390) {
      await fill('.employee-password-dialog input[autocomplete=new-password]', 'NewFixtureOnly@123');
      await fill('.employee-password-dialog label:nth-child(2) input', 'MismatchFixture@123');
      await evaluate("document.querySelector('.employee-password-dialog form').requestSubmit()");
      await until(() => evaluate("document.querySelector('.employee-password-dialog [role=alert]')?.textContent.includes('do not match')"), 'Password mismatch did not show an error');
      assert.equal(passwordUpdates.length, 0);
      await fill('.employee-password-dialog label:nth-child(2) input', 'NewFixtureOnly@123');
      await evaluate("document.querySelector('.employee-password-dialog form').requestSubmit()");
      await until(() => evaluate("document.querySelector('.employee-password-success') !== null"), 'Password was not saved');
      assert.deepEqual(passwordUpdates[0], { password: 'NewFixtureOnly@123', loginEnabled: true });
      assert.equal(await evaluate("[...document.querySelectorAll('.employee-password-dialog input[type=password]')].every(input => input.value === '')"), true);
    }
    await evaluate("document.querySelector('.employee-password-dialog header button').click()");
  }
  await checkPage(origin, '/employee-management/notifications', 'Employee Notifications');
  await fill('.employee-notifications input', 'Fixture announcement');
  await evaluate("const input = document.querySelector('.employee-notifications textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'Notification send fixture'); input.dispatchEvent(new Event('input', { bubbles: true }));");
  await evaluate("document.querySelector('.employee-notifications form').requestSubmit()");
  await until(() => submittedNotification !== undefined, 'Owner notification form did not submit');
  assert.equal(submittedNotification.allEmployees, true);
  assert.equal(submittedNotification.title, 'Fixture announcement');
  assert.equal(submittedNotification.message, 'Notification send fixture');
  await checkPage(origin, '/employee-management/reports', 'Employee Reports');
  await evaluate("window.__employeeReportDownloads = []; window.__reportOriginalAnchorClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { if (/\\.(pdf|xlsx)$/.test(this.download)) window.__employeeReportDownloads.push(this.download); else window.__reportOriginalAnchorClick.call(this); };");
  await evaluate("document.querySelector('.employee-report-downloads button').click()");
  await until(() => evaluate("window.__employeeReportDownloads.length === 1"), 'PDF download did not create a file');
  await evaluate("document.querySelectorAll('.employee-report-downloads button')[1].click()");
  await until(() => evaluate("window.__employeeReportDownloads.length === 2"), 'Excel download did not create a file');
  assert.ok((await evaluate('window.__employeeReportDownloads')).some((name) => name.endsWith('.xlsx')));
  await checkPage(origin, '/employee-management/employees/add', 'Add New Employee');
  const fillLabel = async (label, value) => {
    await evaluate(`(() => { const field = [...document.querySelectorAll('.hr-field')].find(el => el.firstChild.textContent === ${JSON.stringify(label)}); const input = field.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await delay(30);
  };
  for (const [label, value] of [['Employee ID', 'EMP-099'], ['Full Name', 'Fixture New Employee'], ['Mobile', '9000012345'], ['Email', 'new@example.test']]) await fillLabel(label, value);
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Add Family Member')).click()");
  for (const [label, value] of [['Family Member Name', 'Fixture Parent'], ['Relationship', 'Mother'], ['Family Mobile', '9000012346']]) await fillLabel(label, value);
  await evaluate("[...document.querySelectorAll('.hr-field')].find(el => el.textContent.includes('Use as Emergency Contact')).querySelector('input').click()");
  await evaluate("document.querySelectorAll('.hr-stepper button')[2].click()");
  await until(() => evaluate("document.querySelector('.hr-card h2')?.textContent === 'Payroll Setup'"), 'Payroll form did not open');
  for (const [label, value] of [['Monthly Basic Salary', '25000'], ['PF Deduction', '1234'], ['ESI Deduction', '150'], ['UAN', '001234567890'], ['ESI Number', '001234'], ['Account Number', '0012345678']]) await fillLabel(label, value);
  for (const width of [1440, 768, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Payroll form overflows at ${width}px`);
  }
  await evaluate("document.querySelectorAll('.hr-stepper button')[4].click()");
  await until(() => evaluate("document.querySelector('.hr-review') !== null"), 'Review did not open');
  await evaluate("document.querySelector('.employee-add-screen').requestSubmit()");
  await until(() => submittedEmployee !== undefined, 'Employee form did not submit');
  assert.equal(submittedEmployee.familyMembers[0].name, 'Fixture Parent');
  assert.equal(submittedEmployee.familyMembers[0].isEmergencyContact, true);
  assert.equal(submittedEmployee.statutoryDetails.uan, '001234567890');
  assert.equal(submittedEmployee.salaryStructure.pf, '1234');
  assert.equal(submittedEmployee.salaryStructure.esi, '150');
  assert.equal(submittedEmployee.bankDetails.accountNumber, '0012345678');
  await evaluate("location.assign('/employee-management/login-links')");
  await until(() => evaluate("document.querySelector('.employee-directory-table-wrap')?.textContent.includes('EMP-001')"), 'Employee login directory did not render');
  assert.equal(await evaluate("document.querySelectorAll('.employee-directory-table-wrap tbody tr').length"), 10);
  await evaluate("const size = document.querySelector('[aria-label=\"Employee login links per page\"]'); size.value = 'all'; size.dispatchEvent(new Event('change', { bubbles: true }));");
  await until(() => evaluate("document.querySelectorAll('.employee-directory-table-wrap tbody tr').length === 12"), 'Show all did not include every employee');
  await evaluate("Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__allEmployeeUrls = value; } } });");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Copy all URLs').click()");
  await until(() => evaluate("window.__allEmployeeUrls?.split('\\n').length === 12"), 'Copy all omitted employees beyond the first page');
  assert.ok((await evaluate('window.__allEmployeeUrls')).includes('/EMP-012'));
  await evaluate("window.__csvCreateObjectUrl = URL.createObjectURL; URL.createObjectURL = function(blob) { if (blob.type.includes('text/csv')) blob.text().then(text => { window.__employeeUrlsCsv = text; }); return window.__csvCreateObjectUrl.call(URL, blob); }; window.__csvAnchorClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { if (!this.download.endsWith('.csv')) window.__csvAnchorClick.call(this); };");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Download all URLs').click()");
  await until(() => evaluate("window.__employeeUrlsCsv?.includes('EMP-012')"), 'URL CSV omitted employees beyond the first page');
  const csv = await evaluate('window.__employeeUrlsCsv');
  assert.equal(csv.split(/\r?\n/).length, 13);
  await fs.writeFile(path.join(artifacts, 'employee-login-urls-sample.csv'), csv);
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `Employee login directory overflows at ${width}px`);
  }
  await evaluate("[...document.querySelectorAll('.employee-directory-actions button')].find(button => button.textContent.includes('View QR')).click()");
  await until(() => evaluate("document.querySelector('.employee-identity-code img')?.naturalWidth > 0 && document.querySelector('.employee-identity-photo')?.naturalWidth > 0"), 'Personal QR preview and employee photo did not load');
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"Personal employee login URL\"]').value"), origin + '/employee-login/anbu-retail-a1b2c3d4/EMP-001');
  await evaluate("[...document.querySelectorAll('.employee-qr-display-settings label')].find(label => label.textContent.includes('Phone number')).querySelector('input').click()");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Save QR details').click()");
  await until(() => evaluate("document.querySelector('.employee-access-message')?.textContent.includes('QR display details saved')"), 'QR selections were not saved');
  assert.equal(qrFields.phone, false);
  for (const visible of [false, true]) {
    await evaluate("[...document.querySelectorAll('.employee-qr-display-settings label')].find(label => label.textContent.includes('Employee photo')).querySelector('input').click()");
    if (visible) await delay(200);
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Save QR details').click()");
    await until(() => qrFields.photo === visible && evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Save QR details')?.disabled === true"), 'Photo visibility did not save');
  }
  await until(() => evaluate("document.querySelector('.employee-identity-photo')?.naturalWidth > 0"), 'Re-enabled employee photo did not reload');
  assert.equal(await evaluate("document.querySelector('.employee-identity-card').textContent.includes('9000012345')"), false);
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Download QR card').disabled"), false);
  await evaluate("window.__originalAnchorClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function() { if (this.download && this.href.startsWith('data:image/png')) { window.__employeeQrDownload = { filename: this.download, url: this.href }; } else window.__originalAnchorClick.call(this); }");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Download QR card').click()");
  await until(() => evaluate('Boolean(window.__employeeQrDownload)'), 'The complete employee QR card was not generated');
  const download = await evaluate('window.__employeeQrDownload');
  const pngBytes = Buffer.from(download.url.split(',')[1], 'base64');
  await fs.writeFile(path.join(artifacts, 'employee-personal-qr-card.png'), pngBytes);
  const png = PNG.sync.read(pngBytes);
  const pixels = new Uint8ClampedArray(png.width * png.height);
  for (let index = 0; index < pixels.length; index++) pixels[index] = (png.data[index * 4] + 2 * png.data[index * 4 + 1] + png.data[index * 4 + 2]) / 4;
  const decoded = new ZXing.QRCodeReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(pixels, png.width, png.height))), new Map([[ZXing.DecodeHintType.TRY_HARDER, true]])).getText();
  assert.equal(decoded, origin + '/employee-login/anbu-retail-a1b2c3d4/EMP-001');
  ownerUser.category = 'automobile';
  await evaluate(`localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(ownerUser))})`);
  for (const [screen, title, screenshot] of [
    ['dashboard', 'Employee Dashboard', 'automobile-employee-dashboard'], ['employees', 'Employees', 'automobile-employees'],
    ['attendance', 'Attendance'], ['leave', 'Leave Management'], ['payroll', 'Payroll'],
  ]) await checkPage(origin, `/employee-management/${screen}`, title, screenshot);
  ownerUser.category = 'retail';
  await evaluate('localStorage.removeItem("employee_portal_token"); localStorage.removeItem("employee_portal_user")');
  await send('Page.navigate', { url: origin + new URL(decoded).pathname });
  await until(() => evaluate("document.querySelector('#employee-login-business')?.value === 'Anbu Retail'"), 'The scanned personal link did not prefill the business name');
  assert.equal(await evaluate("document.querySelector('#employee-login-id').value"), 'EMP-001');
  assert.equal(await evaluate("document.querySelector('#employee-login-business').readOnly && document.querySelector('#employee-login-id').readOnly"), true);
  assert.equal(await evaluate('document.activeElement.id'), 'employee-login-password');
  assert.equal(await evaluate("document.querySelector('.employee-identity-card').textContent.includes('9000012345')"), false);
  assert.equal(await evaluate("document.querySelector('.employee-identity-card').textContent.includes('Sales Executive')"), true);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 1100, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'The scanned login page overflows on mobile');
  await until(() => evaluate("document.querySelector('.employee-identity-photo')?.naturalWidth > 0"), 'Scanned login employee photo did not load');
  const personalLayout = await send('Page.getLayoutMetrics');
  const personalSize = personalLayout.cssContentSize || personalLayout.contentSize;
  const personalShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: personalSize.width, height: personalSize.height, scale: 1 } });
  await fs.writeFile(path.join(artifacts, 'employee-personal-login-390.png'), Buffer.from(personalShot.data, 'base64'));
  await fill('#employee-login-password', 'FixtureOnly@123');
  await evaluate("document.querySelector('.employee-login-card form').requestSubmit()");
  await until(() => evaluate("document.querySelector('#employee-login-otp') !== null"), 'Password entry from the scanned QR did not reach email verification');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), null);
  assert.deepEqual(errors, []);
  const fixtureWrites = ['/api/admin/employee-notifications', '/api/employee/notifications/507f1f77bcf86cd799439077/read', '/api/admin/employees', '/api/employee/presence', '/api/employee/attendance/break', '/api/employee/auth/login', '/api/employee/auth/verify-otp', '/api/employee/auth/resend-otp', '/api/admin/employee-email-settings', `/api/admin/employees/${sampleEmployee._id}/qr-display`, `/api/admin/employees/${sampleEmployee._id}/access`];
  assert.ok(requests.every((req) => ['GET', 'OPTIONS'].includes(req.method) || fixtureWrites.includes(req.path)), 'UI checks must only submit fixture authentication or sender setup');
  const report = { ok: true, viewports, pageChecks, checks: ['business logo', 'no hamburger or sidebar icons', 'scoped navigation', 'month selection', 'error retry', 'broken-logo fallback', 'shared login', 'no session before OTP', 'wrong OTP rejection', 'OTP resend cooldown', 'verified OTP navigation', 'owner mailbox setup', 'employee dashboard URL directory', 'show all employees', 'copy all URL pages', 'download complete URL CSV', 'saved QR display choices', 'full card QR decode', 'scan prefills username and ID', 'scan focuses password', 'scan profile hides deselected phone', 'QR password still requires email OTP'], sample: { username: 'owner@example.test', employeeId: 'EMP-001', personalUrl: decoded, fixtureOnly: true }, liveAccountAccess: false, artifacts };
  report.checks.push('private family and statutory profile details', 'break start/end and total display', 'responsive PF/ESI and bank inputs', 'full employee form submits family, PF/ESI and bank values');
  report.checks.push('five main menus with dropdown submenus', 'only one submenu opens at a time', 'keyboard accordion toggle', 'mobile menu closes after scoped navigation', 'current page section opens automatically', 'employee dashboard survives reload', 'another employee URL returns to own dashboard', 'temporary session lookup failure retries without logout', 'revoked employee session returns to login');
  report.checks.push('notification bell opens own inbox', 'read receipts and unread badge refresh', 'owner notification submission', 'PDF and Excel download controls');
  report.checks.push('employee card grid', 'details open on demand in a right drawer', 'full-width details on mobile', 'online indicator uses portal presence', 'password menu and responsive dialog', 'password mismatch rejected', 'password reset submits and clears fields');
  report.cancelledInterceptions = cancelledInterceptions;
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, screens: pageChecks.length / 4, layoutChecks: pageChecks.length, viewports: viewports.map(item => item.width), interactionChecks: report.checks.length, liveAccountAccess: false, artifacts }, null, 2));
}

try {
  await runChecks();
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, requests: requests.slice(-15), page: socket?.readyState === WebSocket.OPEN ? await evaluate('document.body.innerText.slice(0, 800)').catch(() => '') : '' }, null, 2));
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close'); } catch {}
    socket.close();
  }
  browser?.kill();
  await new Promise((resolve) => app?.httpServer ? app.httpServer.close(resolve) : resolve());
  // Delete only the unique temporary profile created by this script.
  const absoluteProfile = path.resolve(profileRoot);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(absoluteProfile) !== tempRoot || !path.basename(absoluteProfile).startsWith('gobook-employee-ui-')) throw new Error('Refusing to remove an unexpected browser profile path');
  await fs.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
