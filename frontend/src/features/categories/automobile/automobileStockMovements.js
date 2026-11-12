import { ledgerDay, movementType } from './automobileStockLedger.js';

export function stockMovementRows(entries, products, direction) {
  const byId = new Map(products.map((product) => [String(product._id), product]));
  return entries.map((entry) => {
    const product = byId.get(String(entry.productId || ''));
    const quantity = Number(entry.totalQty) || 0;
    const value = Number(entry.totalValue) || 0;
    return {
      ...entry, number: direction === 'in' ? entry.stockInNo : entry.stockOutNo,
      productKey: String(entry.productId || entry.productName || entry._id),
      code: product?.code || '', partNumber: product?.partNumber || '', barcode: product?.barcode || '',
      warehouse: entry.warehouse || product?.warehouse || '', day: ledgerDay(entry.date),
      type: movementType({ ...entry, direction }), quantity, value,
      rate: quantity > 0 ? value / quantity : null,
    };
  });
}
export function stockMovementTotals(rows) {
  const posted = rows.filter((row) => row.status === 'Completed');
  return {
    movements: posted.length,
    quantity: posted.reduce((sum, row) => sum + row.quantity, 0),
    value: posted.reduce((sum, row) => sum + row.value, 0),
    products: new Set(posted.map((row) => row.productKey)).size,
    pending: rows.filter((row) => row.status === 'Pending').length,
  };
}
