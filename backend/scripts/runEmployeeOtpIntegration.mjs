// Creates an isolated, temporary MongoDB process; never connects to the app DB.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const runtime = path.resolve('runtime');
await fs.mkdir(runtime, { recursive: true });
const directory = await fs.mkdtemp(path.join(runtime, 'gobook-otp-mongo-'));
const binary = process.env.MONGOD_PATH || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const reservation = net.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const mongo = spawn(binary, ['--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', directory, '--logpath', path.join(directory, 'mongo.log')], { windowsHide: true, stdio: 'ignore' });
let stopped = false;
mongo.on('exit', () => { stopped = true; });
let spawnError;
mongo.on('error', (error) => { spawnError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (stopped) throw new Error('The isolated MongoDB process stopped before it was ready.');
    ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => { socket.destroy(); resolve(false); });
    });
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('The isolated MongoDB process did not become ready.');
  const tests = spawn(process.execPath, ['scripts/runTests.js', ...(process.argv.length > 2 ? process.argv.slice(2) : ['tests/businessEmailPersistence.integration.test.js', 'tests/employeeLoginOtp.integration.test.js', 'tests/employeePortalAccess.integration.test.js', 'tests/employeeDetails.integration.test.js', 'tests/employeeMessaging.integration.test.js'])], { windowsHide: true, stdio: 'inherit', env: { ...process.env, SECURITY_TEST_MONGODB_URI: `mongodb://127.0.0.1:${port}` } });
  const [status] = await once(tests, 'exit');
  process.exitCode = status ?? 1;
} finally {
  if (!stopped) { mongo.kill(); await once(mongo, 'exit'); }
  // Resolve and verify this exact temporary target before recursive cleanup.
  const target = path.resolve(directory);
  assert.equal(path.dirname(target), runtime);
  assert.ok(path.basename(target).startsWith('gobook-otp-mongo-'));
  await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
