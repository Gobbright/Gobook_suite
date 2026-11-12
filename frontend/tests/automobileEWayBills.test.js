import assert from 'node:assert/strict';
import test from 'node:test';
import { eWayExpiry, eWayReady, eWaySavedExtra, eWaySource, eWayStatus, eWayTransport, filterEWayBills, recordedEwb } from '../src/features/categories/automobile/automobileEWayBills.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const doc = { _id: '1', number: 'EWB-001', meta: { date: '2026-10-20', poRef: 'PO-9' }, customer: { name: 'Auto Parts' }, items: [{ description: 'Tyre', hsn: '40111010', qty: 2, rate: 100 }], extra: { transporter: 'VRL', vehicleNumber: 'TN01AB1234', distanceKm: 100 } };
test('internal document numbers are not treated as registered E-Way Bill numbers', () => {
  assert.equal(recordedEwb(doc), ''); assert.equal(eWayStatus(doc), 'Ready for Review');
  assert.equal(recordedEwb({ ...doc, number: '123456789012' }), '123456789012');
  assert.equal(eWayStatus({ ...doc, extra: { ...doc.extra, ewbNumber: 'bad' } }), 'Needs Review');
});
test('expiry and transit require explicit registration metadata', () => {
  const saved = { ...doc, extra: { ...doc.extra, ewbNumber: '123456789012' } };
  assert.equal(eWayStatus(saved), 'EWB Recorded'); assert.ok(Number.isNaN(eWayExpiry(saved)));
  assert.equal(eWayStatus({ ...saved, extra: { ...saved.extra, transportStatus: 'in_transit' } }), 'In Transit');
  const expiring = { ...saved, extra: { ...saved.extra, validUpto: '2026-10-20' } };
  assert.equal(eWayStatus(expiring, Date.parse('2026-10-20T18:29:59Z')), 'EWB Recorded');
  assert.equal(eWayStatus(expiring, Date.parse('2026-10-20T18:30:00Z')), 'Expired');
  assert.equal(eWayStatus({ ...saved, extra: { ...saved.extra, ewbStatus: 'cancelled' } }), 'Cancelled (Recorded)');
});
test('basic field checks reject incomplete goods and transport without writing records', () => {
  assert.equal(eWayReady(doc), true);
  assert.equal(eWayReady({ ...doc, items: [{ ...doc.items[0], qty: 0 }] }), false);
  assert.equal(eWayReady({ ...doc, items: [{ ...doc.items[0], rate: '' }] }), false);
  assert.equal(eWayReady({ ...doc, extra: {} }), false);
});
test('transport serialization preserves registration metadata and supports legacy shapes', () => {
  const extra = eWaySavedExtra({ ewbNumber: '123456789012', validUpto: '2026-10-20' }, { transporterName: 'VRL', vehicleNumber: 'TN01' }, { distanceKm: 90, dispatchTo: 'Chennai' });
  assert.equal(extra.ewbNumber, '123456789012'); assert.equal(extra.validUpto, '2026-10-20');
  assert.equal(eWayTransport({ extra }).distanceKm, '90'); assert.equal(eWayTransport({ extra }).dispatchTo, 'Chennai');
  assert.equal(eWayTransport({ transport: { transporterName: 'Legacy' }, route: { distanceKm: 1 } }).transporter, 'Legacy');
  assert.equal(eWayTransport({ extra: { transport: { transporterName: 'Nested' } } }).transporter, 'Nested');
});
test('combined search, source, transporter, date and status filters use saved values', () => {
  assert.equal(eWaySource(doc), 'PO-9');
  assert.deepEqual(filterEWayBills([doc], { search: 'tn01', transporter: 'VRL', type: 'Reference', from: '2026-10-01', to: '2026-10-31', status: 'Ready for Review', ewb: 'no' }), [doc]);
  assert.deepEqual(filterEWayBills([doc], { ewb: 'yes' }), []);
  assert.deepEqual(filterEWayBills([doc], { to: '2026-09-30' }), []);
});
test('Automobile opens the E-Way Bill register while Retail keeps its current form', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items || []).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/e-way-bill')); assert.ok(!links('automobile').includes('/billing/e-way-bill/new'));
  assert.ok(links('retail').includes('/billing/e-way-bill/new'));
});
