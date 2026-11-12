import assert from 'node:assert/strict';
import test from 'node:test';
import { documentPaymentRows } from '../src/features/categories/retail/modules/sales/shared/documentPayments.js';

const payment = { category: 'automobile', documentType: 'invoice', method: 'bank', amount: '250', total: 1000 };

test('sales documents and purchase entries use the same settled-document payment workflow', () => {
  for (const documentType of ['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice', 'purchase-entry']) {
    assert.deepEqual(documentPaymentRows({ ...payment, documentType }), [{ id: 'bank', amount: 250, reference: '' }]);
    assert.equal(documentPaymentRows({ ...payment, documentType, amount: '' })[0].amount, 0);
    assert.equal(documentPaymentRows({ ...payment, documentType, amount: '0' })[0].amount, 0);
  }
});

test('drafts, credit sales and unsupported documents cannot create a payment record', () => {
  assert.deepEqual(documentPaymentRows({ ...payment, saveAsDraft: true }), []);
  assert.deepEqual(documentPaymentRows({ ...payment, method: 'credit' }), []);
  assert.deepEqual(documentPaymentRows({ ...payment, method: null }), []);
  for (const documentType of ['quotation', 'purchase-order', 'delivery-challan', 'sales-return', 'supplier-return', 'credit-note', 'debit-note', 'e-way-bill']) {
    assert.deepEqual(documentPaymentRows({ ...payment, documentType }), []);
  }
});

test('split receipts preserve their reference and exclude credit and empty rows', () => {
  const splits = [{ id: 'bank', amount: 100, reference: 'UTR123' }, { id: 'cash', amount: 150 }, { id: 'credit', amount: 750 }, { id: 'card', amount: '' }];
  assert.deepEqual(documentPaymentRows({ ...payment, documentType: 'e-invoice', splits }), splits.slice(0, 2));
});

test('existing retail receipt defaults and references remain available', () => {
  assert.deepEqual(documentPaymentRows({ ...payment, category: 'retail', amount: '', reference: 'UTR456' }), [{ id: 'bank', amount: 1000, reference: 'UTR456' }]);
});
