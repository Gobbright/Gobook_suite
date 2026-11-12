import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, createHmac } from 'node:crypto';
import { env } from '../src/config/env.js';
import { MAX_SESSION_SECONDS, sessionSeconds, verifyAccessToken } from '../src/services/tokenPolicy.js';
import { signToken, resetPassword } from '../src/modules/auth/authController.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireEmployeeManagementAdminAuth, requireEmployeePortalAuth } from '../src/middleware/employeePortalAuth.js';
import { AppUser } from '../src/models/AppUser.js';
import { AppSession } from '../src/models/AppSession.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { Employee } from '../src/models/Employee.js';
import { assertActiveSession } from '../src/services/appSessions.js';
import { credentialHash } from '../src/services/securitySessions.js';
import { verifyHumanToken, requireHumanVerification } from '../src/middleware/humanVerification.js';
import { createSecurityRateLimit, SecurityRateLimit } from '../src/middleware/securityRateLimit.js';
import { requireAdminAuth, signAdminToken } from '../src/modules/admin/adminAuth.js';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../src/services/razorpay.js';
import { verifyRegistrationPayment, recordRegistrationPaymentFailure } from '../src/modules/subscriptions/subscriptionController.js';
import { SubscriptionPayment } from '../src/models/SubscriptionPayment.js';

afterEach(() => mock.restoreAll());
const id = '507f1f77bcf86cd799439011';
const user = { _id: id, email: 'person@example.test', role: 'Sales Executive', accountType: 'member', status: 'Active', password: 'stored-bcrypt-hash', businessId: id, permissions: { modules: ['billing'] } };
function request(token) { return { headers: { authorization: `Bearer ${token}` }, body: {} }; }
async function invoke(handler, req) {
  let error;
  let called = false;
  const result = {};
  await handler(req, { setHeader: (key, value) => { result[key] = value; }, json: (value) => { result.body = value; }, status(value) { result.status = value; return this; } }, (value) => { called = true; error = value; });
  return { ...result, error, called };
}
function appMocks(current = user, session = { createdAt: new Date(), lastSeenAt: new Date() }) {
  mock.method(AppUser, 'findById', () => ({ select: () => ({ lean: async () => current }) }));
  return mock.method(AppSession, 'findOne', async () => session);
}

test('all configured session durations are capped at seven days', () => {
  for (const duration of ['8d', '30d', '52w', '999999999s']) assert.equal(sessionSeconds(duration), MAX_SESSION_SECONDS);
  assert.equal(sessionSeconds('8h'), 28800);
  assert.equal(sessionSeconds('604800'), MAX_SESSION_SECONDS);
  assert.equal(sessionSeconds('1000ms'), 1);
  for (const duration of ['0s', '-1d', 'forever', '1year', '0ms']) assert.throws(() => sessionSeconds(duration));
});

test('employee schemas never accept new plaintext password values', () => {
  for (const Model of [Employee, EmployeeLogin]) {
    const doc = new Model({ loginPassword: 'DoNotStoreThisPassword' });
    assert.equal(doc.toObject().loginPassword, undefined);
    assert.equal(Model.schema.path('loginPassword').options.select, false);
  }
});

test('tokens have an explicit scope and refreshing claims preserves the original expiry', () => {
  const authTime = Math.floor(Date.now() / 1000) - 86400;
  const token = signToken(user, 'sid', authTime);
  const payload = verifyAccessToken(token, 'app');
  assert.equal(payload.iat, authTime);
  assert.ok(payload.exp <= authTime + MAX_SESSION_SECONDS);
  assert.throws(() => verifyAccessToken(token, 'admin-panel'));
  assert.throws(() => verifyAccessToken(token, 'employee-portal'));
});

test('rejects legacy, expired, future-issued, oversized and different-algorithm tokens', () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: id, scope: 'app', sid: 'sid' };
  for (const token of [
    jwt.sign({ sub: id }, env.jwtSecret, { expiresIn: 3600 }),
    jwt.sign({ ...claims, iat: now - MAX_SESSION_SECONDS - 1 }, env.jwtSecret, { expiresIn: MAX_SESSION_SECONDS }),
    jwt.sign({ ...claims, iat: now + 60 }, env.jwtSecret, { expiresIn: 3600 }),
    jwt.sign(claims, env.jwtSecret, { expiresIn: MAX_SESSION_SECONDS + 1 }),
    jwt.sign(claims, env.jwtSecret, { expiresIn: 3600, algorithm: 'HS384' }),
    jwt.sign(claims, env.jwtSecret, { noTimestamp: true, expiresIn: 3600 }),
  ]) assert.throws(() => verifyAccessToken(token, 'app'));
});

