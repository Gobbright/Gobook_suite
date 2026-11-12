import assert from 'node:assert/strict';
import test from 'node:test';
import { currentEmployeeMonth, employeeMonth, leaveDaysInRange } from '../src/services/employeeMonth.js';

test('employee month defaults follow Indian month boundaries', () => {
  assert.equal(currentEmployeeMonth(new Date('2026-10-31T18:29:59Z')), '2026-10');
  assert.equal(currentEmployeeMonth(new Date('2026-10-31T18:30:00Z')), '2026-11');
  assert.equal(currentEmployeeMonth(new Date('2026-12-31T18:30:00Z')), '2027-01');
});
test('monthly date windows have real calendar boundaries, including leap years', () => {
  assert.deepEqual(employeeMonth('2026-11').dates, { $gte: '2026-11-01', $lte: '2026-11-30' });
  assert.equal(employeeMonth('2024-02').end, '2024-02-29');
  assert.equal(employeeMonth('2026-02').end, '2026-02-28');
  assert.equal(employeeMonth('2026-12').end, '2026-12-31');
  for (const value of ['', 'all', '2026', '2026-00', '2026-13', '2026-1', ['2026-11'], { $ne: '' }, null]) assert.throws(() => employeeMonth(value), { statusCode: 400 });
});
test('leave totals count only the part overlapping the selected period', () => {
  const row = { from: '2026-10-30', to: '2026-11-02', days: 4 };
  assert.equal(leaveDaysInRange(row, '2026-11-01', '2026-11-30'), 2);
  assert.equal(leaveDaysInRange(row, '2026-12-01', '2026-12-31'), 0);
  assert.equal(leaveDaysInRange({ from: '2026-11-02', to: '2026-11-02', days: 0.5 }, '2026-11-01', '2026-11-30'), 0.5);
});
