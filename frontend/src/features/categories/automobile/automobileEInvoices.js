import { creditAmounts, creditDate, creditId, creditPrintDocument } from './automobileCreditNotes.js';
export { creditAmounts as eInvoiceAmounts, creditDate as eInvoiceDate, creditId as eInvoiceId, creditPrintDocument as eInvoicePrintDocument };
const text = (value) => String(value || '').trim();
export const recordedIrn = (doc) => text(doc.extra?.irnNumber || doc.extra?.irn);
export const recordedAck = (doc) => text(doc.extra?.ackNumber);
export const recordedAckDate = (doc) => text(doc.extra?.ackDate);
export const signedQrPayload = (doc) => typeof (doc.extra?.signedQRCode || doc.extra?.signedQrCode) === 'string' ? (doc.extra.signedQRCode || doc.extra.signedQrCode).trim() : '';
export const gstinFormatPresent = (doc) => /^[a-z0-9]{15}$/i.test(text(doc.customer?.gstin));
const validDate = (value) => Boolean(value && Number.isFinite(Date.parse(value)));

// These are checks of saved fields, not tax eligibility, GSTIN verification,
// provider validation, or proof that an IRN is registered with an authority.
export function eInvoiceChecks(doc) {
  const items = doc.items || [];
  return [
    { label: 'Invoice number and date recorded', ok: Boolean(text(doc.number) && validDate(doc.meta?.date)) },
    { label: 'Customer name recorded', ok: Boolean(text(doc.customer?.name)) },
    { label: 'GSTIN has 15 alphanumeric characters', ok: gstinFormatPresent(doc) },
    { label: 'Items have HSN/SAC, positive quantities and valid amounts', ok: items.length > 0 && items.every((item) => text(item.description) && text(item.hsn) && Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 && item.rate !== '' && item.rate != null && Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number.isFinite(Number(item.gstRate ?? 0)) && Number(item.gstRate ?? 0) >= 0) },
    { label: 'Place of supply recorded', ok: Boolean(text(doc.meta?.placeOfSupply)) },
  ];
}
export const eInvoiceReady = (doc) => !['draft', 'cancelled'].includes(doc.lifecycleStatus) && eInvoiceChecks(doc).every((check) => check.ok);
export function eInvoiceStatus(doc) {
  if (doc.lifecycleStatus === 'cancelled') return 'Invoice Cancelled';
  if (doc.lifecycleStatus === 'draft') return 'Draft';
  const irn = recordedIrn(doc);
  if (irn && !/^[a-f0-9]{64}$/i.test(irn)) return 'Needs Review';
  if (irn && recordedAck(doc) && validDate(recordedAckDate(doc))) return 'IRN Recorded';
  if (irn) return 'ACK Incomplete';
  return eInvoiceReady(doc) ? 'Pending IRN' : 'Needs Review';
}
export function eInvoiceStats(docs, now = new Date()) {
  const month = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' });
  return { ready: docs.filter(eInvoiceReady).length, recorded: docs.filter((doc) => eInvoiceStatus(doc) === 'IRN Recorded').length, pending: docs.filter((doc) => ['Pending IRN', 'ACK Incomplete'].includes(eInvoiceStatus(doc))).length, review: docs.filter((doc) => eInvoiceStatus(doc) === 'Needs Review').length, monthValue: docs.filter((doc) => eInvoiceStatus(doc) === 'IRN Recorded' && new Date(recordedAckDate(doc)).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }) === month).reduce((sum, doc) => sum + creditAmounts(doc).finalTotal, 0) };
}
export function filterEInvoices(docs, filters) {
  const query = text(filters.search).toLowerCase();
  return docs.filter((doc) => {
    const date = creditDate(doc); const gstin = text(doc.customer?.gstin);
    if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    if (filters.customer && doc.customer?.name !== filters.customer) return false;
    if (filters.status && eInvoiceStatus(doc) !== filters.status) return false;
    if (filters.gst === 'present' && !gstin || filters.gst === 'absent' && gstin || filters.gst === 'review' && gstinFormatPresent(doc)) return false;
    if (filters.irn === 'yes' && !recordedIrn(doc) || filters.irn === 'no' && recordedIrn(doc)) return false;
    return !query || [doc.number, recordedIrn(doc), recordedAck(doc), doc.customer?.name, gstin, doc.customer?.city].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
}
export function eInvoiceRecord(doc) {
  const customer = Object.fromEntries(['name', 'gstin', 'phone', 'email', 'address', 'city', 'state', 'pincode'].map((key) => [key, doc.customer?.[key] || '']));
  return { recordType: 'saved-e-invoice-record', number: doc.number, documentType: 'e-invoice', lifecycleStatus: doc.lifecycleStatus || 'posted', customer, meta: doc.meta || {}, supplyType: doc.supplyType, items: doc.items || [], charges: doc.charges || [], additionalDiscount: doc.additionalDiscount, totals: creditAmounts(doc), registration: { irnNumber: recordedIrn(doc), ackNumber: recordedAck(doc), ackDate: recordedAckDate(doc), signedQRCode: signedQrPayload(doc) } };
}
