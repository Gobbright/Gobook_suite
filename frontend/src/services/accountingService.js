import { apiClient } from './apiClient.js';

function upload(path, formData) {
  return apiClient(path, {
    method: 'POST',
    body: formData,
  });
}

export function getLedgerAccounts(params = {}) {
  return apiClient(`/accounting/ledger${buildVoucherQuery(params)}`);
}

export function getLedgerDetails(id, params = {}) {
  return apiClient(`/accounting/ledger/${encodeURIComponent(id)}/details${buildVoucherQuery(params)}`);
}

export function getLedgerGroups() {
  return apiClient('/accounting/ledger-groups');
}

export function createLedgerGroup(group) {
  return apiClient('/accounting/ledger-groups', { method: 'POST', body: JSON.stringify(group) });
}

export function resetAccountingFromInvoices(params = {}) {
  return apiClient(`/accounting/reset-from-invoices${buildVoucherQuery(params)}`, { method: 'POST' });
}

export function createLedgerAccount(account) {
  return apiClient('/accounting/ledger', {
    method: 'POST',
    body: JSON.stringify(account),
  });
}

export function updateLedgerAccount(id, account) {
  return apiClient(`/accounting/ledger/${id}`, {
    method: 'PUT',
    body: JSON.stringify(account),
  });
}

export function deleteLedgerAccount(id) {
  return apiClient(`/accounting/ledger/${id}`, { method: 'DELETE' });
}

export function importLedgerAccounts(formData) {
  return upload('/accounting/ledger/import', formData);
}

export function getJournalEntries() {
  return apiClient('/accounting/journal-entries');
}

export function getRecurringJournals() { return apiClient('/accounting/recurring-journals'); }
export function createRecurringJournal(schedule) { return apiClient('/accounting/recurring-journals', { method: 'POST', body: JSON.stringify(schedule) }); }
export function updateRecurringJournal(id, payload) { return apiClient(`/accounting/recurring-journals/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); }
export function generateRecurringJournal(id, date) { return apiClient(`/accounting/recurring-journals/${id}/generate`, { method: 'POST', body: JSON.stringify({ date }) }); }

export function createJournalEntry(entry) {
  return apiClient('/accounting/journal-entries', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export function updateJournalEntry(id, entry) {
  return apiClient(`/accounting/journal-entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export function deleteJournalEntry(id) {
  return apiClient(`/accounting/journal-entries/${id}`, { method: 'DELETE' });
}

export function importJournalEntries(formData) {
  return upload('/accounting/journal-entries/import', formData);
}

function buildVoucherQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function getVoucherTypes() {
  return apiClient('/accounting/vouchers/types');
}

export function getNextVoucherNumber(voucherType = 'Journal', date = '') {
  return apiClient(`/accounting/vouchers/next-number${buildVoucherQuery({ voucherType, date })}`);
}

export function getAccountingVouchers(params = {}) {
  return apiClient(`/accounting/vouchers${buildVoucherQuery(params)}`);
}

export function getAccountingVoucher(id) {
  return apiClient(`/accounting/vouchers/${id}`);
}

export function createAccountingVoucher(voucher) {
  return apiClient('/accounting/vouchers', {
    method: 'POST',
    body: JSON.stringify(voucher),
  });
}

export function updateAccountingVoucher(id, voucher) {
  return apiClient(`/accounting/vouchers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(voucher),
  });
}

export function deleteAccountingVoucher(id) {
  return apiClient(`/accounting/vouchers/${id}`, { method: 'DELETE' });
}

export function cancelAccountingVoucher(id, reason) {
  return apiClient(`/accounting/vouchers/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function reverseAccountingVoucher(id, reason, date) {
  return apiClient(`/accounting/vouchers/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason, date }) });
}

export function getVoucherBillReferences(params) {
  return apiClient(`/accounting/vouchers/bill-references${buildVoucherQuery(params)}`);
}

export function getAccountingDayBook(params = {}) {
  return apiClient(`/accounting/reports/day-book${buildVoucherQuery(params)}`);
}

export function getLedgerStatement(params = {}) {
  return apiClient(`/accounting/reports/ledger-statement${buildVoucherQuery(params)}`);
}

export function getVoucherRegister(params = {}) {
  return apiClient(`/accounting/reports/voucher-register${buildVoucherQuery(params)}`);
}

export function getOutstandingStatement(params = {}) {
  return apiClient(`/accounting/reports/outstanding${buildVoucherQuery(params)}`);
}

export function getBillWiseStatement(params = {}) {
  return apiClient(`/accounting/reports/bill-wise${buildVoucherQuery(params)}`);
}

export function getCostCenterStatement(params = {}) {
  return apiClient(`/accounting/reports/cost-centers${buildVoucherQuery(params)}`);
}

export function getTrialBalance(params = {}) {
  return apiClient(`/accounting/trial-balance${buildVoucherQuery(params)}`);
}

export function getPnlStatement(params = {}) {
  return apiClient(`/accounting/pnl${buildVoucherQuery(params)}`);
}

export function getBalanceSheet(params = {}) {
  return apiClient(`/accounting/balance-sheet${buildVoucherQuery(params)}`);
}

export function getCashBook(params = {}) {
  return apiClient(`/accounting/cash-book${buildVoucherQuery(params)}`);
}

export function createCashBookEntry(entry) {
  return apiClient('/accounting/cash-book', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export function updateCashBookEntry(id, entry) {
  return apiClient(`/accounting/cash-book/${id}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export function deleteCashBookEntry(id) {
  return apiClient(`/accounting/cash-book/${id}`, { method: 'DELETE' });
}

export function getBankBook(bank, params = {}) {
  return apiClient(`/accounting/bank-book${buildVoucherQuery({ ...params, bank })}`);
}

export function getBankReconciliation(params = {}) {
  return apiClient(`/accounting/bank-reconciliation${buildVoucherQuery(params)}`);
}

export function updateBankReconciliation(id, entry) {
  return apiClient(`/accounting/bank-reconciliation/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export function createBankBookEntry(entry) {
  return apiClient('/accounting/bank-book', {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

export function updateBankBookEntry(id, entry) {
  return apiClient(`/accounting/bank-book/${id}`, {
    method: 'PUT',
    body: JSON.stringify(entry),
  });
}

export function deleteBankBookEntry(id) {
  return apiClient(`/accounting/bank-book/${id}`, { method: 'DELETE' });
}
