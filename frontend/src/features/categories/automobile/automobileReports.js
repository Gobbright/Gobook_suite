export const REPORT_GROUPS = [
  ['sales', 'Sales Reports'], ['purchase', 'Purchase Reports'], ['inventory', 'Inventory Reports'],
  ['crm', 'Customers / CRM', '/crm-reports'], ['collections', 'Collections', '/collections-reports'],
  ['accounting-module', 'Accounting', '/accounting-module-reports'], ['tax-review', 'Tax review', '/tax-review-reports'],
  ['expenses', 'Expenses / HR', '/expenses-reports'], ['ecommerce', 'E-commerce', '/ecommerce-reports'],
  ['audit', 'Audit / exceptions', '/audit-exception-reports'], ['movement', 'Stock Movement'], ['customer', 'Customer Reports'],
  ['supplier', 'Supplier Reports'], ['receivables', 'Receivables Reports'], ['payables', 'Payables Reports'], ['profit', 'Profit Reports'], ['accounting', 'Accounting Reports'],
  ['gst', 'GST Reports'], ['employee', 'Employee Reports'], ['online', 'Online Store Reports'], ['branch', 'Branch-wise Reports'], ['product', 'Product Performance'],
];
export function reportInGroup(report, group) {
  const key = report.downloadKey || ''; const category = report.category || ''; const text = `${key} ${report.name}`.toLowerCase();
  return ({ sales: category === 'Sales', purchase: category === 'Purchase' && key !== 'vendors', inventory: category === 'Inventory', crm: category === 'CRM', collections: category === 'Collections', 'accounting-module': category === 'Accounting', 'tax-review': category === 'Tax review', expenses: category === 'HR' || category === 'Expenses / HR', ecommerce: category === 'E-commerce', audit: category === 'Audit / exceptions', movement: /stockin|stockout|stock.transfer|stock.movement/i.test(text), customer: ['customers', 'leads', 'followUps'].includes(key), supplier: key === 'vendors', receivables: /receivable|outstanding.customer/.test(text), payables: /payable|outstanding.supplier/.test(text), profit: /accountingPostings|accountingVouchers|journalEntries/.test(key), accounting: category === 'Finance', gst: category === 'GST', employee: category === 'HR', online: /online.store|onlineStore/.test(text), branch: key === 'branches', product: ['products', 'services'].includes(key) })[group] || false;
}
export function filterReportDirectory(reports, { category = '', search = '', tab = 'all' }, favourites = [], plans = [], recent = {}) {
  const needle = search.trim().toLowerCase();
  return reports.filter((row) => (!category || reportInGroup(row, category) || String(row.category || '').toLowerCase() === category.toLowerCase()) && [row.name, row.description, row.category].join(' ').toLowerCase().includes(needle) && (tab === 'all' || tab === 'favourites' && favourites.includes(row.downloadKey) || tab === 'scheduled' && plans.some((plan) => plan.key === row.downloadKey) || tab === 'recent' && Boolean(recent[row.downloadKey])));
}
export function reportTrend(data, interval) {
  const daily = data?.daily || [];
  if (interval !== 'Weekly') return daily;
  return Array.from({ length: Math.ceil(daily.length / 7) }, (_, index) => ({ label: `Week ${index + 1}`, ...daily.slice(index * 7, index * 7 + 7).reduce((sum, day) => ({ sales: sum.sales + Number(day.sales || 0), purchases: sum.purchases + Number(day.purchases || 0) }), { sales: 0, purchases: 0 }) }));
}
