import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/modules/retail/crm/followUpController.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
function setup({ validLink = true, existing = { _id: 'task', userId: 'owner', status: 'Pending', leadId: 'deleted' } } = {}) {
  let written;
  const links = [];
  const context = {
    FollowUp: {
      exists: async (query) => { links.push(query); return validLink; },
      findOne: (query) => ({ lean: async () => query.userId === 'owner' ? existing : null }),
      create: async (value) => { written = value; return value; },
      findOneAndUpdate: (query, update) => ({ lean: async () => { written = update; return { ...existing, ...update.$set }; } }),
    },
    Lead: { exists: async (query) => { links.push(query); return validLink; } },
    Customer: { exists: async (query) => { links.push(query); return validLink; } },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
  };
  vm.createContext(context); vm.runInContext(source, context);
  async function call(action, body, userId = 'owner') {
    let result; let error;
    const res = { status: () => res, json: (value) => { result = value; } };
    await context[action]({ body, user: { id: userId, name: 'Admin' }, params: { id: 'task' } }, res, (err) => { error = err; });
    return { result, error };
  }
  return { call, written: () => written, links };
}
test('creation owns records and audit history on the server', async () => {
  const fixture = setup();
  const response = await fixture.call('createFollowUp', { person: 'Rahul', customerId: 'customer', userId: 'forged', outcomeLog: [{ note: 'forged' }] });
  assert.equal(response.error, undefined);
  assert.equal(fixture.written().userId, 'owner');
  assert.equal(fixture.written().outcomeLog[0].note, 'Follow-up created');
  assert.equal(fixture.links[0].userId, 'owner');
});
test('creation rejects another account linked record', async () => {
  const fixture = setup({ validLink: false });
  const response = await fixture.call('createFollowUp', { person: 'Rahul', leadId: 'foreign' });
  assert.equal(response.error.status, 404);
  assert.equal(fixture.written(), undefined);
});
test('completion logs the status change and permits historical missing master links', async () => {
  const fixture = setup({ validLink: false });
  const response = await fixture.call('updateFollowUp', { status: 'Done' });
  assert.equal(response.error, undefined);
  assert.equal(fixture.links.length, 0);
  assert.equal(fixture.written().$push.outcomeLog.note, 'Status changed to Completed');
  assert.equal(fixture.written().$push.outcomeLog.by, 'Admin');
});
test('editing notes or saving unchanged empty outcome does not manufacture outcome events', async () => {
  const fixture = setup(); await fixture.call('updateFollowUp', { notes: 'Updated', outcome: '' });
  assert.equal(fixture.written().$push, undefined);
});
test('an outcome change records its actual text', async () => {
  const fixture = setup(); await fixture.call('updateFollowUp', { outcome: 'Requested quotation' });
  assert.equal(fixture.written().$push.outcomeLog.note, 'Requested quotation');
});
test('updates reject conflicting customer and lead links and foreign task ownership', async () => {
  const fixture = setup();
  assert.equal((await fixture.call('updateFollowUp', { customerId: 'customer' })).error.status, 400);
  assert.equal((await fixture.call('updateFollowUp', { status: 'Done' }, 'foreign')).error.status, 404);
  assert.equal(fixture.written(), undefined);
});
