import assert from 'node:assert/strict';
import test from 'node:test';
import { eInvoiceChecks, eInvoiceReady, eInvoiceRecord, eInvoiceStats, eInvoiceStatus, filterEInvoices, recordedIrn, signedQrPayload } from '../src/features/categories/automobile/automobileEInvoices.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const doc = { _id: '1', number: 'EI-01', documentType: 'e-invoice', meta: { date: '2026-10-20', placeOfSupply: 'Tamil Nadu' }, customer: { name: 'Auto Parts', gstin: '33AABCR1234F1Z5' }, items: [{ description: 'Tyre', hsn: '40111010', qty: 2, rate: 100, gstRate: 18 }], extra: {} };
const recorded = { ...doc, extra: { irnNumber: 'a'.repeat(64), ackNumber: '12345', ackDate: '2026-10-20' } };
test('basic checks review saved fields without implying provider validation', () => {
  assert.ok(eInvoiceChecks(doc).every((check) => check.ok)); assert.equal(eInvoiceReady(doc), true);
  assert.equal(eInvoiceReady({ ...doc, items: [{ ...doc.items[0], rate: '' }] }), false);
  assert.equal(eInvoiceReady({ ...doc, lifecycleStatus: 'draft' }), false);
  assert.equal(eInvoiceReady({ ...doc, customer: { name: 'Auto Parts', gstin: 'bad' } }), false);
});
test('registration status requires complete recorded IRN and ACK fields and is separate from posting', () => {
  assert.equal(eInvoiceStatus(doc), 'Pending IRN'); assert.equal(eInvoiceStatus(recorded), 'IRN Recorded');
  assert.equal(eInvoiceStatus({ ...doc, extra: { irnNumber: 'a'.repeat(64) } }), 'ACK Incomplete');
  assert.equal(eInvoiceStatus({ ...doc, extra: { irnNumber: 'INVALID', ackNumber: '1', ackDate: '2026-10-20' } }), 'Needs Review');
  assert.equal(eInvoiceStatus({ ...recorded, lifecycleStatus: 'cancelled' }), 'Invoice Cancelled');
});
test('legacy IRN alias is visible but never supplies a signed QR payload', () => {
  assert.equal(recordedIrn({ extra: { irn: 'legacy' } }), 'legacy'); assert.equal(signedQrPayload(recorded), '');
  assert.equal(signedQrPayload({ extra: { signedQRCode: 'actual-saved-payload' } }), 'actual-saved-payload');
});
test('filters search either IRN alias, ACK, customer and GSTIN and combine date/status/GST filters', () => {
  assert.deepEqual(filterEInvoices([doc, recorded], { status: 'IRN Recorded', gst: 'present', from: '2026-10-01', to: '2026-10-31', search: '12345' }), [recorded]);
  assert.deepEqual(filterEInvoices([doc, recorded], { irn: 'no' }), [doc]);
  assert.deepEqual(filterEInvoices([doc, recorded], { gst: 'absent' }), []);
  assert.deepEqual(filterEInvoices([doc, recorded], { from: '2026-11-01', to: '2026-10-01' }), []);
});
test('monthly value uses recorded acknowledgement dates and excludes incomplete registrations', () => {
  const stats = eInvoiceStats([doc, recorded, { ...recorded, extra: { ...recorded.extra, ackDate: '2026-09-30' } }], new Date('2026-09-30T20:00:00Z'));
  assert.equal(stats.recorded, 2); assert.equal(stats.pending, 1); assert.equal(stats.monthValue, 236);
  assert.equal(eInvoiceStats([{ ...recorded, extra: { ...recorded.extra, ackDate: '2026-09-30T20:00:00Z' } }], new Date('2026-10-01T00:00:00Z')).monthValue, 236);
});
test('saved JSON export preserves registration data without exporting internal notes or business credentials', () => {
  const value = eInvoiceRecord({ ...recorded, internalNotes: 'Internal only', businessSettingsSnapshot: { apiKey: 'private' }, customer: { ...doc.customer, accountNumber: 'private' } });
  assert.equal(value.registration.irnNumber, 'a'.repeat(64)); assert.equal(value.totals.finalTotal, 236);
  assert.equal(value.internalNotes, undefined); assert.equal(value.businessSettingsSnapshot, undefined); assert.equal(value.customer.accountNumber, undefined);
  assert.equal(value.recordType, 'saved-e-invoice-record');
});
test('Automobile E-Invoice navigation opens the register and Retail keeps its current form', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items || []).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/e-invoice')); assert.ok(!links('automobile').includes('/billing/e-invoice/new')); assert.ok(links('retail').includes('/billing/e-invoice/new'));
});
