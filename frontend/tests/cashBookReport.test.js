import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCashReport, cashPageNumbers } from '../src/features/categories/common/modules/accounting/cashBookReport.js';
const accounts = [{name:'Cash in Hand',group:'Cash-In-Hand',opening:1000,branch:'Main'},{name:'Petty Cash',group:'Cash-In-Hand',opening:200,branch:'Main'}];
const transfer = {_id:'t',voucherNo:'T-1',date:'2026-04-02',status:'Posted',branch:'Main',lines:[{ledgerName:'Cash in Hand',side:'credit',amount:50},{ledgerName:'Petty Cash',side:'debit',amount:50}]};
const filters={from:'2026-04-01',to:'2026-04-30',branch:'',account:''};
test('internal transfers net across cash accounts but affect each named account',()=>{
  const all=calculateCashReport(accounts,[transfer],[],filters);
  assert.equal(all.closing,1200); assert.equal(all.rows.length,0);
  const source=calculateCashReport(accounts,[transfer],[],{...filters,account:'Cash in Hand'});
  assert.equal(source.closing,950); assert.equal(source.payments,50); assert.equal(source.rows[0].particulars,'Petty Cash');
  const target=calculateCashReport(accounts,[transfer],[],{...filters,account:'Petty Cash'});
  assert.equal(target.closing,250); assert.equal(target.receipts,50);
});
test('deduplication also handles legacy copies of net-zero transfers',()=>{
  const legacy=[{_id:'old',vchNo:'T-1',date:'2026-04-02',receipt:50}];
  assert.equal(calculateCashReport(accounts,[transfer],legacy,filters).closing,1200);
});
test('unassigned historical cash is never attributed to a named account',()=>{
  const legacy=[{_id:'old',vchNo:'R-old',date:'2026-04-02',receipt:70}];
  assert.equal(calculateCashReport(accounts,[],legacy,filters).closing,1270);
  assert.equal(calculateCashReport(accounts,[],legacy,{...filters,account:'Cash in Hand'}).closing,1000);
  assert.equal(calculateCashReport(accounts,[],legacy,{...filters,account:'__legacy'}).closing,70);
});
test('selected account carries earlier activity and excludes drafts, later dates and other branches',()=>{
  const records=[transfer,{...transfer,_id:'before',date:'2026-03-01'},{...transfer,_id:'draft',status:'Draft'},{...transfer,_id:'future',date:'2027-04-01'},{...transfer,_id:'other',branch:'South'}];
  const report=calculateCashReport(accounts,records,[],{...filters,account:'Cash in Hand',branch:'Main'});
  assert.equal(report.opening,950);assert.equal(report.closing,900);assert.equal(report.rows.length,1);
});
test('large pagination shows bounded actionable pages and gaps',()=>{
  assert.deepEqual(cashPageNumbers(5,10),[1,'…',4,5,6,'…',10]);
  assert.deepEqual(cashPageNumbers(1,2),[1,2]);
});
