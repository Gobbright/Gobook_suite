export function isAutomobileInvoice(category, documentType) {
  return category === 'automobile' && documentType === 'invoice';
}

export function validateAutomobileBill({ customer, meta, items = [] }) {
  const errors = {};
  if (!String(customer?.name || '').trim()) errors.customerName = 'Select a customer before saving the bill.';
  if (!String(meta?.number || '').trim()) errors.invoiceNumber = 'Bill number is required.';
  if (!meta?.date || !Number.isFinite(Date.parse(meta.date))) errors.invoiceDate = 'Enter a valid invoice date.';
  if (!items.length) errors.items = 'Add at least one product or service before saving the bill.';
  items.forEach((item, index) => {
    const row = index + 1;
    if (!String(item.description || '').trim()) errors[`item_name_${index}`] = `Row ${row}: product or service name is required.`;
    if (!Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0) errors[`item_qty_${index}`] = `Row ${row}: quantity must be greater than zero.`;
    if (!Number.isFinite(Number(item.rate)) || Number(item.rate) <= 0) errors[`item_rate_${index}`] = `Row ${row}: unit price must be greater than zero.`;
    const discount = Number(item.discount ?? 0);
    const amountDiscount = item.discountType === 'amount';
    const maxDiscount = amountDiscount ? Number(item.qty) * Number(item.rate) : 100;
    if (!Number.isFinite(discount) || discount < 0 || discount > maxDiscount) errors[`item_discount_${index}`] = amountDiscount
      ? `Row ${row}: discount must be between zero and the item value.`
      : `Row ${row}: discount must be between 0 and 100%.`;
  });
  return errors;
}

const normalize = (value) => String(value || '').trim().toLowerCase();

export function matchingAutomobileProducts(products, { query = '', type = 'Product', vehicleModel = '', compatibleOnly = false } = {}) {
  const search = normalize(query);
  const model = normalize(vehicleModel);
  return products.filter((product) => {
    if (product.status === 'Inactive') return false;
    if (type && (product.itemType === 'Service' ? 'Service' : 'Product') !== type) return false;
    const terms = [product.description, product.name, product.code, product.sku, product.partNumber, product.manufacturerPartNumber, product.barcode];
    if (search && !terms.some((term) => normalize(term).includes(search))) return false;
    if (!compatibleOnly || !model || product.itemType === 'Service') return true;
    const compatibility = normalize(product.compatibleModel);
    return !compatibility || /universal|all models/.test(compatibility) || compatibility.includes(model);
  });
}

export function automobileHistoryRow(invoice) {
  const total = Number(invoice.invoiceTotal ?? invoice.totals?.finalTotal ?? invoice.totals?.grandTotal ?? 0) || 0;
  const received = Number(invoice.totalPaid ?? invoice.advanceReceived ?? 0) || 0;
  const balance = Math.max(0, Number(invoice.balance ?? total - received) || 0);
  const state = invoice.lifecycleStatus || 'posted';
  const status = state === 'draft' ? 'Draft' : state === 'cancelled' ? 'Cancelled' : invoice.payStatus || (balance === 0 ? 'Paid' : received > 0 ? 'Partially Paid' : 'Unpaid');
  return {
    id: String(invoice._id || invoice.id), number: invoice.number || '—',
    date: invoice.meta?.date || invoice.createdAt || '', customer: invoice.customer?.name || '—',
    vehicle: [invoice.extra?.vehicleMake, invoice.extra?.vehicleModel, invoice.extra?.vehicleNumber].filter(Boolean).join(' · ') || '—',
    items: (invoice.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    total, received, balance, status,
  };
}

export function automobilePaymentRows(selectedMethod, amount, splits) {
  const populated = splits.filter((split) => split.id !== 'credit' && Number(split.amount) > 0);
  return populated.length ? populated : [{ id: selectedMethod, amount: Math.max(0, Number(amount) || 0), reference: '' }];
}
