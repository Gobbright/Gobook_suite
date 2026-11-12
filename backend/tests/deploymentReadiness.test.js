import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { createCorsOriginValidator } from '../src/services/corsPolicy.js';
import { topologySupportsTransactions } from '../src/services/database.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { env } from '../src/config/env.js';

function validate(validator, origin) {
  return new Promise((resolve) => validator(origin, (error, allowed) => resolve({ error, allowed })));
}

test('production CORS accepts configured origins and rejects localhost with 403', async () => {
  const validator = createCorsOriginValidator({ nodeEnv: 'production', origins: ['https://app.example.com'] });
  assert.deepEqual(await validate(validator, 'https://app.example.com'), { error: null, allowed: true });
  const blocked = await validate(validator, 'http://localhost:5173');
  assert.equal(blocked.allowed, undefined);
  assert.equal(blocked.error.statusCode, 403);
  assert.equal(blocked.error.code, 'CORS_ORIGIN_DENIED');
});

test('development CORS permits local network origins', async () => {
  const validator = createCorsOriginValidator({ nodeEnv: 'development', origins: [] });
  assert.deepEqual(await validate(validator, 'http://192.168.1.25:5173'), { error: null, allowed: true });
});

test('deployed CORS configuration accepts both frontend addresses without permitting other origins', async () => {
  // Deployment origins come from the container definition; the developer's
  // .env may intentionally point to localhost.
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const deployedOrigins = dockerfile.match(/\bALLOWED_ORIGINS=([^\s\\]+)/)?.[1];
  assert.ok(deployedOrigins, 'Deployment must configure its frontend origins');
  const validator = createCorsOriginValidator({ nodeEnv: 'production', origins: deployedOrigins.split(',') });
  for (const origin of ['https://gobooksuite.com', 'https://www.gobooksuite.com']) {
    assert.deepEqual(await validate(validator, origin), { error: null, allowed: true });
  }
  for (const origin of ['https://other.gobooksuite.com', 'https://gobooksuite.com.example.com']) {
    assert.equal((await validate(validator, origin)).error.statusCode, 403);
  }
});

test('readiness accepts transactional MongoDB topologies and rejects standalone servers', () => {
  assert.equal(topologySupportsTransactions({ setName: 'rs0', logicalSessionTimeoutMinutes: 30 }), true);
  assert.equal(topologySupportsTransactions({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30 }), true);
  assert.equal(topologySupportsTransactions({ isWritablePrimary: true, logicalSessionTimeoutMinutes: 30 }), false);
  assert.equal(topologySupportsTransactions({ setName: 'rs0' }), false);
});

test('production 503 responses never expose MongoDB topology details', () => {
  const originalNodeEnv = env.nodeEnv;
  env.nodeEnv = 'production';
  const result = {};
  const res = {
    status(value) { result.status = value; return this; },
    json(value) { result.body = value; return this; },
  };
  const error = Object.assign(new Error('Configure a replica set or MongoDB Atlas'), { statusCode: 503, code: 'MONGODB_TRANSACTIONS_REQUIRED' });
  try {
    errorHandler(error, { method: 'POST', originalUrl: '/api/purchase', user: { id: 'test-user' } }, res);
    assert.equal(result.status, 503);
    assert.equal(result.body.message, 'Service temporarily unavailable');
    assert.equal(JSON.stringify(result.body).includes('replica set'), false);
    assert.ok(result.body.errorId);
  } finally {
    env.nodeEnv = originalNodeEnv;
  }
});
