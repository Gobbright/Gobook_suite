import assert from 'node:assert/strict';
import test from 'node:test';
import { latestPortalPresence, PORTAL_PRESENCE_TTL_MS } from '../src/services/employeePresence.js';

const now = Date.UTC(2026, 10, 14, 10);
test('a login without a visible portal heartbeat is offline', () => {
  assert.equal(latestPortalPresence(undefined, now), null);
  assert.equal(latestPortalPresence([], now), null);
});
test('an open tab keeps the employee online when another tab closes', () => {
  const tabs = [{ clientId: 'closed', seenAt: new Date(now - PORTAL_PRESENCE_TTL_MS) }, { clientId: 'visible', seenAt: new Date(now - 1000) }];
  assert.equal(latestPortalPresence(tabs, now).getTime(), now - 1000);
  assert.equal(latestPortalPresence(tabs.slice(0, 1), now), null);
});
test('a lost connection expires and malformed or future timestamps cannot mark an employee online', () => {
  assert.equal(latestPortalPresence([{ seenAt: new Date(now - PORTAL_PRESENCE_TTL_MS) }, { seenAt: 'invalid' }, { seenAt: new Date(now + 1000) }], now), null);
  assert.equal(latestPortalPresence([{ seenAt: new Date(now - PORTAL_PRESENCE_TTL_MS + 1) }], now).getTime(), now - PORTAL_PRESENCE_TTL_MS + 1);
});
