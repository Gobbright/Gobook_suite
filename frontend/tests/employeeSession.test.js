import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const token = (identity, expired = false) => {
  const now = Math.floor(Date.now() / 1000);
  return `header.${Buffer.from(JSON.stringify({ sub: identity, iat: now - 60, exp: expired ? now - 1 : now + 3600 })).toString('base64url')}.fixture`;
};

test('late employee and business authentication errors cannot clear a newer employee login', async () => {
  const original = Object.fromEntries(['fetch', 'localStorage', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map();
  const events = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: event => events.push(event.type) } });
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { request, api } = await server.ssrLoadModule('/src/features/employee-management/services/api.js');
    const oldToken = token('old-employee');
    const newToken = token('new-employee');
    values.set('employee_portal_token', oldToken);
    values.set('employee_portal_user', 'old employee');
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${oldToken}`);
      values.set('employee_portal_token', newToken);
      values.set('employee_portal_user', 'new employee');
      return new Response(JSON.stringify({ message: 'Expired old session' }), { status: 401 });
    };
    await assert.rejects(request('/employee/me'), /Expired old session/);
    assert.equal(values.get('employee_portal_token'), newToken);
    assert.equal(values.get('employee_portal_user'), 'new employee');
    assert.equal(events.length, 0);

    values.set('gobook.token', token('business-owner'));
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Business session expired' }), { status: 401 });
    await assert.rejects(request('/admin/employees'), /Business session expired/);
    assert.equal(values.get('employee_portal_token'), newToken);
    assert.equal(events.length, 0);

    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Employee session expired' }), { status: 401 });
    await assert.rejects(request('/employee/me'), /Employee session expired/);
    assert.equal(values.has('employee_portal_token'), false);
    assert.equal(values.has('employee_portal_user'), false);
    assert.deepEqual(events, ['employee:session-expired']);

    values.set('employee_portal_token', token('expired-employee', true));
    values.set('employee_portal_user', 'expired employee');
    await assert.rejects(api.get('/employee/dashboard'), /Employee session expired/);
    assert.equal(values.has('employee_portal_token'), false);
    assert.equal(values.has('employee_portal_user'), false);
    assert.equal(events.length, 2);
  } finally {
    await server.close();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
