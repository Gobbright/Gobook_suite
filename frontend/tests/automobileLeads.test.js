import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichLeads, filterLeads, leadStage, leadStats, leadTrend } from '../src/features/categories/automobile/automobileLeads.js';

const leads = [
  { _id: 'one', name: 'Rahul', status: 'New', priority: 'Hot', owner: 'Amit', source: 'Website', interestedIn: 'City', createdAt: '2026-10-01T10:00:00Z' },
  { _id: 'two', name: 'Priya', status: 'Converted', convertedCustomerId: 'customer', convertedAt: '2026-10-02T10:00:00Z', createdAt: '2026-09-01T10:00:00Z' },
];
test('pipeline maps legacy statuses without treating Qualified as a customer conversion', () => {
  assert.equal(leadStage({ status: 'Converted' }), 'Won');
  assert.equal(leadStage({ status: 'In Progress' }), 'Contacted');
  assert.equal(leadStats([{ status: 'Qualified' }]).converted, 0);
});
test('follow-ups use lead IDs and do not attach legacy names to ambiguous leads', () => {
  const rows = enrichLeads([leads[0], { ...leads[0], _id: 'other' }], [{ person: 'Rahul', date: '2026-10-23' }, { leadId: 'one', person: 'Rahul', date: '2026-10-24' }]);
  assert.equal(rows[0].followUps.length, 1);
  assert.equal(rows[1].followUps.length, 0);
});
test('completed follow-ups no longer count as due, and converted leads are closed', () => {
  const rows = enrichLeads(leads, [{ leadId: 'one', date: '2026-10-22', status: 'Done' }, { leadId: 'one', date: '2026-10-24', status: 'Pending' }, { leadId: 'two', date: '2026-10-20', status: 'Pending' }]);
  const stats = leadStats(rows, new Date('2026-10-23T10:00:00Z'));
  assert.equal(stats.due, 0);
  assert.equal(stats.hot, 1);
  assert.equal(stats.convertedThisMonth, 1);
  assert.equal(stats.rate, 50);
});
test('lead filters compose product, owner, priority, status, search and follow-up dates', () => {
  const rows = enrichLeads(leads, [{ leadId: 'one', date: '2026-10-24', status: 'Pending' }]);
  assert.equal(filterLeads(rows, { search: 'website', status: 'New', priority: 'Hot', owner: 'Amit', interest: 'City', from: '2026-10-01', to: '2026-10-31' }).length, 1);
  assert.equal(filterLeads(rows, { to: '2026-10-23' }).length, 0);
});
test('monthly trend counts dated conversion events and excludes undated historical conversions', () => {
  const points = leadTrend([...leads, { name: 'Legacy', status: 'Converted', createdAt: '2026-10-03T10:00:00Z' }], new Date('2026-10-23T10:00:00Z'));
  assert.equal(points.length, 6);
  assert.equal(points[0].key, '2026-05');
  assert.equal(points[5].key, '2026-10');
  assert.equal(points[5].created, 2);
  assert.equal(points[5].converted, 1);
});
