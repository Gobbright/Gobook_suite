import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { AppUser } from '../src/models/AppUser.js';
import { AppSession } from '../src/models/AppSession.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { createLoginSession, revokeSession } from '../src/services/appSessions.js';
import { createSecuritySession, assertSecuritySession, revokeSecuritySession } from '../src/services/securitySessions.js';
import { signToken, resetPassword } from '../src/modules/auth/authController.js';
import { requireAuth } from '../src/middleware/auth.js';
import { createSecurityRateLimit, SecurityRateLimit } from '../src/middleware/securityRateLimit.js';
import { env } from '../src/config/env.js';
import { issueAdminToken, requireAdminAuth } from '../src/modules/admin/adminAuth.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const dbName = `gobook_security_test_${process.pid}_${Date.now()}`;
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([AppUser.init(), AppSession.init(), SecuritySession.init(), SecurityRateLimit.init()]);
});
after(async () => {
  if (!uri || mongoose.connection.readyState !== 1) return;
  assert.equal(mongoose.connection.name, dbName);
  assert.match(dbName, /^gobook_security_test_\d+_\d+$/);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
const options = { skip: !uri };

test('admin IDs with two configured passwords keep both sessions valid until their credential is removed', options, async () => {
  const previous = env.adminAccounts;
  const primary = { id: 'Shared-Admin', password: 'Primary@123' };
  const secondary = { id: 'shared-admin', password: 'Secondary@123' };
  env.adminAccounts = [primary, secondary];
  async function check(token) {
    let error;
    await requireAdminAuth({ headers: { authorization: `Bearer ${token}` } }, {}, (value) => { error = value; });
    return error;
  }
  try {
    const first = await issueAdminToken(primary.id, primary.password);
    const second = await issueAdminToken(secondary.id, secondary.password);
    assert.ifError(await check(first));
    assert.ifError(await check(second));
    env.adminAccounts = [primary];
    assert.ifError(await check(first));
    assert.equal((await check(second)).statusCode, 401);
  } finally {
    env.adminAccounts = previous;
  }
});
const req = () => ({ headers: { 'user-agent': 'Security regression test' }, ip: '127.0.0.1', body: {} });
async function actor(email) {
  return AppUser.create({ name: 'Security test', email, password: await bcrypt.hash('Password@123', 4), status: 'Active', role: 'Super Admin', accountType: 'owner', category: 'retail' });
}
async function authenticate(user, sid) {
  const request = req();
  request.headers.authorization = `Bearer ${signToken(user, sid)}`;
  let error;
  await requireAuth(request, {}, (value) => { error = value; });
  return { error, user: request.user };
}

test('real database enforces session replacement, fixed expiry and logout', options, async () => {
  const user = await actor('session@example.test');
  const first = await createLoginSession(user, req());
  assert.ifError((await authenticate(user, first.sessionId)).error);
  const second = await createLoginSession(user, req());
  assert.equal((await authenticate(user, first.sessionId)).error.statusCode, 401);
  assert.ifError((await authenticate(user, second.sessionId)).error);
  await AppSession.updateOne({ userId: user._id, revokedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal((await authenticate(user, second.sessionId)).error.statusCode, 401);
  const third = await createLoginSession(user, req());
  await revokeSession(user._id, third.sessionId);
  assert.equal((await authenticate(user, third.sessionId)).error.statusCode, 401);
});

test('password changes revoke sessions and account/role changes apply immediately', options, async () => {
  const user = await actor('permissions@example.test');
  const { sessionId } = await createLoginSession(user, req());
  await AppUser.updateOne({ _id: user._id }, { $set: { role: 'Sales Executive', accountType: 'member', permissions: { modules: ['billing'] } } });
  const current = await authenticate(user, sessionId);
  assert.ifError(current.error);
  assert.equal(current.user.isSuperAdmin, false);
  await AppUser.updateOne({ _id: user._id }, { $set: { status: 'Blocked' } });
  assert.equal((await authenticate(user, sessionId)).error.statusCode, 401);
  await AppUser.updateOne({ _id: user._id }, { $set: { status: 'Active', password: await bcrypt.hash('ChangedPassword@123', 4) } });
  assert.equal((await authenticate(user, sessionId)).error.statusCode, 401);
});

test('admin and employee sessions bind to current credentials and support server logout', options, async () => {
  for (const scope of ['admin-panel', 'employee-portal']) {
    const sid = await createSecuritySession('security-test', scope, 'credential', '30d');
    const payload = { sub: 'security-test', scope, sid };
    const session = await assertSecuritySession(payload, 'credential');
    assert.ok(new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime() <= 604800000);
    await assert.rejects(assertSecuritySession(payload, 'changed-credential'), { statusCode: 401 });
    await revokeSecuritySession(payload.sub, sid);
    await assert.rejects(assertSecuritySession(payload, 'credential'), { statusCode: 401 });
  }
});

test('concurrent database rate-limit requests cannot all pass the limit', options, async () => {
  const limiter = createSecurityRateLimit({ bucket: 'concurrency-test', limit: 3 });
  const attempts = await Promise.all(Array.from({ length: 12 }, () => new Promise((resolve) => {
    limiter(req(), { setHeader() {} }, (error) => resolve(error));
  })));
  const accepted = attempts.filter((error) => !error).length;
  assert.ok(accepted > 0 && accepted <= 3);
  assert.ok(attempts.filter(Boolean).every((error) => error.statusCode === 429));
});

test('a password-reset OTP can be consumed only once under concurrent requests', options, async () => {
  const user = await actor('reset@example.test');
  await AppUser.updateOne({ _id: user._id }, { $set: { resetOtpHash: await bcrypt.hash('123456', 4), resetOtpExpiresAt: new Date(Date.now() + 60000), resetOtpAttempts: 0 } });
  const attempt = () => new Promise((resolve) => {
    resetPassword({ body: { email: user.email, otp: '123456', password: 'ResetPassword@123' } }, { json: () => resolve('success') }, (error) => resolve(error));
  });
  const results = await Promise.all([attempt(), attempt(), attempt()]);
  assert.equal(results.filter((value) => value === 'success').length, 1);
  assert.ok(results.filter((value) => value !== 'success').every((error) => error.statusCode === 400));
});
