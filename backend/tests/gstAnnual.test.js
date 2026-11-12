import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/modules/retail/gst/gstr9Controller.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace('export async function', 'async function');

test('annual source summaries preserve net notes, branch ownership and control totals', async () => {
  const context = {
    Gstr3b: { find: (query) => { assert.equal(query.userId, 'owner'); return { lean: async () => [] }; } },
    getActiveGstin: async () => '33AAACT1234A1Z5',
    periodsForFy: () => ['October 2026'],
    mergeDraftGstr3b: (saved, generated) => generated,
    buildGstr9FromSales: async () => ({
      gstr1Docs: [{ invoiceCount: 2, b2b: [{ taxable: 900, cgst: 81, sgst: 81 }], b2cs: [], noteTotals: { credit: { taxable: -100, cgst: -9, sgst: -9 } }, sourceDocuments: [{ branch: 'Main', taxable: 1000, cgst: 90, sgst: 90 }, { branch: 'Main', taxable: -100, cgst: -9, sgst: -9 }] }],
      gstr3bDocs: [{ period: 'October 2026', outwardRows: [{ key: 'a', taxable: 900, cgst: 81, sgst: 81 }], itcAvailable: [{ key: 'A(5)', cgst: 25, sgst: 25 }], itcReversed: [], purchaseCount: 1, purchaseSummaries: [{ branch: 'Main', registered: true, taxable: 500, cgst: 25, sgst: 25 }] }],
    }),
    httpError: (status, message) => Object.assign(new Error(message), { status }),
  };
  vm.createContext(context); vm.runInContext(source, context);
  let result;
  await context.getGstr9({ user: { id: 'owner' }, query: { fy: '2026-27' } }, { json: (value) => { result = value; } }, (err) => { throw err; });
  assert.equal(result.annualDetails.branches[0].outward, 900);
  assert.equal(result.annualDetails.branches[0].inward, 500);
  assert.equal(result.annualDetails.inwardRows[0].taxable, 500);
  assert.equal(result.annualDetails.monthly[0].difference, 0);
  assert.equal(result.annualDetails.invoiceCount, 2);
  assert.equal(result.overview.turnover, 900);
  assert.equal(result.table6.find((row) => row.sno === '6A').cgst, 25);
});
