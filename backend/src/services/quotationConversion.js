import { httpError } from '../utils/httpError.js';

export function assertConvertibleQuotation(quotation, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
  if (!quotation || quotation.documentType !== 'quotation') throw httpError(404, 'Quotation not found.');
  if (quotation.extra?.convertedInvoiceId) throw httpError(409, 'This quotation has already been converted to a bill.');
  if ((quotation.extra?.quotationStatus || quotation.extra?.status) !== 'Accepted') throw httpError(400, 'Accept the quotation before converting it to a bill.');
  if (quotation.extra?.validTill && quotation.extra.validTill.slice(0, 10) < today) throw httpError(400, 'This quotation has expired. Renew its validity before converting it.');
}
