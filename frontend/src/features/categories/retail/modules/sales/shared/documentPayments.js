import { automobilePaymentRows } from '../../../../automobile/automobileSales.js';

const PAYMENT_DOCUMENTS = new Set(['invoice', 'bill-of-supply', 'pharmacy-bill', 'e-invoice', 'purchase-entry']);

export function documentPaymentRows({ category, documentType, method, amount, splits = [], total, reference = '', saveAsDraft = false }) {
  if (saveAsDraft || !PAYMENT_DOCUMENTS.has(documentType) || !method || method === 'credit') return [];
  if (category === 'automobile') return automobilePaymentRows(method, amount, splits);
  const populated = splits.filter((split) => split.id !== 'credit' && Number(split.amount) > 0);
  return populated.length ? populated : [{ id: method, amount: Number(amount) || total, reference }];
}
