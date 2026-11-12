import test from 'node:test';
import assert from 'node:assert/strict';
import { bankReportSources, calculateBankReport, bankAccountLabel } from '../src/features/categories/common/modules/accounting/bankBookReport.js';
const accounts=[{name:'HDFC',group:'Bank Accounts',opening:1000,branch:'Main'},{name:'SBI',group:'Bank Accounts',opening:2000,branch:'Main'}];
const filters={account:'HDFC',from:'2026-04-01',to:'2026-04-30',branch:''};
const voucher={_id:'one',voucherNo:'B-1',date:'2026-04-02',status:'Posted',voucherType:'Contra',branch:'Main',lines:[{ledgerName:'HDFC',side:'credit',amount:200},{ledgerName:'SBI',side:'debit',amount:200}]};
test('selected-bank transfers are included in receipt/payment totals and running balances',()=>{
  const source=bankReportSources(accounts,[voucher],[]);
  const hdfc=calculateBankReport(accounts,source.events,filters),sbi=calculateBankReport(accounts,source.events,{...filters,account:'SBI'});
  assert.deepEqual([hdfc.opening,hdfc.receipts,hdfc.payments,hdfc.closing],[1000,0,200,800]);
  assert.deepEqual([sbi.opening,sbi.receipts,sbi.payments,sbi.closing],[2000,200,0,2200]);
});
test('duplicate bank history supplies cheque references without double-counting',()=>{
  const legacy=[{_id:'old',bank:'HDFC',vchNo:'B-1',date:'2026-04-02',bankReference:'CHQ-123',withdrawal:200}];
  const report=calculateBankReport(accounts,bankReportSources(accounts,[voucher],legacy).events,filters);
  assert.equal(report.rows.length,1);assert.equal(report.payments,200);assert.equal(report.rows[0].referenceNo,'CHQ-123');
});
test('saved bank references and clearing dates take precedence over a general voucher reference',()=>{
  const source=bankReportSources(accounts,[{...voucher,referenceNo:'General',bankReconciliations:[{bank:'HDFC',bankReference:'UTR-555',bankDate:'2026-04-04'}]}],[]);
  const row=calculateBankReport(accounts,source.events,filters).rows[0];
  assert.equal(row.referenceNo,'UTR-555');assert.equal(row.bankDate,'2026-04-04');
});
test('historical banks and account labels stay separate, with explicit snapshot adjustments',()=>{
  const legacy=[{_id:'ob',bank:'Old Bank',accountNo:'123',vchNo:'OB',vchType:'OB',date:'2026-03-01',balance:500},{_id:'cb',bank:'Old Bank',accountNo:'123',vchNo:'CB',vchType:'CB',date:'2026-04-01',balance:0}];
  const source=bankReportSources(accounts,[],legacy);
  assert.ok(source.banks.includes('Old Bank'));assert.equal(bankAccountLabel('Old Bank',legacy),'Old Bank – A/c 123');
  const report=calculateBankReport(accounts,source.events,{...filters,account:'Old Bank'});
  assert.deepEqual([report.opening,report.adjustments,report.closing],[500,-500,0]);
});
