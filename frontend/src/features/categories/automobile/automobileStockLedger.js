const n = (value) => Number(value) || 0;
export function movementType(row) {
  const types = { 'purchase-entry': 'Purchase', invoice: 'Sales', 'bill-of-supply': 'Sales', 'pharmacy-bill': 'Sales', 'e-invoice': 'Sales', 'sales-return': 'Sales Return', 'supplier-return': 'Supplier Return', 'invoice-cancellation': 'Sales Cancellation', 'online-order': 'Sales' };
  return types[row.sourceType] || (row.sourceType?.includes('transfer') ? row.direction === 'in' ? 'Transfer In' : 'Transfer Out' : row.sourceType ? row.direction === 'in' ? 'Stock In' : 'Stock Out' : 'Adjustment');
}
export function stockSourceLink(row) {
  const routes = { 'purchase-entry': 'purchase-entry', invoice: 'invoice', 'bill-of-supply': 'bill-of-supply', 'pharmacy-bill': 'pharmacy-bill', 'e-invoice': 'e-invoice', 'sales-return': 'sales-return', 'supplier-return': 'supplier-return', 'invoice-cancellation': 'invoice' };
  return row.sourceId && routes[row.sourceType] ? `/billing/${routes[row.sourceType]}/${encodeURIComponent(row.sourceId)}/view` : '';
}
export function ledgerDay(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (key) => parts.find((part) => part.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function normalizeLedger(movements, products) {
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const byName = new Map();
  products.forEach((product) => { const name = String(product.description || '').toLowerCase(); byName.set(name, byName.has(name) ? null : product); });
  const rows = movements.map((movement) => {
    const product = movement.productId ? byId.get(String(movement.productId)) : byName.get(String(movement.productName || '').toLowerCase());
    const qtyIn = movement.status === 'Completed' ? n(movement.qtyIn) : 0;
    const qtyOut = movement.status === 'Completed' ? n(movement.qtyOut) : 0;
    return { ...movement, product, productKey: product ? String(product._id) : '', qtyIn, qtyOut, type: movementType(movement), day: ledgerDay(movement.date), code: product?.code || '', warehouse: movement.warehouse || product?.warehouse || '', rate: n(movement.purchasePrice) || n(movement.salesPrice), value: n(movement.value) };
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(b._id).localeCompare(String(a._id)));
  const balances = new Map(products.map((product) => [String(product._id), n(product.stock)]));
  return rows.map((row) => {
    const balance = row.productKey ? balances.get(row.productKey) : null;
    if (row.productKey) balances.set(row.productKey, balance - row.qtyIn + row.qtyOut);
    return { ...row, balance: row.status === 'Completed' ? balance : null };
  });
}
export function ledgerScope(rows, products, filters) {
  const query = String(filters.search || '').trim().toLowerCase();
  const matchesProduct = (product) => [product.description, product.code, product.partNumber, product.barcode].join(' ').toLowerCase().includes(query) && (!filters.warehouse || product.warehouse === filters.warehouse);
  const matchedIds = new Set(products.filter(matchesProduct).map((product) => String(product._id)));
  const productRows = rows.filter((row) => row.productKey ? matchedIds.has(row.productKey) && (!filters.warehouse || row.warehouse === filters.warehouse) : [row.productName, row.code].join(' ').toLowerCase().includes(query) && (!filters.warehouse || row.warehouse === filters.warehouse));
  const inPeriod = (row) => (!filters.from || row.day >= filters.from) && (!filters.to || row.day <= filters.to);
  const scopeRows = productRows.filter(inPeriod);
  // Reconstruct period balances from current stock and the completed movement
  // history, including movements outside the displayed period.
  let opening = 0; let closing = 0;
  products.filter(matchesProduct).forEach((product) => {
    const all = rows.filter((row) => row.productKey === String(product._id));
    const current = n(product.stock);
    opening += current - all.filter((row) => !filters.from || row.day >= filters.from).reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0);
    closing += current - all.filter((row) => filters.to && row.day > filters.to).reduce((sum, row) => sum + row.qtyIn - row.qtyOut, 0);
  });
  const unknownBalance = productRows.some((row) => !row.productKey);
  return {
    rows: scopeRows.filter((row) => (!filters.type || row.type === filters.type) && (!filters.reference || [row.number, row.sourceNo].join(' ').toLowerCase().includes(filters.reference.toLowerCase()))),
    stats: { opening: unknownBalance ? null : opening, closing: unknownBalance ? null : closing, totalIn: scopeRows.reduce((sum, row) => sum + row.qtyIn, 0), totalOut: scopeRows.reduce((sum, row) => sum + row.qtyOut, 0), adjustments: scopeRows.filter((row) => row.type === 'Adjustment' && row.status === 'Completed').length },
  };
}
