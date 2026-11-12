import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAutomobileBill, assertAutomobileQuotation } from '../src/services/automobileBillValidation.js';

const valid = { documentType: 'invoice', customer: { name: 'Kumar Auto' }, number: 'SI-24', meta: { date: '2026-10-17' }, items: [{ description: 'Brake Pad', qty: 1, rate: 200 }] };

test('Automobile rejects empty bills, including drafts, and incomplete rows', () => {
  for (const lifecycleStatus of ['draft', 'posted']) {
    for (const patch of [{ customer: {} }, { number: ' ' }, { meta: {} }, { items: [] }, { items: [{ description: ' ', qty: 1, rate: 2 }] }, { items: [{ description: 'Part', qty: 0, rate: 2 }] }, { items: [{ description: 'Part', qty: 1, rate: '' }] }]) {
      assert.throws(() => assertAutomobileBill({ ...valid, lifecycleStatus, ...patch }, 'automobile'), { statusCode: 400 });
    }
    assert.doesNotThrow(() => assertAutomobileBill({ ...valid, lifecycleStatus }, 'automobile'));
  }
});

test('Automobile validation leaves other categories and document types unchanged', () => {
  assert.doesNotThrow(() => assertAutomobileBill({}, 'retail'));
  assert.doesNotThrow(() => assertAutomobileBill({ documentType: 'quotation' }, 'automobile'));
});

test('Automobile quotations require complete rows and a valid expiry date', () => {
  const quote = { ...valid, documentType: 'quotation', extra: { validTill: '2026-10-24', quotationStatus: 'Draft' } };
  assert.doesNotThrow(() => assertAutomobileQuotation(quote, 'automobile'));
  for (const patch of [{ items: [] }, { customer: {} }, { extra: {} }, { extra: { validTill: '2026-10-16' } }, { extra: { validTill: 'bad-date' } }, { extra: { ...quote.extra, quotationStatus: 'Invalid' } }]) {
    assert.throws(() => assertAutomobileQuotation({ ...quote, ...patch }, 'automobile'), { statusCode: 400 });
  }
  assert.doesNotThrow(() => assertAutomobileQuotation({ documentType: 'quotation' }, 'retail'));
});
