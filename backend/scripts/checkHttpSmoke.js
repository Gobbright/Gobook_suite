import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Exercise the production entry point with deliberately unreachable test MongoDB.
// No live database or provider is contacted, and no account is created.
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const database = 'mongodb://127.0.0.1:1/gobook_http_smoke';
const child = spawn(process.execPath, ['scripts/startProduction.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'development', PORT: String(port), DNS_SERVERS: '',
    FRONTEND_URL: 'https://www.gobooksuite.com', CLIENT_URL: 'https://www.gobooksuite.com',
    ALLOWED_ORIGINS: 'https://www.gobooksuite.com,https://gobooksuite.com',
    MONGO_URI: database, MONGODB_URI: database, MONGODB_DB_NAME: 'gobook_http_smoke',
    MONGODB_ALLOW_LOOPBACK: 'true', REQUIRE_EXISTING_DATABASE: 'true',
    JWT_SECRET: 'http-smoke-test-only-32-character-value-do-not-deploy',
    ADMIN_LOGIN_ID: 'smoke', ADMIN_LOGIN_PASSWORD: 'http-smoke-only-password',
    ADMIN_LOGIN_ID_2: '', ADMIN_LOGIN_PASSWORD_2: '',
    GOOGLE_CLIENT_ID: '123456-smoke.apps.googleusercontent.com',
    PAYMENT_REQUIRED: 'false', ONLINE_STORE_ENABLED: 'false',
    META_APP_ID: '', META_APP_SECRET: '', META_LOGIN_CONFIG_ID: '', META_GRAPH_API_VERSION: '', META_TOKEN_ENCRYPTION_KEY: '',
    META_PUBLIC_ORIGIN: '', SMTP_HOST: 'smtp.invalid', SMTP_PORT: '587',
    SMTP_USER: 'smoke', SMTP_PASS: 'smoke', SMTP_FROM: 'smoke@example.com',
  },
});
let output = '';
let spawnError;
child.on('error', (error) => { spawnError = error; });
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output = (output + chunk).slice(-8000); });
const base = `http://127.0.0.1:${port}`;
const request = (route, options = {}) => fetch(base + route, { ...options, signal: AbortSignal.timeout(1500) });

try {
  let live;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Production process exited before startup: ${output}`);
    try { live = await request('/health/live'); break; } catch { await delay(100); }
  }
  assert.equal(live?.status, 200, 'Production HTTP server must become live');
  const ready = await request('/health/ready');
  assert.equal(ready.status, 503, 'Unreachable database must never report readiness');
  assert.equal((await ready.json()).environment, 'production', 'Production entry must override development mode');
  assert.equal((await request('/api/auth/me')).status, 401);
  const preflight = await request('/api/auth/google', {
    method: 'OPTIONS', headers: { Origin: 'https://www.gobooksuite.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-device-id' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.gobooksuite.com');
  assert.equal((await request('/api/auth/me', { headers: { Origin: 'http://localhost:5173' } })).status, 403);
  assert.equal((await request('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  console.log('Production HTTP smoke passed: liveness, database readiness gate, authentication, Google route, and CORS.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
}
