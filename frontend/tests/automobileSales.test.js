import assert from 'node:assert/strict';
import test from 'node:test';
import { automobileHistoryRow, automobilePaymentRows, isAutomobileInvoice, matchingAutomobileProducts, validateAutomobileBill } from '../src/features/categories/automobile/automobileSales.js';

test('bills require a customer, number, date and complete positive-value rows', () => {
  const valid = { customer: { name: 'Kumar Auto' }, meta: { number: 'SI-24', date: '2026-10-17' }, items: [{ description: 'Brake Pad', qty: 1, rate: 200, discount: 0 }] };
  assert.deepEqual(validateAutomobileBill(valid), {});
  assert.deepEqual(Object.keys(validateAutomobileBill({})), ['customerName', 'invoiceNumber', 'invoiceDate', 'items']);
  for (const patch of [{ description: ' ' }, { qty: 0 }, { qty: -1 }, { qty: Infinity }, { rate: '' }, { rate: 0 }, { rate: -1 }, { rate: NaN }, { discount: 101 }]) {
    assert.ok(Object.keys(validateAutomobileBill({ ...valid, items: [{ ...valid.items[0], ...patch }] })).length > 0, JSON.stringify(patch));
  }
  assert.ok(validateAutomobileBill({ ...valid, items: [...valid.items, { description: '', qty: 1, rate: 10 }] }).item_name_1);
});

test('Automobile layout applies only to Automobile invoices', () => {
  assert.equal(isAutomobileInvoice('automobile', 'invoice'), true);
  for (const category of ['retail', 'hospital', 'finance']) assert.equal(isAutomobileInvoice(category, 'invoice'), false);
  for (const documentType of ['quotation', 'purchase-entry', 'sales-return']) assert.equal(isAutomobileInvoice('automobile', documentType), false);
});

test('Bills accept rupee discounts up to the line value and retain percentage limits', () => {
  const bill = { customer: { name: 'Kumar Auto' }, meta: { number: 'SI-24', date: '2026-10-24' } };
  const item = { description: 'Brake Pad', qty: 2, rate: 250, discountType: 'amount', discount: 150 };
  assert.deepEqual(validateAutomobileBill({ ...bill, items: [item] }), {});
  assert.deepEqual(validateAutomobileBill({ ...bill, items: [{ ...item, discount: 500 }] }), {});
  for (const patch of [{ discount: 501 }, { discount: -1 }, { discount: Infinity }, { discountType: 'percent', discount: 101 }]) {
    assert.ok(validateAutomobileBill({ ...bill, items: [{ ...item, ...patch }] }).item_discount_0);
  }
});

const products = [
  { description: 'Swift Brake Pad', itemType: 'Product', partNumber: 'BP-SET-001', compatibleModel: 'Maruti Suzuki Swift', status: 'Active' },
  { description: 'Universal Engine Oil', code: 'OIL-3L', itemType: 'Product', compatibleModel: 'Universal', status: 'Active' },
  { description: 'Innova Filter', itemType: 'Product', compatibleModel: 'Toyota Innova', status: 'Active' },
  { description: 'Wheel Alignment', itemType: 'Service', code: 'SRV-ALIGN', status: 'Active' },
  { description: 'Inactive Swift Part', itemType: 'Product', status: 'Inactive' },
];

test('parts search matches names, part numbers and compatibility without mixing services', () => {
  assert.deepEqual(matchingAutomobileProducts(products, { query: 'bp-set' }).map((product) => product.description), ['Swift Brake Pad']);
  assert.deepEqual(matchingAutomobileProducts(products, { vehicleModel: 'Swift', compatibleOnly: true }).map((product) => product.description), ['Swift Brake Pad', 'Universal Engine Oil']);
  assert.deepEqual(matchingAutomobileProducts(products, { type: 'Service', query: 'align' }).map((product) => product.description), ['Wheel Alignment']);
});

test('zero received amount never becomes a full payment', () => {
  assert.equal(automobilePaymentRows('cash', '', [])[0].amount, 0);
  assert.equal(automobilePaymentRows('cash', '0', [])[0].amount, 0);
  assert.equal(automobilePaymentRows('cash', '200', [])[0].amount, 200);
  assert.equal(automobilePaymentRows('cash', '-20', [])[0].amount, 0);
  assert.deepEqual(automobilePaymentRows('cash', '200', [{ id: 'cash', amount: 100 }, { id: 'card', amount: 100 }, { id: 'credit', amount: 500 }]), [{ id: 'cash', amount: 100 }, { id: 'card', amount: 100 }]);
});

test('bill history uses server balances, credits and lifecycle status', () => {
  const invoice = { _id: 'bill', number: 'SI-24', customer: { name: 'Kumar Auto' }, invoiceTotal: 1000, totalPaid: 200, balance: 600, payStatus: 'Partially Paid', items: [{ qty: 2 }], extra: { vehicleMake: 'Maruti', vehicleModel: 'Swift', vehicleNumber: 'TN 37 AB 1234' } };
  const row = automobileHistoryRow(invoice);
  assert.equal(row.balance, 600);
  assert.equal(row.received, 200);
  assert.equal(row.vehicle, 'Maruti · Swift · TN 37 AB 1234');
  assert.equal(automobileHistoryRow({ ...invoice, lifecycleStatus: 'draft' }).status, 'Draft');
  assert.equal(automobileHistoryRow({ ...invoice, lifecycleStatus: 'cancelled' }).status, 'Cancelled');
});
