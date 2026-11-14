// Browser checks use intercepted fixtures only. No live account is accessed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';

const artifacts = path.resolve('../backend/runtime/navigation-badges-preview');
const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gobook-work-ui-'));
const ownerId = '507f1f77bcf86cd799439011';
const employees = [1, 2, 3].map((number) => ({ _id: `507f1f77bcf86cd79943902${number}`, employeeId: `EMP-00${number}`, name: ['Bala Ganesh', 'Priya Kumar', 'Arun Raj'][number - 1], dept: 'Operations', status: 'Active' }));
const owner = { id: ownerId, name: 'Business Owner', email: 'owner@example.test', businessName: 'Anbu Retail', role: 'Super Admin', accountType: 'owner', category: 'retail', status: 'Active', onboardingCompleted: true, emailVerified: true, needsEmailVerification: false, subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', paymentMethodVerified: true, subscriptionExpiresAt: '2099-01-01T00:00:00Z' };
const token = `header.${Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
let badgeOverride = null;
let failRead = false;
const rows = [1, 2, 3].map(number => ({ _id: '507f1f77bcf86cd79943908' + number, title: 'Employee update ' + number, message: 'Fixture notification', employeeName: employees[0].name, employeeId: employees[0].employeeId, kind: 'announcement', emailStatus: 'Accepted', ownerReadAt: null, readAt: null, createdAt: '2026-11-14T04:00:00Z' }));
const unread = () => rows.filter(row => !row.ownerReadAt).length;
let emailConfigured = true;

let app, browser, socket, origin, serial = 0;
const pending = new Map(), errors = [], checks = [], mutations = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) { const end = Date.now() + 20000; while (Date.now() < end) { if (await check()) return; await delay(100); } throw new Error(message); }
function send(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
    pending.set(id, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
async function intercept(event) {
  const url = new URL(event.request.url);
  if (url.origin === origin) return send('Fetch.continueRequest', { requestId: event.requestId });
  if (url.origin !== 'https://api.gobooksuite.com') return send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' });
  const method = event.request.method;
  let body = { data: [] }, code = 200;
  if (method === 'OPTIONS') code = 204;
  else if (url.pathname === '/api/auth/security-config') body = { enabled: false };
  else if (url.pathname === '/api/admin/employee-navigation-counts') body = { unread: badgeOverride ?? unread() };
  else if (url.pathname === '/api/more-modules/email-settings') body = { configured: emailConfigured, canManage: true };
  else if (['/api/hr-payroll/employees', '/api/admin/employees'].includes(url.pathname)) body = { data: employees, total: employees.length, page: 1, limit: 12 };
  else if (url.pathname === '/api/admin/employee-notifications/read-all' && method === 'PUT') {
    if (failRead) { code = 500; body = { message: 'Fixture read failure' }; }
    else { rows.forEach(row => { row.ownerReadAt ||= new Date().toISOString(); }); body = { message: 'All marked as read.' }; }
  } else if (/^\/api\/admin\/employee-notifications\/[^/]+\/read$/.test(url.pathname) && method === 'PUT') {
    const row = rows.find(row => row._id === url.pathname.split('/').at(-2));
    if (failRead) { code = 500; body = { message: 'Fixture read failure' }; }
    else { row.ownerReadAt ||= new Date().toISOString(); body = row; }
  } else if (url.pathname === '/api/admin/employee-notifications') body = { data: rows, total: rows.length, ownerUnread: unread(), unread: rows.length, page: 1, limit: 50 };
  else if (url.pathname === '/api/auth/me') body = owner;
  else if (url.pathname === '/api/settings') body = { businessName: owner.businessName };
  else if (url.pathname === '/api/admin/employee-work') body = { data: [], total: 0, page: 1, limit: 12, summary: { total: 0, assigned: 0, inProgress: 0, completed: 0, overdue: 0 } };
  await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type,x-device-id,x-human-verification' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
}
async function resize(width) { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await delay(230); }
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64')); }

try {
  await fs.mkdir(artifacts, { recursive: true });
  app = await preview({ ...(process.env.EMPLOYEE_UI_DIST ? { build: { outDir: path.resolve(process.env.EMPLOYEE_UI_DIST) } } : {}), preview: { host: '127.0.0.1', port: 0, open: false } });
  origin = `http://127.0.0.1:${app.httpServer.address().port}`;
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileRoot}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(async () => { try { await fs.access(path.join(profileRoot, 'DevToolsActivePort')); return true; } catch { return false; } }, 'Chrome did not start');
  const port = (await fs.readFile(path.join(profileRoot, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => { const event = JSON.parse(data); if (event.id) { const task = pending.get(event.id); pending.delete(event.id); if (event.error) task?.reject(new Error(event.error.message)); else task?.resolve(event.result); } else if (event.method === 'Fetch.requestPaused') intercept(event.params).catch((error) => { if (error.message !== 'Invalid InterceptionId.') errors.push(error.message); }); else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });


  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(owner))}); localStorage.setItem('gobook.token', ${JSON.stringify(token)});` });
  await send('Page.navigate', { url: origin + '/employee-management/employees' });
  const badgeCount = () => evaluate("document.querySelector('#app-navigation .navigation-count-badge')?.textContent || ''");
  await until(async () => await badgeCount() === '3', 'Main unread badge did not load');
  const openMenu = async () => {
    if (await evaluate("document.querySelector('[aria-label=\"Open menu\"]') !== null")) await evaluate("document.querySelector('[aria-label=\"Open menu\"]').click()");
    await delay(250);
  };
  for (const width of [1440, 768, 390, 320]) {
    await resize(width);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Page overflow at ' + width);
    await evaluate("document.querySelector('.employee-team-tools').open = true");
    assert.equal(await evaluate("document.querySelectorAll('.employee-team-tools .navigation-count-badge').length"), 0);
    await evaluate("document.querySelector('.employee-team-tools').open = false");
    await openMenu();
    assert.equal(await evaluate("document.querySelectorAll('#app-navigation .navigation-count-badge').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('#app-navigation a .navigation-count-badge').length"), 0);
    const main = await evaluate("(() => { const badge = [...document.querySelectorAll('#app-navigation button')].find(el => el.textContent.includes('Employee Management')).querySelector('.navigation-count-badge'); return { count: badge.textContent, height: badge.getBoundingClientRect().height, color: getComputedStyle(badge).backgroundColor }; })()");
    assert.deepEqual(main, { count: '3', height: 17, color: 'rgb(220, 38, 38)' });
    if ([1440, 390].includes(width)) await shot('main-only-sidebar-' + width);
    await evaluate("document.querySelector('[data-navigation-overlay]')?.click()");
    checks.push({ width, mainBadgeOnly: true, noSubmenuBadges: true, noOverflow: true });
  }
  await evaluate("document.querySelector('.employee-team-tools').open = true; document.querySelector('.employee-team-tools a[href=\"/employee-management/notifications\"]').click()");
  await until(() => evaluate("document.querySelectorAll('.employee-notification-list article').length === 3"), 'Notification history did not load');
  await evaluate("document.querySelector('.employee-notification-list article button').click()");
  await until(async () => await badgeCount() === '2', 'Viewing message did not reduce main count');
  assert.equal(rows[0].readAt, null);
  await send('Page.reload', { ignoreCache: true });
  await until(async () => await badgeCount() === '2', 'Read status was lost on reload');
  await until(() => evaluate("document.querySelectorAll('.employee-notification-list article').length === 3"), 'History did not reload');
  await evaluate("document.querySelector('.employee-notification-list article button').click()");
  await delay(300); assert.equal(await badgeCount(), '2');
  await evaluate("[...document.querySelectorAll('button')].find(el => el.textContent === 'Mark all as read').click()");
  await until(async () => await badgeCount() === '', 'Mark all did not remove badge');
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelectorAll('.employee-notification-list article').length === 3"), 'History did not load after mark all');
  assert.equal(await badgeCount(), '');
  rows.unshift({ ...rows[0], _id: '507f1f77bcf86cd799439099', title: 'New notification', ownerReadAt: null });
  await evaluate("window.dispatchEvent(new Event('focus')); [...document.querySelectorAll('button')].find(el => el.textContent === 'Refresh').click()");
  await until(async () => await badgeCount() === '1', 'New unread notification did not restore badge');
  await until(() => evaluate("document.querySelectorAll('.employee-notification-list article').length === 4"), 'New notification did not load');
  failRead = true;
  await evaluate("document.querySelector('.employee-notification-list article button').click()");
  await until(() => evaluate("document.querySelector('[role=alert]')?.textContent.includes('Fixture read failure')"), 'Read failure was hidden');
  assert.equal(await badgeCount(), '1');
  failRead = false;
  await evaluate("document.querySelector('.employee-notification-list article button').click()");
  await until(async () => await badgeCount() === '', 'Final read did not clear badge');
  badgeOverride = 120;
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await until(async () => await badgeCount() === '99+', 'Large unread count cap failed');
  assert.equal(await evaluate("document.querySelector('#app-navigation .navigation-count-badge').getAttribute('aria-label')"), '120 unread employee notifications');
  await send('Page.navigate', { url: origin + '/employee-management/work' });
  await until(() => evaluate("document.querySelector('.work-tabs') !== null"), 'Work page did not load');
  await until(async () => await badgeCount() === '99+', 'Main badge missing on another route');
  assert.equal(await evaluate("document.querySelectorAll('#app-navigation a .navigation-count-badge').length"), 0);
  assert.deepEqual(errors, []);
  const report = { ok: true, viewports: checks, mainOnly: true, readDecrements: true, readAllHides: true, readSurvivesReload: true, readFailurePreservesCount: true, employeeReceiptUnchanged: true, newNotificationRestoresBadge: true, liveAccountAccess: false };
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, page: socket?.readyState === WebSocket.OPEN ? await evaluate('document.body.innerText.slice(0, 1200)').catch(() => '') : '' }, null, 2)); throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  browser?.kill(); await new Promise((resolve) => app?.httpServer ? app.httpServer.close(resolve) : resolve());
  const absoluteProfile = path.resolve(profileRoot), tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(absoluteProfile) !== tempRoot || !path.basename(absoluteProfile).startsWith('gobook-work-ui-')) throw new Error('Unexpected temporary browser profile path');
  await fs.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
