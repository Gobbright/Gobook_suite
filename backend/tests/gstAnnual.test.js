import test from 'node:test';
import assert from 'node:assert/strict';
import { annualIdentity } from '../src/services/gstr9Preparation.js';
test('annual years require a complete consecutive April-to-March year', () => {
  assert.equal(annualIdentity('2026-27'), '2026-27');
  for (const value of ['2026', '2026-28', '26-27', '2026-27 trailing', '', null]) assert.throws(() => annualIdentity(value), /financial year/);
});
