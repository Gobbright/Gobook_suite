import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('business and employee actions share popups while reads and presence stay quiet', async () => {
  const original = Object.fromEntries(['fetch', 'localStorage', 'window'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, removeItem() {}, setItem() {} } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: (event) => events.push(event) } });
  let fail = false;
  globalThis.fetch = async () => new Response(JSON.stringify(fail ? { message: 'Please check the employee name.' } : { data: [], message: 'Employee saved.' }), { status: fail ? 400 : 200 });
  const server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  try {
    const { api: business } = await server.ssrLoadModule('/src/services/api.js');
    const { api: employee } = await server.ssrLoadModule('/src/features/employee-management/services/api.js');
    const notices = () => events.filter((event) => event.type === 'gobook:notification').map((event) => event.detail);
    await business.hrListEmployees();
    await employee.post('/employee/presence', { visible: true });
    assert.equal(notices().length, 0);
    await business.hrUpdateEmployee('fixture', { name: 'Employee' });
    await employee.put('/employee/leave', { reason: 'Personal' });
    assert.deepEqual(notices().map((item) => item.tone), ['success', 'success']);
    fail = true;
    await assert.rejects(business.hrUpdateEmployee('fixture', {}), /check the employee name/);
    await assert.rejects(employee.put('/employee/leave', {}), /check the employee name/);
    assert.deepEqual(notices().slice(-2).map((item) => item.tone), ['error', 'error']);
    const { notify } = await server.ssrLoadModule('/src/services/notifications.js');
    notify({ message: 'Open your inbox.', href: 'javascript:alert(1)' });
    assert.equal(notices().at(-1).href, undefined);
  } finally {
    await server.close();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
