export const challanId = (doc) => String(doc._id || doc.id || '');
export const challanDate = (doc) => doc.meta?.date || doc.createdAt?.slice(0, 10) || '';
export const DELIVERY_STATES = ['draft', 'ready', 'dispatched', 'in-transit', 'delivered'];
export const DELIVERY_LABELS = { draft: 'Draft', ready: 'Ready', dispatched: 'Dispatched', 'in-transit': 'In Transit', delivered: 'Delivered' };
export const challanState = (doc) => DELIVERY_STATES.includes(doc.extra?.deliveryStatus) ? doc.extra.deliveryStatus : 'draft';
export const challanQuantity = (doc) => (doc.items || []).reduce((sum, item) => sum + (Number.isFinite(Number(item.qty)) ? Number(item.qty) : 0), 0);
export const challanLinked = (doc) => Boolean(doc.extra?.convertedInvoiceId);
export const challanEditable = (extra = {}) => !extra.convertedInvoiceId && ['draft', 'ready'].includes(extra.deliveryStatus || 'draft');
export function validateChallanForm({ customer, meta, items = [], charges = [] }) {
  const errors = {};
  if (!String(customer?.name || '').trim()) errors.customerName = 'Select a customer before saving the challan.';
  if (!String(meta?.number || '').trim()) errors.invoiceNumber = 'Challan number is required.';
  if (!meta?.date || !Number.isFinite(Date.parse(meta.date))) errors.invoiceDate = 'Enter a valid challan date.';
  if (!items.length) errors.items = 'Add at least one product or service before saving the challan.';
  items.forEach((item, index) => {
    if (!String(item.description || '').trim()) errors[`item_name_${index}`] = `Row ${index + 1}: product or service name is required.`;
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) errors[`item_qty_${index}`] = `Row ${index + 1}: quantity must be greater than zero.`;
    if (!Number.isFinite(Number(item.rate)) || Number(item.rate) < 0) errors[`item_rate_${index}`] = `Row ${index + 1}: enter a valid non-negative rate.`;
    if (!Number.isFinite(Number(item.discount || 0)) || Number(item.discount || 0) < 0 || Number(item.discount || 0) > 100) errors[`item_discount_${index}`] = `Row ${index + 1}: discount must be between 0 and 100%.`;
  });
  if (charges.some((charge) => !Number.isFinite(Number(charge.amount)) || Number(charge.amount) < 0)) errors.charges = 'Additional charges must be valid non-negative amounts.';
  return errors;
}
export function challanActions(doc) {
  return { draft: [{ value: 'ready', label: 'Mark as Ready' }], ready: [{ value: 'dispatched', label: 'Mark as Dispatched' }, { value: 'delivered', label: 'Mark as Delivered' }], dispatched: [{ value: 'in-transit', label: 'Mark In Transit' }, { value: 'delivered', label: 'Mark as Delivered' }], 'in-transit': [{ value: 'delivered', label: 'Mark as Delivered' }], delivered: [] }[challanState(doc)];
}
export function challanStats(docs) {
  return { total: docs.length, ready: docs.filter((doc) => challanState(doc) === 'ready').length, transit: docs.filter((doc) => ['dispatched', 'in-transit'].includes(challanState(doc))).length, delivered: docs.filter((doc) => challanState(doc) === 'delivered').length, unbilled: docs.filter((doc) => !challanLinked(doc)).length };
}
export function filterChallans(docs, filters) {
  const query = (filters.search || '').trim().toLowerCase();
  return docs.filter((doc) => {
    const date = challanDate(doc).slice(0, 10);
    if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    if (filters.customer && doc.customer?.name !== filters.customer) return false;
    if (filters.status && challanState(doc) !== filters.status) return false;
    return !query || [doc.number, doc.customer?.name, doc.meta?.poRef, doc.extra?.vehicleNumber, doc.extra?.transporter, ...(doc.items || []).map((item) => `${item.description} ${item.productCode || ''}`)].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}
export function challanTimeline(doc) {
  const current = DELIVERY_STATES.indexOf(challanState(doc));
  return [['ready', 'readyAt'], ['dispatched', 'dispatchedAt'], ['in-transit', 'inTransitAt'], ['delivered', 'deliveredAt']].map(([state, timestamp]) => ({ state, label: DELIVERY_LABELS[state], reached: current >= DELIVERY_STATES.indexOf(state), at: doc.extra?.[timestamp] || null }));
}
