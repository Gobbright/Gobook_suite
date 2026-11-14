import test from 'node:test';
import assert from 'node:assert/strict';
import { gstr1Category } from '../src/services/gstr1Categories.js';
const invoice = { documentType: 'invoice', invoiceType: 'regular', date: '2026-11-05', supplyType: 'interstate', value: 100001 };
test('B2C Large uses interstate gross invoice value and period-specific threshold', () => {
  assert.equal(gstr1Category(invoice), 'b2cl');
  assert.equal(gstr1Category({ ...invoice, value: 100000 }), 'b2cs');
  assert.equal(gstr1Category({ ...invoice, supplyType: 'intrastate' }), 'b2cs');
  assert.equal(gstr1Category({ ...invoice, date: '2024-07-31' }), 'b2cs');
  assert.equal(gstr1Category({ ...invoice, date: '2024-07-31', value: 250001 }), 'b2cl');
  assert.equal(gstr1Category({ ...invoice, date: '2024-08-01' }), 'b2cl');
});
test('exports and notes remain separate from registered and unregistered sales', () => {
  assert.equal(gstr1Category({ ...invoice, gstin: '33AAACT1234A1Z5' }), 'b2b');
  assert.equal(gstr1Category({ ...invoice, invoiceType: 'export-wop' }), 'exports');
  assert.equal(gstr1Category({ ...invoice, gstin: '33AAACT1234A1Z5', invoiceType: 'export-wp' }), 'exports');
  assert.equal(gstr1Category({ ...invoice, invoiceType: 'export-wp', documentType: 'credit-note' }), 'notes');
  assert.equal(gstr1Category({ ...invoice, documentType: 'debit-note' }), 'notes');
  assert.equal(gstr1Category({ ...invoice, advanceReceived: 20000 }), 'b2cl');
});
test('missing source date uses the selected return period for the threshold', () => {
  assert.equal(gstr1Category({ ...invoice, date: '' }, 'July 2024'), 'b2cs');
  assert.equal(gstr1Category({ ...invoice, date: '' }, 'August 2024'), 'b2cl');
});
