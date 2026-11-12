import assert from 'node:assert/strict';
import test from 'node:test';
import { assertConvertibleQuotation } from '../src/services/quotationConversion.js';

test('conversion requires an accepted unexpired quotation and prevents repeat conversion', () => {
  const quote = { documentType: 'quotation', extra: { quotationStatus: 'Accepted', validTill: '2026-10-20' } };
  assert.doesNotThrow(() => assertConvertibleQuotation(quote, '2026-10-20'));
  for (const invalid of [null, { ...quote, documentType: 'invoice' }, { ...quote, extra: { quotationStatus: 'Draft' } }, { ...quote, extra: { ...quote.extra, convertedInvoiceId: 'bill' } }]) assert.throws(() => assertConvertibleQuotation(invalid, '2026-10-17'));
  assert.throws(() => assertConvertibleQuotation(quote, '2026-10-21'), { statusCode: 400 });
});
