import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileInvoices, reconciliationTotals } from '../src/services/reconciliationMatching.js';
const invoice = (id, values = {}) => ({ id, gstin: '33AAAAA1111A1Z5', invoiceNo: 'INV-1', date: '2026-11-03', taxable: 1000, gst: 180, ...values });
test('exact matches require identity, date, taxable and GST; missing fields are not zero', () => {
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p')])[0].status, 'matched');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { taxable: null })])[0].status, 'partial');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { date: '' })])[0].status, 'partial');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { date: '2026-11-04' })])[0].status, 'partial');
  assert.equal(reconcileInvoices([invoice('b', { gst: 0 })], [])[0].status, 'not_in_2b');
  assert.equal(reconcileInvoices([], [invoice('p', { taxable: null })])[0].taxableDifference, null);
});
test('small amount differences are partial; significant taxable, GST and head differences mismatch', () => {
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { gst: 179.5 })])[0].status, 'partial');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { taxable: 900 })])[0].status, 'mismatch');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { gst: 170 })])[0].status, 'mismatch');
  assert.equal(reconcileInvoices([invoice('b', { igst: 180, cgst: 0 })], [invoice('p', { igst: 0, cgst: 180 })])[0].status, 'mismatch');
});
test('probable candidates normalize punctuation or use equal amounts within seven days', () => {
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { invoiceNo: 'INV/1' })])[0].status, 'probable');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { invoiceNo: 'OTHER', date: '2026-11-09' })])[0].status, 'probable');
  assert.equal(reconcileInvoices([invoice('b')], [invoice('p', { invoiceNo: 'OTHER', date: '2026-11-20' })])[0].status, 'not_in_2b');
});
test('supplier identity and duplicate records prevent unsafe automatic linking', () => {
  const foreign = reconcileInvoices([invoice('b')], [invoice('p', { gstin: '33BBBBB2222B1Z5' })]);
  assert.deepEqual(foreign.map(row => row.status), ['not_in_2b', 'not_in_books']);
  const duplicate = reconcileInvoices([invoice('b')], [invoice('p1'), invoice('p2')]);
  assert.equal(duplicate[0].ambiguous, true); assert.equal(duplicate[0].portal, null);
  assert.equal(duplicate.filter(row => row.duplicate).length, 2);
  const result = reconcileInvoices([invoice('b1'), invoice('b2')], [invoice('p')]);
  assert.equal(result.filter(row => row.portal).length, 1); assert.equal(result[0].duplicate, true);
});
test('manual links are one-to-one, keep differences and can be excluded after unlinking', () => {
  const b = invoice('b'), p = invoice('p', { gstin: '33BBBBB2222B1Z5' });
  const linked = reconcileInvoices([b], [p], { links: [{ bookId: 'b', portalId: 'p', note: 'Reviewed' }] });
  assert.equal(linked.length, 1); assert.equal(linked[0].manual, true); assert.equal(linked[0].status, 'mismatch');
  const blocked = reconcileInvoices([b], [invoice('p')], { blocked: [{ bookId: 'b', portalId: 'p' }] });
  assert.deepEqual(blocked.map(row => row.status), ['not_in_2b', 'not_in_books']);
});
test('acceptance and ITC decisions invalidate when an invoice changes; totals never infer eligibility', () => {
  const b = invoice('b'), p = invoice('p'), initial = reconcileInvoices([b], [p])[0];
  const workspace = { decisions: [{ id: initial.id, fingerprint: initial.fingerprint, resolution: 'accepted', eligibility: 'eligible' }] };
  const reviewed = reconcileInvoices([b], [p], workspace);
  assert.equal(reconciliationTotals(reviewed).eligibleBooks, 180);
  const changed = reconcileInvoices([{ ...b, taxable: 1100 }], [p], workspace);
  assert.equal(changed[0].resolution, 'none'); assert.equal(changed[0].eligibility, 'review'); assert.equal(changed[0].reviewInvalidated, true);
  assert.equal(reconciliationTotals(changed).eligibleBooks, 0);
  assert.equal(reconciliationTotals(reconcileInvoices([b], [p])).eligibleBooks, 0);
});
