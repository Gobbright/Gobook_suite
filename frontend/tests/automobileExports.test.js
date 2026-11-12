import test from 'node:test';
import assert from 'node:assert/strict';
import { availableExportKeys, EXPORT_CATEGORIES } from '../src/features/categories/automobile/automobileExports.js';
test('export category selection only requests collections available in the account summary', () => {
  assert.equal(EXPORT_CATEGORIES.length, 10);
  assert.deepEqual(availableExportKeys('inventory', [{ key: 'products' }, { key: 'customers' }, { key: 'stockOut' }]), ['products', 'stockOut']);
  assert.deepEqual(availableExportKeys('missing', [{ key: 'products' }]), []);
});
test('employee export does not include login credential collections', () => {
  assert.equal(EXPORT_CATEGORIES.find((row) => row.key === 'employee').collections.includes('employeeLogins'), false);
});
