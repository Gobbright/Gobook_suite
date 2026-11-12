import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET = 'subscription-testing-secret';
const { env } = await import('../src/config/env.js');
const { AppUser } = await import('../src/models/AppUser.js');
const { SubscriptionPlan } = await import('../src/models/SubscriptionPlan.js');
const { SubscriptionPayment } = await import('../src/models/SubscriptionPayment.js');
const { activateTestSubscription, getSubscriptionTestConfig } = await import('../src/modules/subscriptions/subscriptionController.js');
const { TRIAL_DAYS, trialEndDate, repairTrialWindow } = await import('../src/services/trialWindow.js');
const originalMode = env.subscriptionTestMode;
afterEach(() => { mock.restoreAll(); env.nodeEnv = 'test'; env.subscriptionTestMode = originalMode; });

async function invoke(handler, body = {}) {
  const result = {};
  await handler({ user: { id: 'owner', sessionId: 'current-session', authTime: Math.floor(Date.now() / 1000) }, body },
    { json(data) { result.data = data; } }, (error) => { result.error = error; });
  return result;
}

function owner(overrides = {}) {
  return {
    _id: 'owner', accountType: 'owner', status: 'Active', email: 'owner@example.com',
    emailVerified: true, onboardingCompleted: true, businessId: 'business', category: 'retail',
    subscriptionStatus: 'expired', billingStatus: 'TRIAL_EXPIRED', paymentMethodVerified: false,
    trialClaimedAt: new Date('2025-01-01T00:00:00Z'),
    save: mock.fn(async () => {}), ...overrides,
  };
}

test('trial lasts 30 days, including across a month boundary', () => {
  assert.equal(TRIAL_DAYS, 30);
  assert.equal(trialEndDate(new Date('2026-01-20T00:00:00Z')).toISOString(), '2026-02-19T00:00:00.000Z');
});

test('short existing trials extend to 30 days and expired trials regain remaining access', async () => {
  for (const subscriptionStatus of ['trial', 'expired']) {
    const user = owner({ subscriptionStatus, trialStartedAt: new Date('2026-11-01T00:00:00Z'), trialEndsAt: new Date('2026-11-04T00:00:00Z') });
    assert.equal(await repairTrialWindow(user, new Date('2026-11-11T00:00:00Z')), true);
    assert.equal(user.trialEndsAt.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(user.billingStatus, 'TRIAL_ACTIVE');
    assert.equal(user.subscriptionStatus, 'trial');
  }
});

test('trial repair never activates verification-pending accounts or replaces paid access', async () => {
  for (const subscriptionStatus of ['', 'active', 'cancelled']) {
    const user = owner({ subscriptionStatus, trialStartedAt: new Date('2026-11-01T00:00:00Z') });
    assert.equal(await repairTrialWindow(user, new Date('2026-11-11T00:00:00Z')), false);
    assert.equal(user.save.mock.callCount(), 0);
  }
});

test('test activation is blocked when disabled and always blocked in production', async () => {
  mock.method(AppUser, 'findById', () => { throw new Error('Should not query accounts'); });
  for (const [nodeEnv, enabled] of [['test', false], ['production', true]]) {
    env.nodeEnv = nodeEnv;
    env.subscriptionTestMode = enabled;
    assert.equal((await invoke(getSubscriptionTestConfig)).data.enabled, false);
    assert.equal((await invoke(activateTestSubscription)).error.statusCode, 403);
  }
});

test('test activation requires a verified, onboarded active business owner', async () => {
  env.subscriptionTestMode = true;
  for (const overrides of [{ accountType: 'member' }, { isPlatformOwner: true }, { emailVerified: false }, { onboardingCompleted: false }, { businessId: null }, { status: 'Blocked' }]) {
    const user = owner(overrides);
    const lookup = mock.method(AppUser, 'findById', async () => user);
    assert.equal((await invoke(activateTestSubscription)).error.statusCode, 403);
    assert.equal(user.save.mock.callCount(), 0);
    lookup.mock.restore();
  }
});

test('expired owner gets persisted 30-day test access and an updated session without a payment', async () => {
  env.subscriptionTestMode = true;
  const user = owner();
  const claimedAt = user.trialClaimedAt;
  mock.method(AppUser, 'findById', async (id) => { assert.equal(id, 'owner'); return user; });
  mock.method(SubscriptionPayment, 'create', () => { throw new Error('Test access must never create a payment'); });
  const result = await invoke(activateTestSubscription);
  assert.equal(result.error, undefined);
  assert.equal(user.subscriptionStatus, 'trial');
  assert.equal(user.billingStatus, 'TRIAL_ACTIVE');
  assert.equal(user.trialEndsAt.getTime() - user.trialStartedAt.getTime(), 30 * 86400000);
  assert.equal(user.trialClaimedAt, claimedAt);
  assert.equal(user.paymentMethodVerified, false);
  assert.equal(user.save.mock.callCount(), 1);
  assert.equal(result.data.user.trialDaysRemaining, 30);
  assert.equal(jwt.verify(result.data.token, env.jwtSecret).sid, 'current-session');
  const end = user.trialEndsAt;
  await invoke(activateTestSubscription);
  assert.equal(user.trialEndsAt, end, 'Repeated clicks must preserve the active trial window');
});

test('test access validates and persists the chosen plan', async () => {
  env.subscriptionTestMode = true;
  const user = owner();
  mock.method(AppUser, 'findById', async () => user);
  mock.method(SubscriptionPlan, 'bulkWrite', async () => ({}));
  const lookup = mock.method(SubscriptionPlan, 'findOne', (query) => {
    assert.equal(query.category, 'retail');
    assert.equal(query.enabled, true);
    return { lean: async () => query.tier === 'advanced' ? { amount: 59999 } : null };
  });
  assert.equal((await invoke(activateTestSubscription, { subscriptionPlan: 'invalid' })).error.statusCode, 400);
  assert.equal(user.save.mock.callCount(), 0);
  const result = await invoke(activateTestSubscription, { subscriptionPlan: 'advanced' });
  assert.equal(result.error, undefined);
  assert.equal(result.data.user.subscriptionPlan, 'advanced');
  assert.equal(user.subscriptionAmount, 59999);
  assert.equal(lookup.mock.callCount(), 2);
});
