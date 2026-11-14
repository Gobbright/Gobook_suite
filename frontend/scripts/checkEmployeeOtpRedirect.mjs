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
let notificationViewed = false;
let submittedNotification;
const fixtureNotification = () => ({ _id: '507f1f77bcf86cd799439077', employeeId: sampleEmployee.employeeId, employeeName: sampleEmployee.name, recipientEmail: sampleEmployee.email, senderEmail: 'owner-fixture@gmail.com', title: 'Fixture business update', message: 'Please review your saved employee update.', emailStatus: 'Accepted', kind: 'announcement', readAt: notificationViewed ? '2026-11-13T04:00:00Z' : null, createdAt: '2026-11-13T03:00:00Z' });
function qrAccess() {
  const identity = { name: sampleEmployee.name, employeeId: sampleEmployee.employeeId, role: sampleEmployee.designation, phone: sampleEmployee.phone, address: sampleEmployee.address, email: sampleEmployee.email, photoUrl: '/api/employee/auth/link-photo?businessSlug=anbu-retail-a1b2c3d4&employeeId=EMP-001' };
  const qrProfile = Object.fromEntries(Object.entries(identity).filter(([key]) => qrFields[key === 'photoUrl' ? 'photo' : key]));
  return { businessName: 'Anbu Retail', businessUsername: 'owner@example.test', ownerUserId: ownerUser.id, employeeId: 'EMP-001', loginPath: '/employee-login/anbu-retail-a1b2c3d4/EMP-001', businessSlug: 'anbu-retail-a1b2c3d4', loginEnabled: true, passwordConfigured: true, emailOtpReady: true, emailVerified: true, qrDisplayFields: qrFields, qrProfile, identity };
}
function directoryEmployees() {
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
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
        await evaluate("document.querySelector('.hr-table tbody tr').scrollIntoView({ block: 'center' })");
        await delay(100);
        assert.equal(await evaluate("(() => { const name = document.querySelector('.hr-employee-cell strong'); const rect = name.getBoundingClientRect(); return Boolean(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.hr-employee-cell')); })()"), true, 'Employee name is covered by the mobile selection checkbox');
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
  if (event.request.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 204, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type,x-device-id,x-human-verification' }] });
  let responseCode = 200;
  let contentType = 'application/json';
  let body = {};
  const input = event.request.postData ? JSON.parse(event.request.postData) : {};
  if (url.pathname === '/api/auth/security-config') body = { enabled: false };
  else if (url.pathname === '/api/employee/presence') body = { online: true };
  else if (url.pathname === '/api/employee/notifications/count') body = { unread: notificationViewed ? 0 : 1 };
  else if (url.pathname.endsWith('/507f1f77bcf86cd799439077/read')) { notificationViewed = true; body = fixtureNotification(); }
  else if (url.pathname === '/api/admin/employee-notifications' && event.request.method === 'POST') { submittedNotification = input; responseCode = 202; body = { count: 12, message: 'Saved 12 employee notifications. Email delivery is queued.' }; }
  else if (['/api/employee/notifications', '/api/admin/employee-notifications'].includes(url.pathname)) body = { data: [fixtureNotification()], total: 1, unread: notificationViewed ? 0 : 1, page: 1, limit: 50 };
  else if (/\/employee-reports\/all\/(pdf|xlsx)$/.test(url.pathname)) { contentType = url.pathname.endsWith('/pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; body = url.pathname.endsWith('/pdf') ? '%PDF-fixture-only' : 'PK-fixture-only'; }
  else if (url.pathname === '/api/admin/employees/presence') body = { data: directoryEmployees().map((employee, index) => ({ employeeObjectId: employee._id, online: index === 0 })) };
  else if (url.pathname === '/api/admin/employees' && event.request.method === 'POST') { submittedEmployee = input; responseCode = 201; body = { ...input, _id: '507f1f77bcf86cd799439099' }; }
  else if (url.pathname === '/api/admin/employees' || url.pathname === '/api/hr-payroll/employees') body = { data: directoryEmployees(), total: 12, page: 1 };
  else if (url.pathname === `/api/admin/employees/${sampleEmployee._id}/access`) body = qrAccess();
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
  return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode, responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
}

try {
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
    } else if (event.method === 'Fetch.requestPaused') intercept(event.params, origin).catch((error) => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });

  await send('Page.navigate', { url: origin + '/employee-login' });
  await until(() => evaluate("Boolean(document.querySelector('#employee-login-business'))"), 'Login missing');
  const fill = (selector,value) => evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await fill('#employee-login-business','Anbu Retail'); await fill('#employee-login-id','EMP-001'); await fill('#employee-login-password','FixtureOnly@123');
  await evaluate("document.querySelector('form').requestSubmit()");
  await until(() => evaluate("Boolean(document.querySelector('#employee-login-otp'))"),'OTP missing');
  await fill('#employee-login-otp','000000'); await evaluate("document.querySelector('form').requestSubmit()");
  await until(() => evaluate("Boolean(document.querySelector('[role=alert]'))"), 'Wrong OTP did not show an error');
  assert.equal(await evaluate("localStorage.getItem('employee_portal_token')"), null);
  assert.equal(await evaluate('location.pathname'), '/employee-login');
  await fill('#employee-login-otp','123456'); await evaluate("document.querySelector('form').requestSubmit()");
  try { await until(() => evaluate("Boolean(document.querySelector('.employee-home'))"),'Dashboard missing after verified OTP'); } catch(error) { console.log(await evaluate('({path:location.pathname,text:document.body.innerText})')); throw error; }
  console.log('PASS: OTP opens employee dashboard');
  await send('Page.reload'); await until(() => evaluate("Boolean(document.querySelector('.employee-home'))"),'Dashboard reload failed');
  console.log('PASS: verified session survives reload');
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