test('app authorization uses current database permissions and credentials', async () => {
  const lookup = appMocks();
  const req = request(signToken({ ...user, role: 'Super Admin', accountType: 'owner' }, 'sid'));
  const result = await invoke(requireAuth, req);
  assert.ifError(result.error);
  assert.equal(req.user.role, 'Sales Executive');
  assert.equal(req.user.isSuperAdmin, false);
  assert.deepEqual(req.user.permissions.modules, ['billing']);
  const filter = lookup.mock.calls[0].arguments[0];
  assert.equal(filter.credentialHash, credentialHash(user.password));
  assert.ok(filter.createdAt.$gt instanceof Date);
  assert.ok(filter.expiresAt.$gt instanceof Date);
});

test('blocked/deleted accounts and revoked sessions cannot use valid signed tokens', async () => {
  for (const current of [null, { ...user, status: 'Blocked' }, { ...user, status: 'Deleted' }]) {
    mock.restoreAll();
    appMocks(current);
    assert.equal((await invoke(requireAuth, request(signToken(user, 'sid')))).error.statusCode, 401);
  }
  mock.restoreAll();
  appMocks(user, null);
  assert.equal((await invoke(requireAuth, request(signToken(user, 'sid')))).error.statusCode, 401);
  await assert.rejects(assertActiveSession({ userId: id }), { statusCode: 401 });
});

test('employee/admin tokens cannot authenticate as an app user', async () => {
  const lookup = mock.method(AppUser, 'findById', () => { throw new Error('Must reject the wrong scope before database access'); });
  for (const scope of ['employee-portal', 'admin-panel']) {
    const token = jwt.sign({ sub: id, scope, sid: 'sid' }, env.jwtSecret, { expiresIn: 3600 });
    assert.equal((await invoke(requireAuth, request(token))).error.statusCode, 401);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('a sub-user cannot become HR admin through a valid app token', async () => {
  appMocks();
  const result = await invoke(requireEmployeeManagementAdminAuth, request(signToken(user, 'sid')));
  assert.equal(result.error.statusCode, 403);
});

test('platform admin sessions must exist and be unrevoked', async () => {
  const account = env.adminAccounts[0];
  assert.ok(account);
  const previous = env.adminAccounts;
  env.adminAccounts = [account];
  try {
    const token = signAdminToken(account.id, { sid: 'sid' });
    const lookup = mock.method(SecuritySession, 'findOne', () => ({ lean: async () => null }));
    const result = await invoke(requireAdminAuth, request(token));
    assert.equal(result.error.statusCode, 401);
    assert.equal(lookup.mock.calls[0].arguments[0].credentialHash, credentialHash(account.password));
  } finally {
    env.adminAccounts = previous;
  }
});

test('employee roles and login-enabled flag are checked against the database', async () => {
  const token = jwt.sign({ sub: id, scope: 'employee-portal', sid: 'sid', role: 'admin' }, env.jwtSecret, { expiresIn: 3600 });
  mock.method(EmployeeLogin, 'findById', () => ({ select: () => ({ lean: async () => ({ ...user, ownerUserId: id, role: 'employee', loginEnabled: true, passwordHash: 'hash' }) }) }));
  mock.method(AppUser, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'Active' }) }) }));
  mock.method(Employee, 'findOne', () => ({ lean: async () => ({ _id: id, userId: id, status: 'Active', loginAccess: true, portalVersion: 1 }) }));
  mock.method(SecuritySession, 'findOne', () => ({ lean: async () => ({}) }));
  const req = request(token);
  assert.ifError((await invoke(requireEmployeePortalAuth, req)).error);
  assert.equal(req.employeeUser.role, 'employee');
  assert.equal((await invoke(requireEmployeeManagementAdminAuth, request(token))).error.statusCode, 403);
});

const config = { enabled: true, siteKey: 'site-key', secretKey: 'secret-key', hostnames: ['app.example.test'] };
const verified = { success: true, hostname: 'app.example.test', action: 'login' };
function verificationResponse(value) { return async () => ({ ok: true, json: async () => value }); }
test('human verification requires the expected action, hostname and valid token', async () => {
  await verifyHumanToken('token', 'login', { config, request: verificationResponse(verified) });
  for (const result of [{ ...verified, success: false }, { ...verified, action: 'register' }, { ...verified, hostname: 'attacker.test' }, {}]) {
    await assert.rejects(verifyHumanToken('token', 'login', { config, request: verificationResponse(result) }), { statusCode: 400 });
  }
  for (const token of ['', null, {}, 'x'.repeat(2049)]) await assert.rejects(verifyHumanToken(token, 'login', { config }), { statusCode: 400 });
  await assert.rejects(verifyHumanToken('token', 'login', { config: { ...config, secretKey: '' } }), { statusCode: 503 });
  await assert.rejects(verifyHumanToken('token', 'login', { config, request: async () => { throw new Error('offline'); } }), { statusCode: 503 });
});

