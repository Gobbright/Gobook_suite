// Existing Sales Report formulas, retained for server-side report calculations.
export function salesLineReportValues(invoice, item, productsById) {
  const product = productsById.get(String(item.productId || ''));
  const variant = product?.variants?.find((entry) => [entry.size, entry.modelName, entry._id].some((value) => value && String(value) === String(item.size)));
  const qty = Number(item.qty) || 0;
  const gross = qty * (Number(item.rate) || 0);
  const lineDiscount = Math.min(gross, Math.max(0, item.discountType === 'amount'
    ? Number(item.discount) || 0
    : gross * ((Number(item.discount) || 0) / 100)));
  const taxable = Math.max(0, gross - lineDiscount);
  const overallDiscount = Number(invoice.totals?.addDiscAmt ?? invoice.addDiscAmt) || 0;
  const docTaxable = (invoice.items || []).reduce((sum, line) => {
    const amount = (Number(line.qty) || 0) * (Number(line.rate) || 0);
    const discount = Math.min(amount, Math.max(0, line.discountType === 'amount' ? Number(line.discount) || 0 : amount * ((Number(line.discount) || 0) / 100)));
    return sum + amount - discount;
  }, 0);
  const allocatedOverallDiscount = docTaxable > 0 ? overallDiscount * taxable / docTaxable : 0;
  const netSales = Math.max(0, taxable - allocatedOverallDiscount);
  const unitCost = Number(item.purchasePrice ?? item.costPrice ?? variant?.purchasePrice ?? product?.purchasePrice) || 0;
  const cost = unitCost * qty;
  const margin = unitCost > 0 ? netSales - cost : 0;
  const unitNet = qty > 0 ? netSales / qty : 0;
  return {
    qty,
    sales: netSales,
    discount: lineDiscount + allocatedOverallDiscount,
    cost,
    costedSales: unitCost > 0 ? netSales : 0,
    margin,
    belowCostSales: unitCost > 0 && unitNet < unitCost ? netSales : 0,
    product: item.description || product?.description || 'Unspecified item',
    category: item.category || product?.category || 'Uncategorized',
    brand: item.brand || product?.brand || 'Unbranded',
  };
}

export function salesReportRows(invoices, productsById, analysis, marginBy) {
  const groups = new Map();
  const add = (key, values) => {
    const row = groups.get(key) || { name: key, invoices: new Set(), quantity: 0, sales: 0, discount: 0, cost: 0, costedSales: 0, margin: 0, belowCostSales: 0 };
    row.invoices.add(String(values.invoice._id || values.invoice.id || values.invoice.number));
    row.quantity += values.line.qty;
    row.sales += values.line.sales;
    row.discount += values.line.discount;
    row.cost += values.line.cost;
    row.costedSales += values.line.costedSales;
    row.margin += values.line.margin;
    row.belowCostSales += values.line.belowCostSales;
    groups.set(key, row);
  };
  invoices.forEach((invoice) => (invoice._reportItems || invoice.items || []).forEach((item) => {
    const line = salesLineReportValues(invoice, item, productsById);
    const created = new Date(invoice.createdAt || invoice.meta?.date || 0);
    const hour = Number.isNaN(created.getTime()) ? 'Unknown hour' : `${created.toLocaleDateString('en-IN')} ${String(created.getHours()).padStart(2, '0')}:00`;
    const salesperson = invoice.extra?.salesPerson || invoice.extra?.salesperson || invoice.salesPerson || 'Unassigned';
    const channel = invoice.extra?.salesChannel || invoice.extra?.channel || invoice.extra?.source || 'Direct / unspecified';
    const analysisKey = {
      invoice: invoice.number || 'Unnumbered invoice',
      item: line.product,
      category: line.category,
      brand: line.brand,
      supplier: invoice._purchase?.supplier || invoice.customer?.name || 'Unspecified supplier',
      branch: invoice._purchase?.branch?.[0] || invoice.branch || 'Head Office',
      hourly: hour,
      salesperson,
      channel,
      all: [line.product, line.category, line.brand, salesperson, channel].join(' · '),
    }[analysis];
    const marginKey = {
      product: line.product,
      invoice: invoice.number || 'Unnumbered invoice',
      customer: invoice.customer?.name || 'Walk-in customer',
      branch: invoice._purchase?.branch?.[0] || invoice.branch || 'Head Office',
    }[marginBy];
    add(analysis === 'margin' ? marginKey : analysisKey, { invoice, line });
  }));
  return [...groups.values()].map((row) => ({ ...row, invoices: row.invoices.size }))
    .sort((a, b) => b.sales - a.sales);
}

// Use the same discount allocation as the analysis reports. Allocate saved
// document tax and payable totals so filtered lines retain invoice adjustments.
export function salesTransactionRow(invoice, item, productsById, index = 0) {
  const line = salesLineReportValues(invoice, item, productsById);
  const lines = (invoice.items || []).map(entry => {
    const values = salesLineReportValues(invoice, entry, productsById);
    return { ...values, tax: invoice.documentType === 'bill-of-supply' ? 0 : Math.max(0, values.sales) * (Number(entry.gstRate) || 0) / 100 };
  });
  const computedTax = lines.reduce((sum, entry) => sum + entry.tax, 0);
  const computedNet = lines.reduce((sum, entry) => sum + entry.sales + entry.tax, 0);
  const lineTax = invoice.documentType === 'bill-of-supply' ? 0 : Math.max(0, line.sales) * (Number(item.gstRate) || 0) / 100;
  const savedTax = Number(invoice.totals?.totalGst);
  const tax = Number.isFinite(savedTax) && computedTax > 0 ? savedTax * lineTax / computedTax : lineTax;
  const savedTotal = invoice.totals?.finalTotal ?? invoice.totals?.grandTotal ?? invoice.totals?.total;
  const netAmount = savedTotal != null && Number.isFinite(Number(savedTotal)) && computedNet > 0 ? Number(savedTotal) * (line.sales + lineTax) / computedNet : line.sales + tax;
  return {
    id: `${invoice._id}:${index}`, name: invoice.number || 'Unnumbered invoice',
    invoiceId: String(invoice._id), invoiceNumber: invoice.number || '',
    invoiceDate: invoice._reportDate || invoice.meta?.date || '',
    customer: invoice.customer?.name || 'Walk-in Customer', supplier: invoice._purchase?.supplier || invoice.customer?.name || 'Unspecified supplier', product: line.product,
    quantity: line.qty, rate: Number(item.rate) || 0, amount: line.sales,
    invoices: 1, sales: line.sales, discount: line.discount, cost: line.cost,
    costedSales: line.costedSales, margin: line.margin, belowCostSales: line.belowCostSales,
    tax, netAmount,
  };
}

