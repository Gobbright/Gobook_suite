import { creditAmounts, creditId, creditLine, creditPrintDocument } from './automobileCreditNotes.js';
import { filterPurchaseOrders } from './automobilePurchaseOrders.js';
export { creditAmounts as supplierReturnAmounts, creditLine as supplierReturnLine, creditPrintDocument as supplierReturnPrintDocument };
export function supplierReturnStatus(note) {
  if (note.lifecycleStatus === 'cancelled') return 'Cancelled';
  if (note.accounting?.posted === true) return 'Posted';
  if (note.lifecycleStatus === 'draft') return 'Draft';
  return note.accounting?.posted === false ? 'Not Posted' : 'Posting Not Recorded';
}
export const SUPPLIER_RETURN_STATUSES = ['Posted', 'Not Posted', 'Posting Not Recorded', 'Draft', 'Cancelled'];
export function supplierReturnRow(note) {
  const amounts = creditAmounts(note);
  return { ...note, id: creditId(note), date: String(note.meta?.date || note.createdAt || '').slice(0, 10),
    originalPurchaseId: String(note.extra?.originalPurchaseId || ''), originalRef: note.extra?.originalInvoiceNo || note.extra?.originalRef || '',
    reason: note.extra?.reason || '', vendorInvoiceNo: note.extra?.vendorInvoiceNo || '',
    taxable: amounts.taxable + amounts.chargesSubtotal, gst: amounts.totalGst + amounts.chargesGst, total: amounts.finalTotal,
    goodsQty: (note.items || []).filter((item) => item.itemType !== 'Service').reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0),
    settlement: note.accounting?.posted === true ? 'Supplier Ledger' : 'Not Recorded',
  };
}
export function filterSupplierReturns(notes, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  return filterPurchaseOrders(notes, { ...filters, status: '', search: '' }).filter((note) => (!filters.status || supplierReturnStatus(note) === filters.status) && (!query || [note.number, note.originalRef, note.vendorInvoiceNo, note.customer?.name, note.customer?.phone, note.reason].join(' ').toLowerCase().includes(query)));
}
export function supplierReturnStats(notes) {
  const active = notes.filter((note) => !['Draft', 'Cancelled'].includes(supplierReturnStatus(note)));
  const posted = active.filter((note) => supplierReturnStatus(note) === 'Posted');
  return { count: notes.length, value: active.reduce((sum, note) => sum + note.total, 0), unposted: notes.filter((note) => supplierReturnStatus(note) === 'Not Posted').length, credit: posted.reduce((sum, note) => sum + note.total, 0), quantity: active.reduce((sum, note) => sum + note.goodsQty, 0), posted: posted.length };
}
export function supplierReturnHistory(note) {
  const events = [{ label: 'Return created', at: note.createdAt }];
  if (note.accounting?.posted && note.accounting.postedAt) events.push({ label: 'Supplier ledger posted', at: note.accounting.postedAt, reference: note.accounting.voucherNo });
  if (note.updatedAt && note.updatedAt !== note.createdAt) events.push({ label: 'Return updated', at: note.updatedAt });
  return events.filter((event) => event.at && Number.isFinite(Date.parse(event.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
