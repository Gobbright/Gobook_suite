import assert from 'node:assert/strict';
import test, { mock, afterEach } from 'node:test';
import { employeeQrFields, employeeQrProfile, employeeEmailIsVerified } from '../src/services/employeeQrProfile.js';
import { employeeAccessView, employeesWithAccess } from '../src/services/employeeAccess.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';

afterEach(() => mock.restoreAll());

test('only owner-selected profile fields are exposed by a personal employee link', () => {
  const employee = { _id: '507f1f77bcf86cd799439022', userId: '507f1f77bcf86cd799439011', employeeId: 'EMP-001', name: 'Employee One', designation: 'Sales Manager', address: 'Private address', phone: '9000012345', email: 'one@example.test', basicSalary: 50000, loginPassword: 'Never display', photo: { gridFsFileId: '507f1f77bcf86cd799439033' }, qrDisplayFields: { photo: false, address: false, phone: false, email: false }, status: 'Active', loginAccess: true };
  const access = employeeAccessView(employee, { _id: employee.userId, businessName: 'Sample Business', email: 'owner@example.test' });
  assert.equal(access.businessUsername, 'owner@example.test');
  assert.equal(access.qrProfile.name, employee.name);
  assert.equal(access.qrProfile.role, 'Sales Manager');
  for (const field of ['photoUrl', 'address', 'phone', 'email', 'basicSalary', 'loginPassword']) assert.equal(access.qrProfile[field], undefined);
});

test('QR preferences reject arbitrary properties and non-boolean values', () => {
  for (const input of [null, [], 'name', { password: true }, { photo: 'false' }, { email: { $ne: '' } }]) assert.throws(() => employeeQrFields(input, true), { statusCode: 400 });
  const fields = employeeQrFields({ name: false, photo: false, email: true }, true);
  assert.equal(fields.name, false);
  assert.equal(fields.email, true);
  assert.deepEqual(employeeQrProfile({ name: 'Hidden', email: 'visible@example.test' }, fields), { employeeId: '', role: 'Employee', address: '', phone: '', email: 'visible@example.test' });
});

test('email verification belongs to the exact employee email and cannot follow address changes', () => {
  const employee = { email: 'ONE@Example.test', emailVerifiedAddress: 'one@example.test', emailVerifiedAt: new Date() };
  assert.equal(employeeEmailIsVerified(employee), true);
  assert.equal(employeeEmailIsVerified({ ...employee, email: 'other@example.test' }), false);
  assert.equal(employeeEmailIsVerified({ ...employee, emailVerifiedAt: null }), false);
});

test('a directory prepares employee aliases in one scoped bulk write instead of per-row writes', async () => {
  const owner = { _id: '507f1f77bcf86cd799439011', businessName: 'Sample', email: 'owner@example.test' };
  mock.method(AppUser, 'findById', () => ({ select() { return this; }, lean: async () => owner }));
  const updates = mock.method(Employee, 'bulkWrite', async () => ({}));
  const single = mock.method(Employee, 'updateOne', () => { throw new Error('Avoid a separate update for every employee'); });
  const rows = Array.from({ length: 100 }, (_, index) => ({ _id: index.toString(16).padStart(24, '0'), userId: owner._id, employeeId: `EMP-${index}`, name: 'Employee' }));
  const result = await employeesWithAccess(rows, owner._id);
  assert.equal(result.length, 100);
  assert.equal(updates.mock.callCount(), 1);
  assert.equal(updates.mock.calls[0].arguments[0].length, 100);
  assert.ok(updates.mock.calls[0].arguments[0].every((item) => item.updateOne.filter.userId === owner._id));
  assert.equal(single.mock.callCount(), 0);
});
