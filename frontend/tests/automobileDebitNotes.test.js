import assert from 'node:assert/strict';
import test from 'node:test';
import { debitAmounts, debitRevisedTotal, debitStats, debitStatus, filterDebitNotes, resolveDebitInvoice } from '../src/features/categories/automobile/automobileDebitNotes.js';
import { getSidebarSections } from '../src/constants/navigation.js';
const note = { number: 'DN-01', meta: { date: '2026-10-01' }, customer: { name: 'Auto Parts' }, extra: { originalInvoiceNo: 'INV-01', reason: 'Freight' }, items: [{ description: 'Delivery', qty: 1, rate: 2000, gstRate: 0 }], charges: [{ label: 'Handling', amount: 500 }], accounting: { posted: true } };
test('debit value includes lines, charges, discounts and tax; revised total requires a real invoice', () => {
  assert.equal(debitAmounts(note).finalTotal, 2500); assert.equal(debitRevisedTotal(note, null), null);
  assert.equal(debitRevisedTotal(note, { totals: { finalTotal: 32300 } }), 34800);
  assert.equal(debitRevisedTotal(note, { totals: { finalTotal: 0 } }), 2500);
});
test('issued status requires accounting evidence and posted records take precedence over stale draft metadata', () => {
  assert.equal(debitStatus(note), 'Issued'); assert.equal(debitStatus({ ...note, lifecycleStatus: 'draft' }), 'Issued');
  assert.equal(debitStatus({ lifecycleStatus: 'posted' }), 'Posting Not Recorded');
  assert.equal(debitStatus({ accounting: { posted: false } }), 'Not Posted');
});
test('filters combine date, customer, invoice and charge/reason search', () => {
  assert.deepEqual(filterDebitNotes([note], { search: 'handling', customer: 'Auto Parts', status: 'Issued', from: '2026-10-01', to: '2026-10-02' }), [note]);
  assert.deepEqual(filterDebitNotes([note], { search: 'INV-01' }), [note]);
  assert.deepEqual(filterDebitNotes([note], { status: 'Draft' }), []);
});
test('monthly additional value uses issued records and the India business month', () => {
  const stats = debitStats([note, { ...note, accounting: { posted: false } }], new Date('2026-09-30T20:00:00Z'));
  assert.equal(stats.monthly, 2500); assert.equal(stats.issued, 1); assert.equal(stats.pending, 1);
});
test('invoice lookup uses a scoped ID when available', async () => {
  const invoice = { _id: 'id-1', documentType: 'invoice', totals: { finalTotal: 100 } };
  assert.equal(await resolveDebitInvoice({ ...note, extra: { originalSalesId: 'id-1' } }, { getInvoice: async (id) => { assert.equal(id, 'id-1'); return invoice; } }), invoice);
});
test('legacy number lookup rejects partial and ambiguous matches and respects branch', async () => {
  const invoice = { _id: '1', number: 'INV-01', documentType: 'invoice', branch: 'Main' };
  assert.equal(await resolveDebitInvoice({ ...note, branch: 'Main' }, { listInvoices: async () => ({ data: [{ ...invoice, number: 'INV-010' }, invoice], total: 2 }) }), invoice);
  await assert.rejects(resolveDebitInvoice(note, { listInvoices: async () => ({ data: [invoice, { ...invoice, _id: '2' }], total: 2 }) }), /More than one/);
  await assert.rejects(resolveDebitInvoice(note, { listInvoices: async () => ({ data: [{ ...invoice, number: 'INV-010' }], total: 1 }) }), /unavailable/);
});
test('invoice lookup continues across pages and handles absent references', async () => {
  let calls = 0;
  const invoice = { number: 'INV-01', totals: { finalTotal: 10 } };
  assert.equal(await resolveDebitInvoice(note, { listInvoices: async () => ++calls === 1 ? { data: [{ number: 'OTHER' }], total: 2 } : { data: [invoice], total: 2 } }), invoice);
  assert.equal(calls, 2); await assert.rejects(resolveDebitInvoice({}, {}), /No linked invoice/);
});
test('Automobile Debit Note navigation opens its register and Retail keeps its original creation link', () => {
  const links = (category) => getSidebarSections(category, { accountType: 'owner', role: 'Owner' }).flatMap((section) => section.items || []).map((item) => item.href);
  assert.ok(links('automobile').includes('/billing/debit-note')); assert.ok(!links('automobile').includes('/billing/debit-note/new')); assert.ok(links('retail').includes('/billing/debit-note/new'));
});
