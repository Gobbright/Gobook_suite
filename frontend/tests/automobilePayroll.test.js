import test from 'node:test';
import assert from 'node:assert/strict';
import { automobilePayrollTotals, filterAutomobilePayroll } from '../src/features/categories/automobile/automobilePayroll.js';

const rows = [{ employeeId: 'one', name: 'Arun', dept: 'Sales', basic: 28000, allowances: 12500, deductions: 2000, net: 38500, status: 'Paid' }, { employeeId: 'two', name: 'Priya', dept: 'Accounts', basic: '32000', allowances: '14000', deductions: '3000', net: '43000', status: 'Pending' }];
test('payroll totals preserve saved net amounts and distinguish Paid from Pending', () => {
  const result = automobilePayrollTotals(rows);
  assert.equal(result.gross, 86500); assert.equal(result.deductions, 5000); assert.equal(result.net, 81500);
  assert.equal(result.employees, 2); assert.equal(result.paid, 1); assert.equal(result.pending, 1); assert.equal(result.pendingNet, 43000);
  assert.equal(automobilePayrollTotals([{ employeeId: 'one', basic: 100, allowances: 0, deductions: 0, net: 90 }]).net, 90);
});
test('payroll filters use employee branch metadata and compose status, department and ID search', () => {
  const employees = [{ employeeId: 'one', branch: 'Main' }, { employeeId: 'two', branch: 'North' }];
  const result = filterAutomobilePayroll(rows, employees, { branch: 'North', dept: 'Accounts', status: 'Pending', search: 'TWO' });
  assert.equal(result.length, 1); assert.equal(result[0].name, 'Priya');
  assert.equal(filterAutomobilePayroll(rows, employees, { branch: 'Main', status: 'Pending' }).length, 0);
  assert.equal(filterAutomobilePayroll(rows, [], {}).length, 2);
});
test('empty payroll totals remain numeric and do not imply a generated or paid run', () => {
  const result = automobilePayrollTotals([]);
  assert.equal(result.records, 0); assert.equal(result.employees, 0); assert.equal(result.net, 0); assert.equal(result.paid, 0);
});
