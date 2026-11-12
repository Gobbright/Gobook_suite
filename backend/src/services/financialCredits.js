import { Invoice } from '../models/Invoice.js';
import { calcDocumentAmounts } from './accountingPostings.js';
import { ACTIVE_FINANCIAL_FILTER } from './salesLifecycle.js';
import { httpError } from '../utils/httpError.js';

export async function creditedAmount(invoice, { excludeId, reservePending = false } = {}) {
  const purchase = invoice.documentType === 'purchase-entry';
  const credits = await Invoice.find({
    userId: invoice.userId,
    documentType: { $in: purchase ? ['supplier-return'] : ['credit-note', 'sales-return'] },
    ...ACTIVE_FINANCIAL_FILTER,
    ...(reservePending ? { returnStatus: { $nin: [] } } : {}),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: [{ [purchase ? 'extra.originalPurchaseId' : 'extra.originalSalesId']: String(invoice._id) }, { 'extra.originalInvoiceNo': invoice.number }],
  }).lean();
  return credits.reduce((total, note) => total + calcDocumentAmounts(note, true).total, 0);
}

export async function assertCreditCapacity(invoice, note, options) {
  if (!invoice) throw httpError(409, 'The original invoice is no longer available');
  const available = Math.max(0, calcDocumentAmounts(invoice, invoice.documentType !== 'bill-of-supply').total - await creditedAmount(invoice, { reservePending: true, ...options }));
  if (calcDocumentAmounts(note, true).total > available + 0.01) throw httpError(409, `This adjustment exceeds the remaining invoice value (${available}). Check existing credits and return requests.`);
}
