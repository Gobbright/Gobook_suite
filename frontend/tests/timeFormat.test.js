import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTime12, clockInputValue } from '../src/utils/timeFormat.js';

test('clock times display midnight, noon and afternoon with AM/PM', () => {
  for (const [input, expected] of [['00:00', '12:00 AM'], ['00:35', '12:35 AM'], ['09:05', '09:05 AM'], ['12:00', '12:00 PM'], ['13:07', '01:07 PM'], ['18:30:00', '06:30 PM'], ['23:59', '11:59 PM'], ['6:30 pm', '06:30 PM']]) assert.equal(formatTime12(input), expected);
});
test('durations and missing or invalid clock values are not misinterpreted', () => {
  for (const value of ['8h 30m', '--', '', '24:01', '12:60', '13:30 PM']) assert.equal(formatTime12(value), value);
});
test('12-hour input produces the correct API value across noon and midnight', () => {
  assert.equal(clockInputValue('12', '00', 'AM'), '00:00');
  assert.equal(clockInputValue('12', '15', 'PM'), '12:15');
  assert.equal(clockInputValue('6', '30', 'PM'), '18:30');
  assert.equal(clockInputValue('6', '30', 'AM'), '06:30');
  assert.equal(clockInputValue('', '00', 'AM'), '');
});
