import assert from 'node:assert/strict';
import test from 'node:test';
import { employeeLoginUrl, employeeLoginPageUrl, selectedQrProfile, employeeLoginRows } from '../src/features/employee-management/services/employeeQr.js';

const origins = ['http://localhost:5173', 'http://127.0.0.1:4173', 'http://192.168.1.20:5173', 'https://staging.gobooksuite.com', 'https://gobooksuite.com', 'https://www.gobooksuite.com'];
const loginPath = '/employee-login/business-a1b2c3d4/EMP-001';

test('personal and shared employee links stay on the frontend origin, including its port', () => {
  for (const origin of origins) {
    assert.equal(employeeLoginUrl({ loginPath }, origin), origin + loginPath);
    assert.equal(employeeLoginPageUrl(origin), origin + '/employee-login');
    assert.notEqual(employeeLoginUrl({ loginPath }, origin), employeeLoginUrl({ loginPath: '/employee-login/business-a1b2c3d5/EMP-001' }, origin));
  }
});

test('all link callers use the current browser origin automatically', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    for (const origin of origins) {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin } });
      assert.equal(employeeLoginUrl({ loginPath }), origin + loginPath);
      assert.equal(employeeLoginPageUrl(), origin + '/employee-login');
      assert.equal(employeeLoginRows([{ portalAccess: { loginPath } }])[0]['Login URL'], origin + loginPath);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'location', original); else delete globalThis.location;
  }
});

test('malformed paths and non-web origins cannot escape the employee login route', () => {
  for (const path of ['https://other.test', '//other.test/employee-login/x/EMP-1', '/employee-login', '/employee/other/id', '/employee-login/../EMP-1', '/employee-login/%2e%2e/EMP-1', '/employee-login/business/EMP-1?password=secret', '/employee-login/business/EMP-1#fragment', '/employee-login/business/a%2Fb', '/employee-login/business/a\\b', '/employee-login/business/%0a', '/employee-login/business/%invalid']) assert.equal(employeeLoginUrl({ loginPath: path }, origins[0]), '');
  for (const origin of [undefined, '', 'null', 'file:///tmp', 'javascript:alert(1)', 'https://user:password@example.test', 'https://example.test/unexpected/path']) {
    assert.equal(employeeLoginUrl({ loginPath }, origin), '');
    assert.equal(employeeLoginPageUrl(origin), '');
  }
});

test('the printed card preview omits deselected details and extra identity properties', () => {
  const profile = selectedQrProfile({ name: 'Employee One', phone: '1234567890', address: 'Hidden', photoUrl: '/api/employee/auth/link-photo?a=b', password: 'never-copy' }, { name: true, phone: false, address: false, photo: false });
  assert.deepEqual(profile, { name: 'Employee One' });
});

test('the complete URL export includes employees beyond the first page and only login details', () => {
  const employees = Array.from({ length: 25 }, (_, index) => ({ name: `Employee ${index}`, employeeId: `EMP-${index}`, password: 'never-export', address: 'private', portalAccess: { businessUsername: 'owner@example.test', loginPath: `/employee-login/business-a1b2c3d4/EMP-${index}` } }));
  for (const origin of origins) {
    const rows = employeeLoginRows([...employees, { name: 'Invalid link', portalAccess: { loginPath: '//other.test' } }], origin);
    assert.equal(rows.length, 25);
    assert.equal(rows.at(-1)['Employee ID'], 'EMP-24');
    assert.equal(rows.at(-1)['Login URL'], origin + '/employee-login/business-a1b2c3d4/EMP-24');
    assert.deepEqual(Object.keys(rows[0]), ['Employee name', 'Employee ID', 'Business username', 'Login URL']);
  }
});
