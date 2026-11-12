import { creditAmounts, creditId, creditLine, creditPrintDocument } from './automobileCreditNotes.js';
export { creditAmounts as purchaseOrderAmounts, creditLine as purchaseOrderLine, creditPrintDocument as purchaseOrderPrintDocument };
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => String(value ?? '').trim();
export function purchaseOrderRow(doc, entries = []) {
  const id = creditId(doc); const amounts = creditAmounts(doc);
  const linkedEntries = entries.filter((entry) => text(entry.extra?.linkedPurchaseOrderId) === id && !['draft', 'cancelled'].includes(entry.lifecycleStatus));
  const purchaseEntryTotal = linkedEntries.reduce((sum, entry) => sum + creditAmounts(entry).finalTotal, 0);
  const difference = purchaseEntryTotal - amounts.finalTotal;
  return { ...doc, id, date: doc.meta?.date || '', expectedDelivery: doc.extra?.expectedDelivery || '',
    taxable: amounts.taxable + amounts.chargesSubtotal, gst: amounts.totalGst + amounts.chargesGst, total: amounts.finalTotal,
    linkedEntries, purchaseEntryCount: linkedEntries.length, purchaseEntryTotal, purchaseEntryDifference: difference,
    purchaseEntryMatched: linkedEntries.length > 0 && Math.abs(difference) < 1,
    orderedQty: (doc.items || []).reduce((sum, item) => sum + Math.max(0, number(item.qty)), 0),
    enteredQty: linkedEntries.reduce((sum, entry) => sum + (entry.items || []).reduce((qty, item) => qty + Math.max(0, number(item.qty)), 0), 0),
  };
}
export function purchaseOrderStatus(order) {
  const recorded = text(order.extra?.purchaseOrderStatus || order.extra?.poStatus || order.extra?.status).toLowerCase().replace(/[ _]+/g, '-');
  if (order.lifecycleStatus === 'cancelled' || ['cancelled', 'canceled'].includes(recorded)) return 'Cancelled';
  const saved = { 'pending-approval': 'Pending Approval (Recorded)', approved: 'Approved (Recorded)', completed: 'Completed (Recorded)', 'partially-received': 'Partially Received (Recorded)' }[recorded];
  if (saved) return saved;
  if (order.lifecycleStatus === 'draft' || recorded === 'draft') return 'Draft';
  if (order.purchaseEntryMatched) return 'PE Matched';
  if (order.purchaseEntryCount) return 'PE Mismatch';
  return 'Pending PE';
}
export function filterPurchaseOrders(orders, filters) {
  const query = text(filters.search).toLowerCase(); const contains = (value, needle) => text(value).toLowerCase().includes(text(needle).toLowerCase());
  return orders.filter((order) => {
    const party = order.customer || {}; const items = order.items || [];
    if (filters.from && order.date < filters.from || filters.to && order.date > filters.to) return false;
    if (filters.customer && !contains(party.name, filters.customer)) return false;
    if (filters.status && purchaseOrderStatus(order) !== filters.status) return false;
    if (filters.city && !contains(party.city, filters.city) || filters.state && !contains(party.state, filters.state)) return false;
    if (filters.supplyType && order.supplyType !== filters.supplyType) return false;
    if (filters.gstType === 'with' && !(order.gst > 0) || filters.gstType === 'without' && order.gst > 0) return false;
    if (filters.amountMin !== '' && filters.amountMin != null && order.total < Number(filters.amountMin) || filters.amountMax !== '' && filters.amountMax != null && order.total > Number(filters.amountMax)) return false;
    if (filters.itemType && !items.some((item) => contains(item.itemType || item.type, filters.itemType))) return false;
    if (filters.hsn && !items.some((item) => contains(item.hsn || item.hsnCode || item.sac, filters.hsn))) return false;
    if (filters.productName && !items.some((item) => contains(item.description || item.name || item.productName, filters.productName))) return false;
    if (filters.barcode && !items.some((item) => contains(item.barcode, filters.barcode))) return false;
    return !query || [order.number, party.name, party.phone, party.gstin].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}
export const PURCHASE_ORDER_STATUSES = ['Draft', 'Pending PE', 'PE Matched', 'PE Mismatch', 'Pending Approval (Recorded)', 'Approved (Recorded)', 'Partially Received (Recorded)', 'Completed (Recorded)', 'Cancelled'];
