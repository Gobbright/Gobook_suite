// Read account backups through the existing live admin API. Credentials and
// the temporary admin token stay in memory and are never printed or saved.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { BSON } from 'mongodb';

const backend = fileURLToPath(new URL('../', import.meta.url));
const config = dotenv.parse(await fs.readFile(path.join(backend, '.env')));
const base = 'https://api.gobooksuite.com/api';
const directory = path.join(backend, 'runtime', 'live-account-backups');
let token;

async function request(route, options = {}) {
  return fetch(base + route, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  });
}

try {
  for (const suffix of ['', '_2']) {
    const adminId = config[`ADMIN_LOGIN_ID${suffix}`];
    const password = config[`ADMIN_LOGIN_PASSWORD${suffix}`];
    if (!adminId || !password) continue;
    const response = await request('/admin/login', { method: 'POST', body: JSON.stringify({ adminId, password }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.token) { token = data.token; break; }
    console.log(`Configured admin account${suffix || ' 1'}: HTTP ${response.status}`);
    if (![401, 403].includes(response.status)) throw new Error('Live admin login is unavailable or requires interactive verification');
  }
  assert.ok(token, 'The configured admin credentials were not accepted by the live API');
  console.log('Live admin authentication succeeded.');
  const response = await request('/admin/section/users');
  assert.ok(response.ok, `Live account list returned HTTP ${response.status}`);
  const users = await response.json();
  assert.ok(Array.isArray(users.rows), 'Unexpected live account list format');
  assert.equal(users.rows.length, users.count, 'The live account list is incomplete; use a database backup instead');
  await fs.mkdir(directory, { recursive: true });
  const manifest = { source: base, downloadedAt: new Date().toISOString(), accountCount: users.count, backups: [] };
  const coveredUsers = new Set();
  for (const user of users.rows) {
    const id = String(user.id || user._id || '');
    assert.match(id, /^[a-f0-9]{24}$/i, 'Unexpected account ID');
    if (coveredUsers.has(id)) continue;
    const backupResponse = await request(`/admin/storage/user-backups/${id}`);
    assert.ok(backupResponse.ok, `Live backup export returned HTTP ${backupResponse.status}`);
    const content = await backupResponse.text();
    const backup = BSON.EJSON.parse(content, { relaxed: false });
    assert.equal(backup.format, 'gobook-user-mongodb-backup');
    assert.ok(Array.isArray(backup.collections));
    const accounts = backup.collections.find((item) => item.name === 'appusers')?.documents || [];
    assert.ok(accounts.length, 'Account backup contains no users');
    for (const account of accounts) coveredUsers.add(String(account._id));
    const filename = `${id}.json`;
    await fs.writeFile(path.join(directory, filename), content);
    manifest.backups.push({ filename, users: accounts.length, documents: backup.documentCount });
    console.log(`Downloaded backup ${manifest.backups.length}: ${accounts.length} accounts, ${backup.documentCount} documents.`);
  }
  assert.equal(coveredUsers.size, users.count, 'Some live accounts were not included in the backups');
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Live backups verified: ${coveredUsers.size} accounts. Saved in backend/runtime/live-account-backups.`);
} catch (error) {
  console.error(error instanceof assert.AssertionError || error.name === 'Error' ? error.message : 'Live API request failed; check connectivity and access.');
  process.exitCode = 1;
} finally {
  if (token) await request('/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
}
