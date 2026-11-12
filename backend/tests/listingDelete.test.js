import assert from 'node:assert/strict';
import test from 'node:test';
import { Attendance } from '../src/models/Attendance.js';
import { Leave } from '../src/models/Leave.js';
import { Payroll } from '../src/models/Payroll.js';
import { deletePortalAttendance, deletePortalLeave, deletePortalPayroll } from '../src/modules/employee-portal/listingDeleteController.js';
import { FinanceCustomer } from '../src/models/FinanceCustomer.js';
import { FinanceCollection } from '../src/models/FinanceCollection.js';
import { deleteCustomer, deleteCollection } from '../src/modules/finance/financeController.js';

for (const [Model, handler] of [[Attendance, deletePortalAttendance], [Leave, deletePortalLeave], [Payroll, deletePortalPayroll]]) {
  test(`${Model.modelName} deletion is scoped to the authenticated business`, async () => {
    const original = Model.findOneAndDelete;
    const id = '507f1f77bcf86cd799439001', owner = '507f1f77bcf86cd799439002';
    const queries = [], errors = [];
    let response;
    Model.findOneAndDelete = filter => { queries.push(filter); return { lean: async () => ({ _id: id }) }; };
    try {
      await handler({ params: { id }, employeeUser: { ownerUserId: owner } }, { json: value => { response = value; } }, error => errors.push(error));
      assert.deepEqual(queries, [{ _id: id, userId: owner }]);
      assert.equal(errors.length, 0);
      assert.match(response.message, /deleted/);
      await handler({ params: { id } }, {}, error => errors.push(error));
      await handler({ params: { id: 'bad-id' }, employeeUser: { ownerUserId: owner } }, {}, error => errors.push(error));
      assert.equal(queries.length, 1);
      assert.equal(errors.length, 2);
      Model.findOneAndDelete = () => ({ lean: async () => null });
      await handler({ params: { id }, employeeUser: { ownerUserId: owner } }, {}, error => errors.push(error));
      assert.match(errors.at(-1).message, /not found/);
    } finally { Model.findOneAndDelete = original; }
  });
}

test('finance customers with saved collections are protected from deletion', async () => {
  const exists = FinanceCollection.exists, remove = FinanceCustomer.findOneAndDelete;
  const owner = '507f1f77bcf86cd799439002', id = '507f1f77bcf86cd799439001';
  const queries = [], errors = [];
  let removed = false;
  FinanceCollection.exists = async filter => { queries.push(filter); return { _id: id }; };
  FinanceCustomer.findOneAndDelete = () => { removed = true; return { lean: async () => ({ _id: id }) }; };
  try {
    await deleteCustomer({ user: { id: owner }, params: { id } }, {}, error => errors.push(error));
    assert.deepEqual(queries, [{ userId: owner, customerId: id }]);
    assert.equal(removed, false);
    assert.match(errors[0].message, /collection history/);
    FinanceCollection.exists = async () => null;
    let filter, response;
    FinanceCustomer.findOneAndDelete = value => { filter = value; return { lean: async () => ({ _id: id }) }; };
    await deleteCustomer({ user: { id: owner }, params: { id } }, { json: value => { response = value; } }, error => errors.push(error));
    assert.deepEqual(filter, { _id: id, userId: owner });
    assert.match(response.message, /deleted/);
  } finally { FinanceCollection.exists = exists; FinanceCustomer.findOneAndDelete = remove; }
});

test('finance collection deletion uses its saved entry ID and business owner', async () => {
  const original = FinanceCollection.findOneAndDelete;
  const id = '507f1f77bcf86cd799439001', owner = '507f1f77bcf86cd799439002';
  let query, response;
  const errors = [];
  FinanceCollection.findOneAndDelete = filter => { query = filter; return { lean: async () => ({ _id: id }) }; };
  try {
    await deleteCollection({ user: { id: owner }, params: { id } }, { json: value => { response = value; } }, error => errors.push(error));
    assert.deepEqual(query, { _id: id, userId: owner });
    assert.match(response.message, /deleted/);
    await deleteCollection({ user: { id: owner }, params: { id: 'not-an-id' } }, {}, error => errors.push(error));
    assert.match(errors[0].message, /valid collection ID/);
  } finally { FinanceCollection.findOneAndDelete = original; }
});
