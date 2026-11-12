export const STOCK_DASHBOARD_FILTERS = ['search', 'brand', 'category', 'warehouse', 'branch', 'dateFrom', 'dateTo', 'status', 'stockStatus', 'zeroStock', 'movementFrom', 'movementTo', 'movementDirection', 'warehouseMissing', 'categoryMissing'];

export function stockDashboardFilters(search = '') {
  const params = new URLSearchParams(search);
  const filters = Object.fromEntries(STOCK_DASHBOARD_FILTERS.map((key) => [key, params.get(key) || '']));
  if (filters.stockStatus === 'zero') { filters.stockStatus = ''; filters.zeroStock = '1'; }
  return filters;
}

export function stockLedgerScope(search = '') {
  const params = new URLSearchParams(search);
  return Object.fromEntries(['productId', 'warehouse', 'branch', 'variantId', 'batch', 'warehouseMissing', 'branchMissing', 'variantMissing', 'batchMissing'].filter((key) => params.get(key)).map((key) => [key, params.get(key)]));
}

export function stockLedgerLink(productId, filters = {}, detail = {}) {
  const params = new URLSearchParams({ productId });
  for (const key of ['dateFrom', 'dateTo', 'warehouse', 'branch', 'warehouseMissing', 'branchMissing', 'variantMissing', 'batchMissing']) if (filters[key]) params.set(key, filters[key]);
  for (const key of ['warehouse', 'branch', 'variantId', 'batch']) if (detail[key]) params.set(key, detail[key]);
  for (const key of ['warehouse', 'branch', 'variantId', 'batch']) {
    if (!Object.prototype.hasOwnProperty.call(detail, key)) continue;
    const missing = `${key === 'variantId' ? 'variant' : key}Missing`;
    if (!detail[key]) { params.delete(key); params.set(missing, '1'); }
    else params.delete(missing);
  }
  return `/stock-ledger?${params}`;
}

export const STOCK_STATUS_OPTIONS = [{ value: '', label: 'All Stock Statuses' }, { value: 'healthy', label: 'In Stock' }, { value: 'low', label: 'Low Stock' }, { value: 'out', label: 'Out of Stock' }, { value: 'overstock', label: 'Overstock' }, { value: 'reserved', label: 'Reserved Stock' }, { value: 'inactive', label: 'Inactive' }];

export const STOCK_TABLE_COLUMNS = [
  { key: 'description', label: 'Product Name' }, { key: 'sku', label: 'SKU/Barcode' },
  { key: 'brand', label: 'Brand' }, { key: 'category', label: 'Category' }, { key: 'warehouse', label: 'Warehouse' }, { key: 'branch', label: 'Branch' },
  { key: 'physicalQty', label: 'Physical Stock' }, { key: 'reservedQty', label: 'Reserved Stock' }, { key: 'availableQty', label: 'Available Stock' },
  { key: 'minStockLevel', label: 'Minimum Stock' }, { key: 'maxStockLevel', label: 'Maximum Stock' }, { key: 'stockValue', label: 'Stock Value' },
  { key: 'stockStatus', label: 'Stock Status' }, { key: 'actions', label: 'Actions' },
];

export function stockTableValue(row, key) {
  if (key === 'sku') return [row.code, row.barcode].filter(Boolean).join(' / ') || '—';
  if (key === 'warehouse' || key === 'branch') return row[key] || (new Set((row.locations || []).map((location) => location[key])).size > 1 ? 'Multiple' : 'Unassigned');
  if (key === 'maxStockLevel') return Number(row[key]) > 0 ? row[key] : 'Not set';
  if (key === 'stockValue') return row[key] == null ? 'Unavailable' : row[key];
  return row[key] ?? '—';
}

export function stockExportColumns(visible) {
  return STOCK_TABLE_COLUMNS.filter((column) => column.key !== 'actions' && visible.includes(column.key)).map((column) => ({ label: column.label, value: (row) => stockTableValue(row, column.key) }));
}

export function selectedStockRows(rows, selected) {
  const ids = new Set(selected);
  return ids.size ? rows.filter((row) => ids.has(row._id)) : rows;
}

export function stockStatusClass(status) {
  return { 'In Stock': 'ass-active', 'Low Stock': 'ass-low', 'Out of Stock': 'ass-out', Overstock: 'ass-overstock', Inactive: 'ass-inactive' }[status] || 'ass-inactive';
}

export function stockProductLink(filters, overrides = {}) {
  const params = new URLSearchParams({ stockDashboard: '1' });
  const selected = { ...filters, ...overrides };
  for (const key of STOCK_DASHBOARD_FILTERS) if (selected[key]) params.set(key, selected[key]);
  return `/products?${params}`;
}

export function stockChartFilter(field, key) {
  return { [field]: key, [`${field}Missing`]: key ? '' : '1' };
}

export async function allStockDashboardRows(api, filters) {
  const rows = [];
  let page = 1;
  while (true) {
    const result = await api.invStockDashboard({ ...filters, page, limit: 500 });
    rows.push(...result.data);
    if (!result.data.length || rows.length >= result.total) return rows;
    page++;
  }
}
