import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeDirectoryStats, employeeSalary, filterEmployeeDirectory } from '../src/features/categories/automobile/automobileEmployees.js';

const rows = [
  { employeeId: 'EMP-001', name: 'Arun', phone: '9876543210', dept: 'Sales', designation: 'Executive', branch: 'Main', joinDate: '2026-10-01', status: 'Active' },
  { employeeId: 'EMP-002', name: 'Priya', email: 'priya@example.test', dept: 'Accounts', designation: 'Accountant', branch: 'North', joinDate: '2026-10-26', status: 'Probation' },
  { employeeId: 'EMP-003', name: 'Ramesh', dept: 'Service', status: 'Resigned', joinDate: '2025-01-01' },
  { employeeId: 'EMP-004', name: 'Karthik', dept: 'Sales', status: 'Inactive', createdAt: '2026-10-01', joinDate: '2024-01-01' },
];
test('directory counts use joining dates, exclude future joiners and keep probation separate from Active', () => {
  assert.deepEqual(employeeDirectoryStats(rows, new Date('2026-10-24T10:00:00Z')), { total: 4, active: 1, departments: 3, newJoiners: 1, exited: 2 });
});
test('directory filters combine typed search with department, designation, branch and status', () => {
  assert.equal(filterEmployeeDirectory(rows, { search: '98765', dept: 'Sales', designation: 'Executive', branch: 'Main', status: 'Active' })[0].name, 'Arun');
  assert.equal(filterEmployeeDirectory(rows, { search: 'EMP-002', status: 'Active' }).length, 0);
  assert.equal(filterEmployeeDirectory(rows, { search: 'PRIYA@EXAMPLE' })[0].name, 'Priya');
  assert.equal(filterEmployeeDirectory(rows, {}).length, 4);
});
test('salary preview sums only saved earnings and deductions without introducing default allowances', () => {
  const result = employeeSalary({ basicSalary: 30000, salaryStructure: { hra: 5000, medicalAllowance: 500, pf: 1800, professionalTax: 200 } });
  assert.equal(result.gross, 35500); assert.equal(result.totalDeductions, 2000); assert.equal(result.net, 33500);
  assert.equal(employeeSalary({}).gross, 0);
});
