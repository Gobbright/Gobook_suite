import assert from 'node:assert/strict';
import test from 'node:test';
import { currentEmployeeMonth, monthQuery, leaveDaysInMonth } from '../src/features/employee-management/services/monthScope.js';

test('employee screens select the Indian business month across UTC/year boundaries', () => {
  assert.equal(currentEmployeeMonth(new Date('2026-10-31T18:29:59Z')), '2026-10');
  assert.equal(currentEmployeeMonth(new Date('2026-10-31T18:30:00Z')), '2026-11');
  assert.equal(currentEmployeeMonth(new Date('2026-12-31T18:30:00Z')), '2027-01');
});
test('requests always select one valid month rather than an unbounded history', () => {
  assert.equal(monthQuery('2026-11'), '?month=2026-11');
  assert.match(monthQuery(), /^\?month=\d{4}-\d{2}$/);
  for (const month of ['', 'all', '2026-13', '2026-00', null, {}]) assert.throws(() => monthQuery(month));
});
test('monthly leave reports include cross-month requests and clip their day totals', () => {
  assert.equal(leaveDaysInMonth({ from: '2026-10-30', to: '2026-11-02', days: 4 }, '2026-11'), 2);
  assert.equal(leaveDaysInMonth({ from: '2026-11-30', to: '2026-12-03', days: 4 }, '2026-11'), 1);
  assert.equal(leaveDaysInMonth({ from: '2024-02-28', to: '2024-03-02', days: 4 }, '2024-02'), 2);
  assert.equal(leaveDaysInMonth({ from: '2026-10-01', to: '2026-10-02', days: 2 }, '2026-11'), 0);
  assert.equal(leaveDaysInMonth({ from: '2026-11-02', to: '2026-11-02', days: 0.5 }, '2026-11'), 0.5);
});
