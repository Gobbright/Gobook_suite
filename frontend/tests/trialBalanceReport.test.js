import assert from 'node:assert/strict';
import test from 'node:test';
import { trialCategory, trialReportGroups } from '../src/features/categories/common/modules/accounting/trialBalanceReport.js';
import { calculateTrialBalance } from '../src/features/categories/automobile/automobileTrialBalance.js';

test('trial balance categories cover conventional groups without inventing classifications for custom groups', () => {
  for (const [group, expected] of [['Bank Accounts','Assets'],['Sundry Debtors','Assets'],['Stock-in-Hand','Assets'],['Sundry Creditors','Liabilities'],['Capital Account','Liabilities'],['Equity','Liabilities'],['Direct Incomes','Income'],['Purchase Accounts','Expenses'],['Indirect Expenses','Expenses'],['Custom Group','Other Accounts']]) assert.equal(trialCategory({group}),expected);
});
test('group totals keep debit and credit balances separate, round cents and respect category and account-group filters', () => {
  const rows=[{name:'Bank',group:'Bank Accounts',closingDebit:100.1,closingCredit:0},{name:'Overdraft',group:'Bank Accounts',closingDebit:0,closingCredit:20},{name:'Cash',group:'Cash-In-Hand',closingDebit:0.2,closingCredit:0},{name:'Capital',group:'Capital Account',closingDebit:0,closingCredit:80.3}];
  const all=trialReportGroups(rows);
  assert.equal(all.debit,100.3);assert.equal(all.credit,100.3);assert.equal(all.difference,0);
  assert.deepEqual(trialReportGroups(rows,'Assets').accounts.map(row=>row.name),['Bank','Cash','Overdraft']);
  assert.equal(trialReportGroups(rows,'Bank Accounts').accounts.length,2);
  assert.equal(trialReportGroups(rows,'Missing').groups.length,0);
});
test('closing report includes earlier posted movements, excludes later and draft entries, and does not count master movement totals twice', () => {
  const accounts=[{name:'Bank',group:'Bank Accounts',opening:100,debit:99999},{name:'Capital',group:'Capital Account',opening:-100}];
  const entry=(date,status,amount)=>({date,status,lines:[{ledgerName:'Bank',side:'debit',amount},{ledgerName:'Capital',side:'credit',amount}]});
  const report=calculateTrialBalance(accounts,[entry('2026-03-01','Posted',20),entry('2026-05-01','Posted',30),entry('2026-12-01','Posted',40),entry('2026-05-01','Draft',500)],{from:'2026-04-01',to:'2026-11-05'});
  const totals=trialReportGroups(report.rows);
  assert.equal(totals.debit,150);assert.equal(totals.credit,150);assert.equal(totals.difference,0);
});

test('parent groups aggregate descendants exactly once while preserving debit/credit splits', () => {
  const rows = [{ _id: 'bank', name: 'Bank', group: 'Regional Bank', accountingGroup: 'Bank Accounts', opening: -10, periodDebit: 30, periodCredit: 5, closing: 15, closingDebit: 15, closingCredit: 0 }, { _id: 'overdraft', name: 'Overdraft', group: 'Bank Accounts', opening: 20, periodDebit: 0, periodCredit: 30, closing: -10, closingDebit: 0, closingCredit: 10 }];
  const definitions = [{ name: 'Regional Bank', parent: 'Bank Accounts', accountingGroup: 'Bank Accounts' }];
  const all = trialReportGroups(rows, '', definitions);
  assert.equal(all.groups[0].name, 'Assets');
  assert.equal(all.groups[0].children[0].accounts.length, 2);
  assert.equal(all.periodDebit, 30); assert.equal(all.periodCredit, 35);
  assert.equal(all.openingDebit, 20); assert.equal(all.openingCredit, 10);
  assert.equal(all.debit, 15); assert.equal(all.credit, 10);
  assert.equal(trialReportGroups(rows, 'Bank Accounts', definitions).accounts.length, 2);
});

test('search, sorting, zero filters and cycles never duplicate report accounts or comparison balances', () => {
  const rows = [{ _id: 'one', name: 'Account B', code: '2', group: 'Custom A', closingDebit: 10, closingCredit: 0, previous: { closingDebit: 20, closingCredit: 0 } }, { _id: 'two', name: 'Account A', code: '1', group: 'Custom B', closingDebit: 0, closingCredit: 0 }];
  const definitions = [{ name: 'Custom A', parent: 'Custom B' }, { name: 'Custom B', parent: 'Custom A' }];
  const report = trialReportGroups(rows, '', definitions, { showZero: false });
  assert.equal(report.accounts.length, 1); assert.equal(report.debit, 10); assert.equal(report.previousDebit, 20);
  assert.deepEqual(trialReportGroups(rows, '', definitions, { sort: 'name' }).accounts.map((row) => row.name), ['Account A', 'Account B']);
  assert.equal(trialReportGroups(rows, '', definitions, { search: '2' }).accounts[0]._id, 'one');
});
