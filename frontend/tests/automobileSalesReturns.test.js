import assert from 'node:assert/strict';
import test from 'node:test';
import { filterSalesReturns, returnAmounts, returnItemStatus, returnLineAvailability, returnLineKey, returnState, returnStatus, returnStockStatus, salesReturnStats, validateReturnRequest } from '../src/features/categories/automobile/automobileSalesReturns.js';
import { getSidebarSections } from '../src/constants/navigation.js';

const note = { _id: 'return-1', number: 'SR-2407', documentType: 'sales-return', meta: { date: '2026-10-17' }, returnStatus: 'requested', customer: { name: 'Kumar Automobiles', phone: '9876543210' }, extra: { originalInvoiceNo: 'SI-2416' }, items: [{ description: 'Brake Pad', qty: 2, rate: 1000, discount: 10, gstRate: 18, itemType: 'Product' }] };

const source = { _id: 'invoice-1', customer: note.customer, items: [{ ...note.items[0], id: 'source-line', soldQty: 4, returnedQty: 1, remainingQty: 3, qty: 4 }] };
const request = { customer: note.customer, meta: { number: 'SR-001', date: '2026-10-17' }, extra: { originalSalesId: 'invoice-1', originalInvoiceDate: '2026-10-15', reason: 'Wrong part' }, items: [{ ...note.items[0], id: 1 }], source };
test('new return form requires its original invoice, reason, valid date, matching customer and returnable rows', () => {
  assert.deepEqual(validateReturnRequest(request), {});
  for (const patch of [{ source: null }, { extra: {} }, { items: [] }, { meta: { number: '', date: '2026-10-17' } }, { meta: { number: 'SR-1', date: '2026-02-30' } }, { meta: { number: 'SR-1', date: '2026-10-14' } }, { customer: { name: 'Another customer' } }, { items: [{ ...request.items[0], qty: 0 }] }, { items: [{ ...request.items[0], qty: 4 }] }, { items: [{ ...request.items[0], rate: 999 }] }, { items: [{ ...request.items[0], gstRate: 5 }] }, { items: [{ ...request.items[0], size: 'Wrong variant' }] }]) assert.ok(Object.keys(validateReturnRequest({ ...request, ...patch })).length > 0);
});
test('return capacity aggregates duplicate lines and keeps original discount identity', () => {
  const lines = [{ ...request.items[0], id: 1, qty: 2 }, { ...request.items[0], id: 2, qty: 2 }];
  assert.equal(returnLineAvailability(lines[0], source.items, lines).maximum, 1);
  assert.ok(validateReturnRequest({ ...request, items: lines }).item_qty_1);
  assert.deepEqual(validateReturnRequest({ ...request, items: [{ ...lines[0], qty: 1 }, lines[1]] }), {});
  assert.equal(returnLineKey({ ...source.items[0], discountType: 'amount', discount: 400 }), returnLineKey(source.items[0]));
  assert.equal(returnLineAvailability(request.items[0], source.items, request.items).returned, 1);
});

test('return amounts preserve server totals and correctly handle percent and fixed discounts', () => {
  assert.deepEqual(returnAmounts(note), { taxable: 1800, gst: 324, total: 2124 });
  assert.deepEqual(returnAmounts({ ...note, totals: { taxable: 0, totalGst: 0, finalTotal: 0 } }), { taxable: 0, gst: 0, total: 0 });
  assert.equal(returnAmounts({ ...note, items: [{ ...note.items[0], discountType: 'amount', discount: 100 }] }).total, 2242);
  assert.equal(returnAmounts({ ...note, additionalDiscount: { type: 'percent', value: 5 } }).total, 2018);
});
test('stock and approval statuses reflect recorded inspection quantities without inventing legacy approvals', () => {
  assert.equal(returnStockStatus(note), 'To Receive');
  assert.equal(returnStockStatus({ ...note, returnStatus: 'received' }), 'To Inspect');
  assert.equal(returnItemStatus(note, note.items[0]).label, 'Pending Inspection');
  const completed = { ...note, returnStatus: 'completed' };
  assert.equal(returnStockStatus(completed), 'Not Recorded');
  assert.equal(returnItemStatus(completed, note.items[0]).label, 'Not Recorded');
  for (const [restockQty, expected] of [[0, 'Not Restocked'], [1, 'Partly Restocked'], [2, 'Restocked']]) assert.equal(returnStockStatus({ ...completed, items: [{ ...note.items[0], restockQty }] }), expected);
  assert.equal(returnItemStatus(completed, { ...note.items[0], restockQty: 0 }).label, 'Not Approved');
  assert.equal(returnStockStatus({ ...completed, items: [{ ...note.items[0], itemType: 'Service' }] }), 'No Stock Movement');
  assert.equal(returnItemStatus(note, { itemType: 'Service' }).label, 'Service');
  assert.equal(returnState({}), 'completed');
  assert.equal(returnStatus({}), 'Completed');
});
test('return filters combine original invoice search, customer, dates, workflow and stock view', () => {
  assert.equal(filterSalesReturns([note], { search: 'si-2416', customer: 'Kumar Automobiles', status: 'requested', from: '2026-10-17', to: '2026-10-17', view: 'pending' }).length, 1);
  for (const filters of [{ customer: 'Other' }, { status: 'completed' }, { from: '2026-10-18' }, { view: 'Restocked' }, { search: 'no match' }]) assert.equal(filterSalesReturns([note], filters).length, 0);
});
test('summary counts and seven-day trends use actual saved records', () => {
  const received = { ...note, _id: 'return-2', returnStatus: 'received' };
  const completed = { ...note, _id: 'return-3', returnStatus: 'completed', meta: { date: '2026-10-10' } };
  const stats = salesReturnStats([note, received, completed], '2026-10-17');
  assert.equal(stats.total, 3); assert.equal(stats.value, 6372); assert.equal(stats.review, 1); assert.equal(stats.ready, 1); assert.equal(stats.completed, 1);
  assert.deepEqual(stats.trends.total, [0, 0, 0, 0, 0, 0, 2]);
  assert.equal(salesReturnStats([], '2026-10-17').total, 0);
});
test('Automobile Sales Return sidebar opens its register while other categories keep their creation link', () => {
  const path = (category) => getSidebarSections(category, { role: 'Super Admin', isSuperAdmin: true }).find((section) => section.title === 'Sales & Bill').items.find((item) => item.label === 'Sales Return').href;
  assert.equal(path('automobile'), '/billing/sales-return');
  assert.equal(path('retail'), '/billing/sales-return/new');
});
