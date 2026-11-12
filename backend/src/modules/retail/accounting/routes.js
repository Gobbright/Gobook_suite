import { Router } from 'express';

import {
  createBankBookEntry,
  createCashBookEntry,
  createJournalEntry,
  createLedgerAccount,
  deleteBankBookEntry,
  deleteCashBookEntry,
  deleteJournalEntry,
  deleteLedgerAccount,
  getAccountingSummary,
  getBalanceSheet,
  getBillWiseStatement,
  getCostCenterStatement,
  getDayBook,
  getBankReconciliation,
  getLedgerStatement,
  getOutstandingStatement,
  getPnlStatement,
  getTrialBalance,
  getVoucherRegister,
  importJournalEntries,
  importLedgerAccounts,
  listBankBookEntries,
  listCashBookEntries,
  listJournalEntries,
  listLedgerAccounts,
  resetAccountingFromInvoices,
  updateBankBookEntry,
  updateBankReconciliation,
  updateCashBookEntry,
  updateJournalEntry,
  updateLedgerAccount,
} from './accountingController.js';
import {
  createVoucher,
  deleteVoucher,
  getNextVoucherNumber,
  getVoucher,
  listVoucherTypes,
  listVouchers,
  updateVoucher,
  listBillReferences,
  cancelVoucher,
  reverseVoucher,
} from './voucherController.js';
import { uploadExcelFile } from '../../../utils/excelImport.js';
import { requireAccountingAction } from '../../../middleware/requireAccountingAction.js';
import { createLedgerGroup, getManagedLedger, listLedgerGroups } from './ledgerManagementController.js';
import { listRecurringJournals, configureRecurringJournal, toggleRecurringJournal, generateRecurringDraft } from './recurringJournalController.js';

export const accountingRouter = Router();

accountingRouter.get('/', getAccountingSummary);
accountingRouter.get('/recurring-journals', requireAccountingAction('view'), listRecurringJournals);
accountingRouter.post('/recurring-journals', requireAccountingAction('create'), configureRecurringJournal);
accountingRouter.put('/recurring-journals/:id', requireAccountingAction('edit'), toggleRecurringJournal);
accountingRouter.post('/recurring-journals/:id/generate', requireAccountingAction('create'), generateRecurringDraft);
accountingRouter.post('/reset-from-invoices', resetAccountingFromInvoices);

accountingRouter.get('/vouchers/types', requireAccountingAction('view'), listVoucherTypes);
accountingRouter.get('/vouchers/next-number', requireAccountingAction('create'), getNextVoucherNumber);
accountingRouter.get('/vouchers/bill-references', requireAccountingAction('view'), listBillReferences);
accountingRouter.get('/reports/day-book', getDayBook);
accountingRouter.get('/reports/ledger-statement', requireAccountingAction('view'), getLedgerStatement);
accountingRouter.get('/reports/voucher-register', getVoucherRegister);
accountingRouter.get('/reports/outstanding', getOutstandingStatement);
accountingRouter.get('/reports/bill-wise', getBillWiseStatement);
accountingRouter.get('/reports/cost-centers', getCostCenterStatement);
accountingRouter.get('/vouchers', requireAccountingAction('view'), listVouchers);
accountingRouter.post('/vouchers', requireAccountingAction('create'), createVoucher);
accountingRouter.get('/vouchers/:id', requireAccountingAction('view'), getVoucher);
accountingRouter.put('/vouchers/:id', requireAccountingAction('edit'), updateVoucher);
accountingRouter.post('/vouchers/:id/cancel', requireAccountingAction('edit'), cancelVoucher);
accountingRouter.post('/vouchers/:id/reverse', requireAccountingAction('edit'), requireAccountingAction('create'), reverseVoucher);
accountingRouter.delete('/vouchers/:id', requireAccountingAction('delete'), deleteVoucher);

accountingRouter.get('/ledger', requireAccountingAction('view'), listLedgerAccounts);
accountingRouter.get('/ledger-groups', requireAccountingAction('view'), listLedgerGroups);
accountingRouter.post('/ledger-groups', requireAccountingAction('create'), createLedgerGroup);
accountingRouter.get('/ledger/:id/details', requireAccountingAction('view'), getManagedLedger);
accountingRouter.post('/ledger/import', requireAccountingAction('create'), uploadExcelFile.single('file'), importLedgerAccounts);
accountingRouter.post('/ledger', requireAccountingAction('create'), createLedgerAccount);
accountingRouter.put('/ledger/:id', requireAccountingAction('edit'), updateLedgerAccount);
accountingRouter.delete('/ledger/:id', requireAccountingAction('delete'), deleteLedgerAccount);

accountingRouter.get('/journal-entries', requireAccountingAction('view'), listJournalEntries);
accountingRouter.post('/journal-entries/import', requireAccountingAction('create'), uploadExcelFile.single('file'), importJournalEntries);
accountingRouter.post('/journal-entries', requireAccountingAction('create'), createJournalEntry);
accountingRouter.put('/journal-entries/:id', requireAccountingAction('edit'), updateJournalEntry);
accountingRouter.delete('/journal-entries/:id', requireAccountingAction('delete'), deleteJournalEntry);

accountingRouter.get('/trial-balance', requireAccountingAction('view'), getTrialBalance);
accountingRouter.get('/pnl', getPnlStatement);
accountingRouter.get('/balance-sheet', getBalanceSheet);

accountingRouter.get('/cash-book', listCashBookEntries);
accountingRouter.post('/cash-book', createCashBookEntry);
accountingRouter.put('/cash-book/:id', updateCashBookEntry);
accountingRouter.delete('/cash-book/:id', deleteCashBookEntry);

accountingRouter.get('/bank-book', listBankBookEntries);
accountingRouter.get('/bank-reconciliation', getBankReconciliation);
accountingRouter.put('/bank-reconciliation/:id', updateBankReconciliation);
accountingRouter.post('/bank-book', createBankBookEntry);
accountingRouter.put('/bank-book/:id', updateBankBookEntry);
accountingRouter.delete('/bank-book/:id', deleteBankBookEntry);
