import { creditAmounts, creditDate, creditId, creditPrintDocument } from './automobileCreditNotes.js';

export { creditAmounts as eWayAmounts, creditDate as eWayDate, creditId as eWayId, creditPrintDocument as eWayPrintDocument };
const text = (value) => String(value ?? '').trim();
export function eWayTransport(doc) {
  const extra = doc.extra || {}; const transport = extra.transport || doc.transport || {}; const route = extra.route || doc.route || {};
  return { ...transport, ...route, transporter: text(extra.transporter || transport.transporterName), vehicleNumber: text(extra.vehicleNumber || transport.vehicleNumber), distanceKm: text(extra.distanceKm ?? route.distanceKm) };
}
export const recordedEwb = (doc) => text(doc.extra?.ewbNumber || doc.extra?.eWayBillNumber || (/^\d{12}$/.test(text(doc.number)) ? doc.number : ''));
export const recordedValidity = (doc) => text(doc.extra?.ewbValidUpto || doc.extra?.ewbValidUntil || doc.extra?.validUpto || doc.extra?.validUntil);
export function eWayExpiry(doc) {
  const value = recordedValidity(doc);
  return value ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+05:30` : value) : NaN;
}
export const eWaySource = (doc) => text(doc.extra?.sourceDocumentNumber || doc.extra?.sourceDocumentNo || doc.extra?.originalInvoiceNo || doc.meta?.poRef);
export const eWaySourceType = (doc) => text(doc.extra?.sourceDocumentType || 'Reference');
export function eWayChecks(doc) {
  const transport = eWayTransport(doc);
  return [
    { label: 'Document number and date recorded', ok: Boolean(text(doc.number) && Number.isFinite(Date.parse(doc.meta?.date))) },
    { label: 'Recipient name recorded', ok: Boolean(text(doc.customer?.name)) },
    { label: 'Goods have names, HSN/SAC, positive quantities and valid rates', ok: Array.isArray(doc.items) && doc.items.length > 0 && doc.items.every((item) => text(item.description) && text(item.hsn) && Number.isFinite(Number(item.qty)) && Number(item.qty) > 0 && item.rate != null && item.rate !== '' && Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0) },
    { label: 'Transporter and vehicle recorded', ok: Boolean(transport.transporter && transport.vehicleNumber) },
    { label: 'Positive distance recorded', ok: Number.isFinite(Number(transport.distanceKm)) && Number(transport.distanceKm) > 0 },
  ];
}
export const eWayReady = (doc) => eWayChecks(doc).every((check) => check.ok);
export function eWayStatus(doc, now = Date.now()) {
  const number = recordedEwb(doc); const state = text(doc.extra?.ewbStatus || doc.extra?.transportStatus).toLowerCase().replace(/[ _]+/g, '-');
  if (number && !/^\d{12}$/.test(number)) return 'Needs Review';
  if (number && state === 'cancelled') return 'Cancelled (Recorded)';
  if (number && Number.isFinite(eWayExpiry(doc)) && eWayExpiry(doc) < Number(now)) return 'Expired';
  if (number && state === 'in-transit') return 'In Transit';
  if (number) return 'EWB Recorded';
  if (doc.lifecycleStatus === 'draft') return 'Draft';
  return eWayReady(doc) ? 'Ready for Review' : 'Needs Review';
}
export function filterEWayBills(docs, filters) {
  const search = text(filters.search).toLowerCase();
  return docs.filter((doc) => {
    const date = creditDate(doc); const transport = eWayTransport(doc);
    if (filters.from && date < filters.from || filters.to && date > filters.to) return false;
    if (filters.status && eWayStatus(doc) !== filters.status) return false;
    if (filters.type && eWaySourceType(doc) !== filters.type) return false;
    if (filters.transporter && transport.transporter !== filters.transporter) return false;
    if (filters.customer && doc.customer?.name !== filters.customer) return false;
    if (filters.ewb === 'yes' && !recordedEwb(doc) || filters.ewb === 'no' && recordedEwb(doc)) return false;
    return !search || [doc.number, recordedEwb(doc), eWaySource(doc), doc.customer?.name, transport.transporter, transport.vehicleNumber].filter(Boolean).join(' ').toLowerCase().includes(search);
  });
}
// Preserve provider metadata while storing transport fields in the schema's Mixed field.
export function eWaySavedExtra(extra, transport, route) {
  return { ...extra, transport: { ...transport }, route: { ...route }, transporter: transport.transporterName || '', vehicleNumber: transport.vehicleNumber || '', distanceKm: route.distanceKm ?? '' };
}
