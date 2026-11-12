import assert from 'node:assert/strict';
import test from 'node:test';
import { nextJournalDate } from '../src/services/recurringJournals.js';

test('recurring periods preserve month-end anchors and real dates', () => {
  assert.equal(nextJournalDate('2026-01-31', 'Monthly'), '2026-02-28');
  assert.equal(nextJournalDate('2026-02-28', 'Monthly', 31), '2026-03-31');
  assert.equal(nextJournalDate('2024-02-29', 'Yearly'), '2025-02-28');
  assert.equal(nextJournalDate('2026-11-30', 'Quarterly'), '2027-02-28');
  assert.equal(nextJournalDate('2026-12-28', 'Weekly'), '2027-01-04');
  assert.throws(() => nextJournalDate('2026-02-30', 'Monthly'), /valid voucher date/);
  assert.throws(() => nextJournalDate('2026-02-28', 'Daily'), /frequency/);
});
