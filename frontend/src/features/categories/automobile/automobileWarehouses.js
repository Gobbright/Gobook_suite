export function warehouseStock(warehouses, products) {
  const grouped = new Map();
  products.forEach((product) => {
    if (!product.warehouse) return;
    const key = String(product.warehouse).trim().toLowerCase();
    const current = grouped.get(key) || { stockValue: 0, activeSkus: 0, lowStock: 0, assignedProducts: 0 };
    current.stockValue += (Number(product.stock) || 0) * (Number(product.rate) || 0);
    current.assignedProducts++;
    if (product.status !== 'Inactive') {
      current.activeSkus++;
      if (product.trackInventory !== false && Number(product.stock || 0) <= Number(product.minStockLevel || 0)) current.lowStock++;
    }
    grouped.set(key, current);
  });
  const nameCounts = new Map();
  warehouses.forEach((row) => { const key = String(row.name || '').trim().toLowerCase(); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  return warehouses.map((row) => {
    const key = String(row.name || '').trim().toLowerCase();
    const ambiguous = nameCounts.get(key) > 1;
    const stock = grouped.get(key) || { stockValue: 0, activeSkus: 0, lowStock: 0, assignedProducts: 0 };
    return { ...row, ...stock, ambiguous, ...(ambiguous ? { stockValue: null, activeSkus: null, lowStock: null } : {}) };
  });
}
export function nextWarehouseCode(warehouses) {
  const highest = warehouses.reduce((max, row) => Math.max(max, Number(String(row.code || '').match(/^WH-(\d+)$/)?.[1]) || 0), 0);
  return `WH-${String(highest + 1).padStart(3, '0')}`;
}
