import assert from 'node:assert/strict';
import test from 'node:test';
import { employeePortalBase, employeeScreenPath, legacyEmployeeScreen } from '../src/features/employee-management/services/portalPaths.js';

const base = '/employee/anbu-retail-a1b2c3d4/EMP-001';
const user = { portalBasePath: base };
test('employee dashboard and navigation keep the business, owner and employee identity in the URL', () => {
  assert.equal(employeeScreenPath(user), base);
  assert.equal(employeeScreenPath(user, 'documents'), base + '/documents');
  assert.equal(employeeScreenPath(user, 'leave/apply'), base + '/leave/apply');
  assert.equal(employeeScreenPath(user, 'https://attacker.test'), base);
});
test('legacy employee links keep the requested screen while invalid/external bases are refused', () => {
  assert.equal(legacyEmployeeScreen('/employee/attendance/monthly'), 'attendance/monthly');
  assert.equal(legacyEmployeeScreen('/employee/documents'), 'documents');
  assert.equal(legacyEmployeeScreen('/employee/unknown'), 'dashboard');
  for (const path of ['https://attacker.test', '//attacker.test', '/employee/slug/not-an-owner/EMP-001', base + '?token=secret']) assert.equal(employeePortalBase({ portalBasePath: path }), '');
});
