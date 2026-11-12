import { httpError } from '../utils/httpError.js';

export function assertAutomobileBill(doc, category) {
  if (category !== 'automobile' || (doc.documentType || 'invoice') !== 'invoice') return;
  if (!String(doc.customer?.name || '').trim()) throw httpError(400, 'Select a customer before saving the bill.');
  if (!String(doc.number || '').trim()) throw httpError(400, 'Bill number is required.');
  if (!doc.meta?.date || !Number.isFinite(Date.parse(doc.meta.date))) throw httpError(400, 'Enter a valid invoice date.');
  if (!Array.isArray(doc.items) || !doc.items.length) throw httpError(400, 'Add at least one product or service before saving the bill.');
  for (const [index, item] of doc.items.entries()) {
    if (!String(item.description || '').trim() || !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 || !Number.isFinite(Number(item.rate)) || Number(item.rate) <= 0) throw httpError(400, `Row ${index + 1}: enter a product or service name, positive quantity and unit price.`);
    if (!Number.isFinite(Number(item.discount ?? 0)) || Number(item.discount ?? 0) < 0 || Number(item.discount ?? 0) > 100) throw httpError(400, `Row ${index + 1}: discount must be between 0 and 100%.`);
  }
}

export function assertAutomobileQuotation(doc, category) {
  if (category !== 'automobile' || doc.documentType !== 'quotation') return;
  try {
    assertAutomobileBill({ ...doc, documentType: 'invoice' }, category);
  } catch (error) {
    error.message = error.message.replaceAll('bill', 'quotation').replaceAll('Bill', 'Quotation').replaceAll('invoice', 'quotation');
    throw error;
  }
  if (!doc.extra?.validTill || !Number.isFinite(Date.parse(doc.extra.validTill))) throw httpError(400, 'Enter a valid quotation expiry date.');
  if (doc.extra.validTill < doc.meta.date) throw httpError(400, 'Valid till cannot be before the quotation date.');
  if (!['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'].includes(doc.extra.quotationStatus || doc.extra.status || 'Draft')) throw httpError(400, 'Choose a valid quotation status.');
}
