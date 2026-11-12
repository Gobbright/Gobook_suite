import assert from 'node:assert/strict';
import test from 'node:test';
import { validateProductionConfig } from '../src/config/production.js';

function configuration(overrides = {}) {
  return {
    nodeEnv: 'production', clientUrl: 'https://www.example.com', allowedOrigins: ['https://www.example.com'],
    googleClientId: '123456-example.apps.googleusercontent.com', mongodbUri: 'mongodb://db.example.com/gobooksuite',
    mongodbDbName: 'gobooksuite', requireExistingDatabase: true, paymentRequired: false,
    razorpay: {}, meta: {}, smtp: { host: 'smtp.example.com', port: 587, user: 'user', pass: 'password', from: 'test@example.com' },
    turnstile: { enabled: true, siteKey: 'production-site-key', secretKey: 'production-secret-key', hostnames: ['www.example.com'] },
    ...overrides,
  };
}

test('production deployment accepts a remote populated-database configuration', () => {
  assert.deepEqual(validateProductionConfig(configuration(), {}), { loopbackDatabase: false, metaEnabled: false });
});
test('production refuses an empty-database bypass and conflicting database aliases', () => {
  assert.throws(() => validateProductionConfig(configuration({ requireExistingDatabase: false }), {}), /REQUIRE_EXISTING_DATABASE/);
  assert.throws(() => validateProductionConfig(configuration(), { MONGO_URI: 'old', MONGODB_URI: 'new' }), /conflict/);
  assert.doesNotThrow(() => validateProductionConfig(configuration(), { MONGO_URI: 'same', MONGODB_URI: 'same' }));
});
test('production detects database mismatches including replica-set seed lists', () => {
  assert.throws(() => validateProductionConfig(configuration({ mongodbUri: 'mongodb://db1:27017,db2:27017/wrong?replicaSet=rs0' }), {}), /MONGODB_DB_NAME/);
  assert.doesNotThrow(() => validateProductionConfig(configuration({ mongodbUri: 'mongodb://db1:27017,db2:27017/gobooksuite?replicaSet=rs0' }), {}));
});
test('loopback database requires an explicit same-host setting, including IPv6', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const value = configuration({ mongodbUri: `mongodb://user:pass@${host}:27017/gobooksuite` });
    assert.throws(() => validateProductionConfig(value, {}), /MONGODB_ALLOW_LOOPBACK/);
    assert.equal(validateProductionConfig(value, { MONGODB_ALLOW_LOOPBACK: 'true' }).loopbackDatabase, true);
  }
});
test('production rejects broken Google, CORS, SMTP, payment, and Meta configuration', () => {
  for (const [overrides, expected] of [
    [{ googleClientId: '' }, /GOOGLE_CLIENT_ID/],
    [{ allowedOrigins: [] }, /ALLOWED_ORIGINS/],
    [{ smtp: { port: 587 } }, /SMTP_HOST/],
    [{ paymentRequired: true }, /Razorpay/],
    [{ meta: { appId: '123' } }, /Meta requires/],
    [{ turnstile: { enabled: false } }, /TURNSTILE/],
    [{ turnstile: { enabled: true, siteKey: '1x00000000000000000000AA', secretKey: 'secret', hostnames: ['www.example.com'] } }, /test keys/],
  ]) assert.throws(() => validateProductionConfig(configuration(overrides), {}), expected);
});
