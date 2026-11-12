import { automobileInvoiceRow } from './automobileInvoices.js';
import { creditAmounts, creditId, creditLine, creditPrintDocument } from './automobileCreditNotes.js';
import { filterPurchaseOrders } from './automobilePurchaseOrders.js';
export { creditAmounts as purchaseEntryAmounts, creditLine as purchaseEntryLine, creditPrintDocument as purchaseEntryPrintDocument };
const supplied = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function purchaseEntryRow(doc, purchaseOrders = []) {
  const row = automobileInvoiceRow(doc);
  const linkedPoId = String(doc.extra?.linkedPurchaseOrderId || '');
  const linkedOrder = linkedPoId ? purchaseOrders.find((order) => creditId(order) === linkedPoId) : null;
  const linkedPoNumber = doc.extra?.linkedPurchaseOrderNo || linkedOrder?.number || '';
  const poTotal = linkedOrder ? creditAmounts(linkedOrder).finalTotal : supplied(doc.extra?.purchaseOrderTotal) ? Number(doc.extra.purchaseOrderTotal) : null;
  const hasReference = Boolean(linkedPoId || linkedPoNumber);
  const difference = hasReference && poTotal !== null ? row.total - poTotal : null;
  const matchStatus = !hasReference ? 'No Linked PO' : poTotal === null ? 'PO Unavailable' : Math.abs(difference) < 1 ? 'Matched' : 'Mismatch';
  const vendorInvoiceAmount = supplied(doc.extra?.vendorInvoiceAmount) ? Number(doc.extra.vendorInvoiceAmount) : null;
  return { ...row, date: String(doc.meta?.date || doc.createdAt || '').slice(0, 10),
    vendorInvoiceNo: doc.extra?.vendorInvoiceNo || doc.meta?.poRef || '', vendorInvoiceAmount,
    vendorDifference: vendorInvoiceAmount === null ? null : row.total - vendorInvoiceAmount,
    linkedPoId, linkedPoNumber, linkedOrder, poTotal: hasReference ? poTotal : null, difference, matchStatus,
    quantity: (doc.items || []).reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0),
  };
}
export const purchaseEntryStatus = (entry) => entry.matchStatus;
export const PURCHASE_ENTRY_STATUSES = ['Matched', 'Mismatch', 'No Linked PO', 'PO Unavailable'];
export function filterPurchaseEntries(entries, filters) {
  const search = String(filters.search || '').trim().toLowerCase();
  const paymentStatus = (value) => String(value || '').toLowerCase().replace('partially paid', 'partial');
  return filterPurchaseOrders(entries, { ...filters, status: '', search: '' }).filter((entry) => {
    if (filters.status && entry.matchStatus !== filters.status) return false;
    if (filters.paymentStatus && paymentStatus(entry.paymentStatus) !== paymentStatus(filters.paymentStatus)) return false;
    const methods = [String(entry.paymentMethod || '').split(/\s*\+\s*/), ...(entry.paymentSplits || []).map((split) => split.method)].flat().map((method) => String(method || '').trim().toLowerCase());
    if (filters.paymentMethod && !methods.includes(filters.paymentMethod.toLowerCase())) return false;
    return !search || [entry.number, entry.vendorInvoiceNo, entry.linkedPoNumber, entry.customer.name, entry.customer.phone, entry.customer.gstin].join(' ').toLowerCase().includes(search);
  });
}
export function purchaseEntryStats(entries) {
  const active = entries.filter((entry) => !['draft', 'cancelled'].includes(entry.lifecycleStatus));
  return { count: entries.length, value: active.reduce((sum, entry) => sum + entry.total, 0), paid: active.reduce((sum, entry) => sum + entry.paid, 0), balance: active.reduce((sum, entry) => sum + entry.balanceDue, 0), matched: entries.filter((entry) => entry.matchStatus === 'Matched').length, mismatch: entries.filter((entry) => entry.matchStatus === 'Mismatch').length };
}
