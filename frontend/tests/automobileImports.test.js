import test from 'node:test';
import assert from 'node:assert/strict';
import { importCollectionPreview, importCompletionStatus, inspectImportBackup } from '../src/features/categories/automobile/automobileImports.js';

test('backup inspection accepts GoBook record backups and rejects unsupported shapes', () => {
  const backup = inspectImportBackup(JSON.stringify({ meta: { app: 'GoBook' }, data: { customers: [{ name: 'Arun' }] } }));
  assert.equal(backup.data.customers.length, 1);
  assert.throws(() => inspectImportBackup('{"data":{}}'));
  assert.throws(() => inspectImportBackup('{"meta":{"app":"GoBook"},"data":[]}'));
  assert.throws(() => inspectImportBackup('{"meta":{"app":"GoBook"},"data":{"customers":[null]}}'));
});
test('preview only includes accessible registered collections actually present in the backup', () => {
  const backup = { data: { customers: [{ name: 'Arun' }], products: [{ description: 'Filter' }], unknown: [{ value: 1 }] } };
  const available = [{ key: 'customers', label: 'Customers', count: 2 }, { key: 'products', label: 'Products', count: 8 }, { key: 'vendors', label: 'Suppliers', count: 3 }];
  assert.deepEqual(importCollectionPreview(backup, available, 'customers').map((row) => [row.key, row.incoming, row.count]), [['customers', 1, 2]]);
  assert.equal(importCollectionPreview(backup, available, 'all').length, 2);
});
test('preview retains empty backup collections and their replace eligibility for explicit review', () => {
  const rows = importCollectionPreview({ data: { businessSettings: [], branches: [] } }, [{ key: 'businessSettings', count: 1, deletable: false }, { key: 'branches', count: 5, deletable: true }], 'all');
  assert.equal(rows.length, 2); assert.equal(rows[0].incoming, 0); assert.equal(rows[0].deletable, false); assert.equal(rows[1].count, 5);
});
test('partially skipped imports are labelled completed with issues', () => {
  assert.equal(importCompletionStatus({ imported: 3, skipped: 1 }), 'Completed with issues');
  assert.equal(importCompletionStatus({ errors: ['Invalid record'] }), 'Completed with issues');
  assert.equal(importCompletionStatus({ imported: 3, updated: 2, skipped: 0 }), 'Completed');
});
