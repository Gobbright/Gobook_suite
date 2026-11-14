import { purchaseDimensionFields, purchaseIndustry } from './purchaseReportFields.js';

const empty = ['isEmpty', 'isNotEmpty'];
export const FILTER_OPERATORS = {
  multi: ['equals', 'notEquals', ...empty],
  single: ['equals', 'notEquals', ...empty],
  autocomplete: ['equals', 'notEquals', 'contains', ...empty],
  text: ['equals', 'notEquals', 'contains', ...empty],
  number: ['equals', 'notEquals', 'greaterThan', 'lessThan', 'between', ...empty],
  date: ['equals', 'greaterThan', 'lessThan', 'between', ...empty],
  boolean: ['equals', 'notEquals', ...empty],
};
const field = (key, label, type, path, extra = {}) => ({ key, label, type, path, operators: FILTER_OPERATORS[type], ...extra });
const date = field('date', 'Date', 'date', '_reportDate');
const product = field('product', 'Product', 'autocomplete', 'productKey', { item: true, options: true });
const category = field('category', 'Category', 'multi', 'category', { item: true, options: true });
const brand = field('brand', 'Brand', 'multi', 'brand', { item: true, options: true });
const branch = field('branch', 'Branch', 'multi', 'branch', { options: true });
const invoice = field('invoiceNumber', 'Invoice Number', 'text', 'number');
const amount = field('amount', 'Amount', 'number', 'invoiceTotal');
const gstRate = field('gstRate', 'GST Rate', 'multi', 'gstRate', { item: true, numeric: true, values: [0, 5, 12, 18, 28].map(value => ({ value, label: `${value}%` })) });
const status = field('status', 'Transaction Status', 'multi', '_reportStatus', { values: ['posted', 'draft', 'cancelled', 'returned'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) });
const paymentStatus = field('paymentStatus', 'Payment Status', 'multi', 'payStatus', { values: ['Paid', 'Unpaid', 'Partial', 'Overdue', 'Draft', 'Cancelled'].map(value => ({ value, label: value === 'Partial' ? 'Partially Paid' : value })) });
const paymentMode = field('paymentMode', 'Payment Mode', 'multi', '_reportPaymentModes', { values: ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Credit', 'Cheque'].map(value => ({ value, label: value })) });
const salesperson = field('salesperson', 'Salesperson', 'autocomplete', '_reportSalesperson', { options: true });
const warehouse = field('warehouse', 'Warehouse', 'multi', 'warehouse', { options: true });

// Only named, typed fields are public. Database paths never come from the client.
export const REPORT_FILTER_CONFIGS = {
  sales: [date, field('customer', 'Customer', 'autocomplete', 'customer.name', { options: true }), product, category, brand, branch, salesperson, paymentMode, invoice, amount, gstRate, status, paymentStatus,
    field('documentType', 'Document Type', 'multi', 'documentType', { values: ['invoice', 'bill-of-supply', 'quotation', 'sales-return', 'purchase-entry', 'supplier-return'].map(value => ({ value, label: value.replaceAll('-', ' ') })) }),
    field('reverseCharge', 'Reverse Charge', 'boolean', 'meta.rcm')],
  purchase: [
    field('supplier', 'Supplier', 'autocomplete', '_purchase.supplier', { options: true }),
    { ...invoice, label: 'Purchase Invoice Number' },
    field('purchaseType', 'Purchase Type', 'multi', '_purchase.type', { values: [['purchase-entry', 'Purchase Invoice'], ['purchase-order', 'Purchase Order'], ['supplier-return', 'Purchase Return'], ['debit-note', 'Debit Note']].map(([value, label]) => ({ value, label })) }),
    { ...status, label: 'Purchase Status' }, paymentStatus, paymentMode, date,
    { ...branch, label: 'Branch / Warehouse', path: '_purchase.branch', array: true },
    { ...amount, label: 'Purchase Amount' }, gstRate,
    field('gstType', 'GST Purchase Type', 'multi', '_purchase.gstType', { values: [['gst', 'GST Purchase'], ['non-gst', 'Non-GST Purchase'], ['itc', 'Input Tax Credit Eligible']].map(([value, label]) => ({ value, label })) }),
    field('itcStatus', 'GST / ITC Status', 'multi', '_purchase.itcStatus', { values: ['Eligible', 'Ineligible', 'Pending Verification'].map(value => ({ value, label: value })) }),
    product, category, brand,
    ...purchaseDimensionFields(FILTER_OPERATORS),
    ...[['quantity', 'Quantity'], ['purchaseRate', 'Purchase Rate', 'rate'], ['discountPercent', 'Discount Percentage'], ['discountAmount', 'Discount Amount']].map(([key, label, path = key]) => field(key, label, 'number', `_purchase.${path}`, { item: true })),
  ],
  stockSummary: [product, category, brand, warehouse, field('stockStatus', 'Stock Status', 'multi', 'stockStatus', { values: ['In Stock', 'Low Stock', 'Out of Stock'].map(value => ({ value, label: value })) }), field('stockQuantity', 'Stock Quantity', 'number', 'physicalQty')],
  stockMovement: [date, product, category, warehouse, field('transactionType', 'Transaction Type', 'multi', 'sourceType', { options: true }), field('referenceNumber', 'Reference Number', 'text', 'sourceNo')],
  ledger: [date, field('ledgerAccount', 'Ledger Account', 'autocomplete', 'ledgerName', { options: true }), field('voucherType', 'Voucher Type', 'multi', 'voucherType', { options: true }), branch, status],
  gst: [date, field('gstin', 'GSTIN', 'text', 'gstin'), { ...gstRate, key: 'taxRate', label: 'Tax Rate' }, field('transactionType', 'Transaction Type', 'multi', 'transactionType', { options: true }), field('documentType', 'Document Type', 'multi', 'documentType', { options: true }), field('filingStatus', 'Filing Status', 'multi', 'status', { values: ['draft', 'filed'].map(value => ({ value, label: value })) })],
};

export function publicReportFields(report, user = {}) {
  const industry = purchaseIndustry(user);
  return (REPORT_FILTER_CONFIGS[report] || []).filter(field => report !== 'purchase' || !field.industry || field.industry === industry || field.industry === 'all' || field.industry === 'technical' && ['automobile', 'electronics'].includes(industry))
    .map(({ path, item, numeric, array, industry, ...definition }) => definition);
}
