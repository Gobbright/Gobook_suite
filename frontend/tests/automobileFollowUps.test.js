import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichFollowUps, filterFollowUps, followUpCalendar, followUpStats, followUpStatus, followUpWeek, scheduleLanes } from '../src/features/categories/automobile/automobileFollowUps.js';

const now = new Date('2026-10-23T10:00:00Z');
test('completed tasks stay completed while old pending dates become overdue in India', () => {
  assert.equal(followUpStatus({ date: '2026-10-22', status: 'Done' }, now), 'Completed');
  assert.equal(followUpStatus({ date: '2026-10-22', status: 'Pending' }, now), 'Overdue');
  assert.equal(followUpStatus({ date: '2026-10-23', status: 'Pending' }, now), 'Pending');
  assert.equal(followUpStatus({ date: '2026-10-23' }, new Date('2026-10-23T19:00:00Z')), 'Overdue');
});
test('weekly counts exclude completed tasks and next Monday', () => {
  const result = followUpStats([{ date: '2026-10-22' }, { date: '2026-10-23' }, { date: '2026-10-25' }, { date: '2026-10-26' }, { date: '2026-10-24', status: 'Done' }], now);
  assert.deepEqual(followUpWeek(now), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(result, { total: 5, pending: 3, completed: 1, overdue: 1, today: 1, upcoming: 2 });
});
test('party links prefer IDs and ambiguous legacy names remain unlinked', () => {
  const rows = enrichFollowUps([{ _id: 'one', person: 'Same' }, { _id: 'two', person: 'Same', customerId: 'customer' }, { _id: 'three', person: 'Same', leadId: 'deleted' }], [{ _id: 'customer', name: 'Same' }], [{ _id: 'lead', name: 'Same' }], now);
  assert.equal(rows[0].party, null);
  assert.equal(rows[1].party._id, 'customer');
  assert.equal(rows[2].party, null);
});
test('next follow-up comes from explicit chain and skips completed children', () => {
  const rows = enrichFollowUps([{ _id: 'first' }, { _id: 'done', previousFollowUpId: 'first', status: 'Done', date: '2026-10-24' }, { _id: 'next', previousFollowUpId: 'first', date: '2026-10-25' }], [], [], now);
  assert.equal(rows[0].next._id, 'next');
});
test('filters compose derived status, owner, priority, search and dates', () => {
  const rows = enrichFollowUps([{ _id: 'one', person: 'Rahul', notes: 'Exchange offer', date: '2026-10-22', owner: 'Priya', priority: 'High' }], [], [], now);
  assert.equal(filterFollowUps(rows, { status: 'Overdue', owner: 'Priya', priority: 'High', search: 'exchange', from: '2026-10-01', to: '2026-10-23' }).length, 1);
  assert.equal(filterFollowUps(rows, { status: 'Completed' }).length, 0);
});
test('calendar includes leap day and complete Sunday-to-Saturday weeks', () => {
  const days = followUpCalendar('2024-02');
  assert.equal(days.length % 7, 0);
  assert.equal(days[0].date, '2024-01-28');
  assert.equal(days.at(-1).date, '2024-03-02');
  assert.equal(days.filter((day) => day.current).length, 29);
});
test('overlapping appointments use separate lanes and later appointments reuse free lanes', () => {
  const rows = scheduleLanes([{ _id: 'a', time: '09:00', duration: 60 }, { _id: 'b', time: '09:30', duration: 30 }, { _id: 'c', time: '10:00', duration: 30 }, { _id: 'untimed' }]);
  assert.deepEqual(rows.map((row) => [row._id, row.lane]), [['a', 0], ['b', 1], ['c', 0]]);
});
