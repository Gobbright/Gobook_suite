import assert from 'node:assert/strict';
import test from 'node:test';
import { filterQuotations, quotationAmounts, quotationStats, quotationStatus, validateQuotationDetails } from '../src/features/categories/automobile/automobileQuotations.js';
import { getSidebarSections } from '../src/constants/navigation.js';

test('Automobile sidebar opens the quotation list while Retail keeps its existing form link', () => {
  const quotationLink = (category) => getSidebarSections(category, { role: 'Super Admin', isSuperAdmin: true }).find((section) => section.title === 'Sales & Bill').items.find((item) => item.label === 'Quotation').href;
  assert.equal(quotationLink('automobile'), '/billing/quotation');
  assert.equal(quotationLink('retail'), '/billing/quotation/new');
});

const quote = { _id: 'quote-1', number: 'QT-1', documentType: 'quotation', customer: { name: 'Kumar Auto' }, meta: { date: '2026-10-17' }, extra: { quotationStatus: 'Accepted', validTill: '2026-10-20' }, items: [{ description: 'Brake Pad', qty: 2, rate: 1000, discount: 10, gstRate: 18 }] };
test('quotation details require a valid expiry date on or after the quote date and a supported status', () => {
  assert.deepEqual(validateQuotationDetails(quote), {});
  assert.ok(validateQuotationDetails({ ...quote, extra: {} }).validTill);
  assert.ok(validateQuotationDetails({ ...quote, extra: { validTill: 'invalid' } }).validTill);
  assert.ok(validateQuotationDetails({ ...quote, extra: { validTill: '2026-10-16' } }).validTill);
  assert.ok(validateQuotationDetails({ ...quote, extra: { ...quote.extra, quotationStatus: 'Unknown' } }).quotationStatus);
});
test('quotation totals treat item discount as a percentage and prefer saved totals including zero', () => {
  assert.deepEqual(quotationAmounts(quote), { subtotal: 2000, lineDiscount: 200, charges: 0, taxable: 1800, gst: 324, overallDiscount: 0, total: 2124 });
  assert.equal(quotationAmounts({ ...quote, totals: { finalTotal: 0 } }).total, 0);
  assert.equal(quotationAmounts({ ...quote, additionalDiscount: { type: 'percent', value: 5 } }).total, 2018);
});
test('statuses derive expiry without overwriting rejected or converted quotations', () => {
  assert.equal(quotationStatus(quote, '2026-10-20'), 'Accepted');
  assert.equal(quotationStatus(quote, '2026-10-21'), 'Expired');
  assert.equal(quotationStatus({ ...quote, extra: { ...quote.extra, convertedInvoiceId: 'bill' } }, '2026-10-21'), 'Converted');
  assert.equal(quotationStatus({ ...quote, extra: { ...quote.extra, quotationStatus: 'Rejected' } }, '2026-10-21'), 'Rejected');
  assert.equal(quotationStatus({}), 'Draft');
});
test('filters combine customer, dates, query and status; statistics use actual records', () => {
  const sent = { ...quote, _id: 'quote-2', customer: { name: 'Ramesh Motors' }, extra: { quotationStatus: 'Sent' } };
  assert.equal(filterQuotations([quote, sent], { customer: 'Kumar Auto', search: 'qt-1', status: 'Accepted', from: '2026-10-17', to: '2026-10-17' }, '2026-10-17').length, 1);
  assert.equal(filterQuotations([quote], { from: '2026-10-18' }, '2026-10-17').length, 0);
  assert.deepEqual(quotationStats([quote, sent], '2026-10-17'), { total: 2, value: 4248, awaiting: 1, accepted: 1, expiring: 1 });
  assert.deepEqual(quotationStats([], '2026-10-17'), { total: 0, value: 0, awaiting: 0, accepted: 0, expiring: 0 });
});
