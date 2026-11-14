// Browser QA uses fixtures exclusively; no request reaches a live account.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gobook-email-ui-'));
const artifacts = path.resolve(process.env.EMAIL_UI_ARTIFACTS || '../backend/runtime/business-email-preview');
const now = Math.floor(Date.now() / 1000);
const token = `header.${Buffer.from(JSON.stringify({ iat: now, exp: now + 3600 })).toString('base64url')}.fixture`;
const owner = { id: '507f1f77bcf86cd799439011', name: 'Business Owner', email: 'owner@example.test', businessName: 'Anbu Retail', role: 'Super Admin', accountType: 'owner', category: 'retail', status: 'Active', onboardingCompleted: true, emailVerified: true, needsEmailVerification: false, subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', paymentMethodVerified: true, subscriptionExpiresAt: '2099-01-01T00:00:00Z' };
let app, browser, socket, serial = 0, configured = false, rejectVerification = false;
let savedEmail = 'business@gmail.com', savedPassword = '';
let expectedEmail = 'business@gmail.com', expectedPassword = 'abcdefghijklmnop';
let statusMode = 'normal';
const heldStatusReads = [];
const pending = new Map();
const errors = [];
const requests = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await check()) return; await delay(100); }
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
async function typePassword(text) {
  await evaluate("document.querySelector('#business-sender-password').scrollIntoView({ block: 'center' })");
  const point = await evaluate("(() => { const input = document.querySelector('#business-sender-password'); const rect = input.getBoundingClientRect(); return { x: rect.left + 24, y: rect.top + rect.height / 2, disabled: input.disabled, readOnly: input.readOnly }; })()");
  assert.equal(point.disabled, false, 'Password field must accept typing');
  assert.equal(point.readOnly, false);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  assert.equal(await evaluate("document.activeElement.id"), 'business-sender-password', 'Click must focus the password field');
  assert.equal(await evaluate("document.activeElement.value"), '');
  for (const character of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: character, text: character, unmodifiedText: character });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: character });
  }
  assert.equal(await evaluate("document.querySelector('#business-sender-password').value"), text, 'Actual keyboard input must update the password');
}
async function intercept(event, origin) {
  const url = new URL(event.request.url);
  if (url.origin === origin) return send('Fetch.continueRequest', { requestId: event.requestId });
  if (url.origin !== 'https://api.gobooksuite.com') return send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Aborted' });
  requests.push({ method: event.request.method, path: url.pathname });
  let responseCode = 200, body = { data: [] };
  if (url.pathname === '/api/auth/me') body = owner;
  else if (url.pathname === '/api/auth/security-config') body = { enabled: false };
  else if (url.pathname === '/api/more-modules/email-settings') {
    const mode = statusMode;
    if (event.request.method === 'GET' && mode === 'loading') await new Promise(resolve => heldStatusReads.push(resolve));
    if (event.request.method === 'GET' && mode === 'error') { responseCode = 503; body = { message: 'Fixture email status unavailable' }; }
    if (event.request.method === 'PUT') {
      const input = JSON.parse(event.request.postData);
      assert.equal(input.email, expectedEmail);
      assert.equal(input.appPassword, expectedPassword);
      if (rejectVerification) { responseCode = 400; body = { message: 'Could not verify the Google app password. Check that it belongs to the selected Gmail address.' }; }
      else { configured = true; savedEmail = input.email; savedPassword = input.appPassword; }
    }
    if (responseCode === 200) body = { configured, ...(event.request.method === 'PUT' || mode === 'missing-permission' ? {} : { canManage: mode !== 'denied' }), email: savedEmail, verifiedAt: configured ? '2026-11-13T00:00:00Z' : null };
  } else if (url.pathname === '/api/settings') body = { businessName: 'Anbu Retail', emailSmtpHost: 'smtp.gmail.com', emailSmtpUser: 'business@gmail.com' };
  else if (url.pathname === '/api/more-modules/email-campaigns') body = { campaigns: [], stats: { totalSent: 0, totalOpened: 0, totalClicked: 0, totalBounced: 0 } };
  else if (url.pathname.startsWith('/api/hr-payroll/employees')) body = { data: [], total: 0 };
  return send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: event.request.method === 'OPTIONS' ? 204 : responseCode, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' }, { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type,x-device-id,x-human-verification' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
}
try {
  await fs.mkdir(artifacts, { recursive: true });
  app = await preview({ ...(process.env.EMAIL_UI_DIST ? { build: { outDir: path.resolve(process.env.EMAIL_UI_DIST) } } : {}), preview: { host: '127.0.0.1', port: 0, open: false } });
  console.log('Starting browser email verification checks.');
  const origin = `http://127.0.0.1:${app.httpServer.address().port}`;
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', (error) => errors.push(error.message));
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(async () => { try { await fs.access(portFile); return true; } catch { return false; } }, 'Chrome did not start');
  const port = (await fs.readFile(portFile, 'utf8')).split('\n')[0];
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) { const task = pending.get(event.id); pending.delete(event.id); if (event.error) task?.reject(new Error(event.error.message)); else task?.resolve(event.result); }
    else if (event.method === 'Fetch.requestPaused') intercept(event.params, origin).catch((error) => errors.push(error.message));
    else if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text);
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('gobook.user', ${JSON.stringify(JSON.stringify(owner))}); localStorage.setItem('gobook.token', ${JSON.stringify(token)});` });
  for (const mode of ['loading', 'missing-permission', 'error']) {
    statusMode = mode;
    await send('Page.navigate', { url: origin + '/email-setup' });
    await until(() => evaluate("Boolean(document.querySelector('#business-sender-password'))"), `Password field did not render during ${mode}`);
    if (mode === 'error') await until(() => evaluate("document.querySelector('[role=alert]')?.textContent.includes('Fixture email status unavailable')"), 'Status error did not render');
    await typePassword('abcdefghijklmnop');
    if (mode === 'loading') {
      await until(() => heldStatusReads.length > 0, 'Status lookup was not held');
      configured = true;
      heldStatusReads.splice(0).forEach(resolve => resolve());
      await until(() => evaluate("Boolean(document.querySelector('.business-email-status.is-ready'))"), 'Late saved status did not finish loading');
      assert.equal(await evaluate("document.querySelector('#business-sender-password')?.value"), 'abcdefghijklmnop', 'A late status response must not close or erase the active form');
      configured = false;
    }
  }
  statusMode = 'denied';
  await send('Page.navigate', { url: origin + '/email-setup' });
  await until(() => evaluate("document.querySelector('.business-email-setup')?.textContent.includes('Ask your business administrator')"), 'An explicit access denial must remain enforced');
  assert.equal(await evaluate("document.querySelector('#business-sender-password')"), null);
  statusMode = 'normal';
  await send('Page.navigate', { url: origin + '/employee-management/employees' });
  await until(() => evaluate("Boolean(document.querySelector('.business-email-notice'))"), 'Unverified user reminder is missing');
  await send('Page.reload');
  await until(() => evaluate("Boolean(document.querySelector('.business-email-notice'))"), 'Reminder did not persist after reload');
  for (const route of ['/employee-management/employees/add', '/email-marketing']) {
    await send('Page.navigate', { url: origin + route });
    await until(() => evaluate("Boolean(document.querySelector('.business-email-gate h1'))"), `Unverified screen opened: ${route}`);
  }
  assert.equal(requests.some((request) => request.path === '/api/more-modules/email-campaigns'), false, 'Locked marketing screen fetched campaigns');
  await evaluate("document.querySelector('.business-email-gate a').click()");
  await until(() => evaluate("Boolean(document.querySelector('#business-sender-password'))"), 'Setup page did not open');
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, `Email setup overflows at ${width}px`);
    assert.equal(await evaluate("!document.querySelector('#business-sender-email').disabled && !document.querySelector('#business-sender-password').disabled"), true, 'Owner email/password inputs must be available');
    if (width !== 320) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(artifacts, `email-setup-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await evaluate("(() => { const input = document.querySelector('#business-sender-password'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'abcdefghijkl'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  const beforeInvalid = requests.filter(request => request.path === '/api/more-modules/email-settings' && request.method === 'PUT').length;
  await evaluate("document.querySelector('.business-email-setup form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.business-email-error')?.textContent.includes('16-character')"), 'Short app password did not show validation');
  assert.equal(requests.filter(request => request.path === '/api/more-modules/email-settings' && request.method === 'PUT').length, beforeInvalid, 'Invalid password should not reach the server');
  await evaluate("document.querySelector('.employee-password-input button').click()");
  assert.equal(await evaluate("document.querySelector('#business-sender-password').type"), 'text');
  await evaluate("document.querySelector('.employee-password-input button').click()");
  assert.equal(await evaluate("document.querySelector('#business-sender-password').type"), 'password');
  await evaluate("(() => { const input = document.querySelector('#business-sender-password'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'abcd efgh ijkl mnop'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  rejectVerification = true;
  await evaluate("document.querySelector('.business-email-setup form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.business-email-error')?.textContent.includes('Could not verify')"), 'Failed verification did not show an error');
  assert.equal(await evaluate("Boolean(document.querySelector('.business-email-status.is-ready'))"), false);
  rejectVerification = false;
  await evaluate("document.querySelector('.business-email-setup form').requestSubmit()");
  await until(() => evaluate("Boolean(document.querySelector('.business-email-status.is-ready'))"), 'Successful verification did not unlock the business');
  assert.equal(await evaluate("document.querySelector('#business-sender-password')"), null);
  assert.ok(await evaluate("document.querySelector('.business-email-success').textContent.includes('business@gmail.com')"));
  assert.equal(savedPassword, 'abcdefghijklmnop');
  await send('Page.reload');
  await until(() => evaluate("Boolean(document.querySelector('.business-email-saved'))"), 'Saved email did not remain verified after reload');
  assert.equal(await evaluate("document.querySelector('.business-email-saved').textContent.includes('business@gmail.com')"), true);
  assert.equal(await evaluate("document.querySelector('#business-sender-password')"), null);
  const fill = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await evaluate("document.querySelector('.business-email-change').click()");
  assert.equal(await evaluate("document.querySelector('#business-sender-password').value"), '');
  await typePassword('ponmlkjihgfedcba');
  await evaluate("document.querySelector('.business-email-cancel').click()");
  await evaluate("document.querySelector('.business-email-change').click()");
  const beforeTyping = requests.filter(request => request.path === '/api/more-modules/email-settings' && request.method === 'PUT').length;
  await fill('#business-sender-email', 'unsaved@gmail.com');
  await fill('#business-sender-password', 'ponm lkji hgfe dcba');
  assert.equal(requests.filter(request => request.path === '/api/more-modules/email-settings' && request.method === 'PUT').length, beforeTyping, 'Typing must not submit or store credentials');
  await evaluate("document.querySelector('.business-email-cancel').click()");
  assert.equal(savedEmail, 'business@gmail.com');
  assert.equal(savedPassword, 'abcdefghijklmnop');
  assert.equal(await evaluate("document.querySelector('#business-sender-password')"), null);
  await evaluate("document.querySelector('.business-email-change').click()");
  assert.equal(await evaluate("document.querySelector('#business-sender-email').value"), 'business@gmail.com');
  assert.equal(await evaluate("document.querySelector('#business-sender-password').value"), '');
  assert.equal(await evaluate("document.querySelector('#business-sender-password').type"), 'password');
  expectedEmail = 'replacement@gmail.com'; expectedPassword = 'ponmlkjihgfedcba';
  await fill('#business-sender-email', expectedEmail);
  await fill('#business-sender-password', 'ponm lkji hgfe dcba');
  rejectVerification = true;
  await evaluate("document.querySelector('.business-email-setup form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.business-email-error')?.textContent.includes('Could not verify')"), 'A failed change must show its error');
  assert.equal(savedEmail, 'business@gmail.com');
  assert.equal(savedPassword, 'abcdefghijklmnop');
  assert.equal(await evaluate("document.querySelector('.business-email-status').textContent.includes('business@gmail.com')"), true);
  rejectVerification = false;
  await evaluate("document.querySelector('.business-email-setup form').requestSubmit()");
  await until(() => evaluate("document.querySelector('.business-email-saved')?.textContent.includes('replacement@gmail.com')"), 'Verified replacement was not saved');
  assert.equal(savedPassword, expectedPassword);
  assert.equal(await evaluate("document.querySelector('#business-sender-password')"), null);
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('.business-email-saved')?.textContent.includes('replacement@gmail.com')"), 'Replacement did not persist after reload');
  const savedShot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(artifacts, 'email-setup-saved-320.png'), Buffer.from(savedShot.data, 'base64'));
  await evaluate("[...document.querySelectorAll('.business-email-setup a')].find(a => a.textContent === 'Continue').click()");
  await until(() => evaluate("location.pathname === '/email-marketing' && !document.querySelector('.business-email-gate')"), 'Verified user could not return to Email Marketing');
  assert.equal(await evaluate("Boolean(document.querySelector('.business-email-notice'))"), false);
  await send('Page.navigate', { url: origin + '/employee-management/employees/add' });
  await until(() => evaluate("document.querySelector('h1')?.textContent === 'Add New Employee'"), 'Verified user could not open Add Employee');
  await send('Page.navigate', { url: origin + '/email-marketing' });
  await until(() => evaluate("Boolean(!document.querySelector('.business-email-gate') && location.pathname === '/email-marketing' && document.querySelector('h1'))"), 'Verified marketing screen did not reopen');
  configured = false;
  await evaluate("window.dispatchEvent(new Event('gobook:business-email-changed'))");
  await until(() => evaluate("Boolean(document.querySelector('.business-email-gate h1'))"), 'Invalidating email settings did not lock marketing again');
  assert.deepEqual(errors, []);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(artifacts, 'verification-required-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  await send('Page.navigate', { url: origin + '/business-settings' });
  await until(() => evaluate("[...document.querySelectorAll('button')].some(button => button.textContent === 'Send Reminders Now')"), 'Normal business settings were locked');
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Send Reminders Now').click()");
  await until(() => evaluate("Boolean(location.pathname === '/email-setup' && document.querySelector('#business-sender-password'))"), 'Unverified email action did not open verification');
  assert.equal(requests.some((request) => request.path === '/api/settings/test-email'), false, 'Unverified reminder action attempted delivery');
  console.log('PASS: typed input, explicit submit, failed/successful verification, saved status after reload, Change and Cancel, failed change preserves the saved connection, verified replacement, access gates and desktop/mobile layout. All API calls used fixtures.');
} catch (error) {
  console.error(error);
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} }
  socket?.close(); browser?.kill();
  await new Promise((resolve) => app?.httpServer ? app.httpServer.close(resolve) : resolve());
  // The unique browser profile stays in the OS temp directory until the OS cleans it.
}
