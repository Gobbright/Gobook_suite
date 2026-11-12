import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSelection, matchesSelection, selectionValues } from '../src/features/categories/common/modules/reports/salesReportSelections.js';

test('empty and legacy All values do not restrict reports', () => {
  for (const value of ['', null, undefined, [], 'all']) {
    assert.equal(hasSelection(value), false);
    assert.equal(matchesSelection(value, () => false), true);
  }
  assert.deepEqual(selectionValues(['Red', 'Red', '', 'Blue']), ['Red', 'Blue']);
});

test('multi selections combine OR within fields and AND across fields', () => {
  const rows = [{ brand: 'Dell', status: 'Paid' }, { brand: 'Apple', status: 'Unpaid' }, { brand: 'Sony', status: 'Paid' }];
  const result = rows.filter((row) => matchesSelection(['Dell', 'Apple'], (brand) => brand === row.brand) && matchesSelection(['Paid'], (status) => status === row.status));
  assert.deepEqual(result, [rows[0]]);
  assert.equal(matchesSelection(['Missing'], (value) => value === 'Dell'), false);
  assert.equal(matchesSelection('Dell', (value) => value === 'Dell'), true);
});
