// Browser checks use intercepted fixtures only. No live account is accessed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';

const artifacts = path.resolve('../backend/runtime/employee-work-preview');
const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gobook-work-ui-'));
const base = '/employee/anbu-retail-a1b2c3d4/EMP-001';
const ownerId = '507f1f77bcf86cd799439011';
const employees = [1, 2, 3].map((number) => ({ _id: `507f1f77bcf86cd79943902${number}`, employeeId: `EMP-00${number}`, name: ['Bala Ganesh', 'Priya Kumar', 'Arun Raj'][number - 1], dept: 'Operations', status: 'Active' }));
const user = { id: 'employee-preview', name: employees[0].name, employeeId: 'EMP-001', employeeObjectId: employees[0]._id, businessName: 'Anbu Retail', businessLogoUrl: '/api/files/logos/work-preview', role: 'employee', ownerUserId: ownerId, portalBasePath: base };
const owner = { id: ownerId, name: 'Business Owner', email: 'owner@example.test', businessName: 'Anbu Retail', role: 'Super Admin', accountType: 'owner', category: 'retail', status: 'Active', onboardingCompleted: true, emailVerified: true, needsEmailVerification: false, subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', paymentMethodVerified: true, subscriptionExpiresAt: '2099-01-01T00:00:00Z' };
const token = `header.${Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
let tasks = [
  { _id: '507f1f77bcf86cd799439081', employeeObjectId: employees[0]._id, employeeName: employees[0].name, employeeId: 'EMP-001', title: 'Prepare weekly stock report', description: 'Review the stock counts and share the completed report.', dueDate: '2026-11-20', priority: 'High', status: 'Assigned', note: '', __v: 0, createdAt: '2026-11-14T04:00:00Z', assignedBy: 'Business Owner' },
  { _id: '507f1f77bcf86cd799439082', employeeObjectId: employees[0]._id, employeeName: employees[0].name, employeeId: 'EMP-001', title: 'Review customer requests', description: 'Follow up on the open requests.', dueDate: '', priority: 'Normal', status: 'In Progress', note: 'Two requests remaining.', __v: 0, createdAt: '2026-11-14T03:00:00Z', assignedBy: 'Business Owner' },
];
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
  if (url.pathname === '/api/files/logos/work-preview') return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }], body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" rx="8" fill="#315bd5"/><text x="60" y="32" text-anchor="middle" fill="white" font-size="24">AR</text></svg>').toString('base64') });
  const input = event.request.postData ? JSON.parse(event.request.postData) : {};
  let body = { data: [] }, code = 200;
  if (method === 'OPTIONS') code = 204;
  else if (url.pathname === '/api/auth/security-config') body = { enabled: false };
  else if (url.pathname === '/api/auth/me') body = owner;
  else if (url.pathname === '/api/employee/me') body = { user };
  else if (url.pathname === '/api/settings') body = { businessName: owner.businessName };
  else if (url.pathname === '/api/employee/presence') body = { online: true };
  else if (url.pathname === '/api/employee/notifications/count') body = { unread: 0 };
  else if (url.pathname === '/api/employee/dashboard') body = { presentDays: 12, pendingLeaves: 1, pendingPermissions: 0, documents: 3, recentAttendance: [], salary: { net: 28500, status: 'Paid' } };
  else if (url.pathname === '/api/admin/employees') body = { data: employees };
  else if (url.pathname === '/api/admin/employee-work' && method === 'POST') {
    mutations.push(input);
    const recipients = input.allEmployees ? employees : employees.filter((employee) => input.employeeIds.includes(employee._id));
    for (const employee of recipients) tasks.push({ ...input, _id: `fixture-work-${tasks.length}`, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name, status: 'Assigned', note: '', createdAt: new Date().toISOString(), assignedBy: 'Business Owner', __v: 0 });
    body = { count: recipients.length, message: `Work assigned to ${recipients.length} employees.` }; code = 201;
  } else if (/\/(employee\/work|admin\/employee-work)\/[^/]+$/.test(url.pathname) && method === 'PUT') {
    const task = tasks.find((row) => row._id === url.pathname.split('/').at(-1));
    assert.equal(task.__v, input.version);
    Object.assign(task, input, { __v: task.__v + 1, completedAt: input.status === 'Completed' ? new Date().toISOString() : null }); body = task;
  } else if (['/api/employee/work', '/api/admin/employee-work'].includes(url.pathname)) {
    let rows = tasks.filter((task) => url.pathname.startsWith('/api/admin') || task.employeeObjectId === user.employeeObjectId);
    if (url.searchParams.get('employee')) rows = rows.filter((task) => task.employeeObjectId === url.searchParams.get('employee'));
    if (url.searchParams.get('q')) rows = rows.filter((task) => task.title.toLowerCase().includes(url.searchParams.get('q').toLowerCase()));
    const summary = { total: rows.length, assigned: rows.filter((task) => task.status === 'Assigned').length, inProgress: rows.filter((task) => task.status === 'In Progress').length, completed: rows.filter((task) => task.status === 'Completed').length, overdue: 0 };
    if (url.searchParams.get('status')) rows = rows.filter((task) => task.status === url.searchParams.get('status'));
    const page = Number(url.searchParams.get('page')) || 1;
    body = { data: rows.slice((page - 1) * 12, page * 12), total: rows.length, page, limit: 12, summary };
  }
  await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: code, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type,x-device-id,x-human-verification' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
}
async function resize(width) { await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); await delay(230); }
async function shot(name) { const result = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64')); }
async function layout(name, width) {
  const result = await evaluate("({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, contentRight: document.querySelector('.employee-workspace .main')?.getBoundingClientRect().right || 0 })");
  assert.ok(result.documentWidth <= width + 1 && result.contentRight <= width + 1, `${name} overflows at ${width}px: ${JSON.stringify(result)}`); checks.push({ name, ...result });
}
const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
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
  const bootstrap = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('employee_portal_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('employee_portal_token', ${JSON.stringify(token)});` });
  await send('Page.navigate', { url: origin + base });
  await until(() => evaluate("document.querySelector('.employee-work-preview') !== null"), 'Dashboard work overview did not load');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await resize(width); await layout('dashboard', width);
    assert.equal(await evaluate("document.querySelector('.employee-business-name')?.textContent"), user.businessName);
    assert.ok(await evaluate("(() => { const logo = document.querySelector('.employee-business-logo'); return logo?.complete && logo.naturalWidth > 0; })()"), 'Business logo did not load');
    assert.ok(await evaluate("(() => { const brand = document.querySelector('.employee-business-brand').getBoundingClientRect(); const next = document.querySelector('.employee-notification-bell').getBoundingClientRect(); const name = document.querySelector('.employee-business-name').getBoundingClientRect(); const logo = document.querySelector('.employee-business-logo').getBoundingClientRect(); return brand.left >= 0 && brand.right <= next.left && name.width > 0 && name.height > 0 && logo.left >= brand.left - 1 && logo.right <= name.left && name.right <= brand.right + 1; })()"), 'Business name or logo overlaps header controls at ' + width);
    await evaluate('window.scrollTo(0, 500)'); await delay(100);
    assert.ok(await evaluate("Math.abs(document.querySelector('.employee-workspace-topbar').getBoundingClientRect().top) < 1"), 'Header is not fixed');
    if (width > 900) {
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.employee-workspace-sidebar')).position"), 'fixed');
      assert.ok(await evaluate("document.querySelector('.main').getBoundingClientRect().left >= document.querySelector('.employee-workspace-sidebar').getBoundingClientRect().right - 1"), 'Sidebar covers main content');
    } else {
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.employee-workspace-sidebar')).visibility"), 'hidden');
      await evaluate("document.querySelector('.employee-topbar-menu').click()"); await delay(250);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.employee-workspace-sidebar')).visibility"), 'visible');
      assert.equal(await evaluate("document.querySelector('.employee-workspace-sidebar').contains(document.activeElement)"), true);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await delay(250);
      assert.equal(await evaluate("document.querySelector('.employee-topbar-menu').getAttribute('aria-expanded')"), 'false');
    }
    await evaluate('window.scrollTo(0, 0)');
    if ([1440, 390].includes(width)) await shot('dashboard-' + width);
  }
  user.businessName = 'Anbu Retail Sales and Service Private Limited';
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelector('.employee-business-name')?.textContent === 'Anbu Retail Sales and Service Private Limited' && document.querySelector('.employee-work-preview') !== null"), 'Saved business name did not refresh');
  await resize(320); await layout('long-business-name', 320);
  assert.ok(await evaluate("(() => { const brand = document.querySelector('.employee-business-brand').getBoundingClientRect(); const name = document.querySelector('.employee-business-name').getBoundingClientRect(); const logo = document.querySelector('.employee-business-logo').getBoundingClientRect(); return logo.left >= brand.left - 1 && logo.right <= name.left && name.right <= brand.right + 1 && name.height <= 34; })()"), 'Long business name breaks mobile branding');
  await shot('business-branding-320');
  await evaluate("document.querySelector('.employee-business-logo').dispatchEvent(new Event('error'))");
  await until(() => evaluate("document.querySelector('.employee-business-monogram')?.textContent === 'AR'"), 'Missing logo did not fall back to business initials');
  assert.equal(await evaluate("document.querySelector('.employee-business-name').textContent"), user.businessName);
  user.businessName = 'Anbu Retail';
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelector('.employee-work-preview') !== null"), 'Dashboard did not recover after logo fallback check');
  await evaluate("document.querySelector('.employee-work-overview > a').click()");
  await until(() => evaluate("document.querySelectorAll('.work-task-card').length === 2"), 'Employee assigned work did not load');
  for (const width of [1440, 768, 390, 320]) {
    await resize(width); await layout('my-work', width);
    await evaluate("document.querySelector('.work-task-card footer button').click()"); await until(() => evaluate("document.querySelector('.work-dialog[open]') !== null"), 'Work details did not open');
    assert.equal(await evaluate("document.querySelector('.work-dialog').scrollWidth <= document.querySelector('.work-dialog').clientWidth + 1"), true);
    await evaluate("document.querySelector('.work-dialog header button').click()");
    if ([1440, 390].includes(width)) await shot('my-work-' + width);
  }
  await evaluate("document.querySelector('.employee-topbar-menu').click()"); await delay(250);
  await evaluate("[...document.querySelectorAll('.employee-subnav a')].find(link => link.textContent === 'Completed Work').click()");
  await until(() => evaluate("document.querySelector('.work-empty') !== null && location.search.includes('Completed')"), 'Completed work sidebar filter did not navigate');
  assert.equal(await evaluate("document.querySelector('.employee-topbar-menu').getAttribute('aria-expanded')"), 'false');
  assert.equal(await evaluate("document.querySelectorAll('.employee-subnav a[aria-current=page]').length"), 1);
  await evaluate("document.querySelector('.work-tabs button').click()"); await until(() => evaluate("document.querySelectorAll('.work-task-card').length === 2"), 'All work filter failed');
  await evaluate("document.querySelector('.work-task-card footer button').click()");
  await until(() => evaluate("document.querySelector('.work-dialog select') !== null"), 'Progress form missing');
  await evaluate("const select = document.querySelector('.work-dialog select'); select.value = 'Completed'; select.dispatchEvent(new Event('change', { bubbles: true }));");
  await fill('.work-dialog textarea', 'Stock report completed and checked.');
  await evaluate("document.querySelector('.work-dialog form').requestSubmit()");
  await until(() => evaluate("!document.querySelector('.work-dialog') && document.querySelector('.work-notice')?.textContent.includes('completed')"), 'Employee completion did not save');
  assert.equal(tasks[0].status, 'Completed'); assert.equal(tasks[0].note, 'Stock report completed and checked.');
  await send('Page.reload', { ignoreCache: true });
  await until(() => evaluate("document.querySelector('.work-task-card.is-completed') !== null"), 'Completion did not survive reload');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap.identifier });
  await evaluate(`localStorage.clear(); localStorage.setItem('gobook.token', ${JSON.stringify(token)}); localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(owner))}); location.assign('/employee-management/work')`);
  await until(() => evaluate("document.querySelector('.work-heading h1')?.textContent === 'Work Management' && document.querySelectorAll('.work-task-card').length === 2"), 'Owner work management did not load');
  for (const width of [1440, 768, 390, 320]) {
    await resize(width); await layout('work-management', width);
    await evaluate("document.querySelector('.work-heading-actions .is-primary').click()"); await until(() => evaluate("document.querySelector('.work-recipients') !== null"), 'Assignment form did not open');
    assert.equal(await evaluate("document.querySelector('.work-dialog').scrollWidth <= document.querySelector('.work-dialog').clientWidth + 1"), true);
    await evaluate("document.querySelector('.work-dialog header button').click()");
    if ([1440, 390].includes(width)) await shot('work-management-' + width);
  }
  await evaluate("document.querySelector('.work-heading-actions .is-primary').click()");
  await until(() => evaluate("document.querySelector('.work-dialog input') !== null"), 'Assignment form missing');
  await fill('.work-dialog .work-field input', 'Prepare tomorrow’s dispatch list');
  await fill('.work-dialog textarea', 'Review confirmed orders and prepare the dispatch list.');
  await evaluate("document.querySelector('.work-all-employees input').click()");
  await evaluate("document.querySelector('.work-dialog form').requestSubmit()");
  await until(() => mutations.length === 1 && evaluate("!document.querySelector('.work-dialog')"), 'Assignment did not submit');
  assert.equal(mutations[0].allEmployees, true); assert.equal(tasks.length, 5);
  await evaluate("[...document.querySelectorAll('.work-tabs button')].find(button => button.textContent === 'Completed').click()");
  await until(() => evaluate("document.querySelectorAll('.work-task-card').length === 1 && document.querySelector('.work-task-note')?.textContent.includes('Stock report completed')"), 'Owner did not receive employee completion');
  assert.deepEqual(errors, []);
  const report = { ok: true, layoutChecks: checks, employeeCompletion: true, ownerAssignment: true, fixedSidebar: true, mobileDrawer: true, liveAccountAccess: false };
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, layoutChecks: checks.length, viewports: [1440, 1024, 768, 390, 320], artifacts, liveAccountAccess: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, errors, page: socket?.readyState === WebSocket.OPEN ? await evaluate('document.body.innerText.slice(0, 1200)').catch(() => '') : '' }, null, 2)); throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  browser?.kill(); await new Promise((resolve) => app?.httpServer ? app.httpServer.close(resolve) : resolve());
  const absoluteProfile = path.resolve(profileRoot), tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(absoluteProfile) !== tempRoot || !path.basename(absoluteProfile).startsWith('gobook-work-ui-')) throw new Error('Unexpected temporary browser profile path');
  await fs.rm(absoluteProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
