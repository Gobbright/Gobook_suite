import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/modules/retail/crm/leadController.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');

function setup({ matches = [], failUpdate = false } = {}) {
  let lead = { _id: 'lead', userId: 'owner', name: 'Rahul', phone: '9876543210', email: 'rahul@example.test', status: 'New' };
  let customer = matches.length === 1 ? matches[0] : null; let creates = 0; let failurePending = failUpdate;
  const lean = (fn) => ({ lean: async () => fn() });
  const context = {
    Lead: {
      findOne: (query) => lean(() => query.userId === lead.userId ? { ...lead } : null),
      findOneAndUpdate: (query, update) => lean(() => { if (failurePending) { failurePending = false; throw new Error('Temporary update failure'); } lead = { ...lead, ...update.$set }; return lead; }),
    },
    Customer: {
      findOne: (query) => lean(() => customer && query.userId === 'owner' && (query._id === customer._id || query.sourceLeadId && query.sourceLeadId === customer.sourceLeadId) ? customer : null),
      find: () => ({ limit: () => lean(() => matches) }),
      findOneAndUpdate: (query, update) => lean(() => { creates++; customer = { _id: 'created', ...update.$setOnInsert }; return customer; }),
    },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
  };
  vm.createContext(context); vm.runInContext(source, context);
  async function convert(userId = 'owner') { let result; let error; await context.convertLead({ user: { id: userId }, params: { id: 'lead' } }, { json: (value) => { result = value; } }, (err) => { error = err; }); return { result, error }; }
  return { convert, creates: () => creates };
}
test('repeat conversion reuses one customer and retains its original conversion date', async () => {
  const fixture = setup(); const first = await fixture.convert(); const second = await fixture.convert();
  assert.equal(first.error, undefined); assert.equal(second.error, undefined);
  assert.equal(fixture.creates(), 1);
  assert.equal(second.result.lead.convertedCustomerId, 'created');
  assert.equal(second.result.lead.convertedAt, first.result.lead.convertedAt);
});
test('one matching customer is linked without creating a duplicate', async () => {
  const fixture = setup({ matches: [{ _id: 'existing', phone: '9876543210' }] }); const response = await fixture.convert();
  assert.equal(response.result.customer._id, 'existing'); assert.equal(fixture.creates(), 0);
});
test('ambiguous customer identities require review and do not convert the lead', async () => {
  const fixture = setup({ matches: [{ _id: 'one' }, { _id: 'two' }] }); const response = await fixture.convert();
  assert.equal(response.error.status, 409); assert.equal(fixture.creates(), 0);
});
test('retry after a failed lead update reuses the customer already created', async () => {
  const fixture = setup({ failUpdate: true }); const first = await fixture.convert(); const second = await fixture.convert();
  assert.ok(first.error); assert.equal(second.error, undefined); assert.equal(fixture.creates(), 1);
});
test('another user cannot convert a lead outside their account', async () => {
  const fixture = setup(); const response = await fixture.convert('other-owner');
  assert.equal(response.error.status, 404); assert.equal(fixture.creates(), 0);
});
