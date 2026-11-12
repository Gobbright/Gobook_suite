const SALES_PURCHASE_DOCUMENTS = new Set([
  'invoice', 'bill-of-supply', 'quotation', 'sales-return', 'delivery-challan',
  'credit-note', 'debit-note', 'e-invoice', 'e-way-bill',
  'purchase-order', 'purchase-entry', 'supplier-return',
]);

export function withDocumentWorkflow(settings, category, documentType) {
  if (category !== 'automobile' || !SALES_PURCHASE_DOCUMENTS.has(documentType)) return settings;
  return { ...settings, documentWorkflow: 'electronics-technology' };
}
