import test from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoiceQuantity, getInvoiceQuantitySummary } from '../src/utils/invoiceQuantitySummary.js';

test('invoice quantities are grouped by normalized UQC without combining different units', () => {
  assert.deepEqual(getInvoiceQuantitySummary([
    { qty: 4, unit: 'Nos' }, { qty: '6', uqc: ' NOS ' },
    { qty: 1.25, unit: 'kg' }, { qty: 0.5, unit: 'KG' },
  ]), [{ unit: 'NOS', quantity: 10 }, { unit: 'KG', quantity: 1.75 }]);
});

test('PDF summaries use raw quantities rather than locale-formatted display values', () => {
  assert.deepEqual(getInvoiceQuantitySummary([
    { qty: '1,000', quantityValue: 1000 }, { qty: '2', unit: 'NOS' },
  ]), [{ unit: 'NOS', quantity: 1002 }]);
});

test('empty and invalid quantities do not create summary rows', () => {
  assert.deepEqual(getInvoiceQuantitySummary(), []);
  assert.deepEqual(getInvoiceQuantitySummary([{ qty: 0 }, { qty: 'invalid' }, { qty: Infinity }]), []);
});

test('fractional quantities avoid floating-point artifacts and unnecessary decimals', () => {
  const [row] = getInvoiceQuantitySummary([{ qty: 0.1 }, { qty: 0.2 }]);
  assert.equal(row.quantity, 0.3);
  assert.equal(formatInvoiceQuantity(row.quantity), '0.3');
  assert.equal(formatInvoiceQuantity(10), '10');
});
