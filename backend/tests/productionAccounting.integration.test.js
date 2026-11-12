import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { AppUser } from '../src/models/AppUser.js';
import { AppSession } from '../src/models/AppSession.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { AccountingVoucher } from '../src/models/AccountingVoucher.js';
import { LedgerAccount } from '../src/models/LedgerAccount.js';
import { VoucherSequence } from '../src/models/VoucherSequence.js';

test('production HTTP accounting preserves authentication, atomic posting, tenant scope and Trial Balance', { skip: !process.env.PRODUCTION_TEST_MONGODB_URI, timeout: 120000 }, async () => {
  const dbName = `gobook_production_test_${randomUUID().replaceAll('-', '')}`;
  const secret = `production-test-only-${randomUUID()}`;
  const sessionId = randomUUID();
  let child, output = '';
  await mongoose.connect(process.env.PRODUCTION_TEST_MONGODB_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all([AppUser.init(), AppSession.init(), BusinessSettings.init(), AccountingVoucher.init(), LedgerAccount.init(), VoucherSequence.init()]);
    const businessId = new mongoose.Types.ObjectId();
    const owner = await AppUser.create({ businessId, name: 'Production Test Owner', email: 'production-owner@example.test', accountType: 'owner', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), onboardingCompleted: true });
    async function createTestSession(user, sid) {
      await AppSession.create({ userId: user._id, sessionIdHash: createHash('sha256').update(sid).digest('hex'), credentialHash: createHash('sha256').update('').digest('hex'), deviceType: 'desktop', expiresAt: new Date(Date.now() + 86400000) });
    }
    await createTestSession(owner, sessionId);
    await BusinessSettings.create({ userId: owner._id, fyStart: '01 April' });
    await LedgerAccount.insertMany([{ name: 'Expense', group: 'Indirect Expenses' }, { name: 'Bank', group: 'Bank Accounts' }].map((account) => ({ ...account, userId: owner._id, businessId })));
    const reservation = net.createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    child = spawn(process.execPath, ['scripts/startProduction.js'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, NODE_ENV: 'production', PORT: String(port), DNS_SERVERS: '',
        FRONTEND_URL: 'https://app.example.test', CLIENT_URL: 'https://app.example.test', ALLOWED_ORIGINS: 'https://app.example.test',
        MONGO_URI: process.env.PRODUCTION_TEST_MONGODB_URI, MONGODB_URI: process.env.PRODUCTION_TEST_MONGODB_URI, MONGODB_DB_NAME: dbName,
        MONGODB_ALLOW_LOOPBACK: 'true', REQUIRE_EXISTING_DATABASE: 'true', JWT_SECRET: secret,
        ADMIN_LOGIN_ID: 'production-test', ADMIN_LOGIN_PASSWORD: `test-only-${randomUUID()}`, ADMIN_LOGIN_ID_2: '', ADMIN_LOGIN_PASSWORD_2: '',
        GOOGLE_CLIENT_ID: '123456-productiontest.apps.googleusercontent.com', PAYMENT_REQUIRED: 'false', ONLINE_STORE_ENABLED: 'false',
        TURNSTILE_SITE_KEY: 'production-simulation-widget', TURNSTILE_SECRET_KEY: 'production-simulation-secret', TURNSTILE_HOSTNAMES: 'app.example.test',
        META_APP_ID: '', META_APP_SECRET: '', META_LOGIN_CONFIG_ID: '', META_GRAPH_API_VERSION: '', META_TOKEN_ENCRYPTION_KEY: '', META_PUBLIC_ORIGIN: '',
        SMTP_HOST: 'smtp.invalid', SMTP_PORT: '587', SMTP_USER: 'test', SMTP_PASS: 'test', SMTP_FROM: 'test@example.test',
      },
    });
    let spawnError;
    child.on('error', (error) => { spawnError = error; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 400; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Production startup failed: ${output}`);
      try { ready = (await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (ready) break;
      await delay(200);
    }
    assert.equal(ready, true, `Production database readiness must succeed: ${output}`);
    const claims = { sub: String(owner._id), scope: 'app', businessId: String(businessId), sid: sessionId, accountType: 'owner', category: 'retail' };
    const token = jwt.sign(claims, secret, { expiresIn: '5m' });
    async function request(path, method = 'GET', body, authorization = token) {
      const response = await fetch(`${base}/api/accounting${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}), Origin: 'https://app.example.test' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
      return { status: response.status, data: await response.json() };
    }
    assert.equal((await request('/trial-balance', 'GET', undefined, '')).status, 401);
    const noSession = jwt.sign({ ...claims, sid: undefined }, secret, { expiresIn: '5m' });
    assert.equal((await request('/trial-balance', 'GET', undefined, noSession)).status, 401);
    const member = await AppUser.create({ businessId, name: 'Restricted member', email: 'restricted@example.test', role: 'Sales Executive', accountType: 'member', permissions: { modules: [] }, category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), onboardingCompleted: true });
    const memberSession = randomUUID();
    await createTestSession(member, memberSession);
    const denied = jwt.sign({ ...claims, sub: String(member._id), sid: memberSession, accountType: 'owner' }, secret, { expiresIn: '5m' });
    assert.equal((await request('/trial-balance', 'GET', undefined, denied)).status, 403);
    const payload = { requestKey: randomUUID(), voucherType: 'Journal', numberingMode: 'auto', date: '2026-11-10', status: 'Draft', narration: 'Production accounting validation', lines: [{ ledgerName: 'Expense', side: 'debit', amount: 100 }, { ledgerName: 'Bank', side: 'credit', amount: 100 }] };
    const draft = await request('/vouchers', 'POST', payload);
    assert.equal(draft.status, 201, draft.data.message);
    const draftRetry = await request('/vouchers', 'POST', payload);
    assert.equal(draftRetry.data.voucher._id, draft.data.voucher._id);
    const path = '/trial-balance?financialYear=2026-27&from=2026-04-01&to=2026-11-11';
    const before = await request(path);
    assert.equal(before.status, 200, before.data.message);
    assert.equal(before.data.totals.debit, 0);
    const posted = await request(`/vouchers/${draft.data.voucher._id}`, 'PUT', { status: 'Posted', revision: 1 });
    assert.equal(posted.status, 200, posted.data.message);
    const after = await request(path);
    assert.equal(after.data.totals.debit, 100); assert.equal(after.data.totals.credit, 100); assert.equal(after.data.totals.balanced, true);
    const bank = after.data.rows.find((row) => row.name === 'Bank');
    assert.equal(bank.closing, -100);
    const statement = await request(`/reports/ledger-statement?ledgerId=${bank._id}&from=2026-04-01&to=2026-11-11`);
    assert.equal(statement.status, 200, statement.data.message); assert.equal(statement.data.totals.closing, bank.closing);
    const immutable = await request(`/vouchers/${posted.data.voucher._id}`, 'PUT', { alterationReason: 'Attempt overwrite', narration: 'Must not overwrite', revision: 2 });
    assert.equal(immutable.status, 409);
    const foreignOwner = await AppUser.create({ businessId: new mongoose.Types.ObjectId(), name: 'Other company owner', email: 'other-owner@example.test', accountType: 'owner', category: 'retail', subscriptionStatus: 'active', billingStatus: 'SUBSCRIPTION_ACTIVE', subscriptionExpiresAt: new Date(Date.now() + 86400000), onboardingCompleted: true });
    const foreignSession = randomUUID();
    await createTestSession(foreignOwner, foreignSession);
    const foreign = jwt.sign({ ...claims, sub: String(foreignOwner._id), sid: foreignSession }, secret, { expiresIn: '5m' });
    assert.equal((await request(`/vouchers/${posted.data.voucher._id}`, 'GET', undefined, foreign)).status, 404);
    const reversal = await request(`/vouchers/${posted.data.voucher._id}/reverse`, 'POST', { reason: 'Production test correction', date: '2026-11-11' });
    assert.equal(reversal.status, 201, reversal.data.message);
    const reversed = await request(path);
    assert.equal(reversed.data.totals.debit, 0); assert.equal(reversed.data.totals.credit, 0);
    assert.equal(await AccountingVoucher.countDocuments({}), 2);
    assert.equal((await AccountingVoucher.findById(posted.data.voucher._id)).status, 'Posted');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    if (mongoose.connection.name === dbName && dbName.startsWith('gobook_production_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
