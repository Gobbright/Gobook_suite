import test from 'node:test';
import assert from 'node:assert/strict';
import { deletionCollections, deletionPeriodLabel, deletionSelection } from '../src/features/categories/automobile/automobileDeletePeriod.js';
const collections = [{ key: 'businessSettings', deletable: false }, { key: 'invoices', label: 'Invoices & Billing', count: 10 }, { key: 'products', count: 5 }];
test('default and explicit deletion selection always exclude protected collections', () => {
  assert.deepEqual(deletionSelection(collections, null).map((row) => row.key), ['invoices', 'products']);
  assert.equal(deletionSelection(collections, ['businessSettings']).length, 0);
  assert.equal(deletionSelection(collections, []).length, 0);
});
test('category grouping returns source collections without pretending billing subtypes are separate collections', () => {
  assert.deepEqual(deletionCollections(collections, 'sales').map((row) => row.key), ['invoices']);
  assert.deepEqual(deletionCollections(collections, 'purchase').map((row) => row.key), ['invoices']);
  assert.equal(deletionCollections(collections, 'all').length, 3);
});
test('period labels distinguish full-year and selected-month deletion scopes', () => {
  assert.equal(deletionPeriodLabel('2026', ''), 'Full Year 2026');
  assert.equal(deletionPeriodLabel('2026', '10'), 'October 2026');
});
