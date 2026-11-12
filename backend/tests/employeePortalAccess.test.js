import assert from 'node:assert/strict';
import test from 'node:test';
import { businessSlug, employeeLinkCode, employeeAccessView, employeeCredential, resolveEmployeeLink } from '../src/services/employeeAccess.js';

const owner = { _id: '507f1f77bcf86cd799439011', businessName: 'Anbu Retail & Stores' };
const employee = { _id: '507f1f77bcf86cd799439022', userId: owner._id, employeeId: 'EMP-001', portalVersion: 1, loginAccess: true, status: 'Active' };
test('short employee URLs end in the employee ID without long owner IDs or query codes', () => {
  const view = employeeAccessView(employee, owner);
  const url = new URL(view.loginPath, 'https://example.test');
  assert.match(url.pathname, /^\/employee-login\/anbu-retail-stores-[a-f0-9]{8}\/EMP-001$/);
  assert.equal(url.search, '');
  assert.equal(url.pathname.includes(owner._id), false);
  assert.equal(url.searchParams.has('password'), false);
  assert.equal(businessSlug('   '), 'business');
});
test('QR code generation is stable until reset and isolated per owner/employee', () => {
  assert.equal(employeeLinkCode(employee), employeeLinkCode({ ...employee }));
  for (const changed of [{ portalVersion: 2 }, { userId: 'another-owner' }, { _id: 'another-employee' }, { employeeId: 'EMP-002' }]) assert.notEqual(employeeLinkCode(employee), employeeLinkCode({ ...employee, ...changed }));
  assert.notEqual(employeeCredential('hash', employee), employeeCredential('hash', { ...employee, portalVersion: 2 }));
});
test('legacy QR versions default to one and malformed links fail before database access', async () => {
  assert.equal(employeeLinkCode({ ...employee, portalVersion: undefined }), employeeLinkCode(employee));
  for (const input of [{}, { ownerUserId: { $ne: '' } }, { ownerUserId: owner._id, employeeId: 'EMP-001', businessSlug: 'anbu-retail-stores', code: 'forged' }]) await assert.rejects(resolveEmployeeLink(input), { statusCode: 404 });
});
