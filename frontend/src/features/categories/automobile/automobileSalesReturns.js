export const returnId = (note) => String(note._id || note.id);
export const returnState = (note) => note.returnStatus || 'completed';
export const returnDate = (note) => (note.meta?.date || note.date || note.createdAt || '').slice(0, 10);
export const returnStatus = (note) => ({ requested: 'Under Review', received: 'Ready to Settle', completed: 'Completed' }[returnState(note)] || 'Unknown');

export function returnLineKey(item) {
  const text = (value) => String(value || '').trim().toLowerCase();
  const gross = Number(item.rate) * Number(item.qty);
  const discount = item.discountType === 'amount' ? (gross > 0 ? Number(item.discount || 0) / gross * 100 : 0) : Number(item.discount || 0);
  return JSON.stringify([text(item.description), text(item.size), text(item.unit), Number(item.rate), Number(item.gstRate || 0), Math.round(discount * 1e6) / 1e6]);
}

export function returnLineAvailability(item, sourceItems = [], selectedItems = []) {
  const key = returnLineKey(item);
  const matching = sourceItems.filter((row) => returnLineKey(row) === key);
  const available = matching.reduce((sum, row) => sum + (Number(row.remainingQty) || 0), 0);
  const usedElsewhere = selectedItems.filter((row) => row.id !== item.id && returnLineKey(row) === key).reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
  return { sold: matching.reduce((sum, row) => sum + (Number(row.soldQty ?? row.qty) || 0), 0), returned: matching.reduce((sum, row) => sum + (Number(row.returnedQty) || 0), 0), available, maximum: Math.max(0, available - usedElsewhere) };
}

export function validateReturnRequest({ customer = {}, meta = {}, extra = {}, items = [], source }) {
  const errors = {};
  if (!String(meta.number || '').trim()) errors.invoiceNumber = 'Return number is required.';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') && Number.isFinite(Date.parse(meta.date)) && new Date(meta.date).toISOString().slice(0, 10) === meta.date;
  if (!validDate) errors.invoiceDate = 'Enter a valid return date.';
  if (validDate && extra.originalInvoiceDate && meta.date < extra.originalInvoiceDate) errors.invoiceDate = 'Return date cannot precede the original invoice date.';
  if (!extra.originalSalesId) errors.originalInvoiceNo = 'Select an original sales invoice.';
  else if (!source || String(source._id || source.id) !== String(extra.originalSalesId)) errors.originalInvoiceNo = 'Load the original invoice details before saving.';
  if (!String(extra.reason || '').trim()) errors.reason = 'Reason for return is required.';
  if (!String(customer.name || '').trim()) errors.customerName = 'Select an invoice to load its customer.';
  else if (source && String(customer.name).trim().toLowerCase() !== String(source.customer?.name || '').trim().toLowerCase()) errors.customerName = 'Customer must match the selected invoice.';
  if (!items.length) errors.items = 'Keep at least one item to return.';
  const remaining = new Map();
  for (const row of source?.items || []) { const key = returnLineKey(row); remaining.set(key, (remaining.get(key) || 0) + (Number(row.remainingQty) || 0)); }
  items.forEach((item, index) => {
    const key = returnLineKey(item); const quantity = Number(item.qty);
    if (!String(item.description || '').trim() || !Number.isFinite(quantity) || quantity <= 0) errors[`item_qty_${index}`] = `Row ${index + 1}: return quantity must be greater than zero.`;
    else if (source && !remaining.has(key)) errors[`item_source_${index}`] = `Row ${index + 1}: item, variant, rate, discount and GST must match the original invoice.`;
    else if (source && quantity > remaining.get(key) + 0.000001) errors[`item_qty_${index}`] = `${item.description}: only ${Math.max(0, remaining.get(key))} units remain returnable.`;
    else if (source) remaining.set(key, remaining.get(key) - quantity);
  });
  return errors;
}

