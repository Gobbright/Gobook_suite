import assert from 'node:assert/strict';
import test from 'node:test';
import { creditAmounts, creditHistory, creditPrintDocument, creditStats, creditStatus, filterCreditNotes } from '../src/features/categories/automobile/automobileCreditNotes.js';
import { getSidebarSections } from '../src/constants/navigation.js';

const notes = [
  { _id: '1', number: 'CRN-001', meta: { date: '2026-10-01' }, customer: { name: 'Auto Parts', city: 'Chennai' }, items: [{ description: 'Brake pad', qty: 2, rate: 100, discountType: 'amount', discount: 20, gstRate: 18 }], extra: { originalInvoiceNo: 'INV-001', reason: 'Price adjustment' }, accounting: { posted: true, postedAt: '2026-10-01T04:00:00Z', voucherNo: 'V-001' }, createdAt: '2026-10-01T03:00:00Z' },
  { _id: '2', number: 'CRN-002', meta: { date: '2026-09-30' }, customer: { name: 'Motor Care' }, items: [], totals: { finalTotal: 50 }, accounting: { posted: false } },
];
test('credit amounts support fixed discounts, charges and a saved zero total', () => {
  const value = creditAmounts(notes[0]); assert.equal(value.taxable, 180); assert.equal(value.totalGst, 32.4); assert.equal(value.finalTotal, 212);
  const charge = creditAmounts({ ...notes[0], charges: [{ amount: 100, gstRate: 5 }], additionalDiscount: { type: 'percent', value: 10 } });
  assert.equal(charge.chargesGst, 5); assert.equal(charge.finalTotal, 286);
  assert.equal(creditAmounts({ ...notes[0], totals: { finalTotal: 0 } }).finalTotal, 0);
});
test('posting status uses accounting evidence and never invents approval', () => {
  assert.equal(creditStatus(notes[0]), 'Posted'); assert.equal(creditStatus(notes[1]), 'Not Posted');
  assert.equal(creditStatus({ lifecycleStatus: 'posted' }), 'Posting Not Recorded');
  assert.equal(creditStatus({ ...notes[0], lifecycleStatus: 'cancelled' }), 'Cancelled');
});
test('filters combine invoice/reason search, customer, date and posting status', () => {
  assert.deepEqual(filterCreditNotes(notes, { search: 'inv-001', customer: 'Auto Parts', status: 'Posted', from: '2026-10-01', to: '2026-10-02' }), [notes[0]]);
  assert.deepEqual(filterCreditNotes(notes, { search: 'price adjustment' }), [notes[0]]);
  assert.deepEqual(filterCreditNotes(notes, { from: '2026-10-02', to: '2026-10-01' }), []);
});
test('monthly issued count uses India business month and actual posting evidence', () => {
  const stats = creditStats(notes, new Date('2026-09-30T20:00:00Z'));
  assert.equal(stats.posted, 1); assert.equal(stats.pending, 1); assert.equal(stats.issued, 1); assert.equal(stats.value, 262);
});
test('document history contains only recorded times and events', () => {
  assert.deepEqual(creditHistory({}), []);
  assert.deepEqual(creditHistory(notes[0]).map((event) => event.label), ['Accounting posted', 'Credit note created']);
});
test('printing normalizes a fixed discount for existing PDF rendering without changing the source', () => {
  const doc = creditPrintDocument(notes[0]); assert.equal(doc.items[0].discount, 10); assert.equal(doc.totals.finalTotal, 212);
  assert.equal(notes[0].items[0].discount, 20); assert.equal(notes[0].items[0].discountType, 'amount');
});
test('Automobile Credit Note sidebar opens its register while Retail keeps its creation link', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items || []).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/credit-note')); assert.ok(!links('automobile').includes('/billing/credit-note/new')); assert.ok(links('retail').includes('/billing/credit-note/new'));
});
