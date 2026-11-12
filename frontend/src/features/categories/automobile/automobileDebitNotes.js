import { creditAmounts, creditDate, creditHistory, creditId, creditLine, creditPrintDocument } from './automobileCreditNotes.js';
export { creditAmounts as debitAmounts, creditDate as debitDate, creditId as debitId, creditLine as debitLine, creditPrintDocument as debitPrintDocument };
export const debitStatus = (note) => note.accounting?.posted === true ? 'Issued' : note.lifecycleStatus === 'cancelled' ? 'Cancelled' : note.lifecycleStatus === 'draft' ? 'Draft' : note.accounting?.posted === false ? 'Not Posted' : 'Posting Not Recorded';
export const invoiceLookupKey = (note) => JSON.stringify([note.branch || '', note.extra?.originalSalesId || '', note.extra?.originalInvoiceNo || note.extra?.originalRef || '']);
export function debitRevisedTotal(note, invoice) {
  if (!invoice) return null;
  return creditAmounts(invoice).finalTotal + creditAmounts(note).finalTotal;
}
export function filterDebitNotes(notes, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  return notes.filter((note) => {
    const date = creditDate(note);
    if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    if (filters.customer && note.customer?.name !== filters.customer) return false;
    if (filters.status && debitStatus(note) !== filters.status) return false;
    return !query || [note.number, note.extra?.originalInvoiceNo, note.extra?.originalRef, note.customer?.name, note.customer?.city, note.extra?.reason, ...(note.items || []).map((item) => item.description), ...(note.charges || []).map((charge) => charge.label)].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}
export function debitStats(notes, now = new Date()) {
  const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  const issued = notes.filter((note) => debitStatus(note) === 'Issued');
  return { total: notes.length, value: notes.filter((note) => !['Cancelled', 'Draft'].includes(debitStatus(note))).reduce((sum, note) => sum + creditAmounts(note).finalTotal, 0), pending: notes.filter((note) => ['Not Posted', 'Posting Not Recorded'].includes(debitStatus(note))).length, issued: issued.length, monthly: issued.filter((note) => creditDate(note).startsWith(month)).reduce((sum, note) => sum + creditAmounts(note).finalTotal, 0) };
}
export const debitHistory = (note) => creditHistory(note).map((event) => ({ ...event, label: event.label.replace('Credit note', 'Debit note') }));

// Number-only legacy references are resolved exactly. Partial matches or
// duplicate numbers across branches must never supply an unrelated total.
export async function resolveDebitInvoice(note, api) {
  const id = note.extra?.originalSalesId;
  if (id) {
    const invoice = await api.getInvoice(id);
    if (String(invoice?._id || invoice?.id) !== String(id) || !['invoice', 'bill-of-supply', 'e-invoice', 'pharmacy-bill'].includes(invoice.documentType || 'invoice')) throw new Error('Linked sales invoice is unavailable.');
    return invoice;
  }
  const number = String(note.extra?.originalInvoiceNo || note.extra?.originalRef || '').trim();
  if (!number) throw new Error('No linked invoice recorded.');
  const matches = []; let page = 1; let seen = 0;
  while (true) {
    const result = await api.listInvoices({ search: number, branch: note.branch || undefined, page, limit: 100 });
    const rows = Array.isArray(result.data) ? result.data : [];
    matches.push(...rows.filter((invoice) => invoice.number === number && (!note.branch || invoice.branch === note.branch) && ['invoice', 'bill-of-supply', 'e-invoice', 'pharmacy-bill'].includes(invoice.documentType || 'invoice')));
    seen += rows.length;
    if (matches.length > 1 || !rows.length || seen >= (Number(result.total) || rows.length)) break;
    page++;
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'More than one invoice matches this reference. Open the note to verify its link.' : 'Linked sales invoice is unavailable.');
  return matches[0];
}
