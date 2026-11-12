import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAccountingAction } from '../src/middleware/requireAccountingAction.js';

for (const action of ['view', 'create', 'edit', 'delete']) {
  test(`voucher ${action} permission uses existing company action permissions`, () => {
    for (const user of [{ accountType: 'owner' }, { role: 'Super Admin' }, { permissions: { modules: ['accounting'], actions: { [action]: true } } }]) {
      let error;
      requireAccountingAction(action)({ user }, {}, (failure) => { error = failure; });
      assert.equal(error, undefined);
    }
    for (const user of [{}, { permissions: { modules: ['billing'], actions: { [action]: true } } }, { permissions: { modules: ['accounting'], actions: { [action]: false } } }]) {
      let error;
      requireAccountingAction(action)({ user }, {}, (failure) => { error = failure; });
      assert.equal(error.statusCode, 403);
    }
  });
}
