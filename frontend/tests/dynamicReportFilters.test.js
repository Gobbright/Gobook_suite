import assert from 'node:assert/strict';
import test from 'node:test';
import { describeCondition, presetDateRange, readReportStorage, reportStorageKey, validateCondition, writeReportStorage } from '../src/components/reports/reportFilters.js';

test('date presets use calendar boundaries including quarters, leap days and Monday weeks', () => {
  const date = new Date(2026, 10, 13, 15);
  assert.deepEqual(presetDateRange('today', date), { min: '2026-11-13', max: '2026-11-13' });
  assert.deepEqual(presetDateRange('yesterday', new Date(2024, 2, 1)), { min: '2024-02-29', max: '2024-02-29' });
  assert.deepEqual(presetDateRange('week', new Date(2026, 10, 15)), { min: '2026-11-09', max: '2026-11-15' });
  assert.deepEqual(presetDateRange('month', date), { min: '2026-11-01', max: '2026-11-13' });
  assert.deepEqual(presetDateRange('quarter', date), { min: '2026-10-01', max: '2026-11-13' });
  assert.deepEqual(presetDateRange('year', date), { min: '2026-01-01', max: '2026-11-13' });
});
test('chips display multiple labels, operators, zero values and ranges', () => {
  assert.equal(describeCondition({ field: 'customer', operator: 'equals', values: ['1', '2'], labels: ['ABC Traders', 'XYZ'] }, [{ key: 'customer', label: 'Customer' }]), 'Customer: ABC Traders, XYZ');
  assert.equal(describeCondition({ field: 'amount', operator: 'greaterThan', value: 0 }, [{ key: 'amount', label: 'Amount' }]), 'Amount Greater Than: 0');
  assert.equal(describeCondition({ field: 'date', operator: 'between', min: '2026-11-01', max: '2026-11-13' }), 'date: 01 Nov 2026 – 13 Nov 2026');
});
test('filter inputs accept false and zero and reject reversed ranges', () => {
  assert.equal(validateCondition({ operator: 'equals', value: false }, { type: 'boolean', operators: ['equals'] }), '');
  assert.equal(validateCondition({ operator: 'equals', value: 0 }, { type: 'number', operators: ['equals'] }), '');
  assert.ok(validateCondition({ operator: 'between', min: 100, max: 20 }, { type: 'number', operators: ['between'] }));
});
test('saved filter storage is scoped by business, user and report and tolerates storage errors', () => {
  assert.notEqual(reportStorageKey({ id: '1' }, 'sales', 'saved'), reportStorageKey({ id: '1' }, 'purchase', 'saved'));
  assert.notEqual(reportStorageKey({ businessId: 'a', id: '1' }, 'sales', 'saved'), reportStorageKey({ businessId: 'b', id: '1' }, 'sales', 'saved'));
  assert.notEqual(reportStorageKey({ id: '1' }, 'sales', 'saved'), reportStorageKey({ id: '2' }, 'sales', 'saved'));
  const blocked = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.deepEqual(readReportStorage('x', [], blocked), []);
  assert.equal(writeReportStorage('x', [], blocked), false);
});
