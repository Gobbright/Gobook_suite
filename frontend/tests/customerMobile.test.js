import assert from 'node:assert/strict';
import test from 'node:test';
import { customerMobileDigits, customerMobileError } from '../src/utils/customerMobile.js';

test('customer mobiles accept local numbers and formatted India prefixes', () => {
  for (const value of ['9876543210', '+91 98765 43210', '919876543210', '09876543210']) {
    assert.equal(customerMobileDigits(value), '9876543210');
    assert.equal(customerMobileError(value), '');
  }
});

test('customer mobiles reject missing, incomplete and non-phone values', () => {
  assert.match(customerMobileError(''), /required/);
  for (const value of ['98765', '987654321012345', 'abc9876543210', 'customer name']) assert.match(customerMobileError(value), /valid/);
});
