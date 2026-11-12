import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePnl } from '../src/features/categories/automobile/automobilePnl.js';
import { pnlReportTotals, pnlDetailRows } from '../src/features/categories/common/modules/accounting/pnlReport.js';

const period={from:'2026-04-01',to:'2026-11-05',branch:''};
function voucher(name,group,side,amount,extra={}) { return {date:'2026-10-01',status:'Posted',branch:'Main',lines:[{ledgerName:name,ledgerGroup:group,side,amount}],...extra}; }
test('summary separates gross, operating and net profit and uses total income for net margin',()=>{
  const report=calculatePnl([], [voucher('Sales','Direct Incomes','credit',11000000),voucher('Sales Return','Direct Incomes','debit',500000),voucher('Other Operating Income','Direct Incomes','credit',1500000),voucher('Interest','Indirect Incomes','credit',500000),voucher('Purchases','Direct Expenses','debit',7000000),voucher('Purchase Return','Direct Expenses','credit',300000),voucher('Labour','Direct Expenses','debit',500000),voucher('Overheads','Indirect Expenses','debit',2340000)],period);
  assert.deepEqual(pnlReportTotals(report.totals),{income:12500000,expenses:9540000,grossProfit:4800000,operatingProfit:2460000,netProfit:2960000,netMargin:23.68});
});
test('details preserve negative returns and include accounts present only in the comparison',()=>{
  const current=calculatePnl([], [voucher('Sales','Direct Incomes','credit',1000),voucher('Sales Return','Direct Incomes','debit',100)],period);
  const previous=calculatePnl([], [voucher('Old Sales','Direct Incomes','credit',500)],period);
  const rows=pnlDetailRows(current,previous);
  assert.deepEqual(rows.find(row=>row.name==='Old Sales'),{name:'Old Sales',group:'Operating Income',side:'income',current:0,previous:500,variance:-500});
  assert.equal(rows.find(row=>row.name==='Sales Return').current,-100);
});
test('losses, zero income, fractional values and branch filters remain accurate',()=>{
  const report=calculatePnl([], [voucher('Rent','Indirect Expenses','debit',0.1),voucher('Rent','Indirect Expenses','debit',0.2),voucher('Sales','Direct Incomes','credit',999,{branch:'South'}),voucher('Sales','Direct Incomes','credit',999,{status:'Draft'})],{...period,branch:'Main'});
  const summary=pnlReportTotals(report.totals);
  assert.equal(summary.netProfit,-0.3);assert.equal(summary.expenses,0.3);assert.equal(summary.netMargin,null);
});
