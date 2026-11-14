import assert from 'node:assert/strict';
import test from 'node:test';
import { assertBillingCustomerMobile } from '../src/services/customerMobile.js';

test('both billing modes require valid customer mobiles for creates and updates', () => {
  for (const billingMode of ['b2b', 'b2c']) {
    for (const documentType of ['invoice', 'bill-of-supply', 'pharmacy-bill']) {
      const bill = { documentType, extra: { billingMode } };
      assert.throws(() => assertBillingCustomerMobile(bill), error => error.statusCode === 400 && /required/.test(error.message));
      assert.throws(() => assertBillingCustomerMobile({ ...bill, customer: { phone: '123' } }), error => error.statusCode === 400);
      for (const phone of ['9876543210', '+91 98765 43210', '09876543210']) assert.doesNotThrow(() => assertBillingCustomerMobile({ ...bill, customer: { phone } }));
    }
  }
});

test('billing requirement does not change purchase documents or legacy imports', () => {
  assert.doesNotThrow(() => assertBillingCustomerMobile({ documentType: 'purchase-entry', extra: { billingMode: 'b2b' } }));
  assert.doesNotThrow(() => assertBillingCustomerMobile({ documentType: 'invoice', extra: {} }));
});
