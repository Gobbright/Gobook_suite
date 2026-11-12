import test from 'node:test';
import assert from 'node:assert/strict';
import { gstr3bSummary, validateGstr3b } from '../src/features/categories/automobile/automobileGstr3b.js';

const gstin = '33AAACT1234A1Z5';
const draft = {
  gstin,
  outwardRows: [{ key: 'a', taxable: 1000, cgst: 90, sgst: 90, igst: 0, cess: 0 }, { key: 'd', taxable: 100, cgst: 9, sgst: 9, igst: 0, cess: 0 }],
  itcAvailable: [{ key: 'A(5)', cgst: 50, sgst: 50, igst: 100, cess: 0 }],
  itcReversed: [{ key: 'B(1)', cgst: 10, sgst: 10, igst: 0, cess: 0 }],
  lateFeeCgst: 5, lateFeeSgst: 5,
};

test('liability includes reverse charge once and net ITC includes saved reversals', () => {
  const result = gstr3bSummary(draft);
  assert.equal(result.taxable, 1100);
  assert.equal(result.outputTotal, 198);
  assert.equal(result.reversalTotal, 20);
  assert.equal(result.eligibleTotal, 180);
  assert.equal(result.cashTotal, 118);
  assert.equal(result.payable, 128);
});

test('same-head estimate does not apply unused IGST credit against CGST or SGST', () => {
  const result = gstr3bSummary(draft);
  assert.equal(result.utilized.igst, 0);
  assert.equal(result.cash.cgst, 59);
  assert.equal(result.cash.sgst, 59);
});

test('available excess ITC does not produce negative payable', () => {
  const result = gstr3bSummary({ ...draft, itcAvailable: [{ cgst: 1000, sgst: 1000 }], lateFeeCgst: 0, lateFeeSgst: 0 });
  assert.equal(result.cashTotal, 0);
  assert.equal(result.payable, 0);
});

test('cess is separately included in review totals', () => {
  const result = gstr3bSummary({ outwardRows: [{ cess: 50 }], itcAvailable: [{ cess: 20 }] });
  assert.equal(result.outputTotal, 50);
  assert.equal(result.cash.cess, 30);
  assert.equal(result.payable, 30);
});

test('local validation catches malformed amounts, negative fees and excess reversal', () => {
  const issues = validateGstr3b({ ...draft, gstin: 'bad', itcAvailable: [{ cgst: 'invalid', sgst: 10 }], itcReversed: [{ cgst: 0, sgst: 15 }], lateFeeCgst: -1 });
  assert.ok(issues.some((issue) => issue.includes('GSTIN')));
  assert.ok(issues.some((issue) => issue.includes('CGST')));
  assert.ok(issues.some((issue) => issue.includes('Late fee')));
  assert.ok(issues.some((issue) => issue.includes('SGST reversals')));
});

test('valid numeric inputs and empty totals remain stable', () => {
  assert.deepEqual(validateGstr3b(draft), []);
  assert.equal(gstr3bSummary().payable, 0);
  assert.equal(gstr3bSummary({ lateFeeCgst: '1.10', lateFeeSgst: '2.20' }).payable, 3.3);
});
