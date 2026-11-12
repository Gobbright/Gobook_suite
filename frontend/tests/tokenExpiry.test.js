import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenIsCurrent } from '../src/services/tokenExpiry.js';

const now = 1800000000000;
const seconds = now / 1000;
const token = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
test('UI tokens expire exactly at seven days and never accept longer sessions', () => {
  assert.equal(tokenIsCurrent(token({ iat: seconds, exp: seconds + 604800 }), now), true);
  assert.equal(tokenIsCurrent(token({ iat: seconds, exp: seconds + 604800 }), now + 604800000), false);
  assert.equal(tokenIsCurrent(token({ iat: seconds, exp: seconds + 604801 }), now), false);
  assert.equal(tokenIsCurrent(token({ iat: seconds + 60, exp: seconds + 3600 }), now), false);
  assert.equal(tokenIsCurrent(token({ exp: seconds + 3600 }), now), false);
  assert.equal(tokenIsCurrent('malformed', now), false);
});
