import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = (await readFile(new URL('../src/modules/retail/gst/reconciliationController.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const context = {}; vm.createContext(context); vm.runInContext(source, context);
test('saved statement ITC cannot cross suppliers sharing an invoice number', () => {
  const rows = context.mergeEntries([{ gstin: 'GST-A', invoiceNo: 'P1', itcBooks: 100 }, { gstin: 'GST-B', invoiceNo: 'P1', itcBooks: 200 }], [{ _id: 'a', gstin: 'GST-A', invoiceNo: 'P1', itcGstr2b: 100, resolution: 'accepted' }, { _id: 'b', gstin: 'GST-B', invoiceNo: 'P1', itcGstr2b: 180, resolution: 'disputed' }]);
  assert.equal(rows[0].status, 'matched');
  assert.equal(rows[0].resolution, 'accepted');
  assert.equal(rows[1].diff, 20);
  assert.equal(rows[1].resolution, 'disputed');
});
test('zero statement values retain recorded state on merge and preserve source metadata', () => {
  const rows = context.mergeEntries([{ gstin: 'GST-A', invoiceNo: 'P1', itcBooks: 100, sourceId: 'source', bookTax: { taxable: 1000 } }], [{ _id: 'a', gstin: 'GST-A', invoiceNo: 'P1', itcGstr2b: 0, statementRecorded: true }]);
  assert.equal(rows[0].statementRecorded, true);
  assert.equal(rows[0].status, 'mismatch');
  assert.equal(rows[0].sourceId, 'source');
  assert.equal(rows[0].bookTax.taxable, 1000);
  assert.equal(rows[0]._id, 'a');
});
