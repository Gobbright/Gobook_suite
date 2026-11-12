import test from 'node:test';
import assert from 'node:assert/strict';
import { withDocumentWorkflow } from '../src/modules/retail/sales/shared/documentWorkflow.js';

test('Automobile Sales and Purchase documents use Electronics without changing business identity', () => {
  const settings = { businessName: 'Auto Parts', retailSubcategory: '', gstin: 'GST' };
  for (const type of ['invoice', 'quotation', 'sales-return', 'delivery-challan', 'credit-note', 'debit-note', 'e-invoice', 'e-way-bill', 'purchase-order', 'purchase-entry', 'supplier-return']) {
    assert.deepEqual(withDocumentWorkflow(settings, 'automobile', type), { ...settings, documentWorkflow: 'electronics-technology' });
  }
  assert.equal(settings.documentWorkflow, undefined);
});

test('other categories and modules retain their workflow', () => {
  const settings = { retailSubcategory: 'fashion' };
  assert.equal(withDocumentWorkflow(settings, 'retail', 'purchase-entry'), settings);
  assert.equal(withDocumentWorkflow(settings, 'automobile', 'stock-in'), settings);
});
