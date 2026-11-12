import assert from 'node:assert/strict';
import test from 'node:test';
import { challanActions, challanEditable, challanState, challanStats, challanTimeline, filterChallans, validateChallanForm } from '../src/features/categories/automobile/automobileChallans.js';
import { getSidebarSections } from '../src/constants/navigation.js';

const docs = [
  { _id: '1', number: 'DC-01', meta: { date: '2026-10-01' }, customer: { name: 'Auto Parts' }, items: [{ description: 'Tyre', productCode: 'TY-1', qty: 2 }], extra: {} },
  { _id: '2', number: 'DC-02', meta: { date: '2026-10-02' }, customer: { name: 'Motor Care' }, extra: { deliveryStatus: 'in-transit', vehicleNumber: 'TN01AB1234' } },
  { _id: '3', number: 'DC-03', meta: { date: '2026-10-03' }, customer: { name: 'Auto Parts' }, extra: { deliveryStatus: 'delivered', convertedInvoiceId: 'bill-1' } },
];
test('Automobile sidebar opens the challan list while Retail keeps the existing creation link', () => {
  const owner = { accountType: 'owner', role: 'Owner' };
  const hrefs = (category) => getSidebarSections(category, owner).flatMap((section) => section.items || []).map((item) => item.href);
  assert.ok(hrefs('automobile').includes('/billing/delivery-challan'));
  assert.ok(!hrefs('automobile').includes('/billing/delivery-challan/new'));
  assert.ok(hrefs('retail').includes('/billing/delivery-challan/new'));
});
test('legacy challans have no invented delivery history', () => {
  assert.equal(challanState(docs[0]), 'draft');
  assert.ok(challanTimeline(docs[0]).every((step) => !step.reached && step.at === null));
});
test('summary counts derive from actual delivery states and billing links', () => {
  assert.deepEqual(challanStats(docs), { total: 3, ready: 0, transit: 1, delivered: 1, unbilled: 2 });
});
test('filters combine date, customer, state and product/vehicle search', () => {
  assert.deepEqual(filterChallans(docs, { search: 'TY-1' }).map((doc) => doc._id), ['1']);
  assert.deepEqual(filterChallans(docs, { search: 'tn01', status: 'in-transit' }).map((doc) => doc._id), ['2']);
  assert.deepEqual(filterChallans(docs, { from: '2026-10-02', to: '2026-10-03', customer: 'Auto Parts' }).map((doc) => doc._id), ['3']);
  assert.deepEqual(filterChallans(docs, { from: '2026-10-03', to: '2026-10-01' }), []);
});
test('delivery actions only move forwards and delivered is final', () => {
  assert.deepEqual(challanActions(docs[0]).map((action) => action.value), ['ready']);
  assert.deepEqual(challanActions(docs[1]).map((action) => action.value), ['delivered']);
  assert.deepEqual(challanActions(docs[2]), []);
});
test('timeline shows recorded timestamps without fabricating intermediate dates', () => {
  const steps = challanTimeline({ extra: { deliveryStatus: 'delivered', deliveredAt: '2026-10-03T12:00:00Z' } });
  assert.equal(steps[3].at, '2026-10-03T12:00:00Z'); assert.equal(steps[1].at, null);
});
test('challan form requires customer, document details and valid lines while allowing zero-value delivery', () => {
  const valid = { customer: { name: 'Auto Parts' }, meta: { number: 'DC-01', date: '2026-10-17' }, items: [{ description: 'Replacement tyre', qty: 1, rate: 0, discount: 0 }] };
  assert.deepEqual(validateChallanForm(valid), {});
  assert.ok(validateChallanForm({ ...valid, items: [] }).items);
  assert.ok(validateChallanForm({ ...valid, customer: {} }).customerName);
  assert.ok(validateChallanForm({ ...valid, meta: { number: '', date: 'invalid' } }).invoiceDate);
  assert.ok(validateChallanForm({ ...valid, items: [{ description: 'Tyre', qty: -1, rate: NaN, discount: 101 }] }).item_qty_0);
  assert.ok(validateChallanForm({ ...valid, charges: [{ amount: -50 }] }).charges);
});
test('only unconverted draft and ready challans remain editable', () => {
  assert.equal(challanEditable(), true);
  assert.equal(challanEditable({ deliveryStatus: 'ready' }), true);
  assert.equal(challanEditable({ deliveryStatus: 'dispatched' }), false);
  assert.equal(challanEditable({ deliveryStatus: 'delivered' }), false);
  assert.equal(challanEditable({ deliveryStatus: 'draft', convertedInvoiceId: 'bill-1' }), false);
});
