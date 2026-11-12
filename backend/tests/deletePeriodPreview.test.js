import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/modules/data-management/controller.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
function setup() {
  const counts = []; const deletes = [];
  const model = { schema: { path: (name) => ({ instance: name === 'createdAt' ? 'Date' : 'String' }) }, countDocuments: async (query) => { counts.push(query); return 3; }, deleteMany: async (query) => { deletes.push(query); return { deletedCount: 3 }; } };
  const collections = [{ key: 'invoices', label: 'Invoices & Billing', model, ownerField: 'userId', dateFields: ['meta.date', 'createdAt'] }, { key: 'businessSettings', label: 'Settings', model, deletable: false }];
  const multer = () => ({}); multer.memoryStorage = () => ({});
  const context = { multer, DATA_COLLECTIONS: collections, DATA_COLLECTIONS_BY_KEY: new Map(collections.map((row) => [row.key, row])), branchScopedQuery: async (req) => ({ userId: req.user.id, branch: req.query?.branch || req.body?.branchFilter }), httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) };
  vm.createContext(context); vm.runInContext(source, context);
  async function call(action, input) { let result; let error; await context[action]({ user: { id: 'owner' }, query: action === 'previewDeleteByPeriod' ? input : {}, body: action === 'deleteByPeriod' ? input : {} }, { json: (value) => { result = value; } }, (err) => { error = err; }); return { result, error }; }
  return { call, counts, deletes };
}
test('period preview is read-only and uses exactly the same owned branch and period query as deletion', async () => {
  const fixture = setup(); const input = { year: '2026', month: '10', collections: 'invoices', branch: 'Main' };
  const preview = await fixture.call('previewDeleteByPeriod', input);
  assert.equal(preview.error, undefined); assert.equal(preview.result.total, 3); assert.equal(fixture.deletes.length, 0);
  assert.equal(fixture.counts[0].userId, 'owner'); assert.equal(fixture.counts[0].branch, 'Main');
  const deletion = await fixture.call('deleteByPeriod', { ...input, branchFilter: 'Main' });
  assert.equal(deletion.error, undefined); assert.equal(JSON.stringify(fixture.counts[0]), JSON.stringify(fixture.deletes[0]));
});
test('preview excludes protected and unregistered collections', async () => {
  const fixture = setup(); const response = await fixture.call('previewDeleteByPeriod', { year: '2026', month: '', collections: 'businessSettings,unknown' });
  assert.equal(response.result.total, 0); assert.equal(response.result.collections.length, 0); assert.equal(fixture.counts.length, 0); assert.equal(fixture.deletes.length, 0);
});
test('invalid preview periods fail before any collection is counted or deleted', async () => {
  const fixture = setup();
  assert.equal((await fixture.call('previewDeleteByPeriod', { year: 'bad', month: '10', collections: 'invoices' })).error.statusCode, 400);
  assert.equal((await fixture.call('previewDeleteByPeriod', { year: '2026', month: '13', collections: 'invoices' })).error.statusCode, 400);
  assert.equal(fixture.counts.length, 0); assert.equal(fixture.deletes.length, 0);
});
