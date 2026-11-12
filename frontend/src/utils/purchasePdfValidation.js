const knownNumber = (value) => value !== '' && value != null && Number.isFinite(Number(value));
const money = (value) => Number(value).toFixed(2);

// These are accounting and data-integrity checks, independent of PDF layout.
export function purchaseImportIssues(data) {
  const issues = [];
  let total = 0, taxable = 0, complete = true;
  for (const [index, row] of (data.items || []).entries()) {
    const item = index + 1;
    if (/^(?:category|sub\s*category|brand|material|supplier|vendor|hsn|gstin|sub\s*total|grand\s*total)\s*:/i.test(row.description || '')) issues.push({ row: index, fields: ['description'], message: `Item ${item}: a metadata label was read as a product name. Confirm the parent product.` });
    if (row.uncertainFields?.length) issues.push({ row: index, fields: row.uncertainFields, message: `Item ${item}: confirm the uncertain ${row.uncertainFields.join(', ')} fields against the PDF.` });
    if (!['qty', 'rate', 'discount', 'gstRate'].every((field) => knownNumber(row[field]))) { complete = false; continue; }
    const gross = Number(row.qty) * Number(row.rate);
    const discount = row.discountType === 'amount' ? Number(row.discount) : gross * Number(row.discount) / 100;
    const net = gross - discount;
    const taxed = net * (1 + Number(row.gstRate) / 100);
    if (knownNumber(row.sourceAmount) && Math.min(Math.abs(net - Number(row.sourceAmount)), Math.abs(taxed - Number(row.sourceAmount))) > 0.51) issues.push({ row: index, fields: ['qty', 'rate', 'discount', 'gstRate', 'sourceAmount'], message: `Item ${item}: quantity, rate, discount and GST do not reconcile with the printed amount ${money(row.sourceAmount)}.` });
    total += taxed;
    taxable += net;
  }
  for (const charge of data.charges || []) {
    if (!knownNumber(charge.amount) || !knownNumber(charge.gstRate)) complete = false;
    else total += Number(charge.amount) * (1 + Number(charge.gstRate) / 100);
  }
  const discount = data.additionalDiscount || { type: 'amount', value: 0 };
  if (!knownNumber(discount.value) || Number(discount.value) < 0 || discount.type === 'percent' && Number(discount.value) > 100 || discount.type !== 'percent' && Number(discount.value) > total && complete) {
    complete = false;
    issues.push({ fields: ['additionalDiscount'], message: 'Confirm the invoice-level discount before applying.' });
  } else total -= discount.type === 'percent' ? total * Number(discount.value) / 100 : Number(discount.value);
  const invoiceTotal = total;
  for (const field of ['tds', 'tcs']) {
    const tax = data[field];
    if (!tax?.enabled) continue;
    if (!knownNumber(tax.rate) || Number(tax.rate) < 0 || Number(tax.rate) > 100 || field === 'tds' && !tax.section?.trim()) {
      complete = false;
      issues.push({ fields: [field], message: `Confirm the ${field.toUpperCase()} rate${field === 'tds' ? ' and section' : ''} before applying.` });
    } else total += (field === 'tds' ? -taxable : invoiceTotal) * Number(tax.rate) / 100;
  }
  // Allow printed currency rounding, never a percentage-based discrepancy.
  if (complete && knownNumber(data.invoiceAmount) && Math.abs(total - Number(data.invoiceAmount)) > 1.01) issues.push({ fields: ['invoiceAmount'], message: `Calculated invoice amount ${money(total)} differs from the printed total ${money(data.invoiceAmount)}. Check rows, taxes, charges and invoice discount before applying.` });
  return issues;
}
