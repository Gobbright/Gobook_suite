import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBalanceSheet, balanceCategory } from '../src/features/categories/automobile/automobileBalanceSheet.js';
import { balanceReportDetails, balanceReportGroups } from '../src/features/categories/common/modules/accounting/balanceSheetReport.js';

const accounts=[{name:'Bank',group:'Bank Accounts',opening:1000},{name:'Inventory',group:'Stock-in-Hand',opening:500},{name:'Equipment',group:'Fixed Assets',opening:800},{name:'Software',group:'Intangible Assets',opening:200},{name:'Shares',group:'Investments',opening:100},{name:'Capital',group:'Capital Account',opening:-2000},{name:'Retained Earnings',group:'Reserves & Surplus',opening:-100},{name:'Supplier',group:'Sundry Creditors',opening:-200},{name:'Term Loan',group:'Secured Loans',opening:-300}];
const vouchers=[{date:'2026-10-01',status:'Posted',lines:[{ledgerName:'Bank',ledgerGroup:'Bank Accounts',side:'debit',amount:100},{ledgerName:'Sales',ledgerGroup:'Direct Incomes',side:'credit',amount:100}]}];
test('presentation hierarchy reconciles assets, liabilities and equity and keeps derived profit separate from real ledger accounts',()=>{
  const report=calculateBalanceSheet(accounts,vouchers,'2026-11-05');
  const groups=balanceReportGroups(report,accounts,vouchers);
  assert.equal(report.totals.assets,2700);assert.equal(report.totals.liabilities,500);assert.equal(report.totals.equity,2200);assert.equal(report.totals.difference,0);
  assert.equal(groups.filter(row=>row.side==='right').reduce((a,row)=>a+row.amount,0),2700);
  assert.equal(groups.filter(row=>row.side==='left').reduce((a,row)=>a+row.amount,0),2700);
  const nonCurrent=groups.find(row=>row.key==='nonCurrentAssets');
  assert.equal(nonCurrent.buckets.find(row=>row.key==='tangible').amount,800);
  assert.equal(nonCurrent.buckets.find(row=>row.key==='intangible').amount,200);
  assert.equal(nonCurrent.buckets.find(row=>row.key==='investments').amount,100);
  const derived=groups.find(row=>row.key==='equity').buckets.find(row=>row.key==='unclosed').accounts[0];
  assert.equal(derived.derived,true);assert.equal(derived.amount,100);
});
test('comparison details retain accounts that only exist in the previous statement',()=>{
  const now=balanceReportGroups(calculateBalanceSheet([],[],'2026-11-05'),[]);
  const old=balanceReportGroups(calculateBalanceSheet(accounts,[],'2026-03-31'),accounts);
  const row=balanceReportDetails(now,old).find(row=>row.name==='Bank');
  assert.equal(row.current,0);assert.equal(row.previous,1000);assert.equal(row.variance,-1000);
});
test('investment and non-current groups are classified without treating every investment as current',()=>{
  for(const [group,expected]of[['Investments','fixedAssets'],['Non-Current Investments','fixedAssets'],['Short-Term Investments','currentAssets'],['Investments - Current Assets','currentAssets'],['Long-Term Deposits','fixedAssets'],['Other Non-Current Assets','fixedAssets']])assert.equal(balanceCategory(group),expected);
});
