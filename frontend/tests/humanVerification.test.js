import assert from 'node:assert/strict';
import test, { before, after, afterEach, mock } from 'node:test';
import { createServer } from 'vite';

let server;
let apiClient;
let humanVerificationHeaders;
const originalGlobals = new Map();

function setGlobal(name, value) {
  if (!originalGlobals.has(name)) originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

before(async () => {
  server = await createServer({ logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false, hmr: false }, appType: 'custom' });
  ({ apiClient } = await server.ssrLoadModule('/src/services/apiClient.js'));
  ({ humanVerificationHeaders } = await server.ssrLoadModule('/src/services/humanVerification.js'));
});
after(async () => { await server?.close(); });
afterEach(() => {
  mock.restoreAll();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  originalGlobals.clear();
});

function browser() {
  setGlobal('localStorage', { getItem: () => null, setItem() {} });
  setGlobal('window', { crypto: { randomUUID: () => 'test-device' } });
}

function challenge(result) {
  setGlobal('document', {
    activeElement: null,
    body: { appendChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, append() {}, addEventListener() {}, showModal() {}, close() {}, remove() {} }),
  });
  window.turnstile = {
    render(_widget, options) {
      assert.equal(options.sitekey, 'site-key');
      assert.equal(options.action, 'login');
      queueMicrotask(() => result(options));
      return 'widget-id';
    },
    remove(id) { assert.equal(id, 'widget-id'); },
  };
}

for (const status of [401, 404]) {
  for (const path of ['/auth/login', '/auth/register', '/auth/google', '/auth/email-otp/start', '/auth/forgot-password']) {
    test(`${path} reaches the auth endpoint when an older API returns ${status} for security config`, async () => {
      browser();
      const payload = { email: 'person@example.test' };
      const request = mock.method(globalThis, 'fetch', async (url, options) => {
        if (url.endsWith('/auth/security-config')) {
          assert.equal(options.cache, 'no-store');
          return Response.json({ message: 'Authentication required' }, { status });
        }
        assert.ok(url.endsWith(path));
        assert.equal(options.method, 'POST');
        assert.equal(options.body, JSON.stringify(payload));
        return Response.json({ accepted: true });
      });
      assert.deepEqual(await apiClient(path, { method: 'POST', body: JSON.stringify(payload) }), { accepted: true });
      assert.equal(request.mock.callCount(), 2);
    });
  }
}

test('the actual login endpoint still rejects invalid credentials after legacy discovery', async () => {
  browser();
  mock.method(globalThis, 'fetch', async (url) => Response.json({ message: url.endsWith('/auth/security-config') ? 'Authentication required' : 'Invalid credentials' }, { status: 401 }));
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: '{}' }), /Invalid credentials/);
});

test('configuration outages, denials and rate limits never submit the login request', async () => {
  browser();
  for (const status of [403, 429, 500, 502, 503]) {
    const request = mock.method(globalThis, 'fetch', async () => Response.json({}, { status }));
    await assert.rejects(apiClient('/auth/login', { method: 'POST', body: '{}' }), /Unable to check sign-in security/);
    assert.equal(request.mock.callCount(), 1);
    request.mock.restore();
  }
  const request = mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network unavailable'); });
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: '{}' }), /Network unavailable/);
  assert.equal(request.mock.callCount(), 1);
});

test('only an explicit disabled config skips verification on a supported API', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ enabled: false, siteKey: '' }));
  assert.deepEqual(await humanVerificationHeaders('/auth/login', 'POST'), {});
  mock.restoreAll();
  for (const config of [{}, null, { enabled: 'false' }, { enabled: true }, { enabled: true, siteKey: ' ' }]) {
    const request = mock.method(globalThis, 'fetch', async () => Response.json(config));
    await assert.rejects(humanVerificationHeaders('/auth/login', 'POST'), /not configured/);
    request.mock.restore();
  }
});

test('a supported API sends the completed human challenge to the login endpoint', async () => {
  browser();
  challenge((options) => options.callback('verified-token'));
  const request = mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/security-config')) return Response.json({ enabled: true, siteKey: 'site-key' });
    assert.equal(options.headers['X-Human-Verification'], 'verified-token');
    return Response.json({ accepted: true });
  });
  assert.deepEqual(await apiClient('/auth/login', { method: 'POST', body: '{}' }), { accepted: true });
  assert.equal(request.mock.callCount(), 2);
});

test('a failed human challenge never submits the login request', async () => {
  browser();
  challenge((options) => options['error-callback']());
  const request = mock.method(globalThis, 'fetch', async () => Response.json({ enabled: true, siteKey: 'site-key' }));
  await assert.rejects(apiClient('/auth/login', { method: 'POST', body: '{}' }), /Human verification failed/);
  assert.equal(request.mock.callCount(), 1);
});

test('unprotected requests do not fetch security configuration', async () => {
  const request = mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  assert.deepEqual(await humanVerificationHeaders('/auth/login', 'GET'), {});
  assert.deepEqual(await humanVerificationHeaders('/dashboard', 'POST'), {});
  assert.equal(request.mock.callCount(), 0);
});
