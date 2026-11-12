import { bankBookSources } from '../../../automobile/automobileBankBook.js';
import { calculateCashBook } from '../../../automobile/automobileCashBook.js';

export function bankReportSources(accounts, vouchers, legacy) {
  const sources = bankBookSources(accounts, vouchers, legacy);
  const events = sources.events.map((event) => {
    const historical = event.legacy ? event : legacy.find((row) => row.bank === event.bank && !['OB', 'CB'].includes(row.vchType) && (row.vchNo === event.vchNo || row.sourceType && row.sourceId && row.sourceType === event.sourceType && String(row.sourceId) === String(event.sourceId)));
    const clearing = (event.bankReconciliations || []).find((row) => row.bank === event.bank);
    return { ...event, narration: event.legacy ? '' : event.narration, referenceNo: clearing?.bankReference || historical?.bankReference || event.referenceNo || (event.lines || []).find((line) => line.ledgerName === event.bank && line.billRef)?.billRef || '', bankDate: clearing?.bankDate || historical?.bankDate || '' };
  });
  return { ...sources, events };
}

export function calculateBankReport(accounts, events, filters) {
  const masters = accounts.filter((account) => account.name === filters.account).map((account) => ({ ...account, group: 'Cash-In-Hand' }));
  // Transfers affect receipts/payments of the selected bank, just like its other movements.
  return calculateCashBook(masters, events.filter((row) => row.bank === filters.account), filters);
}

export function bankAccountLabel(name, legacy, branch = '') {
  const records = legacy.filter((row) => row.bank === name && (!branch || row.branch === branch));
  const numbers = [...new Set(records.map((row) => row.accountNo).filter(Boolean))];
  return numbers.length === 1 ? `${name} – A/c ${numbers[0]}` : name;
}
