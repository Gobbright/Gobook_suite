import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { AppUser } from '../src/models/AppUser.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Employee } from '../src/models/Employee.js';
import { employeeAccessView } from '../src/services/employeeAccess.js';
import { getEmployeePortalMe } from '../src/modules/employee-portal/portalController.js';

afterEach(() => mock.restoreAll());
const owner = { _id: '507f1f77bcf86cd799439011', businessName: 'Anbu Retail', status: 'Active' };
const employee = { _id: '507f1f77bcf86cd799439022', userId: owner._id, employeeId: 'EMP-001', name: 'Employee One', status: 'Active', loginAccess: true };
const access = employeeAccessView(employee, owner);
employee.portalAlias = access.businessSlug;
const query = (value) => ({ select() { return this; }, limit() { return this; }, lean: async () => value });
async function invoke(handler, req) {
  let data, error;
  await handler(req, { json: (value) => { data = value; } }, (value) => { error = value; });
  assert.ifError(error);
  return data;
}

test('profile refresh follows the authenticated owner, ignores request tenant IDs and reflects logo changes', async () => {
  mock.method(Employee, 'findOne', () => query(employee));
  mock.method(AppUser, 'findById', () => query(owner));
  let logo = '/api/files/logos/current-logo';
  mock.method(BusinessSettings, 'findOne', (filter) => {
    assert.deepEqual(filter, { userId: owner._id });
    return query(logo ? { logoUrl: logo } : null);
  });
  const req = { employeeUser: { ownerUserId: owner._id, employeeId: employee.employeeId }, query: { ownerUserId: 'another-owner' }, body: { userId: 'another-owner' } };
  assert.equal((await invoke(getEmployeePortalMe, req)).user.businessLogoUrl, logo);
  logo = '/api/files/logos/replacement-logo';
  assert.equal((await invoke(getEmployeePortalMe, req)).user.businessLogoUrl, logo);
  logo = '';
  assert.equal((await invoke(getEmployeePortalMe, req)).user.businessLogoUrl, '');
});