export function returnAmounts(note) {
  let taxable = 0; let gst = 0;
  for (const item of note.items || []) {
    const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
    const discount = item.discountType === 'amount' ? Math.min(gross, Number(item.discount) || 0) : gross * (Number(item.discount) || 0) / 100;
    const base = gross - discount; taxable += base; gst += base * (Number(item.gstRate) || 0) / 100;
  }
  for (const charge of note.charges || []) { taxable += Number(charge.amount) || 0; gst += (Number(charge.amount) || 0) * (Number(charge.gstRate) || 0) / 100; }
  const beforeDiscount = taxable + gst;
  const discount = note.additionalDiscount?.type === 'percent' ? beforeDiscount * (Number(note.additionalDiscount.value) || 0) / 100 : Math.min(beforeDiscount, Number(note.additionalDiscount?.value) || 0);
  return { taxable: Number(note.totals?.taxable ?? taxable), gst: Number(note.totals?.totalGst ?? gst), total: Number(note.totals?.finalTotal ?? note.totals?.grandTotal ?? note.invoiceTotal ?? Math.round(beforeDiscount - discount)) };
}

export function returnStockStatus(note) {
  const state = returnState(note);
  if (state === 'requested') return 'To Receive';
  if (state === 'received') return 'To Inspect';
  if (state !== 'completed') return 'Unknown';
  const goods = (note.items || []).filter((item) => item.itemType !== 'Service');
  if (!goods.length) return 'No Stock Movement';
  if (goods.some((item) => item.restockQty == null)) return 'Not Recorded';
  if (goods.every((item) => Number(item.restockQty) === 0)) return 'Not Restocked';
  if (goods.every((item) => Number(item.restockQty) >= Number(item.qty))) return 'Restocked';
  return 'Partly Restocked';
}

export function returnItemStatus(note, item) {
  if (item.itemType === 'Service') return { label: 'Service', tone: 'neutral' };
  if (returnState(note) !== 'completed') return { label: 'Pending Inspection', tone: 'amber' };
  if (item.restockQty == null) return { label: 'Not Recorded', tone: 'neutral' };
  if (Number(item.restockQty) <= 0) return { label: 'Not Approved', tone: 'red' };
  return { label: Number(item.restockQty) >= Number(item.qty) ? 'Approved' : `${item.restockQty} Approved`, tone: 'green' };
}

export function salesReturnStats(notes, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(`${today}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 6 + index); return day.toISOString().slice(0, 10); });
  const stats = { total: 0, value: 0, review: 0, ready: 0, completed: 0, trends: { total: Array(7).fill(0), value: Array(7).fill(0), review: Array(7).fill(0), ready: Array(7).fill(0), completed: Array(7).fill(0) } };
  for (const note of notes) {
    const amount = returnAmounts(note).total;
    const key = { requested: 'review', received: 'ready', completed: 'completed' }[returnState(note)];
    stats.total++; stats.value += amount; if (key) stats[key]++;
    const day = days.indexOf(returnDate(note));
    if (day >= 0) { stats.trends.total[day]++; stats.trends.value[day] += amount; if (key) stats.trends[key][day]++; }
  }
  return stats;
}

export function filterSalesReturns(notes, { search = '', customer = '', status = '', from = '', to = '', view = '' } = {}) {
  const query = search.trim().toLowerCase();
  return notes.filter((note) => {
    const date = returnDate(note); const stock = returnStockStatus(note);
    return (!query || [note.number, note.extra?.originalInvoiceNo, note.extra?.originalRef, note.customer?.name, note.customer?.phone].some((value) => String(value || '').toLowerCase().includes(query)))
      && (!customer || note.customer?.name === customer) && (!status || returnState(note) === status)
      && (!from || date >= from) && (!to || date <= to)
      && (!view || (view === 'pending' ? returnState(note) !== 'completed' : stock === view));
  });
}
