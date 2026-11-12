import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingCampaignStatuses, marketingCampaignTotals, marketingConversations, marketingDailyUsage } from '../src/features/categories/common/modules/more-modules/whatsappMarketing.js';

test('marketing failures use explicit failure counts rather than treating undelivered messages as failed', () => {
  assert.deepEqual(marketingCampaignTotals([{ sent: 100, delivered: 80, read: 50, replied: 5, failed: 3 }, { sent: '10', delivered: '8', failed: 1 }]), { sent: 110, delivered: 88, read: 50, replied: 5, failed: 4 });
});
test('campaign statuses preserve Paused without inventing Scheduled or Completed status', () => {
  assert.deepEqual(marketingCampaignStatuses([{ status: 'Active' }, { status: 'Paused' }, { status: 'Paused' }, { status: 'Draft' }]), [{ label: 'Active', value: 1 }, { label: 'Paused', value: 2 }, { label: 'Draft', value: 1 }]);
});
test('daily usage aggregates real dates in India and ignores invalid timestamps', () => {
  const result = marketingDailyUsage([{ date: '2026-10-23T20:00:00Z', sent: 10, delivered: 8, read: 3 }, { date: '2026-10-24T00:00:00Z', sent: 5, delivered: 4, read: 1 }, { date: 'bad', sent: 99 }]);
  assert.deepEqual(result, [{ day: '2026-10-24', sent: 15, delivered: 12, read: 4 }]);
});
test('conversation activity picks latest real message per business and phone without inventing unread flags', () => {
  const result = marketingConversations([{ _id: 'old', businessId: 'a', phone: '123', createdAt: '2026-10-23T10:00:00Z' }, { _id: 'latest', businessId: 'a', phone: '123', createdAt: '2026-10-24T10:00:00Z' }, { _id: 'other-business', businessId: 'b', phone: '123', createdAt: '2026-10-24T10:00:00Z' }]);
  assert.equal(result.length, 2); assert.equal(result[0]._id, 'latest'); assert.equal(result[0].unread, undefined);
});