test('human verification cannot be bypassed with route casing or a trailing slash', async () => {
  const original = env.turnstile;
  env.turnstile = config;
  try {
    for (const path of ['/auth/login', '/AUTH/LOGIN/', '/ADMIN/LOGIN/', '/employee/auth/login/']) {
      const result = await invoke(requireHumanVerification, { path, method: 'POST', get: () => '' });
      assert.equal(result.error.statusCode, 400);
    }
  } finally { env.turnstile = original; }
});

test('database rate limits hash identities, reject excess attempts and return Retry-After', async () => {
  const lookup = mock.method(SecurityRateLimit, 'findOneAndUpdate', async () => ({ count: 3 }));
  const limiter = createSecurityRateLimit({ bucket: 'test', limit: 2 });
  const result = await invoke(limiter, { ip: '192.0.2.1' });
  assert.equal(result.error.statusCode, 429);
  assert.ok(Number(result['Retry-After']) > 0);
  assert.ok(!lookup.mock.calls[0].arguments[0]._id.includes('192.0.2.1'));
});

test('Razorpay signatures reject body tampering and wrong payment IDs', () => {
  const original = env.razorpay;
  env.razorpay = { keyId: 'key', keySecret: 'secret', webhookSecret: 'webhook-secret' };
  try {
    const signature = createHmac('sha256', 'secret').update('order_123|pay_123').digest('hex');
    assert.equal(verifyCheckoutSignature({ orderId: 'order_123', paymentId: 'pay_123', signature }), true);
    assert.equal(verifyCheckoutSignature({ orderId: 'order_123', paymentId: 'pay_other', signature }), false);
    assert.equal(verifyCheckoutSignature({ orderId: 'order_123', paymentId: 'pay_123', signature: 'short' }), false);
    const raw = Buffer.from('{ "event": "payment.captured" }');
    const webhookSignature = createHmac('sha256', 'webhook-secret').update(raw).digest('hex');
    assert.equal(verifyWebhookSignature(raw, webhookSignature), true);
    assert.equal(verifyWebhookSignature(Buffer.from(JSON.stringify(JSON.parse(raw))), webhookSignature), false);
  } finally { env.razorpay = original; }
});

test('a captured registration payment response alone cannot mint another login token', async () => {
  const lookup = mock.method(SubscriptionPayment, 'findOne', async () => null);
  const payment = { razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_123', razorpay_signature: 'signature' };
  assert.equal((await invoke(verifyRegistrationPayment, { body: payment })).error.statusCode, 401);
  assert.equal(lookup.mock.callCount(), 0);
  const token = 'a'.repeat(64);
  assert.equal((await invoke(verifyRegistrationPayment, { body: { ...payment, registrationToken: token } })).error.statusCode, 404);
  const filter = lookup.mock.calls[0].arguments[0];
  assert.equal(filter.registrationTokenHash, createHash('sha256').update(token).digest('hex'));
  assert.equal(filter.registrationTokenConsumedAt, null);
  assert.ok(filter.registrationTokenExpiresAt.$gt instanceof Date);
});

test('an unauthenticated payment failure report cannot change order status', async () => {
  const update = mock.method(SubscriptionPayment, 'updateOne', async () => ({ modifiedCount: 1 }));
  assert.deepEqual((await invoke(recordRegistrationPaymentFailure, { body: { orderId: 'order_123' } })).body, { recorded: false });
  assert.equal(update.mock.callCount(), 0);
  await invoke(recordRegistrationPaymentFailure, { body: { orderId: 'order_123', registrationToken: 'a'.repeat(64), error: { description: 'Failure' } } });
  assert.equal(update.mock.calls[0].arguments[1].$set.status, undefined);
});

test('password reset OTP attempts and consumption are atomic', async () => {
  const otpHash = await bcrypt.hash('123456', 4);
  const lookup = mock.method(AppUser, 'findOneAndUpdate', () => ({ select: async () => ({ _id: id, resetOtpHash: otpHash, resetOtpExpiresAt: new Date(Date.now() + 60000), resetOtpAttempts: 1 }) }));
  const consume = mock.method(AppUser, 'updateOne', async () => ({ modifiedCount: 0 }));
  const result = await invoke(resetPassword, { body: { email: user.email, otp: '123456', password: 'NewPassword@123' } });
  assert.equal(result.error.statusCode, 400);
  assert.equal(lookup.mock.calls[0].arguments[0].resetOtpAttempts.$lt, 5);
  assert.equal(lookup.mock.calls[0].arguments[1].$inc.resetOtpAttempts, 1);
  const [filter, update] = consume.mock.calls[0].arguments;
  assert.equal(filter.resetOtpHash, otpHash);
  assert.equal(await bcrypt.compare('NewPassword@123', update.$set.password), true);
  assert.equal(update.$set.resetOtpHash, '');
});
