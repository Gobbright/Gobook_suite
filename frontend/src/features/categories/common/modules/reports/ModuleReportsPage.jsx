import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Database, Download, FileSpreadsheet, FileText, Search, X } from 'lucide-react';

import { apiClient } from '../../../../../services/apiClient.js';
import { api } from '../../../../../services/api.js';
import { getCustomers, getFollowUps } from '../../../../../services/crmService.js';
import { API_BASE_URL } from '../../../../../services/apiBase.js';
import { downloadReportCsv, downloadReportPdf, downloadReportTableCsv, downloadReportTablePdf } from '../../../../../services/reportDownloadService.js';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { getCurrentUser } from '../../../../../services/authService.js';
import { getToken } from '../../../../../services/authToken.js';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { PurchaseReportGeneralFilters, PurchaseReportFilters } from './PurchaseReportFilters.jsx';
import { automobilePurchaseDocuments, emptyAutomobilePurchaseFilters, matchesAutomobilePurchase } from '../../../automobile/automobilePurchaseReportFilters.js';
import { emptyElectronicsPurchaseFilters, matchesElectronicsPurchase } from './electronicsPurchaseReportFilters.js';
import { SalesReportGeneralFilters, SalesReportFilters } from './SalesReportFilters.jsx';
import { hasSelection, matchesSelection, selectionValues } from './salesReportSelections.js';
import '../../../automobile/automobileProducts.css';
import '../../../automobile/automobileReports.css';

const MODULE_CONFIG = {
  sales: {
    title: 'Sales Reports',
    section: 'Sales',
    description: 'Sales reports generated from billing records stored in the database.',
    categories: ['Sales'],
  },
  purchase: {
    title: 'Purchase Reports',
    section: 'Purchase',
    description: 'Purchases, supplier prices, pending orders, goods received, returns, payables and delivery performance.',
    categories: ['Purchase'],
  },
  crm: {
    title: 'CRM Reports',
    section: 'CRM',
    description: 'Purchase history, repeat and inactive customers, receivable ageing and follow-ups; Customer 360 with purchases, returns, receipts and balance.',
    categories: ['CRM', 'Customers'],
  },
  collections: {
    title: 'Collections Reports', section: 'Collections',
    description: 'Cash, UPI, card and bank receipts, split payments, refunds, settlements and counter closing.',
    categories: ['Collections', 'Finance'],
  },
  accounting: {
    title: 'Accounting Reports', section: 'Accounting',
    description: 'Day book, ledgers, journal, trial balance, profit and loss, balance sheet, cash flow and bank reconciliation.',
    categories: ['Accounting', 'Finance'],
  },
  tax: {
    title: 'Tax Review Reports', section: 'Tax review',
    description: 'Tax component breakdown, HSN/SAC summary, document exceptions and reconciliation.',
    categories: ['Tax review', 'GST'],
  },
  expenses: {
    title: 'Expenses & HR Reports', section: 'Expenses / HR',
    description: 'Expense category, branch, employee, recurrence and budget comparison; attendance, leave, salary, overtime, incentives and payroll cost.',
    categories: ['Expenses / HR', 'Expenses', 'HR'],
  },
  ecommerce: {
    title: 'E-commerce Reports', section: 'E-commerce',
    description: 'Orders, cancellations, returns, delivery state and channel profitability with available fees and fulfilment costs.',
    categories: ['E-commerce', 'Online Store'],
  },
  audit: {
    title: 'Audit & Exceptions Reports', section: 'Audit / exceptions',
    description: 'Edited and cancelled bills, price overrides, unusual refunds, stock adjustments and access history.',
    categories: ['Audit / exceptions', 'Audit'],
  },
  inventory: {
    title: 'Inventory Reports',
    section: 'Inventory',
    description: 'Inventory reports generated from product and stock records stored in the database.',
    categories: ['Inventory'],
  },
  service: {
    title: 'Service Reports',
    section: 'Service',
    description: 'Service reports generated from service masters stored in the database.',
    categories: ['Service'],
  },
  hr: {
    title: 'HR Reports',
    section: 'HR & Payroll',
    description: 'HR reports generated from employee records stored in the database.',
    categories: ['HR'],
  },
};
const SALES_DOCUMENT_OPTIONS = [
  { value: 'all', label: 'All Sales' },
  { value: 'invoice', label: 'Sales Invoice' },
  { value: 'purchase-invoice', label: 'Purchase Invoice' },
  { value: 'sales-return', label: 'Sales Return' },
  { value: 'purchase-return', label: 'Purchase Return' },
  { value: 'bill-of-supply', label: 'Bill Of Supply' },
  { value: 'quotation', label: 'Quotation' },
];
const PURCHASE_REPORT_OPTIONS = [
  { value: 'purchases', label: 'Supplier Purchases' },
  { value: 'prices', label: 'Price Changes' },
  { value: 'pending', label: 'Pending Orders' },
  { value: 'received', label: 'Goods Received' },
  { value: 'returns', label: 'Supplier Returns' },
  { value: 'payables', label: 'Payable Ageing' },
  { value: 'delivery', label: 'Delivery Performance' },
  { value: 'comparison', label: 'Price Comparison' },
];
const INVENTORY_REPORT_OPTIONS = [
  { value: 'balance', label: 'Stock Balance' }, { value: 'ledger', label: 'Movement Ledger' },
  { value: 'ageing', label: 'Stock Ageing' }, { value: 'dead', label: 'Dead Stock' },
  { value: 'fast', label: 'Fast Movers' }, { value: 'slow', label: 'Slow Movers' },
  { value: 'reorder', label: 'Reorder List' }, { value: 'valuation', label: 'Stock Valuation' },
  { value: 'expiry', label: 'Batch Expiry' }, { value: 'serial', label: 'Serial History' },
  { value: 'warranty', label: 'Warranty Reference' },
];
const AUTOMOBILE_INVENTORY_OPTIONS = [
  { value: 'auto-part-movement', label: 'Part-number movement' },
  { value: 'auto-brand-margin', label: 'Brand / supplier margins' },
  { value: 'reorder', label: 'Reorder list' },
  { value: 'auto-compatibility', label: 'Recorded vehicle compatibility' },
  { value: 'product-360', label: 'Product 360' },
];
const TEXTILE_INVENTORY_OPTIONS = [
  { value: 'textile-matrix', label: 'Size / colour stock matrix' },
  { value: 'textile-sell-through', label: 'Variant sell-through' },
  { value: 'textile-ageing', label: 'Ageing by collection' },
  { value: 'textile-margin', label: 'Salesperson / category margins' },
  { value: 'product-360', label: 'Product 360' },
];
const CRM_REPORT_OPTIONS = [
  { value: 'history', label: 'Purchase history' },
  { value: 'repeat-inactive', label: 'Repeat / inactive customers' },
  { value: 'ageing', label: 'Receivable ageing' },
  { value: 'follow-ups', label: 'Follow-ups' },
  { value: 'customer-360', label: 'Customer 360' },
];
const COLLECTION_REPORT_OPTIONS = [
  { value: 'all', label: 'All collections' }, { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' }, { value: 'split', label: 'Split payments' },
  { value: 'refunds', label: 'Refunds' }, { value: 'settlements', label: 'Settlements' },
  { value: 'closing', label: 'Counter closing' },
];
const SUBSECTION_REPORT_OPTIONS = {
  accounting: [
    ['day-book', 'Day book'], ['ledgers', 'Ledgers'], ['journal', 'Journal'],
    ['trial-balance', 'Trial balance'], ['pnl', 'Profit & loss'], ['balance-sheet', 'Balance sheet'],
    ['cash-flow', 'Cash flow'], ['bank-reconciliation', 'Bank reconciliation'],
  ].map(([value, label]) => ({ value, label })),
  tax: [
    ['tax-breakup', 'Tax component breakup'], ['hsn-sac', 'HSN / SAC summary'],
    ['exceptions', 'Document exceptions'], ['reconciliation', 'Tax reconciliation'],
  ].map(([value, label]) => ({ value, label })),
  expenses: [
    ['expense-comparison', 'Expense category / branch / employee'], ['budget', 'Recurrence and budget comparison'],
    ['attendance', 'Attendance'], ['leave', 'Leave'], ['salary', 'Salary and payroll cost'],
    ['overtime', 'Overtime'], ['incentives', 'Incentives'],
  ].map(([value, label]) => ({ value, label })),
  ecommerce: [
    ['orders', 'Orders'], ['cancellations', 'Cancellations'], ['returns', 'Returns'],
    ['delivery', 'Delivery state'], ['profitability', 'Channel profitability'],
  ].map(([value, label]) => ({ value, label })),
  audit: [
    ['edited-cancelled', 'Edited / cancelled bills'], ['price-overrides', 'Price overrides'],
    ['refunds', 'Unusual refunds'], ['stock-adjustments', 'Stock adjustments'],
    ['access-history', 'Access history'],
  ].map(([value, label]) => ({ value, label })),
};

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsvTable(text = '', title = '') {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const columns = lines[0] ? parseCsvLine(lines[0]) : [];
  const rows = lines.slice(1).map((line, index) => ({
    id: String(index),
    values: parseCsvLine(line),
  }));
  return { title, count: rows.length, columns, rows };
}

function amountFromInvoice(invoice = {}) {
  const totals = invoice.totals || {};
  return Number(totals.finalTotal ?? totals.grandTotal ?? totals.total ?? totals.subTotal ?? 0);
}

function reportDate(invoice = {}) {
  const value = invoice.meta?.date || invoice.createdAt;
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function typeLabel(type = '') {
  return String(type || 'invoice').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchAllSalesDocuments({ documentType, branch, dateFrom, dateTo }) {
  const limit = 500;
  let page = 1;
  let total = Infinity;
  const rows = [];
  while (rows.length < total) {
    const query = new URLSearchParams({ documentType, page: String(page), limit: String(limit) });
    if (branch) query.set('branch', branch);
    if (dateFrom) query.set('dateFrom', dateFrom);
    if (dateTo) query.set('dateTo', dateTo);
    const response = await apiClient(`/sales/invoices?${query.toString()}`);
    const batch = response.data || [];
    rows.push(...batch);
    total = Number(response.total) || 0;
    if (!batch.length) break;
    page += 1;
  }
  return rows;
}

function salesLineReportValues(invoice, item, productsById) {
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

function salesReportRows(invoices, productsById, analysis, marginBy) {
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
  invoices.forEach((invoice) => (invoice.items || []).forEach((item) => {
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
      hourly: hour,
      salesperson,
      channel,
      all: [line.product, line.category, line.brand, salesperson, channel].join(' · '),
    }[analysis];
    const marginKey = {
      product: line.product,
      invoice: invoice.number || 'Unnumbered invoice',
      customer: invoice.customer?.name || 'Walk-in customer',
      branch: invoice.branch || 'Head Office',
    }[marginBy];
    add(analysis === 'margin' ? marginKey : analysisKey, { invoice, line });
  }));
  return [...groups.values()].map((row) => ({ ...row, invoices: row.invoices.size }))
    .sort((a, b) => b.sales - a.sales);
}

function salesDimensionValue(invoice, item, dimension, productsById) {
  const product = productsById.get(String(item.productId || ''));
  if (dimension === 'item') return item.description || product?.description || 'Unspecified item';
  if (dimension === 'category') return item.category || product?.category || 'Uncategorized';
  if (dimension === 'brand') return item.brand || product?.brand || 'Unbranded';
  if (dimension === 'salesperson') return invoice.extra?.salesPerson || invoice.extra?.salesperson || invoice.extra?.salesExecutive || invoice.extra?.billingStaff || invoice.extra?.billedBy || invoice.salesPerson || invoice.salesperson || invoice.salesExecutive || invoice.billingStaff || invoice.createdByName || 'Unassigned';
  if (dimension === 'hourly') {
    const created = new Date(invoice.createdAt || invoice.meta?.date || 0);
    return Number.isNaN(created.getTime()) ? 'Unknown hour' : `${created.toLocaleDateString('en-IN')} ${String(created.getHours()).padStart(2, '0')}:00`;
  }
  return '';
}

function textileInvoiceValue(product, item, dimension) {
  const source = item || {};
  const variants = product?.variants || [];
  const explicitVariant = source.variantId ? variants.find((entry) => String(entry._id || entry.id || '') === String(source.variantId)) : null;
  const sizeMatches = source.size ? variants.filter((entry) => [entry.size, entry.modelName, entry.name].some((value) => value && String(value).toLowerCase() === String(source.size).toLowerCase())) : [];
  const variant = explicitVariant || (sizeMatches.length === 1 ? sizeMatches[0] : null);
  const variantIsAmbiguous = !explicitVariant && sizeMatches.length > 1;
  const productSuppliers = [product?.preferredSupplier, product?.supplier, ...(product?.supplierMappings || []).map((entry) => entry.supplier)].filter(Boolean);
  const value = {
    productCategory: source.category || source.productCategory || product?.category || '',
    subcategory: source.subCategory || source.subcategory || product?.subCategory || product?.subcategory || product?.sub_category || '',
    fabricType: source.fabricType || source.fabric || source.material || product?.fabricType || product?.fabric || product?.material || '',
    brand: source.brand || product?.brand || '',
    size: source.size || source.variantName || variant?.size || variant?.name || product?.size || '',
    color: source.colour || source.color || variant?.colour || variant?.color || (!variantIsAmbiguous && !variants.length ? product?.colour || product?.color : '') || '',
    pattern: source.pattern || variant?.pattern || product?.pattern || '',
    skuBarcode: source.productCode || source.sku || source.barcode || variant?.barcode || product?.code || product?.sku || product?.barcode || '',
    hsn: source.hsn || source.hsnCode || product?.hsn || product?.hsnCode || '',
    batchLot: source.batchNumber || source.batchNo || source.batch || source.lotNumber || product?.batchNumber || product?.batchNo || product?.batchLotNo || product?.lotNumber || '',
    supplier: source.supplierName || source.supplier?.name || product?.supplierName || productSuppliers[0] || '',
    season: source.season || product?.season || product?.collection || '',
  }[dimension];
  return String(value ?? '').trim();
}

function textileDiscountValues(item, invoice = null) {
  const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0);
  const discount = Math.max(0, Number(item.discount) || 0);
  const lineDiscount = Math.min(gross, String(item.discountType || '').toLowerCase() === 'amount' ? discount : gross * discount / 100);
  const documentTaxable = (invoice?.items || []).reduce((sum, line) => {
    const lineGross = (Number(line.qty) || 0) * (Number(line.rate) || 0);
    const lineDiscountValue = Math.min(lineGross, String(line.discountType || '').toLowerCase() === 'amount' ? Number(line.discount) || 0 : lineGross * (Number(line.discount) || 0) / 100);
    return sum + lineGross - lineDiscountValue;
  }, 0);
  const savedOverallDiscount = invoice?.totals?.addDiscAmt ?? invoice?.addDiscAmt ?? invoice?.overallDiscountAmount;
  const additionalDiscount = invoice?.additionalDiscount || {};
  const configuredOverallDiscount = Number(additionalDiscount.value) || 0;
  const overallDiscount = savedOverallDiscount != null ? Number(savedOverallDiscount) || 0
    : String(additionalDiscount.type || '').toLowerCase() === 'percent'
      ? documentTaxable * configuredOverallDiscount / 100
      : Math.min(documentTaxable, configuredOverallDiscount);
  const allocatedDiscount = documentTaxable > 0 ? overallDiscount * Math.max(0, gross - lineDiscount) / documentTaxable : 0;
  const amount = Math.min(gross, lineDiscount + allocatedDiscount);
  return { percent: gross > 0 ? amount / gross * 100 : 0, amount };
}

function textileValueMatches(actual, selected) {
  return String(actual || '').trim().toLocaleLowerCase() === String(selected || '').trim().toLocaleLowerCase();
}

function textileFilterMatches(product, item, dimension, selected) {
  if (!hasSelection(selected)) return true;
  if (dimension === 'supplier') {
    const suppliers = [item?.supplierName, item?.supplier?.name, product?.preferredSupplier, product?.supplier, product?.supplierName, ...(product?.supplierMappings || []).map((entry) => entry.supplier)].filter(Boolean);
    return matchesSelection(selected, (choice) => suppliers.some((value) => textileValueMatches(value, choice)));
  }
  return matchesSelection(selected, (choice) => textileValueMatches(textileInvoiceValue(product, item, dimension), choice));
}

function automobileFilterValues(product = {}, item = {}, dimension = '', invoice = null) {
  const source = item || {};
  const compatibilityText = String(source.compatibleModel || source.vehicleCompatibility || product.compatibleModel || product.vehicleCompatibility || '');
  const compatibilityLower = compatibilityText.toLocaleLowerCase();
  const recordedVehicleTypes = ['Two-Wheeler', 'Three-Wheeler', 'Car', 'SUV', 'LCV', 'HCV'].filter((value) => new RegExp(`(^|[^a-z])${value.toLocaleLowerCase()}([^a-z]|$)`).test(compatibilityLower));
  const recordedVehicleBrands = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Honda', 'TVS', 'Bajaj', 'Hero'].filter((value) => compatibilityLower.includes(value.toLocaleLowerCase()));
  const expiry = source.warrantyExpiryDate || source.warrantyEndDate || product.warrantyExpiryDate || product.warrantyEndDate || product.warrantyExpiresAt;
  const stock = Number(product.stock ?? source.stock ?? 0) || 0;
  const minimum = Number(product.minStockLevel || product.reorderLevel || source.minStockLevel || source.reorderLevel || 0) || 0;
  const warrantyStatus = String(source.warrantyStatus || product.warrantyStatus || '').trim();
  const warrantyPeriod = String(source.warrantyPeriod || product.warrantyPeriod || '').trim();
  const periodMatch = warrantyPeriod.match(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months|year|years|yr|yrs)/i);
  let derivedExpiry = expiry ? new Date(expiry) : null;
  const warrantyStart = invoice?.meta?.date || invoice?.createdAt || '';
  if (!derivedExpiry && periodMatch && warrantyStart) {
    derivedExpiry = new Date(warrantyStart);
    const amount = Number(periodMatch[1]); const unit = periodMatch[2].toLowerCase();
    if (unit.startsWith('day')) derivedExpiry.setDate(derivedExpiry.getDate() + amount);
    else if (unit.startsWith('week')) derivedExpiry.setDate(derivedExpiry.getDate() + amount * 7);
    else derivedExpiry.setMonth(derivedExpiry.getMonth() + amount * (unit.startsWith('year') || unit.startsWith('yr') ? 12 : 1));
  }
  const warranty = warrantyStatus || (derivedExpiry && !Number.isNaN(derivedExpiry.getTime())
    ? (derivedExpiry.getTime() >= Date.now() ? 'Under Warranty' : 'Expired')
    : warrantyPeriod ? 'Warranty date unavailable' : 'No Warranty');
  const suppliers = [source.supplierName, source.supplier?.name, product.preferredSupplier, product.supplier, product.supplierName, ...(product.supplierMappings || []).map((entry) => entry.supplier)].filter(Boolean);
  const values = {
    productCategory: [source.category, source.productCategory, product.category],
    partType: [source.partType, source.productType, product.partType, product.productType, product.itemGroup],
    vehicleType: [source.vehicleType, source.compatibleVehicleType, product.vehicleType, product.compatibleVehicleType, ...recordedVehicleTypes],
    vehicleBrand: [source.vehicleBrand, source.vehicleMake, source.compatibleVehicleBrand, product.vehicleBrand, product.vehicleMake, product.compatibleVehicleBrand, ...recordedVehicleBrands],
    vehicleModel: [source.vehicleModel, compatibilityText],
    partNumber: [source.partNumber, source.oemNumber, source.manufacturerPartNumber, product.partNumber, product.manufacturerPartNumber],
    skuBarcode: [source.productCode, source.sku, source.barcode, product.code, product.aliasCode, product.barcode, product.upc, product.ean],
    brandManufacturer: [source.brand, source.manufacturer, product.brand, product.manufacturer],
    hsn: [source.hsn, source.hsnCode, product.hsn],
    warranty: [warranty],
    serialNumber: [source.serialNumber, source.serial, product.serialNumber],
    batchLot: [source.batchNumber, source.batchNo, source.batch, source.lotNumber, product.batchNumber, product.batchLotNo],
    stockStatus: [stock <= 0 ? 'Out of Stock' : stock <= minimum ? 'Low Stock' : 'In Stock'],
    supplier: suppliers,
  }[dimension] || [];
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (['vehicleModel'].includes(dimension) && value) return String(value).split(/[,;\n]/);
    return [value];
  }).map((value) => String(value ?? '').trim()).filter(Boolean);
}

function automobileFilterMatches(product, item, dimension, selected, invoice = null) {
  return matchesSelection(selected, (choice) => automobileFilterValues(product, item, dimension, invoice).some((value) => textileValueMatches(value, choice)));
}

function electronicsFilterValues(product = {}, item = {}, dimension = '', invoice = null) {
  const source = item || {};
  const variants = product.variants || [];
  const values = {
    productCategory: [source.category, source.productCategory, product.category],
    subcategory: [source.subCategory, source.subcategory, product.subCategory],
    brand: [source.brand, product.brand],
    productModel: [source.modelNumber, source.modelName, product.modelNumber, product.modelFamily, ...variants.flatMap((variant) => [variant.modelName, variant.modelCode])],
    productType: [source.condition, source.productCondition, product.condition, product.productCondition, product.productType],
    sku: [source.productCode, source.sku, product.code, product.aliasCode],
    barcode: [source.barcode, product.barcode, product.upc, product.ean, ...variants.map((variant) => variant.barcode)],
    serialNumber: [source.serialNumber, source.serial, source.imei, source.imei1, source.imei2, product.serialNumber],
    imei: [source.imei, source.imei1, source.imei2, source.serialNumber, product.imei, product.imei1, product.imei2, product.serialNumber],
    warrantyStatus: automobileFilterValues(product, source, 'warranty', invoice),
    warrantyPeriod: [source.warrantyPeriod, product.warrantyPeriod],
    color: [source.colour, source.color, product.colour, ...variants.map((variant) => variant.colour)],
    storage: [source.storage, product.storage, ...variants.map((variant) => variant.storage)],
    ram: [source.ram, product.ram, ...variants.map((variant) => variant.ram)],
    processor: [source.processor, product.processor, ...variants.map((variant) => variant.processor)],
    supplier: [source.supplierName, source.supplier?.name, product.preferredSupplier, product.supplier, product.supplierName, ...(product.supplierMappings || []).map((entry) => entry.supplier)],
    hsn: [source.hsn, source.hsnCode, product.hsn],
    stockStatus: automobileFilterValues(product, source, 'stockStatus', invoice),
  }[dimension] || [];
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value ?? '').trim()).filter(Boolean);
}

function electronicsFilterMatches(product, item, dimension, selected, invoice = null) {
  return matchesSelection(selected, (choice) => electronicsFilterValues(product, item, dimension, invoice).some((value) => textileValueMatches(value, choice)));
}

function matchesSalesDimensionFilters(invoice, item, filters, productsById, omit = '') {
  return ['category', 'brand', 'item', 'salesperson', 'hourly'].every((dimension) => (
    dimension === omit || matchesSelection(filters[dimension], (choice) => salesDimensionValue(invoice, item, dimension, productsById) === choice)
  ));
}

function purchaseRecordDate(record) {
  return record.meta?.date || record.date || record.createdAt || record.updatedAt || '';
}

function crmReportData(reportType, customers, invoices, followUps) {
  const byCustomer = new Map();
  customers.forEach((customer) => byCustomer.set(String(customer._id), { customer, purchases: 0, purchaseCount: 0, returns: 0, receipts: 0, balance: 0, lastPurchase: '', invoices: [] }));
  invoices.forEach((invoice) => {
    const name = invoice.customer?.name || invoice.customerName || 'Walk-in customer';
    const id = invoice.customer?._id || invoice.customer?.id || invoice.customerId;
    const key = id ? String(id) : `name:${name}`;
    if (!byCustomer.has(key)) byCustomer.set(key, { customer: { _id: key, name }, purchases: 0, purchaseCount: 0, returns: 0, receipts: 0, balance: 0, lastPurchase: '', invoices: [] });
    const entry = byCustomer.get(key);
    const total = purchaseRecordTotal(invoice);
    const due = Number(invoice.totals?.balanceDue ?? invoice.balanceDue ?? invoice.remainingBalance) || 0;
    if (invoice.documentType === 'sales-return') entry.returns += total;
    else if (['invoice', 'bill-of-supply'].includes(invoice.documentType)) {
      entry.purchases += total; entry.purchaseCount += 1; entry.balance += due; entry.receipts += Math.max(0, total - due); entry.invoices.push(invoice);
      const date = purchaseRecordDate(invoice);
      if (date && (!entry.lastPurchase || new Date(date) > new Date(entry.lastPurchase))) entry.lastPurchase = date;
    }
  });
  const rows = [...byCustomer.values()].map(({ customer, ...entry }) => ({ customerId: String(customer._id || ''), customer: customer.name || customer.customerName || 'Unnamed customer', phone: customer.phone || '', email: customer.email || '', ...entry }));
  if (reportType === 'history') return invoices.filter((row) => ['invoice', 'bill-of-supply', 'sales-return'].includes(row.documentType)).map((row) => ({ date: purchaseRecordDate(row), document: row.number || 'Unnumbered', customer: row.customer?.name || row.customerName || 'Walk-in customer', type: typeLabel(row.documentType), items: row.items?.length || 0, amount: purchaseRecordTotal(row), balance: Number(row.totals?.balanceDue ?? row.balanceDue ?? row.remainingBalance) || 0 }));
  if (reportType === 'repeat-inactive') return rows.map((row) => ({ customer: row.customer, phone: row.phone, purchases: row.purchaseCount, purchaseValue: row.purchases, lastPurchase: row.lastPurchase, segment: row.purchaseCount >= 2 ? 'Repeat' : !row.lastPurchase || Date.now() - new Date(row.lastPurchase).getTime() > 90 * 86400000 ? 'Inactive' : 'New / active' })).filter((row) => row.segment === 'Repeat' || row.segment === 'Inactive');
  if (reportType === 'ageing') return invoices.filter((row) => ['invoice', 'bill-of-supply'].includes(row.documentType)).map((row) => {
    const balance = Number(row.totals?.balanceDue ?? row.balanceDue ?? row.remainingBalance) || 0;
    const date = purchaseRecordDate(row); const days = date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000)) : 0;
    return { date, document: row.number || 'Unnumbered', customer: row.customer?.name || row.customerName || 'Walk-in customer', balance, ageDays: days, bucket: days <= 30 ? '0–30 days' : days <= 60 ? '31–60 days' : days <= 90 ? '61–90 days' : 'Over 90 days' };
  }).filter((row) => row.balance > 0);
  if (reportType === 'follow-ups') return followUps.map((row) => ({ date: row.date || row.reminderAt || row.createdAt, customer: row.person || row.customerName || '—', regarding: row.regarding || row.followUpType || '—', status: row.status || 'Pending', priority: row.priority || '—', owner: row.owner || '—', notes: row.notes || row.outcome || '' }));
  return rows.map((row) => ({ customer: row.customer, phone: row.phone, email: row.email, purchases: row.purchaseCount, purchaseValue: row.purchases, returns: row.returns, receipts: row.receipts, balance: row.balance, lastPurchase: row.lastPurchase, followUps: followUps.filter((followUp) => String(followUp.customerId || '') === row.customerId || followUp.person === row.customer).length }));
}

function collectionReportData(reportType, payments, refunds) {
  if (reportType === 'refunds') return refunds.map((row) => ({ collectionDate: purchaseRecordDate(row), invoiceDate: row.extra?.originalInvoiceDate || '', document: row.number || '—', customer: row.customer?.name || '—', method: 'Refund', amount: -purchaseRecordTotal(row), reference: row.extra?.reference || '—', type: 'Refund' }));
  if (['settlements', 'closing'].includes(reportType)) return [];
  if (reportType === 'split') {
    const grouped = new Map();
    payments.forEach((payment) => { const key = String(payment.invoiceId || payment.invoiceNumber || ''); const rows = grouped.get(key) || []; rows.push(payment); grouped.set(key, rows); });
    return [...grouped.values()].filter((rows) => rows.length > 1).map((rows) => { const dates = rows.map((row) => row.date || row.createdAt).sort(); return { collectionDate: dates[dates.length - 1], invoiceDate: rows[0].invoiceDate || '', document: rows[0].invoiceNumber || '—', customer: rows[0].customerName || '—', method: rows.map((row) => row.method).join(' + '), amount: rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), reference: rows.map((row) => row.reference).filter(Boolean).join(', ') || '—', type: `${rows.length} payments` }; });
  }
  return payments.filter((payment) => {
    const method = String(payment.method || '').toLowerCase();
    if (reportType === 'all') return true;
    if (reportType === 'cash') return method === 'cash';
    if (reportType === 'upi') return method === 'upi';
    if (reportType === 'card') return method === 'card';
    if (reportType === 'bank') return ['bank transfer', 'cheque'].includes(method);
    return false;
  }).map((payment) => ({ collectionDate: payment.date || payment.createdAt, invoiceDate: payment.invoiceDate || '', document: payment.invoiceNumber || '—', customer: payment.customerName || '—', method: payment.method || '—', amount: Number(payment.amount) || 0, reference: payment.reference || '—', type: 'Receipt' }));
}

function inventoryReportData(reportType, stockRows, products, movements) {
  const productMap = new Map(products.map((row) => [String(row._id || row.id), row]));
  const rows = stockRows.map((stock) => {
    const product = productMap.get(String(stock.productId || stock._id || stock.id)) || stock;
    const qty = Number(stock.stock ?? stock.quantity ?? product.stock) || 0;
    const cost = Number(stock.purchasePrice ?? product.purchasePrice ?? product.costPrice) || 0;
    const stockValue = Number(stock.stockValue) || qty * cost;
    const expiry = product.expiryDate || stock.expiryDate || '';
    const ageDays = product.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(product.createdAt).getTime()) / 86400000)) : null;
    return { product: product.description || stock.description || 'Unnamed product', sku: product.code || stock.code || '', category: product.category || stock.category || 'Unassigned', brand: product.brand || stock.brand || 'Unassigned', warehouse: stock.warehouse || '', quantity: qty, minStock: Number(product.minStockLevel ?? stock.minStockLevel) || 0, reorderLevel: Number(product.reorderLevel ?? product.minStockLevel ?? stock.minStockLevel) || 0, stockValue, unitCost: cost, ageDays, expiry, batch: product.batchNumber || stock.batchNumber || '', serial: product.serialNumber || stock.serialNumber || '', warranty: [product.warrantyPeriod, product.warrantyType].filter(Boolean).join(' ') || product.warranty || '', status: product.status || stock.status || '' };
  });
  if (reportType === 'ledger') return movements.map((row) => ({ date: row.date || row.createdAt || '', product: row.productName || row.description || '', sku: row.code || '', reference: row.sourceNo || row.number || '', movement: row.type || '', warehouse: row.warehouse || '', in: Number(row.qtyIn) || 0, out: Number(row.qtyOut) || 0, balance: Number(row.balance) || 0, value: Number(row.value) || 0 }));
  if (reportType === 'expiry') return rows.filter((row) => row.expiry).map((row) => ({ ...row, daysToExpiry: Math.ceil((new Date(row.expiry) - Date.now()) / 86400000) })).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  if (reportType === 'serial') return rows.filter((row) => row.serial).map((row) => ({ product: row.product, sku: row.sku, serial: row.serial, batch: row.batch, warranty: row.warranty, quantity: row.quantity }));
  if (reportType === 'warranty') return rows.filter((row) => row.warranty).map((row) => ({ product: row.product, sku: row.sku, serial: row.serial, warranty: row.warranty, quantity: row.quantity }));
  if (reportType === 'reorder') return rows.filter((row) => row.quantity <= row.reorderLevel);
  if (reportType === 'dead') return rows.filter((row) => row.quantity > 0 && !movements.some((movement) => (movement.code && movement.code === row.sku || movement.productName && movement.productName === row.product) && Number(movement.qtyOut) > 0));
  if (reportType === 'fast' || reportType === 'slow') {
    const counts = new Map();
    movements.forEach((movement) => { const key = String(movement.code || movement.productName || movement.productId || movement.product || ''); counts.set(key, (counts.get(key) || 0) + (Number(movement.qtyOut) || 0)); });
    return rows.map((row) => ({ ...row, movedQty: counts.get(row.sku) || counts.get(row.product) || 0 })).sort((a, b) => reportType === 'fast' ? b.movedQty - a.movedQty : a.movedQty - b.movedQty);
  }
  if (reportType === 'ageing') return rows.sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0));
  return rows;
}

function industryInventoryRows(reportType, stockRows, products, movements, salesDocs, purchaseDocs, dateFrom = '', dateTo = '') {
  const periodMovements = movements.filter((movement) => { const date = String(movement.date || movement.createdAt || '').slice(0, 10); return (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo)); });
  const inPeriod = (doc) => { const date = String(doc.meta?.date || doc.date || doc.createdAt || '').slice(0, 10); return (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo)); };
  salesDocs = salesDocs.filter(inPeriod);
  purchaseDocs = purchaseDocs.filter(inPeriod);
  const productsById = new Map(products.map((product) => [String(product._id || product.id), product]));
  const sales = salesDocs.filter((doc) => doc.documentType !== 'sales-return').flatMap((doc) => (doc.items || []).map((item) => ({ doc, item })));
  const returns = salesDocs.filter((doc) => doc.documentType === 'sales-return').flatMap((doc) => (doc.items || []).map((item) => ({ doc, item })));
  const purchases = purchaseDocs.flatMap((doc) => (doc.items || []).map((item) => ({ doc, item })));
  const stockById = new Map(stockRows.map((row) => [String(row.productId || row._id || row.id), row]));
  const productFor = (item) => productsById.get(String(item.productId || item.product?._id || item.product?.id || ''));
  if (reportType === 'auto-part-movement') return periodMovements.map((movement) => {
    const product = productFor(movement) || products.find((row) => (row.partNumber || row.manufacturerPartNumber) && [row.code, row.partNumber, row.manufacturerPartNumber, row.barcode].some((key) => key && [movement.code, movement.productCode, movement.partNumber, movement.barcode].includes(key)));
    return { date: movement.date || movement.createdAt || '', product: movement.productName || movement.description || product?.description || 'Unmatched movement', category: product?.category || 'Unassigned', partNumber: product?.partNumber || product?.manufacturerPartNumber || movement.partNumber || '—', brand: product?.brand || '—', movement: movement.type || '—', reference: movement.sourceNo || movement.number || '—', in: Number(movement.qtyIn) || 0, out: Number(movement.qtyOut) || 0, balance: movement.balance ?? '—', vehicleCompatibility: product?.compatibleModel || product?.vehicleCompatibility || 'Not recorded' };
  });
  if (reportType === 'auto-compatibility') return products.map((product) => ({ product: product.description || product.name || 'Unnamed product', category: product.category || 'Unassigned', partNumber: product.partNumber || product.manufacturerPartNumber || '—', brand: product.brand || '—', vehicleCompatibility: product.compatibleModel || product.vehicleCompatibility || 'Not recorded' }));
  if (reportType === 'auto-brand-margin') {
    const groups = new Map();
    sales.forEach(({ doc, item }) => {
      const product = productFor(item); const key = product?.brand || item.brand || 'Unbranded'; const costUnit = Number(item.purchasePrice ?? item.costPrice ?? product?.purchasePrice);
      const row = groups.get(key) || { brand: key, sales: 0, recordedCost: 0, costedSales: 0, supplier: product?.supplierName || product?.supplier?.name || 'Supplier not linked', status: 'Recorded costs only' };
      const revenue = (Number(item.qty) || 0) * (Number(item.rate) || 0); row.sales += revenue; if (Number.isFinite(costUnit) && costUnit > 0) { row.recordedCost += costUnit * (Number(item.qty) || 0); row.costedSales += revenue; } else row.status = 'Cost data incomplete';
      groups.set(key, row);
    });
    const result = [...groups.values()].map((row) => ({ ...row, margin: row.costedSales ? row.costedSales - row.recordedCost : null, supplierMargin: row.supplier === 'Supplier not linked' ? 'Unavailable: supplier not linked to sales cost' : 'Based on recorded product cost' }));
    if (!result.length && purchaseDocs.length) return [{ brand: '—', sales: 0, recordedCost: 0, costedSales: 0, margin: null, supplier: 'Supplier purchase records exist', supplierMargin: 'Unavailable: sales lines do not record supplier attribution', status: 'Insufficient linked cost data' }];
    return result;
  }
  if (reportType === 'textile-matrix' || reportType === 'textile-sell-through') {
    return products.flatMap((product) => (product.variants || []).map((variant) => {
      const size = variant.size || variant.attributes?.size || variant.name || 'Unspecified';
      const colour = variant.color || variant.colour || variant.attributes?.color || variant.attributes?.colour || 'Unspecified';
      const stock = Number(variant.stock ?? variant.quantity) || 0;
      const opening = variant.openingStock ?? product.openingStock;
      const variantMoves = periodMovements.filter((move) => String(move.productId || '') === String(product._id || product.id) && String(move.variantId || '') === String(variant._id || variant.id || ''));
      const receipts = variantMoves.reduce((sum, move) => sum + (Number(move.qtyIn) || 0), 0);
      const sold = variantMoves.reduce((sum, move) => sum + (Number(move.qtyOut) || 0), 0);
      const denominator = opening == null ? null : Number(opening) + receipts;
      return { product: product.description || product.name || 'Unnamed product', category: product.category || product.collection || 'Not recorded', brand: product.brand || '', collection: product.collection || product.category || 'Not recorded', size, colour, stock, openingStock: opening ?? 'Not recorded', receipts, sold, sellThrough: denominator == null ? 'N/A — opening stock not recorded' : denominator === 0 ? 'N/A — denominator is zero' : `${((sold / denominator) * 100).toFixed(1)}%` };
    }));
  }
  if (reportType === 'textile-ageing') return products.map((product) => ({ product: product.description || product.name || 'Unnamed product', category: product.category || product.collection || 'Not recorded', brand: product.brand || '', collection: product.collection || product.category || 'Not recorded', stock: Number(stockById.get(String(product._id || product.id))?.stock ?? product.stock) || 0, ageDays: product.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(product.createdAt).getTime()) / 86400000)) : null, ageingSource: product.createdAt ? 'Product record date' : 'Date not recorded' }));
  if (reportType === 'textile-margin') {
    const groups = new Map();
    sales.forEach(({ doc, item }) => { const product = productFor(item); const category = item.category || product?.category || 'Uncategorized'; const salesperson = doc.extra?.salesPerson || doc.extra?.salesperson || doc.salesPerson || 'Unassigned'; const key = `${salesperson} · ${category}`; const cost = Number(item.purchasePrice ?? item.costPrice ?? product?.purchasePrice); const row = groups.get(key) || { salesperson, category, netSales: 0, recordedCost: 0, margin: 0, status: 'Recorded costs only' }; const gross = (Number(item.qty) || 0) * (Number(item.rate) || 0); const discount = Math.min(gross, Math.max(0, item.discountType === 'amount' ? Number(item.discount) || 0 : gross * ((Number(item.discount) || 0) / 100))); const amount = gross - discount; row.netSales += amount; if (cost > 0) { row.recordedCost += cost * (Number(item.qty) || 0); row.margin += amount - cost * (Number(item.qty) || 0); } else row.status = 'Cost data incomplete'; groups.set(key, row); });
    return [...groups.values()].map((row) => row.status === 'Cost data incomplete' ? { ...row, margin: null } : row);
  }
  if (reportType === 'product-360') return products.map((product) => {
    const id = String(product._id || product.id); const matches = (item) => String(item.productId || item.product?._id || item.product?.id || '') === id; const productSales = sales.filter(({ item }) => matches(item)); const productPurchases = purchases.filter(({ item }) => matches(item)); const productReturns = returns.filter(({ item }) => matches(item)); const stock = stockById.get(id); const productMovements = movements.filter((movement) => String(movement.productId || '') === id); const stockIn = productMovements.reduce((sum, movement) => sum + (Number(movement.qtyIn) || 0), 0); const stockOut = productMovements.reduce((sum, movement) => sum + (Number(movement.qtyOut) || 0), 0); const salesValue = productSales.reduce((sum, { item }) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0); const purchaseValue = productPurchases.reduce((sum, { item }) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0); const returnedQty = productReturns.reduce((sum, { item }) => sum + (Number(item.qty) || 0), 0); const returnedValue = productReturns.reduce((sum, { item }) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0); const soldQty = productSales.reduce((sum, { item }) => sum + (Number(item.qty) || 0), 0); const purchasedQty = productPurchases.reduce((sum, { item }) => sum + (Number(item.qty) || 0), 0); const cost = Number(product.purchasePrice ?? product.costPrice); return { product: product.description || product.name || 'Unnamed product', category: product.category || 'Unassigned', sku: product.code || '—', partNumber: product.partNumber || product.manufacturerPartNumber || '—', brand: product.brand || '—', stockIn: productMovements.length ? stockIn : null, stockOut: productMovements.length ? stockOut : null, stock: stock?.stock == null && stock?.quantity == null && product.stock == null ? null : Number(stock?.stock ?? stock?.quantity ?? product.stock), purchaseQty: productPurchases.length ? purchasedQty : null, purchaseValue: productPurchases.length ? purchaseValue : null, soldQty: productSales.length ? soldQty : null, salesValue: productSales.length ? salesValue : null, returnedQty: productReturns.length ? returnedQty : null, returnedValue: productReturns.length ? returnedValue : null, margin: cost > 0 && productSales.length ? salesValue - cost * soldQty : null, dataStatus: productSales.length || productPurchases.length || productReturns.length ? 'Linked records' : 'Unavailable: no product-linked transaction lines' };
  });
  return [];
}

function purchaseRecordTotal(record) {
  const known = record.totals?.finalTotal ?? record.totals?.grandTotal ?? record.total ?? record.amount;
  if (known != null) return Number(known) || 0;
  return (record.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0);
}

function purchaseReportData(reportType, purchaseDocs, returnDocs, dateFrom = '', dateTo = '', matches = () => true, purchaseType = '', allPurchaseTypes = false) {
  const entries = purchaseDocs.filter((record) => record.documentType === 'purchase-entry');
  const orders = purchaseDocs.filter((record) => record.documentType === 'purchase-order');
  const inDateRange = (record) => {
    const date = String(purchaseRecordDate(record) || '').slice(0, 10);
    return (!dateFrom || (date && date >= dateFrom)) && (!dateTo || (date && date <= dateTo));
  };
  const asDocumentRow = (record, kind = '') => ({
    _records: [{ record, items: record.items || [] }],
    date: purchaseRecordDate(record),
    dueDate: record.meta?.dueDate || record.dueDate || '',
    document: record.number || record.meta?.number || 'Unnumbered',
    supplier: record.customer?.name || record.supplier?.name || 'Unassigned supplier',
    status: record.returnStatus || record.lifecycleStatus || record.status || (kind === 'entry' ? 'Received' : 'Open'),
    amount: purchaseRecordTotal(record),
    balance: record.balanceDue != null ? Number(record.balanceDue) || 0
      : record.totals?.balanceDue != null ? Number(record.totals.balanceDue) || 0
        : record.remainingBalance != null ? Number(record.remainingBalance) || 0
          : Math.max(0, purchaseRecordTotal(record) - (Number(record.advanceReceived) || 0)),
    items: (record.items || []).length,
  });

  if (reportType === 'pending') {
    const receivedByOrder = new Map();
    entries.forEach((entry) => {
      const orderId = entry.extra?.linkedPurchaseOrderId;
      if (orderId) receivedByOrder.set(orderId, (receivedByOrder.get(orderId) || 0) + purchaseRecordTotal(entry));
    });
    return orders.map((order) => {
      const row = asDocumentRow(order, 'order');
      const received = receivedByOrder.get(String(order._id)) || 0;
      return { ...row, received, balance: Math.max(0, row.amount - received), status: received >= row.amount && row.amount > 0 ? 'Completed' : received > 0 ? 'Partially received' : 'Pending' };
    }).filter((row) => row.balance > 0);
  }
  if (reportType === 'returns') return returnDocs.map((record) => asDocumentRow(record, 'return'));
  if (reportType === 'payables') return entries.map((record) => asDocumentRow(record, 'entry')).filter((row) => row.balance > 0).map((row) => {
    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(row.dueDate || row.date || Date.now()).getTime()) / 86400000));
    return { ...row, ageDays, ageing: ageDays <= 30 ? '0–30 days' : ageDays <= 60 ? '31–60 days' : ageDays <= 90 ? '61–90 days' : '90+ days' };
  });
  if (reportType === 'prices' || reportType === 'comparison') {
    const prices = new Map();
    entries.filter(inDateRange).forEach((entry) => (entry.items || []).filter((item) => matches({ ...entry, items: [item] })).forEach((item) => {
      const product = item.description || item.productName || item.name || 'Unspecified item';
      const supplier = entry.customer?.name || 'Unassigned supplier';
      const rate = Number(item.rate) || 0;
      const groupKey = reportType === 'prices' ? `${product}\u0000${supplier}` : product;
      const current = prices.get(groupKey) || { product, suppliers: new Set(), points: [], _records: [] };
      current.suppliers.add(supplier);
      current.points.push({ date: purchaseRecordDate(entry), rate, supplier });
      current._records.push({ record: entry, items: [item] });
      prices.set(groupKey, current);
    }));
    return [...prices.values()].map(({ product, suppliers, points, _records }) => {
      points.sort((a, b) => new Date(a.date) - new Date(b.date));
      if (reportType === 'comparison') {
        const latestBySupplier = new Map();
        points.forEach((point) => latestBySupplier.set(point.supplier, point.rate));
        const ranked = [...latestBySupplier.entries()].sort((a, b) => a[1] - b[1]);
        const lowest = ranked[0] || ['—', 0];
        const highest = ranked[ranked.length - 1] || ['—', 0];
        return { product, supplierNames: ranked.map(([supplier]) => supplier), lowestSupplier: lowest[0], lowestRate: lowest[1], highestSupplier: highest[0], highestRate: highest[1], change: highest[1] - lowest[1], purchases: ranked.length, _records };
      }
      const previousRate = points.length > 1 ? points[points.length - 2].rate : points[0]?.rate || 0;
      const latestRate = points[points.length - 1]?.rate || 0;
      return { product, supplier: [...suppliers].join(', '), previousRate, latestRate, change: latestRate - previousRate, changePercent: previousRate ? ((latestRate - previousRate) / previousRate) * 100 : 0, purchases: points.length, date: points[points.length - 1]?.date || '', _records };
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }
  if (reportType === 'delivery') {
    return orders.map((order) => {
      const linked = entries.filter((entry) => String(entry.extra?.linkedPurchaseOrderId || '') === String(order._id));
      const receivedDate = linked.map(purchaseRecordDate).filter(Boolean).sort((a, b) => new Date(a) - new Date(b))[0] || '';
      const promised = order.extra?.expectedDeliveryDate || order.extra?.deliveryDate || order.expectedDate || '';
      const daysLate = promised && receivedDate ? Math.max(0, Math.floor((new Date(receivedDate) - new Date(promised)) / 86400000)) : null;
      return { ...asDocumentRow(order, 'order'), promised, receivedDate, daysLate, performance: !receivedDate ? 'Awaiting receipt' : daysLate > 0 ? 'Late' : 'On time' };
    });
  }
  const documents = allPurchaseTypes ? automobilePurchaseDocuments(purchaseDocs, returnDocs, purchaseType) : purchaseType === 'purchase-order' ? orders : purchaseType === 'purchase-return' ? returnDocs : purchaseType === 'debit-note' ? purchaseDocs.filter((record) => record.documentType === 'debit-note') : entries;
  return documents.map((record) => asDocumentRow(record, record.documentType === 'purchase-entry' ? 'entry' : ''));
}

function escapeReportHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function ModuleReportsPage({ type }) {
  const config = MODULE_CONFIG[type] ?? MODULE_CONFIG.sales;
  const [reports, setReports] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [salesRows, setSalesRows] = useState([]);
  const [salesProducts, setSalesProducts] = useState([]);
  const [salesCustomers, setSalesCustomers] = useState([]);
  const [purchaseDocs, setPurchaseDocs] = useState([]);
  const [supplierReturnDocs, setSupplierReturnDocs] = useState([]);
  const [purchaseReportType, setPurchaseReportType] = useState('purchases');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseStatus, setPurchaseStatus] = useState('');
  const [purchaseDatePreset, setPurchaseDatePreset] = useState('custom');
  const [automobilePurchaseFilters, setAutomobilePurchaseFilters] = useState(emptyAutomobilePurchaseFilters);
  const [electronicsPurchaseFilters, setElectronicsPurchaseFilters] = useState(emptyElectronicsPurchaseFilters);
  const [purchaseGeneralFilters, setPurchaseGeneralFilters] = useState({ purchaseType: '', documentNo: '', supplierCode: '', supplierInvoiceNo: '', paymentStatus: '', paymentMode: '', gstType: '', gstRate: '', branch: '', staff: '', minAmount: '', maxAmount: '' });
  const [textilePurchaseFilters, setTextilePurchaseFilters] = useState({ productCategory: '', subcategory: '', fabricType: '', brand: '', productName: '', skuBarcode: '', barcode: '', color: '', size: '', pattern: '', material: '', hsn: '', batchLot: '', supplier: '', unit: '', minQty: '', maxQty: '', minRate: '', maxRate: '', discountPercent: '', discountAmount: '' });
  const [crmReportType, setCrmReportType] = useState('history');
  const [crmCustomers, setCrmCustomers] = useState([]);
  const [crmInvoices, setCrmInvoices] = useState([]);
  const [crmFollowUps, setCrmFollowUps] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [collectionReportType, setCollectionReportType] = useState('all');
  const [collectionPayments, setCollectionPayments] = useState([]);
  const [collectionRefunds, setCollectionRefunds] = useState([]);
  const [collectionDateFrom, setCollectionDateFrom] = useState('');
  const [collectionDateTo, setCollectionDateTo] = useState('');
  const [collectionInvoiceDateFrom, setCollectionInvoiceDateFrom] = useState('');
  const [collectionInvoiceDateTo, setCollectionInvoiceDateTo] = useState('');
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [subsectionReportType, setSubsectionReportType] = useState('');
  const [inventoryReportType, setInventoryReportType] = useState('balance');
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [inventoryStock, setInventoryStock] = useState([]);
  const [inventoryMovements, setInventoryMovements] = useState([]);
  const [industrySalesDocs, setIndustrySalesDocs] = useState([]);
  const [industryPurchaseDocs, setIndustryPurchaseDocs] = useState([]);
  const [industrySourceStatus, setIndustrySourceStatus] = useState({});
  const [businessSettings, setBusinessSettings] = useState({});
  const [inventoryCategory, setInventoryCategory] = useState('');
  const [inventoryBrand, setInventoryBrand] = useState('');
  const [inventoryDateFrom, setInventoryDateFrom] = useState('');
  const [inventoryDateTo, setInventoryDateTo] = useState('');
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [salesDocumentType, setSalesDocumentType] = useState('all');
  const [salesDateFrom, setSalesDateFrom] = useState('');
  const [salesDateTo, setSalesDateTo] = useState('');
  const [salesDatePreset, setSalesDatePreset] = useState('custom');
  const [salesInvoiceFilters, setSalesInvoiceFilters] = useState({ invoiceNo: '', invoiceSeries: '', customer: '', billingType: '', payment: '', paymentMode: '', invoiceStatus: '', gst: '', taxRate: '', minAmount: '', maxAmount: '', branch: '' });
  const [textileInvoiceFilters, setTextileInvoiceFilters] = useState({ productCategory: '', subcategory: '', fabricType: '', brand: '', size: '', color: '', pattern: '', skuBarcode: '', hsn: '', batchLot: '', supplier: '', season: '', discountPercent: '', discountAmount: '' });
  const [automobileInvoiceFilters, setAutomobileInvoiceFilters] = useState({ productCategory: '', partType: '', vehicleType: '', vehicleBrand: '', vehicleModel: '', partNumber: '', skuBarcode: '', brandManufacturer: '', hsn: '', warranty: '', serialNumber: '', batchLot: '', stockStatus: '', supplier: '', discountPercent: '', discountAmount: '' });
  const [electronicsInvoiceFilters, setElectronicsInvoiceFilters] = useState({ productCategory: '', subcategory: '', brand: '', productModel: '', productType: '', sku: '', barcode: '', serialNumber: '', imei: '', warrantyStatus: '', warrantyPeriod: '', color: '', storage: '', ram: '', processor: '', supplier: '', hsn: '', stockStatus: '', discountPercent: '', discountAmount: '' });
  const [salesAnalysis, setSalesAnalysis] = useState('invoice');
  const [textileSalesReportType, setTextileSalesReportType] = useState('textile-matrix');
  const [salesDimensionFilters, setSalesDimensionFilters] = useState({ category: '', brand: '', item: '', salesperson: '', hourly: '' });
  const [salesMetric, setSalesMetric] = useState('sales');
  const [marginBy, setMarginBy] = useState('product');
  const [activeReport, setActiveReport] = useState(null);
  const [reportData, setReportData] = useState({ columns: [], rows: [], title: '', count: 0 });
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [salesLoading, setSalesLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const currentUser = getCurrentUser();
  const isAutomobile = currentUser?.category === 'automobile';
  const isTextile = /fashion|textile|apparel|clothing/i.test(String(businessSettings.retailSubcategory || currentUser?.retailSubcategory || ''));
  const isElectronics = /electronics|technology/i.test(String(businessSettings.retailSubcategory || currentUser?.retailSubcategory || ''));
  const hasSalesFilterPanel = isAutomobile || isTextile || isElectronics;
  const invoiceSeriesOptions = useMemo(() => [...new Set(salesRows.map((invoice) => String(invoice.series || invoice.meta?.series || invoice.invoiceSeries || String(invoice.number || invoice.meta?.number || '').match(/^[^\-/]+/)?.[0] || '')).filter(Boolean))].sort().map((value) => ({ value, label: value })), [salesRows]);
  const industryInventoryOptions = isAutomobile ? AUTOMOBILE_INVENTORY_OPTIONS : isTextile ? TEXTILE_INVENTORY_OPTIONS : INVENTORY_REPORT_OPTIONS;
  useEffect(() => {
    if (type === 'inventory' && !industryInventoryOptions.some((option) => option.value === inventoryReportType)) setInventoryReportType(industryInventoryOptions[0]?.value || 'balance');
  }, [type, isAutomobile, isTextile]);
  const isSuperAdmin = currentUser?.isSuperAdmin || currentUser?.accountType === 'owner' || currentUser?.role === 'Super Admin';
  const branchOptions = useMemo(() => [
    { value: '', label: 'All Branches' },
    ...branches.map((item) => ({ value: item.code || item.name, label: `${item.name}${item.code ? ` (${item.code})` : ''}` })),
  ], [branches]);
  const branchNameByKey = useMemo(() => {
    const map = new Map();
    branches.forEach((item) => {
      if (item.code) map.set(String(item.code), item.name || item.code);
      if (item.name) map.set(String(item.name), item.name);
    });
    return map;
  }, [branches]);
  const displayBranchName = (value) => {
    const key = String(value || '').trim();
    if (!key) return 'Head Office';
    return branchNameByKey.get(key) || key;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setActiveReport(null);
    setReportData({ columns: [], rows: [], title: '', count: 0 });
    setRecordsError('');
    apiClient(`/more-modules/reports-summary${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`)
      .then((data) => {
        if (active) setReports(data.reports || []);
      })
      .catch(() => {
        if (active) setReports([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [branch]);

  useEffect(() => {
    if (type !== 'sales') {
      setSalesRows([]);
      setSalesCustomers([]);
      return;
    }
    let active = true;
    setSalesLoading(true);
    Promise.all([
      fetchAllSalesDocuments({ documentType: 'invoice', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      fetchAllSalesDocuments({ documentType: 'bill-of-supply', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      fetchAllSalesDocuments({ documentType: 'quotation', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      fetchAllSalesDocuments({ documentType: 'sales-return', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      fetchAllSalesDocuments({ documentType: 'purchase-entry', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      fetchAllSalesDocuments({ documentType: 'supplier-return', branch, dateFrom: salesDateFrom, dateTo: salesDateTo }),
      apiClient(`/sales/products${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`),
    ])
      .then(([...responses]) => {
        if (!active) return;
        const products = responses.pop() || [];
        const rows = responses.flat();
        rows.sort((a, b) => new Date(b.createdAt || b.meta?.date || 0) - new Date(a.createdAt || a.meta?.date || 0));
        setSalesRows(rows);
        setSalesProducts(products);
      })
      .catch(() => {
        if (active) { setSalesRows([]); setSalesProducts([]); }
      })
      .finally(() => {
        if (active) setSalesLoading(false);
      });
    return () => { active = false; };
  }, [branch, type, salesDateFrom, salesDateTo]);

  useEffect(() => {
    if (type !== 'sales') return undefined;
    let active = true;
    getCustomers().then((response) => { if (active) setSalesCustomers(response.customers || []); }).catch(() => { if (active) setSalesCustomers([]); });
    return () => { active = false; };
  }, [type, branch]);

  useEffect(() => {
    if (type !== 'purchase') {
      setPurchaseDocs([]);
      setSupplierReturnDocs([]);
      return;
    }
    let active = true;
    setPurchaseLoading(true);
    const fetchReturns = async () => {
      const rows = [];
      let page = 1;
      let total = Infinity;
      while (rows.length < total) {
        const query = new URLSearchParams({ page: String(page), limit: '500' });
        if (branch) query.set('branch', branch);
        const response = await apiClient(`/sales/supplier-returns?${query.toString()}`);
        const batch = response.data || [];
        rows.push(...batch);
        total = Number(response.total) || 0;
        if (!batch.length) break;
        page += 1;
      }
      return branch ? rows.filter((row) => String(row.branch || '') === String(branch)) : rows;
    };
    Promise.all([
      fetchAllSalesDocuments({ documentType: 'purchase-entry', branch }),
      fetchAllSalesDocuments({ documentType: 'purchase-order', branch }),
      fetchReturns().catch(() => []),
      isAutomobile || isElectronics ? fetchAllSalesDocuments({ documentType: 'debit-note', branch }) : Promise.resolve([]),
    ]).then(([entries, orders, returns, debitNotes]) => {
      if (active) {
        setPurchaseDocs([...entries, ...orders, ...debitNotes]);
        setSupplierReturnDocs(returns);
      }
    }).catch(() => {
      if (active) { setPurchaseDocs([]); setSupplierReturnDocs([]); }
    }).finally(() => {
      if (active) setPurchaseLoading(false);
    });
    return () => { active = false; };
  }, [branch, type, isAutomobile, isElectronics]);

  useEffect(() => {
    if (type !== 'purchase' || !(isAutomobile || isElectronics)) return undefined;
    let active = true;
    const load = async () => {
      const products = []; let page = 1;
      while (active) {
        const response = await api.invListProducts({ itemType: 'Product', page, limit: 500 });
        const batch = response.data || []; products.push(...batch);
        if (!batch.length || products.length >= Number(response.total || 0)) break;
        page += 1;
      }
      if (active) setInventoryProducts(products);
    };
    load().catch(() => { if (active) setInventoryProducts([]); });
    return () => { active = false; };
  }, [type, isAutomobile, isElectronics, branch]);

  useEffect(() => {
    if (type !== 'inventory' && !(type === 'sales' && isTextile)) return undefined;
    let active = true;
    setInventoryLoading(true);
    setIndustrySourceStatus({ products: 'loading', stock: 'loading', movements: 'loading', sales: 'loading', purchases: 'loading' });
    const collect = async (method) => {
      const rows = []; let page = 1; let total = Infinity;
      while (active && rows.length < total) {
        const response = await method({ itemType: 'Product', page, limit: 500 });
        const batch = response.data || []; rows.push(...batch); total = Number(response.total) || 0;
        if (!batch.length) break;
        page += 1;
      }
      return rows;
    };
    Promise.allSettled([
      collect(api.invListProducts), collect(api.invStockSummary), collect(api.invStockLedger),
      fetchAllSalesDocuments({ documentType: 'invoice', branch }),
      fetchAllSalesDocuments({ documentType: 'bill-of-supply', branch }),
      fetchAllSalesDocuments({ documentType: 'sales-return', branch }),
      fetchAllSalesDocuments({ documentType: 'purchase-entry', branch }),
    ])
      .then((results) => { if (!active) return; const value = (index) => results[index].status === 'fulfilled' ? results[index].value : []; setIndustrySourceStatus({ products: results[0].status, stock: results[1].status, movements: results[2].status, sales: [results[3], results[4], results[5]].every((result) => result.status === 'fulfilled') ? 'fulfilled' : 'rejected', purchases: results[6].status }); setInventoryProducts(value(0)); setInventoryStock(value(1)); setInventoryMovements(value(2)); setIndustrySalesDocs([...value(3), ...value(4), ...value(5)]); setIndustryPurchaseDocs(value(6)); })
      .finally(() => { if (active) setInventoryLoading(false); });
    return () => { active = false; };
  }, [branch, type, isTextile]);

  useEffect(() => {
    api.getSettings().then((settings) => setBusinessSettings(settings || {})).catch(() => setBusinessSettings({}));
  }, []);

  useEffect(() => {
    if (type !== 'crm') return undefined;
    let active = true;
    setCrmLoading(true);
    Promise.all([
      getCustomers().then((data) => data.customers || []),
      fetchAllSalesDocuments({ documentType: 'invoice', branch }),
      fetchAllSalesDocuments({ documentType: 'bill-of-supply', branch }),
      fetchAllSalesDocuments({ documentType: 'sales-return', branch }),
      getFollowUps().then((data) => data.followUps || []),
    ]).then(([customers, invoices, bills, returns, followUps]) => {
      if (active) { setCrmCustomers(customers); setCrmInvoices([...invoices, ...bills, ...returns]); setCrmFollowUps(followUps); }
    }).catch(() => {
      if (active) { setCrmCustomers([]); setCrmInvoices([]); setCrmFollowUps([]); }
    }).finally(() => { if (active) setCrmLoading(false); });
    return () => { active = false; };
  }, [branch, type]);

  useEffect(() => {
    if (type !== 'collections') return undefined;
    let active = true;
    setCollectionLoading(true);
    const query = new URLSearchParams(); if (branch) query.set('branch', branch);
    Promise.all([
      apiClient(`/sales/collections/report${query.size ? `?${query.toString()}` : ''}`).then((data) => data.payments || []),
      fetchAllSalesDocuments({ documentType: 'sales-return', branch }),
    ]).then(([payments, refunds]) => { if (active) { setCollectionPayments(payments); setCollectionRefunds(refunds); } })
      .catch(() => { if (active) { setCollectionPayments([]); setCollectionRefunds([]); } })
      .finally(() => { if (active) setCollectionLoading(false); });
    return () => { active = false; };
  }, [branch, type]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    apiClient('/settings/branches')
      .then((data) => setBranches(data.branches || []))
      .catch(() => setBranches([]));
  }, [isSuperAdmin]);

  const filteredReports = useMemo(() => reports.filter((report) => (
    config.categories.some((category) => report.category === category || report.category.startsWith(`${category} /`))
    && `${report.name} ${report.category} ${report.description}`.toLowerCase().includes(search.trim().toLowerCase())
  )), [config.categories, reports, search]);
  const salesCustomerTypes = useMemo(() => {
    const byPhone = new Map(); const byName = new Map();
    salesCustomers.forEach((customer) => {
      const type = String(customer.customerType || '').trim();
      if (!type) return;
      const phone = String(customer.phone || '').replace(/\D/g, '');
      const name = String(customer.name || '').trim().toLowerCase();
      if (phone) byPhone.set(phone, type);
      if (name) { const types = byName.get(name) || new Set(); types.add(type); byName.set(name, types); }
    });
    return { byPhone, byName };
  }, [salesCustomers]);
  const filteredSalesRows = useMemo(() => (
    salesRows.filter((invoice) => {
      const typeMatches = !hasSelection(salesDocumentType) ? ['invoice', 'bill-of-supply'].includes(invoice.documentType) : matchesSelection(salesDocumentType, (documentType) => documentType === 'all'
        ? ['invoice', 'bill-of-supply'].includes(invoice.documentType)
        : documentType === 'invoice' ? invoice.documentType === 'invoice'
          : documentType === 'purchase-invoice' ? invoice.documentType === 'purchase-entry'
            : documentType === 'purchase-return' ? invoice.documentType === 'supplier-return'
              : invoice.documentType === documentType);
      const filters = salesInvoiceFilters;
      const invoiceNo = String(invoice.number || invoice.meta?.number || '');
      const series = String(invoice.series || invoice.meta?.series || invoice.invoiceSeries || invoiceNo.match(/^[^\-/]+/)?.[0] || '');
      const invoiceNoMatches = !filters.invoiceNo || invoiceNo.toLowerCase().includes(filters.invoiceNo.trim().toLowerCase());
      const seriesMatches = matchesSelection(filters.invoiceSeries, (choice) => series.toLowerCase().includes(choice.trim().toLowerCase()));
      const customerText = `${invoice.customer?.name || ''} ${invoice.customer?.phone || invoice.customer?.mobile || invoice.customer?.phoneNumber || ''} ${invoice.customer?.group || invoice.customer?.groupName || invoice.customerGroup || ''}`.toLowerCase();
      const invoicePhone = String(invoice.customer?.phone || invoice.customer?.mobile || '').replace(/\D/g, '');
      const invoiceName = String(invoice.customer?.name || '').trim().toLowerCase();
      const customerTypesByName = salesCustomerTypes.byName.get(invoiceName);
      const customerType = salesCustomerTypes.byPhone.get(invoicePhone) || (customerTypesByName?.size === 1 ? [...customerTypesByName][0] : '');
      const enrichedCustomerText = `${customerText} ${customerType}`.toLowerCase();
      const customerMatches = !filters.customer || enrichedCustomerText.includes(filters.customer.trim().toLowerCase());
      const declaredBillingType = String(invoice.billingType || invoice.extra?.billingType || invoice.extra?.customerType || invoice.extra?.supplyType || '').toLowerCase();
      const billingType = /b2b|business/.test(declaredBillingType) || invoice.isB2B === true || invoice.extra?.isB2B === true ? 'b2b'
        : /b2c|consumer|retail/.test(declaredBillingType) || invoice.isB2B === false || invoice.extra?.isB2B === false ? 'b2c'
          : invoice.customer?.gstin || invoice.gstin ? 'b2b' : 'b2c';
      const billingMatches = matchesSelection(filters.billingType, (choice) => billingType === choice);
      const total = Number(invoice.invoiceTotal ?? invoice.totals?.finalTotal ?? invoice.totals?.grandTotal ?? invoice.totals?.total ?? invoice.finalTotal ?? invoice.grandTotal ?? invoice.total ?? invoice.amount) || 0;
      const recordedPayments = Array.isArray(invoice.payments) ? invoice.payments.reduce((sum, payment) => sum + (Number(payment.amount ?? payment.paidAmount ?? payment.value) || 0), 0) : 0;
      const paid = Number(invoice.totalPaid ?? invoice.paidAmount ?? invoice.advanceReceived ?? invoice.totals?.paidAmount ?? invoice.payment?.amount ?? recordedPayments) || 0;
      const balance = Number(invoice.balance ?? invoice.balanceDue ?? invoice.totals?.balanceDue ?? invoice.remainingBalance ?? Math.max(0, total - paid)) || 0;
      const dueDate = String(invoice.dueDate || invoice.meta?.dueDate || '').slice(0, 10);
      const localToday = (() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; })();
      const rawPaymentStatus = String(invoice.payStatus || invoice.paymentStatus || invoice.extra?.paymentStatus || (balance <= 0 ? 'paid' : paid > 0 ? 'partially paid' : dueDate && dueDate < localToday ? 'overdue' : 'unpaid')).toLowerCase().replace(/[-_]/g, ' ');
      const paymentStatus = rawPaymentStatus === 'partial' ? 'partially paid' : rawPaymentStatus;
      const paymentMatches = matchesSelection(filters.payment, (choice) => paymentStatus === choice);
      const rawMode = [invoice.paymentMethod, invoice.paymentMode, invoice.paymentType, invoice.extra?.paymentMode, invoice.payment?.method, ...(Array.isArray(invoice.paymentSplits) ? invoice.paymentSplits.map((payment) => payment.method) : []), ...(Array.isArray(invoice.payments) ? invoice.payments.map((payment) => payment.mode || payment.method) : [])].filter(Boolean).join(' ');
      const paymentMode = String(rawMode).toLowerCase();
      const paymentModeMatches = matchesSelection(filters.paymentMode, (choice) => paymentMode.includes(choice));
      const rawInvoiceStatus = String(invoice.lifecycleStatus || invoice.status || '').toLowerCase();
      const invoiceStatus = ['sales-return', 'supplier-return'].includes(invoice.documentType) || rawInvoiceStatus.includes('return') ? 'returned' : rawInvoiceStatus.includes('cancel') ? 'cancelled' : rawInvoiceStatus.includes('draft') ? 'draft' : 'completed';
      const statusMatches = matchesSelection(filters.invoiceStatus, (choice) => invoiceStatus.includes(choice));
      const taxValue = Number(invoice.totals?.tax ?? invoice.totals?.totalTax ?? invoice.tax ?? invoice.gstAmount) || 0;
      const taxSummary = invoice.taxSummary || invoice.totals?.taxSummary;
      const hasTaxSummary = Array.isArray(taxSummary) ? taxSummary.length > 0 : Boolean(taxSummary && typeof taxSummary === 'object' && Object.keys(taxSummary).length);
      const hasTaxedLine = (invoice.items || []).some((item) => Number(item.gstRate ?? item.taxRate ?? item.taxPercent) > 0);
      const hasGst = invoice.documentType === 'bill-of-supply' ? false
        : invoice.documentType === 'invoice' ? true
          : Boolean(invoice.isGstInvoice || invoice.gstin || invoice.customer?.gstin || invoice.gstApplicable || invoice.taxType === 'GST' || taxValue > 0 || hasTaxSummary || hasTaxedLine);
      const gstMatches = matchesSelection(filters.gst, (choice) => choice === 'gst' ? hasGst : !hasGst);
      const taxRates = (invoice.items || []).map((item) => String(item.taxRate ?? item.gstRate ?? item.taxPercent ?? '')).filter(Boolean);
      const taxRateMatches = matchesSelection(filters.taxRate, (choice) => taxRates.includes(choice));
      const amountMatches = (!filters.minAmount || total >= Number(filters.minAmount)) && (!filters.maxAmount || total <= Number(filters.maxAmount));
      const documentBranch = String(invoice.branch || invoice.extra?.branch || invoice.extra?.store || invoice.extra?.warehouse || '').trim();
      const branchMatches = matchesSelection(filters.branch, (choice) => documentBranch === choice);
      const needle = search.trim().toLowerCase();
      const searchMatches = !needle || [invoice.number, invoice.customer?.name, invoice.branch, ...(invoice.items || []).map((item) => `${item.description} ${item.category} ${item.brand}`)].join(' ').toLowerCase().includes(needle);
      return typeMatches && invoiceNoMatches && seriesMatches && customerMatches && billingMatches && paymentMatches && paymentModeMatches && statusMatches && gstMatches && taxRateMatches && amountMatches && branchMatches && searchMatches;
    })
  ), [salesDocumentType, salesRows, salesCustomerTypes, search, salesInvoiceFilters]);
  const invoiceTaxRateOptions = useMemo(() => [...new Set(salesRows.flatMap((invoice) => (invoice.items || []).map((item) => String(item.taxRate ?? item.gstRate ?? item.taxPercent ?? '')).filter(Boolean)))].sort((a, b) => Number(a) - Number(b)).map((value) => ({ value, label: `${value}%` })), [salesRows]);
  const invoiceBranchOptions = useMemo(() => [...new Set(salesRows.map((invoice) => String(invoice.branch || invoice.extra?.branch || invoice.extra?.store || invoice.extra?.warehouse || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: branchNameByKey.get(value) || value })), [salesRows, branchNameByKey]);
  const purchaseBaseRows = useMemo(() => {
    const matches = (record) => (!isAutomobile || matchesAutomobilePurchase(record, automobilePurchaseFilters, inventoryProducts, purchaseDocs))
      && (!isElectronics || matchesElectronicsPurchase(record, electronicsPurchaseFilters, inventoryProducts));
    return purchaseReportData(purchaseReportType, purchaseDocs, supplierReturnDocs, salesDateFrom, salesDateTo, matches, isAutomobile || isElectronics ? purchaseGeneralFilters.purchaseType : '', isAutomobile)
      .filter((row) => !(isAutomobile || isElectronics) || row._records?.some(({ record, items }) => matches({ ...record, items })));
  }, [purchaseReportType, purchaseDocs, supplierReturnDocs, salesDateFrom, salesDateTo, isAutomobile, isElectronics, automobilePurchaseFilters, electronicsPurchaseFilters, inventoryProducts, purchaseGeneralFilters.purchaseType]);
  const filteredPurchaseRows = useMemo(() => purchaseBaseRows.filter((row) => {
    const date = String(row.date || '').slice(0, 10);
    const dateMatches = (!salesDateFrom || (date && date >= salesDateFrom)) && (!salesDateTo || (date && date <= salesDateTo));
    const supplierMatches = !purchaseSupplier || row.supplier === purchaseSupplier || row.lowestSupplier === purchaseSupplier || row.highestSupplier === purchaseSupplier || row.supplierNames?.includes(purchaseSupplier);
    const normalizePurchaseStatus = (value) => {
      const normalized = String(value || '').toLowerCase().replace(/[-_]/g, ' ');
      if (['open', 'awaiting receipt'].includes(normalized)) return 'pending';
      if (['posted', 'complete'].includes(normalized)) return 'completed';
      if (normalized === 'canceled') return 'cancelled';
      return normalized;
    };
    const statusMatches = !purchaseStatus || [row.status, row.performance, row.ageing].some((value) => normalizePurchaseStatus(value) === normalizePurchaseStatus(purchaseStatus));
    const searchMatches = !search.trim() || Object.values(row).filter((value) => ['string', 'number'].includes(typeof value)).join(' ').toLowerCase().includes(search.trim().toLowerCase());
    const sources = row._records?.length ? row._records : [{ record: {}, items: [] }];
    const generalMatches = sources.some(({ record, items }) => {
      if (isAutomobile && !matchesAutomobilePurchase({ ...record, items }, automobilePurchaseFilters, inventoryProducts, purchaseDocs)) return false;
      if (isElectronics && !matchesElectronicsPurchase({ ...record, items }, electronicsPurchaseFilters, inventoryProducts)) return false;
      const general = purchaseGeneralFilters;
      const sourceSupplier = record.customer || record.supplier || {};
      const rawSourceStatus = String(record.payStatus || record.paymentStatus || record.extra?.paymentStatus || '').toLowerCase().replace(/[-_]/g, ' ');
      const sourceStatus = ['partial', 'part paid', 'partially-paid'].includes(rawSourceStatus) ? 'partially paid' : rawSourceStatus;
      const paid = Number(record.totalPaid ?? record.paidAmount ?? record.advanceReceived ?? record.totals?.paidAmount ?? 0) || 0;
      const balance = Number(record.balanceDue ?? record.totals?.balanceDue ?? record.remainingBalance ?? Math.max(0, purchaseRecordTotal(record) - paid)) || 0;
      const dueDate = String(record.dueDate || record.meta?.dueDate || '').slice(0, 10);
      const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const paymentStatus = sourceStatus || (balance <= 0 ? 'paid' : dueDate && dueDate < today ? 'overdue' : paid > 0 ? 'partially paid' : 'unpaid');
      const paymentMode = [record.paymentMethod, record.paymentMode, record.paymentType, record.extra?.paymentMode, record.payment?.method, ...(record.paymentSplits || []).map((entry) => entry.method), ...(Array.isArray(record.payments) ? record.payments.map((entry) => entry.mode || entry.method) : [])].filter(Boolean).join(' ').toLowerCase();
      const taxAmount = Number(record.totals?.tax ?? record.totals?.totalTax ?? record.tax ?? record.gstAmount ?? 0) || 0;
      const hasTax = taxAmount > 0 || Boolean(record.isGstInvoice || record.gstin || record.gstApplicable) || items.some((item) => Number(item.gstRate ?? item.taxRate ?? item.taxPercent) > 0);
      const recordType = String(record.documentType || '').toLowerCase();
      const kindMatches = !general.purchaseType || (general.purchaseType === 'purchase-invoice' ? recordType === 'purchase-entry' : general.purchaseType === 'purchase-order' ? recordType === 'purchase-order' : general.purchaseType === 'purchase-return' ? ['supplier-return', 'purchase-return'].includes(recordType) : recordType === 'debit-note');
      const document = `${record.number || record.meta?.number || ''} ${record.invoiceSeries || record.series || record.meta?.series || record.meta?.invoiceSeries || ''}`;
      const supplierCode = String(sourceSupplier.code || sourceSupplier.supplierCode || sourceSupplier.supplierId || '');
      const supplierInvoice = String(record.vendorInvoiceNo || record.vendorInvoiceNumber || record.supplierInvoiceNo || record.supplierInvoiceNumber || record.extra?.vendorInvoiceNo || record.extra?.vendorInvoiceNumber || record.extra?.supplierInvoiceNo || record.extra?.supplierInvoiceNumber || '');
      const recordAmount = purchaseRecordTotal(record);
      const amountMatches = (!general.minAmount || recordAmount >= Number(general.minAmount)) && (!general.maxAmount || recordAmount <= Number(general.maxAmount));
      const gstRates = items.map((item) => String(item.gstRate ?? item.taxRate ?? item.taxPercent ?? '')).filter(Boolean);
      const branchValue = record.branch || record.extra?.branch || record.extra?.store || record.extra?.warehouse || '';
      const branchName = String(typeof branchValue === 'object' ? branchValue.name || branchValue.label || branchValue.code || '' : branchValue);
      const staffValue = record.extra?.purchaseStaff || record.extra?.purchaseExecutive || record.extra?.createdByName || record.createdByName || record.createdBy?.name || '';
      const staffName = String(typeof staffValue === 'object' ? staffValue.name || staffValue.label || '' : staffValue);
      return kindMatches
        && (!general.documentNo || document.toLowerCase().includes(general.documentNo.toLowerCase()))
        && (!general.supplierCode || supplierCode.toLowerCase().includes(general.supplierCode.toLowerCase()))
        && (!general.supplierInvoiceNo || supplierInvoice.toLowerCase().includes(general.supplierInvoiceNo.toLowerCase()))
        && (!general.paymentStatus || paymentStatus === general.paymentStatus)
        && (!general.paymentMode || paymentMode.includes(general.paymentMode) || general.paymentMode === 'bank transfer' && /\bbank\b/.test(paymentMode))
        && (!general.gstType || (general.gstType === 'gst' ? hasTax : general.gstType === 'non-gst' ? !hasTax : Boolean(record.inputTaxCreditEligible ?? record.itcEligible ?? record.extra?.inputTaxCreditEligible)))
        && (!general.gstRate || gstRates.includes(general.gstRate))
        && (!general.branch || branchName === general.branch)
        && (!general.staff || staffName === general.staff)
        && amountMatches;
    });
    const textileMatches = sources.some(({ record, items }) => items.some((item) => {
      const product = inventoryProducts.find((entry) => String(entry._id || entry.id) === String(item.productId || item.product?._id || item.product?.id)) || item.product || {};
      const filters = textilePurchaseFilters;
      const category = textileInvoiceValue(product, item, 'productCategory');
      const subcategory = textileInvoiceValue(product, item, 'subcategory');
      const fabricType = textileInvoiceValue(product, item, 'fabricType');
      const textMatches = !filters.productName || String(item.description || item.productName || product.description || product.name || '').toLowerCase().includes(filters.productName.toLowerCase());
      const barcodeMatches = !filters.barcode || String(item.barcode || product.barcode || '').toLowerCase().includes(filters.barcode.toLowerCase());
      const unitMatches = !filters.unit || String(item.unit || product.unit || '').toLowerCase() === filters.unit.toLowerCase();
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const discount = textileDiscountValues(item, record);
      return (!filters.productCategory || textileValueMatches(category, filters.productCategory))
        && (!filters.subcategory || textileValueMatches(subcategory, filters.subcategory))
        && (!filters.fabricType || textileValueMatches(fabricType, filters.fabricType))
        && (!filters.brand || textileFilterMatches(product, item, 'brand', filters.brand))
        && textMatches
        && (!filters.skuBarcode || textileFilterMatches(product, item, 'skuBarcode', filters.skuBarcode))
        && barcodeMatches
        && (!filters.color || textileFilterMatches(product, item, 'color', filters.color))
        && (!filters.size || textileFilterMatches(product, item, 'size', filters.size))
        && (!filters.pattern || textileFilterMatches(product, item, 'pattern', filters.pattern))
        && (!filters.material || String(item.material || item.composition || product.material || product.composition || '').toLowerCase() === filters.material.toLowerCase())
        && (!filters.hsn || textileFilterMatches(product, item, 'hsn', filters.hsn))
        && (!filters.batchLot || textileFilterMatches(product, item, 'batchLot', filters.batchLot))
        && (!filters.supplier || String(record.customer?.name || record.supplier?.name || '').toLowerCase() === filters.supplier.toLowerCase())
        && unitMatches
        && (!filters.minQty || qty >= Number(filters.minQty))
        && (!filters.maxQty || qty <= Number(filters.maxQty))
        && (!filters.minRate || rate >= Number(filters.minRate))
        && (!filters.maxRate || rate <= Number(filters.maxRate))
        && (!filters.discountPercent || discount.percent >= Number(filters.discountPercent))
        && (!filters.discountAmount || discount.amount >= Number(filters.discountAmount));
    }));
    const hasTextileFilters = Object.values(textilePurchaseFilters).some(Boolean);
    return dateMatches && supplierMatches && statusMatches && searchMatches && generalMatches && (!hasTextileFilters || textileMatches);
  }), [purchaseBaseRows, purchaseSupplier, purchaseStatus, purchaseGeneralFilters, textilePurchaseFilters, inventoryProducts, salesDateFrom, salesDateTo, search, isAutomobile, automobilePurchaseFilters, isElectronics, electronicsPurchaseFilters, purchaseDocs]);
  const purchaseSupplierOptions = useMemo(() => [...new Set([...purchaseDocs, ...supplierReturnDocs].map((row) => row.customer?.name || row.supplier?.name).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })), [purchaseDocs, supplierReturnDocs]);
  const purchaseStatusOptions = useMemo(() => [...new Map([...['Draft', 'Pending', 'Received', 'Completed', 'Cancelled'], ...purchaseBaseRows.map((row) => row.performance || row.ageing || row.status).filter(Boolean)].map((value) => [String(value).toLowerCase(), { value: String(value).toLowerCase(), label: value }])).values()], [purchaseBaseRows]);
  const purchaseFilterRecords = useMemo(() => [...purchaseDocs, ...supplierReturnDocs], [purchaseDocs, supplierReturnDocs]);
  const purchaseBranchOptions = useMemo(() => [...new Set(purchaseFilterRecords.map((record) => { const value = record.branch || record.extra?.branch || record.extra?.store || record.extra?.warehouse || ''; return String(typeof value === 'object' ? value.name || value.label || value.code || '' : value).trim(); }).filter(Boolean))].sort().map((value) => ({ value, label: value })), [purchaseFilterRecords]);
  const purchaseStaffOptions = useMemo(() => [...new Set(purchaseFilterRecords.map((record) => { const value = record.extra?.purchaseStaff || record.extra?.purchaseExecutive || record.extra?.createdByName || record.createdByName || record.createdBy?.name || ''; return String(typeof value === 'object' ? value.name || value.label || '' : value).trim(); }).filter(Boolean))].sort().map((value) => ({ value, label: value })), [purchaseFilterRecords]);
  const purchaseGstRateOptions = useMemo(() => [...new Set([...['0', '5', '12', '18', '28'], ...purchaseFilterRecords.flatMap((record) => (record.items || []).map((item) => String(item.gstRate ?? item.taxRate ?? item.taxPercent ?? '')).filter(Boolean))])].sort((a, b) => Number(a) - Number(b)).map((value) => ({ value, label: `${value}%` })), [purchaseFilterRecords]);
  const textilePurchaseFilterOptions = useMemo(() => {
    const definitions = {
      productCategory: ['Sarees', 'Shirts', 'T-Shirts', 'Kurtis', 'Dresses', 'Fabrics', 'Readymade Garments'],
      subcategory: ['Silk Saree', 'Cotton Saree', 'Designer Saree', 'Formal Shirt', 'Casual Wear'],
      fabricType: ['Cotton', 'Silk', 'Linen', 'Polyester', 'Rayon', 'Denim', 'Georgette'],
      color: ['Red', 'Blue', 'Black', 'White', 'Green', 'Other'],
      size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'],
      pattern: ['Plain', 'Printed', 'Embroidered', 'Checked', 'Striped'],
      material: ['Cotton Blend', 'Pure Cotton', 'Silk Blend', 'Polyester Blend'],
    };
    const dimensions = ['productCategory', 'subcategory', 'fabricType', 'brand', 'productName', 'skuBarcode', 'barcode', 'color', 'size', 'pattern', 'material', 'hsn', 'batchLot', 'supplier', 'unit'];
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, new Set(definitions[dimension] || [])]));
    purchaseFilterRecords.forEach((record) => (record.items || []).forEach((item) => {
      const product = inventoryProducts.find((entry) => String(entry._id || entry.id) === String(item.productId || item.product?._id || item.product?.id)) || item.product || {};
      dimensions.forEach((dimension) => {
        const value = dimension === 'productName' ? item.description || item.productName || product.description || product.name
          : dimension === 'barcode' ? item.barcode || product.barcode
            : dimension === 'material' ? item.material || item.composition || product.material || product.composition
              : dimension === 'unit' ? item.unit || product.unit
                : textileInvoiceValue(product, item, dimension);
        if (value) values[dimension].add(String(value));
      });
      const supplierName = record.customer?.name || record.supplier?.name;
      if (supplierName) values.supplier.add(String(supplierName));
    }));
    return Object.fromEntries(dimensions.map((dimension) => [dimension, [...values[dimension]].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))]));
  }, [purchaseFilterRecords, inventoryProducts]);
  useEffect(() => {
    if (purchaseStatus && !purchaseStatusOptions.some((option) => option.value === purchaseStatus)) setPurchaseStatus('');
  }, [purchaseStatus, purchaseStatusOptions]);
  const purchaseTotals = useMemo(() => filteredPurchaseRows.reduce((totals, row) => ({
    amount: totals.amount + (Number(row.amount) || 0),
    balance: totals.balance + (Number(row.balance) || 0),
    pending: totals.pending + (row.balance > 0 ? 1 : 0),
  }), { amount: 0, balance: 0, pending: 0 }), [filteredPurchaseRows]);
  const purchaseColumns = useMemo(() => {
    if (purchaseReportType === 'comparison') return [['product', 'Product'], ['lowestSupplier', 'Lowest Supplier'], ['lowestRate', 'Lowest Rate'], ['highestSupplier', 'Highest Supplier'], ['highestRate', 'Highest Rate'], ['change', 'Price Spread'], ['purchases', 'Suppliers']];
    if (purchaseReportType === 'prices') return [['product', 'Product'], ['supplier', 'Supplier'], ['previousRate', 'Previous Rate'], ['latestRate', 'Latest Rate'], ['change', 'Change'], ['changePercent', 'Change %'], ['purchases', 'Purchases'], ['date', 'Last Purchase']];
    if (purchaseReportType === 'pending') return [['date', 'Order Date'], ['document', 'Order No.'], ['supplier', 'Supplier'], ['status', 'Status'], ['amount', 'Order Value'], ['received', 'Received Value'], ['balance', 'Pending Value']];
    if (purchaseReportType === 'payables') return [['date', 'Purchase Date'], ['document', 'Invoice'], ['supplier', 'Supplier'], ['dueDate', 'Due Date'], ['ageing', 'Ageing'], ['ageDays', 'Days Overdue'], ['amount', 'Invoice Value'], ['balance', 'Payable']];
    if (purchaseReportType === 'delivery') return [['document', 'Order No.'], ['supplier', 'Supplier'], ['promised', 'Expected Date'], ['receivedDate', 'Received Date'], ['performance', 'Delivery Status'], ['daysLate', 'Days Late'], ['amount', 'Order Value']];
    return [['date', purchaseReportType === 'returns' ? 'Return Date' : 'Purchase Date'], ['document', 'Document No.'], ['supplier', 'Supplier'], ['status', 'Status'], ['items', 'Items'], ['amount', 'Amount'], ['balance', 'Balance Due']];
  }, [purchaseReportType]);
  const industryReportSelected = industryInventoryOptions.some((option) => option.value === inventoryReportType) && !INVENTORY_REPORT_OPTIONS.some((option) => option.value === inventoryReportType);
  const inventoryBaseRows = useMemo(() => industryReportSelected
    ? industryInventoryRows(inventoryReportType, inventoryStock, inventoryProducts, inventoryMovements, industrySalesDocs, industryPurchaseDocs, inventoryDateFrom, inventoryDateTo)
    : inventoryReportData(inventoryReportType, inventoryStock, inventoryProducts, inventoryMovements),
  [inventoryReportType, inventoryStock, inventoryProducts, inventoryMovements, industrySalesDocs, industryPurchaseDocs, industryReportSelected, inventoryDateFrom, inventoryDateTo]);
  const inventoryCategories = useMemo(() => [...new Set(inventoryStock.map((row) => row.category).filter(Boolean))].sort().map((value) => ({ value, label: value })), [inventoryStock]);
  const inventoryBrands = useMemo(() => [...new Set(inventoryStock.map((row) => row.brand).filter(Boolean))].sort().map((value) => ({ value, label: value })), [inventoryStock]);
  const filteredInventoryRows = useMemo(() => inventoryBaseRows.filter((row) => {
    const searchMatches = !search.trim() || Object.values(row).join(' ').toLowerCase().includes(search.trim().toLowerCase());
    return searchMatches && (!inventoryCategory || row.category === inventoryCategory || row.collection === inventoryCategory) && (!inventoryBrand || row.brand === inventoryBrand);
  }), [inventoryBaseRows, inventoryCategory, inventoryBrand, search]);
  const inventoryColumns = useMemo(() => {
    if (inventoryReportType === 'auto-part-movement') return [['date', 'Date'], ['product', 'Product'], ['partNumber', 'Part Number'], ['brand', 'Brand'], ['movement', 'Movement'], ['reference', 'Reference'], ['in', 'Stock In'], ['out', 'Stock Out'], ['balance', 'Balance'], ['vehicleCompatibility', 'Recorded Vehicle Compatibility']];
    if (inventoryReportType === 'auto-compatibility') return [['product', 'Product'], ['partNumber', 'Part Number'], ['brand', 'Brand'], ['vehicleCompatibility', 'Recorded Vehicle Compatibility']];
    if (inventoryReportType === 'auto-brand-margin') return [['brand', 'Brand'], ['sales', 'Sales'], ['recordedCost', 'Recorded Cost'], ['margin', 'Margin'], ['supplier', 'Supplier'], ['supplierMargin', 'Supplier Margin Status'], ['status', 'Data Status']];
    if (inventoryReportType === 'textile-matrix' || inventoryReportType === 'textile-sell-through') return [['product', 'Product'], ['collection', 'Collection'], ['size', 'Size'], ['colour', 'Colour'], ['stock', 'Current Stock'], ['openingStock', 'Opening Stock'], ['receipts', 'Receipts'], ['sold', 'Units Sold'], ['sellThrough', 'Sell-through']];
    if (inventoryReportType === 'textile-ageing') return [['product', 'Product'], ['collection', 'Collection'], ['stock', 'Current Stock'], ['ageDays', 'Age (Days)'], ['ageingSource', 'Ageing Source']];
    if (inventoryReportType === 'textile-margin') return [['salesperson', 'Salesperson'], ['category', 'Category'], ['netSales', 'Net Sales'], ['recordedCost', 'Recorded Cost'], ['margin', 'Margin'], ['status', 'Data Status']];
    if (inventoryReportType === 'product-360') return [['product', 'Product'], ['sku', 'SKU'], ['partNumber', 'Part Number'], ['brand', 'Brand'], ['stock', 'Current Stock'], ['stockIn', 'Stock In'], ['stockOut', 'Stock Out'], ['purchaseQty', 'Purchased Qty'], ['purchaseValue', 'Purchase Value'], ['soldQty', 'Sold Qty'], ['salesValue', 'Sales Value'], ['returnedQty', 'Returned Qty'], ['returnedValue', 'Return Value'], ['margin', 'Recorded Cost Margin'], ['dataStatus', 'Data Status']];
    if (inventoryReportType === 'ledger') return [['date', 'Date'], ['product', 'Product'], ['sku', 'SKU'], ['reference', 'Reference'], ['movement', 'Movement'], ['warehouse', 'Warehouse'], ['in', 'Stock In'], ['out', 'Stock Out'], ['balance', 'Balance'], ['value', 'Value']];
    if (inventoryReportType === 'expiry') return [['product', 'Product'], ['sku', 'SKU'], ['batch', 'Batch'], ['expiry', 'Expiry Date'], ['daysToExpiry', 'Days to Expiry'], ['quantity', 'Quantity'], ['stockValue', 'Stock Value']];
    if (inventoryReportType === 'serial') return [['product', 'Product'], ['sku', 'SKU'], ['serial', 'Serial Number'], ['batch', 'Batch'], ['warranty', 'Warranty'], ['quantity', 'Quantity']];
    if (inventoryReportType === 'warranty') return [['product', 'Product'], ['sku', 'SKU'], ['serial', 'Serial Number'], ['warranty', 'Warranty'], ['quantity', 'Quantity']];
    if (inventoryReportType === 'fast' || inventoryReportType === 'slow') return [['product', 'Product'], ['sku', 'SKU'], ['category', 'Category'], ['brand', 'Brand'], ['quantity', 'Current Stock'], ['movedQty', 'Moved Quantity'], ['stockValue', 'Stock Value']];
    if (inventoryReportType === 'ageing') return [['product', 'Product'], ['sku', 'SKU'], ['category', 'Category'], ['quantity', 'Quantity'], ['ageDays', 'Age (Days)'], ['stockValue', 'Stock Value']];
    if (inventoryReportType === 'reorder') return [['product', 'Product'], ['sku', 'SKU'], ['category', 'Category'], ['brand', 'Brand'], ['quantity', 'Available'], ['reorderLevel', 'Reorder Level'], ['minStock', 'Minimum Stock']];
    return [['product', 'Product'], ['sku', 'SKU'], ['category', 'Category'], ['brand', 'Brand'], ['warehouse', 'Warehouse'], ['quantity', 'Quantity'], ['unitCost', 'Unit Cost'], ['stockValue', 'Stock Value']];
  }, [inventoryReportType]);
  const textileSalesColumns = useMemo(() => {
    if (textileSalesReportType === 'textile-matrix' || textileSalesReportType === 'textile-sell-through') return [['product', 'Product'], ['collection', 'Collection'], ['size', 'Size'], ['colour', 'Colour'], ['stock', 'Current Stock'], ['openingStock', 'Opening Stock'], ['receipts', 'Receipts'], ['sold', 'Units Sold'], ['sellThrough', 'Sell-through']];
    if (textileSalesReportType === 'textile-ageing') return [['product', 'Product'], ['collection', 'Collection'], ['stock', 'Current Stock'], ['ageDays', 'Age (Days)'], ['ageingSource', 'Ageing Source']];
    if (textileSalesReportType === 'textile-margin') return [['salesperson', 'Salesperson'], ['category', 'Category'], ['netSales', 'Net Sales'], ['recordedCost', 'Recorded Cost'], ['margin', 'Margin'], ['status', 'Data Status']];
    return [['product', 'Product'], ['sku', 'SKU'], ['partNumber', 'Part Number'], ['brand', 'Brand'], ['stock', 'Current Stock'], ['stockIn', 'Stock In'], ['stockOut', 'Stock Out'], ['purchaseQty', 'Purchased Qty'], ['purchaseValue', 'Purchase Value'], ['soldQty', 'Sold Qty'], ['salesValue', 'Sales Value'], ['returnedQty', 'Returned Qty'], ['returnedValue', 'Return Value'], ['margin', 'Recorded Cost Margin'], ['dataStatus', 'Data Status']];
  }, [textileSalesReportType]);
  const inventoryTotals = useMemo(() => filteredInventoryRows.reduce((sum, row) => ({ quantity: sum.quantity + (Number(row.quantity ?? row.in ?? row.stock ?? 0) || 0), stockValue: sum.stockValue + (Number(row.stockValue ?? row.value ?? 0) || 0) }), { quantity: 0, stockValue: 0 }), [filteredInventoryRows]);
  const inventoryHasValuation = filteredInventoryRows.some((row) => row.stockValue != null || row.value != null);
  const inventoryHasQuantity = filteredInventoryRows.some((row) => row.quantity != null || row.in != null || row.stock != null);
  const crmBaseRows = useMemo(() => crmReportData(crmReportType, crmCustomers, crmInvoices, crmFollowUps), [crmReportType, crmCustomers, crmInvoices, crmFollowUps]);
  const filteredCrmRows = useMemo(() => crmBaseRows.filter((row) => !search.trim() || Object.values(row).join(' ').toLowerCase().includes(search.trim().toLowerCase())), [crmBaseRows, search]);
  const crmColumns = useMemo(() => {
    if (crmReportType === 'history') return [['date', 'Date'], ['document', 'Document'], ['customer', 'Customer'], ['type', 'Type'], ['items', 'Items'], ['amount', 'Purchase / Return'], ['balance', 'Balance']];
    if (crmReportType === 'repeat-inactive') return [['customer', 'Customer'], ['phone', 'Phone'], ['purchases', 'Purchases'], ['purchaseValue', 'Purchase Value'], ['lastPurchase', 'Last Purchase'], ['segment', 'Customer Segment']];
    if (crmReportType === 'ageing') return [['date', 'Invoice Date'], ['document', 'Invoice'], ['customer', 'Customer'], ['ageDays', 'Age (Days)'], ['bucket', 'Ageing'], ['balance', 'Receivable']];
    if (crmReportType === 'follow-ups') return [['date', 'Follow-up Date'], ['customer', 'Customer / Contact'], ['regarding', 'Regarding'], ['status', 'Status'], ['priority', 'Priority'], ['owner', 'Owner'], ['notes', 'Notes']];
    return [['customer', 'Customer'], ['phone', 'Phone'], ['email', 'Email'], ['purchases', 'Purchases'], ['purchaseValue', 'Purchase Value'], ['returns', 'Returns'], ['receipts', 'Receipts'], ['balance', 'Balance Due'], ['lastPurchase', 'Last Purchase'], ['followUps', 'Follow-ups']];
  }, [crmReportType]);
  const crmTotals = useMemo(() => filteredCrmRows.reduce((totals, row) => ({ purchaseValue: totals.purchaseValue + (Number(row.amount ?? row.purchaseValue) || 0), balance: totals.balance + (Number(row.balance) || 0) }), { purchaseValue: 0, balance: 0 }), [filteredCrmRows]);
  const collectionBaseRows = useMemo(() => collectionReportData(collectionReportType, collectionPayments, collectionRefunds), [collectionReportType, collectionPayments, collectionRefunds]);
  const filteredCollectionRows = useMemo(() => collectionBaseRows.filter((row) => {
    const collectionDate = String(row.collectionDate || '').slice(0, 10); const invoiceDate = String(row.invoiceDate || '').slice(0, 10);
    const collectionDateMatches = (!collectionDateFrom || collectionDate >= collectionDateFrom) && (!collectionDateTo || collectionDate <= collectionDateTo);
    const invoiceDateMatches = (!collectionInvoiceDateFrom || invoiceDate && invoiceDate >= collectionInvoiceDateFrom) && (!collectionInvoiceDateTo || invoiceDate && invoiceDate <= collectionInvoiceDateTo);
    const searchMatches = !search.trim() || Object.values(row).join(' ').toLowerCase().includes(search.trim().toLowerCase());
    return collectionDateMatches && invoiceDateMatches && searchMatches;
  }), [collectionBaseRows, collectionDateFrom, collectionDateTo, collectionInvoiceDateFrom, collectionInvoiceDateTo, search]);
  const collectionColumns = [['collectionDate', 'Collection Date'], ['invoiceDate', 'Invoice Date'], ['document', 'Invoice'], ['customer', 'Customer'], ['method', 'Payment Method'], ['amount', 'Amount'], ['reference', 'Reference'], ['type', 'Entry Type']];
  const collectionTotals = useMemo(() => ({ amount: filteredCollectionRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), methods: new Set(filteredCollectionRows.map((row) => row.method).filter(Boolean)).size }), [filteredCollectionRows]);
  function downloadTableCsv(name, columns, rows) {
    downloadReportTableCsv(name, columns.map(([, label]) => label), rows.map((row) => columns.map(([key]) => row[key] ?? '')));
  }
  function downloadTablePdf(name, columns, rows, subtitle) {
    return downloadReportTablePdf(name, columns.map(([, label]) => label), rows.map((row) => columns.map(([key]) => row[key] ?? '')), { subtitle: `${subtitle} · ${rows.length} records` });
  }
  const subsectionOptions = SUBSECTION_REPORT_OPTIONS[type] || [];
  const activeSubsection = subsectionReportType || subsectionOptions[0]?.value || '';
  const activeSubsectionLabel = subsectionOptions.find((option) => option.value === activeSubsection)?.label || '';
  const productsById = useMemo(() => new Map(salesProducts.map((product) => [String(product._id || product.id), product])), [salesProducts]);
  const salesDimensionOptions = useMemo(() => {
    const dimensions = ['category', 'brand', 'item', 'salesperson', 'hourly'];
    return Object.fromEntries(dimensions.map((dimension) => {
      const values = new Set();
      salesRows.forEach((invoice) => (invoice.items || []).forEach((item) => {
        values.add(salesDimensionValue(invoice, item, dimension, productsById));
      }));
      return [dimension, [...values].filter(Boolean).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))];
    }));
  }, [salesRows, productsById]);
  const textileInvoiceOptions = useMemo(() => {
    const dimensions = ['productCategory', 'subcategory', 'fabricType', 'brand', 'size', 'color', 'pattern', 'skuBarcode', 'hsn', 'batchLot', 'supplier', 'season'];
    const productMap = new Map([...inventoryProducts, ...salesProducts].map((product) => [String(product._id || product.id), product]));
    const pairs = [...productMap.values()].map((product) => ({ product, item: {} }));
    salesRows.forEach((invoice) => (invoice.items || []).forEach((item) => pairs.push({ product: productsById.get(String(item.productId || '')) || item.product || {}, item })));
    const suggestions = {
      productCategory: ['Sarees', 'Shirts', 'T-Shirts', 'Kurtis', 'Dresses', 'Fabrics'],
      subcategory: ['Silk Saree', 'Cotton Saree', 'Formal Shirt', 'Casual Shirt'],
      fabricType: ['Cotton', 'Silk', 'Linen', 'Polyester', 'Rayon', 'Denim'],
      size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'],
      color: ['Red', 'Blue', 'Black', 'White', 'Green', 'Other'],
      pattern: ['Plain', 'Printed', 'Embroidered', 'Checked', 'Striped'],
      season: ['Summer', 'Winter', 'Festive'],
    };
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, new Set(suggestions[dimension] || [])]));
    pairs.forEach(({ product, item }) => {
      dimensions.forEach((dimension) => {
        const value = textileInvoiceValue(product, item, dimension);
        if (value) values[dimension].add(value);
      });
      [product.preferredSupplier, product.supplier, ...(product.supplierMappings || []).map((entry) => entry.supplier)].filter(Boolean).forEach((supplier) => values.supplier.add(String(supplier)));
      (product.variants || []).forEach((variant) => {
        if (variant.size) values.size.add(String(variant.size));
        const color = variant.colour || variant.color;
        if (color) values.color.add(String(color));
      });
    });
    return Object.fromEntries(dimensions.map((dimension) => [dimension, [...values[dimension]].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))]));
  }, [salesProducts, inventoryProducts, salesRows, productsById]);
  const automobileInvoiceOptions = useMemo(() => {
    const dimensions = ['productCategory', 'partType', 'vehicleType', 'vehicleBrand', 'vehicleModel', 'partNumber', 'skuBarcode', 'brandManufacturer', 'hsn', 'warranty', 'serialNumber', 'batchLot', 'stockStatus', 'supplier'];
    const products = new Map([...inventoryProducts, ...salesProducts].map((product) => [String(product._id || product.id), product]));
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, new Set()]));
    products.forEach((product) => dimensions.forEach((dimension) => automobileFilterValues(product, {}, dimension).forEach((value) => values[dimension].add(value))));
    salesRows.forEach((invoice) => (invoice.items || []).forEach((item) => {
      const product = productsById.get(String(item.productId || '')) || item.product || {};
      dimensions.forEach((dimension) => automobileFilterValues(product, item, dimension, invoice).forEach((value) => values[dimension].add(value)));
    }));
    return Object.fromEntries(dimensions.map((dimension) => [dimension, [...values[dimension]].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))]));
  }, [inventoryProducts, salesProducts, salesRows, productsById]);
  const electronicsInvoiceOptions = useMemo(() => {
    const dimensions = ['productCategory', 'subcategory', 'brand', 'productModel', 'productType', 'sku', 'barcode', 'serialNumber', 'imei', 'warrantyStatus', 'warrantyPeriod', 'color', 'storage', 'ram', 'processor', 'supplier', 'hsn', 'stockStatus'];
    const products = new Map([...inventoryProducts, ...salesProducts].map((product) => [String(product._id || product.id), product]));
    const values = Object.fromEntries(dimensions.map((dimension) => [dimension, new Set()]));
    products.forEach((product) => dimensions.forEach((dimension) => electronicsFilterValues(product, {}, dimension).forEach((value) => values[dimension].add(value))));
    salesRows.forEach((invoice) => (invoice.items || []).forEach((item) => {
      const product = productsById.get(String(item.productId || '')) || item.product || {};
      dimensions.forEach((dimension) => electronicsFilterValues(product, item, dimension, invoice).forEach((value) => values[dimension].add(value)));
    }));
    return Object.fromEntries(dimensions.map((dimension) => [dimension, [...values[dimension]].sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }))]));
  }, [inventoryProducts, salesProducts, salesRows, productsById]);
  const dimensionFilteredSalesRows = useMemo(() => {
    return filteredSalesRows.map((invoice) => ({
      ...invoice,
      items: (invoice.items || []).filter((item) => {
        const product = productsById.get(String(item.productId || '')) || item.product || {};
        const dimensionsMatch = matchesSalesDimensionFilters(invoice, item, salesDimensionFilters, productsById)
          && matchesSelection(salesInvoiceFilters.taxRate, (choice) => String(item.taxRate ?? item.gstRate ?? item.taxPercent ?? '') === choice)
          && Object.entries(textileInvoiceFilters).every(([dimension, selected]) => !hasSelection(selected) || ['discountPercent', 'discountAmount'].includes(dimension) || textileFilterMatches(product, item, dimension, selected))
          && Object.entries(automobileInvoiceFilters).every(([dimension, selected]) => !selected || ['discountPercent', 'discountAmount'].includes(dimension) || automobileFilterMatches(product, item, dimension, selected, invoice))
          && Object.entries(electronicsInvoiceFilters).every(([dimension, selected]) => !selected || ['discountPercent', 'discountAmount'].includes(dimension) || electronicsFilterMatches(product, item, dimension, selected, invoice));
        if (!dimensionsMatch) return false;
        const { percent, amount } = textileDiscountValues(item, invoice);
        return (!textileInvoiceFilters.discountPercent || percent >= Number(textileInvoiceFilters.discountPercent))
          && (!textileInvoiceFilters.discountAmount || amount >= Number(textileInvoiceFilters.discountAmount))
          && (!automobileInvoiceFilters.discountPercent || percent >= Number(automobileInvoiceFilters.discountPercent))
          && (!automobileInvoiceFilters.discountAmount || amount >= Number(automobileInvoiceFilters.discountAmount))
          && (!electronicsInvoiceFilters.discountPercent || percent >= Number(electronicsInvoiceFilters.discountPercent))
          && (!electronicsInvoiceFilters.discountAmount || amount >= Number(electronicsInvoiceFilters.discountAmount));
      }),
    })).filter((invoice) => invoice.items.length);
  }, [filteredSalesRows, productsById, salesDimensionFilters, textileInvoiceFilters, automobileInvoiceFilters, electronicsInvoiceFilters, salesInvoiceFilters.taxRate]);
  const textileSalesRows = useMemo(() => {
    const documentKeys = (doc) => [doc._id, doc.id, doc.number, doc.meta?.number].filter(Boolean).map(String);
    const industryDocumentKeys = new Set(industrySalesDocs.flatMap(documentKeys));
    const selectedIndustrySalesDocs = dimensionFilteredSalesRows.filter((doc) => documentKeys(doc).some((key) => industryDocumentKeys.has(key)));
    const restrictToSales = hasSelection(salesDocumentType) || Object.values(salesInvoiceFilters).some(hasSelection) || Object.values(salesDimensionFilters).some(hasSelection) || Boolean(salesDateFrom || salesDateTo || search.trim());
    return industryInventoryRows(textileSalesReportType, inventoryStock, inventoryProducts, inventoryMovements, selectedIndustrySalesDocs, industryPurchaseDocs, salesDateFrom, salesDateTo).filter((row) => {
    const textMatches = !search.trim() || Object.values(row).join(' ').toLowerCase().includes(search.trim().toLowerCase());
    const categoryMatches = !(row.category || row.collection) || matchesSelection(salesDimensionFilters.category, (choice) => row.category === choice || row.collection === choice);
    const brandMatches = !row.brand || matchesSelection(salesDimensionFilters.brand, (choice) => row.brand === choice);
    const personMatches = !row.salesperson || matchesSelection(salesDimensionFilters.salesperson, (choice) => row.salesperson === choice);
    const itemMatches = !row.product || matchesSelection(salesDimensionFilters.item, (choice) => row.product === choice);
    const product = inventoryProducts.find((entry) => (entry.description || entry.name) === row.product) || {};
    const rowItem = { ...row, category: row.category || row.collection, colour: row.colour || row.color, size: row.size || row.variantName, productCode: row.sku || row.code, batchNumber: row.batch || row.batchNumber };
    const hasLinkedSale = !restrictToSales || !row.product || selectedIndustrySalesDocs.some((doc) => (doc.items || []).some((line) => {
      const linked = String(line.productId || line.product?._id || line.product?.id || '') === String(product._id || product.id || '') || (line.description || line.productName) === row.product;
      return linked && (!row.size || !line.size || row.size === line.size) && (!row.colour || !(line.colour || line.color) || row.colour === (line.colour || line.color));
    }));
    const textileDimensionsMatch = Object.entries(textileInvoiceFilters).every(([dimension, selected]) => !selected || ['discountPercent', 'discountAmount'].includes(dimension) || textileFilterMatches(product, rowItem, dimension, selected));
    const discountMatches = !(textileInvoiceFilters.discountPercent || textileInvoiceFilters.discountAmount) || selectedIndustrySalesDocs.some((doc) => (doc.items || []).some((line) => {
      const linked = String(line.productId || line.product?._id || line.product?.id || '') === String(product._id || product.id || '') || (line.description || line.productName) === row.product;
      if (!linked) return false;
      const discount = textileDiscountValues(line, doc);
      return (!textileInvoiceFilters.discountPercent || discount.percent >= Number(textileInvoiceFilters.discountPercent)) && (!textileInvoiceFilters.discountAmount || discount.amount >= Number(textileInvoiceFilters.discountAmount));
    }));
    return hasLinkedSale && textMatches && categoryMatches && brandMatches && personMatches && itemMatches && textileDimensionsMatch && discountMatches;
    });
  }, [textileSalesReportType, inventoryStock, inventoryProducts, inventoryMovements, industrySalesDocs, industryPurchaseDocs, salesDateFrom, salesDateTo, search, salesDimensionFilters, textileInvoiceFilters, dimensionFilteredSalesRows, salesDocumentType, salesInvoiceFilters]);
  const groupedSalesRows = useMemo(() => salesReportRows(dimensionFilteredSalesRows, productsById, salesAnalysis, marginBy).filter((row) => (
    salesMetric === 'discounts' ? row.discount > 0
      : salesMetric === 'profitability' ? row.costedSales > 0
        : salesMetric === 'below-cost' ? row.belowCostSales > 0
          : true
  )), [dimensionFilteredSalesRows, productsById, salesAnalysis, marginBy, salesMetric]);
  const salesTotals = useMemo(() => groupedSalesRows.reduce((sum, row) => ({
    sales: sum.sales + row.sales,
    margin: sum.margin + row.margin,
    discount: sum.discount + row.discount,
    belowCostSales: sum.belowCostSales + row.belowCostSales,
    costedSales: sum.costedSales + row.costedSales,
  }), { sales: 0, margin: 0, discount: 0, belowCostSales: 0, costedSales: 0 }), [groupedSalesRows]);

  const salesExportColumns = [
    salesAnalysis === 'margin' ? `Margin by ${marginBy}` : salesAnalysis === 'all' ? 'Item / Category / Brand / Salesperson / Channel' : `${salesAnalysis[0].toUpperCase()}${salesAnalysis.slice(1)}`,
    'Invoices', 'Quantity', 'Net Sales', 'Discounts', 'Cost', 'Costed Sales', 'Gross Profit', 'Below-Cost Sales',
  ];
  const salesExportRows = groupedSalesRows.map((row) => [row.name, row.invoices, row.quantity, row.sales, row.discount, row.cost, row.costedSales, row.margin, row.belowCostSales]);

  function downloadSalesCsv() {
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [salesExportColumns, ...salesExportRows].map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadSalesPdf() {
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default || html2pdfModule;
    const host = document.createElement('div');
    const filters = [
      `Breakdown: ${salesAnalysis}${salesAnalysis === 'margin' ? ` (${marginBy})` : ''}`,
      salesDateFrom ? `From: ${salesDateFrom}` : '', salesDateTo ? `To: ${salesDateTo}` : '',
      ...Object.entries(salesDimensionFilters).filter(([, value]) => hasSelection(value)).map(([key, value]) => `${key}: ${selectionValues(value).join(', ')}`),
    ].filter(Boolean).map(escapeReportHtml).join(' | ');
    const rows = salesExportRows.map((row) => `<tr>${row.map((value) => `<td>${escapeReportHtml(value)}</td>`).join('')}</tr>`).join('');
    host.innerHTML = `<div style="font-family:Arial,sans-serif;color:#17345c;padding:24px;width:1100px"><h1 style="font-size:24px;margin:0 0 6px">Sales Report</h1><p style="color:#60738e;font-size:12px;margin:0 0 20px">${filters || 'All sales'} · ${salesExportRows.length} rows</p><div style="display:flex;gap:12px;margin-bottom:20px"><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Net Sales</small><h2>${escapeReportHtml(formatCurrency(salesTotals.sales))}</h2></div><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Gross Profit</small><h2>${escapeReportHtml(formatCurrency(salesTotals.margin))}</h2></div><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Discounts</small><h2>${escapeReportHtml(formatCurrency(salesTotals.discount))}</h2></div><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Below-Cost Sales</small><h2>${escapeReportHtml(formatCurrency(salesTotals.belowCostSales))}</h2></div></div><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr>${salesExportColumns.map((column) => `<th style="padding:8px;background:#edf4fc;border:1px solid #dce7f5;text-align:left">${escapeReportHtml(column)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    host.style.cssText = 'position:fixed;left:-12000px;top:0;z-index:-1';
    document.body.appendChild(host);
    try {
      await html2pdf().set({ margin: 8, filename: `sales-report-${new Date().toISOString().slice(0, 10)}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(host.firstElementChild).save();
    } finally {
      host.remove();
    }
  }

  function downloadPurchaseCsv() {
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [purchaseColumns.map(([, label]) => label), ...filteredPurchaseRows.map((row) => purchaseColumns.map(([key]) => row[key] ?? ''))]
      .map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase-${purchaseReportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPurchasePdf() {
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default || html2pdfModule;
    const host = document.createElement('div');
    const heading = PURCHASE_REPORT_OPTIONS.find((option) => option.value === purchaseReportType)?.label || 'Purchase Report';
    const rows = filteredPurchaseRows.map((row) => `<tr>${purchaseColumns.map(([key]) => `<td>${escapeReportHtml(row[key] ?? '—')}</td>`).join('')}</tr>`).join('');
    host.innerHTML = `<div style="font-family:Arial,sans-serif;color:#17345c;padding:24px;width:1100px"><h1 style="font-size:24px;margin:0 0 6px">${escapeReportHtml(heading)}</h1><p style="color:#60738e;font-size:12px;margin:0 0 20px">${escapeReportHtml(purchaseSupplier || 'All suppliers')} · ${salesDateFrom || 'All dates'} to ${salesDateTo || 'Today'} · ${filteredPurchaseRows.length} rows</p><div style="display:flex;gap:12px;margin-bottom:20px"><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Purchase Value</small><h2>${escapeReportHtml(formatCurrency(purchaseTotals.amount))}</h2></div><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Outstanding Payable</small><h2>${escapeReportHtml(formatCurrency(purchaseTotals.balance))}</h2></div><div style="flex:1;padding:14px;border:1px solid #dce7f5;border-radius:8px"><small>Open Items</small><h2>${purchaseTotals.pending}</h2></div></div><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr>${purchaseColumns.map(([, label]) => `<th style="padding:8px;background:#edf4fc;border:1px solid #dce7f5;text-align:left">${escapeReportHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    host.style.cssText = 'position:fixed;left:-12000px;top:0;z-index:-1';
    document.body.appendChild(host);
    try {
      await html2pdf().set({ margin: 8, filename: `purchase-${purchaseReportType}-${new Date().toISOString().slice(0, 10)}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(host.firstElementChild).save();
    } finally {
      host.remove();
    }
  }

  async function handleDownloadReport(report) {
    try {
      await downloadReportCsv(report.downloadKey, report.name, { branch });
    } catch (err) {
      window.alert(err.message || 'Report download failed');
    }
  }

  async function handleDownloadReportPdf(report) {
    try {
      await downloadReportPdf(report.downloadKey, report.name, { branch });
    } catch (err) {
      window.alert(err.message || 'Report PDF download failed');
    }
  }

  async function handleOpenReport(report) {
    if (!report.downloadKey) return;
    setActiveReport(report);
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const query = new URLSearchParams({ key: report.downloadKey });
      if (branch) query.set('branch', branch);
      const data = await apiClient(`/more-modules/reports-records?${query.toString()}`);
      setReportData(data);
    } catch (err) {
      try {
        const query = new URLSearchParams({ key: report.downloadKey });
        if (branch) query.set('branch', branch);
        const response = await fetch(`${API_BASE_URL}/more-modules/reports-download?${query.toString()}`, {
          headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        });
        if (!response.ok) throw new Error(err.message || 'Unable to load report data', { cause: err });
        setReportData(parseCsvTable(await response.text(), report.name));
      } catch (fallbackErr) {
        setReportData({ columns: [], rows: [], title: report.name, count: 0 });
        setRecordsError(fallbackErr.message || 'Unable to load report data');
      }
    } finally {
      setRecordsLoading(false);
    }
  }

  const resetButton = (<button className={type === 'sales' ? 'arh-sales-reset' : type === 'purchase' ? 'arh-purchase-reset' : ''} onClick={() => { setSearch(''); if (type === 'sales') { setSalesDateFrom(''); setSalesDateTo(''); setSalesDatePreset('custom'); setSalesDocumentType('all'); setSalesAnalysis('invoice'); setSalesDimensionFilters({ category: '', brand: '', item: '', salesperson: '', hourly: '' }); setSalesInvoiceFilters({ invoiceNo: '', invoiceSeries: '', customer: '', billingType: '', payment: '', paymentMode: '', invoiceStatus: '', gst: '', taxRate: '', minAmount: '', maxAmount: '', branch: '' }); setTextileInvoiceFilters({ productCategory: '', subcategory: '', fabricType: '', brand: '', size: '', color: '', pattern: '', skuBarcode: '', hsn: '', batchLot: '', supplier: '', season: '', discountPercent: '', discountAmount: '' }); setAutomobileInvoiceFilters({ productCategory: '', partType: '', vehicleType: '', vehicleBrand: '', vehicleModel: '', partNumber: '', skuBarcode: '', brandManufacturer: '', hsn: '', warranty: '', serialNumber: '', batchLot: '', stockStatus: '', supplier: '', discountPercent: '', discountAmount: '' }); setElectronicsInvoiceFilters({ productCategory: '', subcategory: '', brand: '', productModel: '', productType: '', sku: '', barcode: '', serialNumber: '', imei: '', warrantyStatus: '', warrantyPeriod: '', color: '', storage: '', ram: '', processor: '', supplier: '', hsn: '', stockStatus: '', discountPercent: '', discountAmount: '' }); setSalesMetric('sales'); setMarginBy('product'); } if (type === 'purchase') { setElectronicsPurchaseFilters(emptyElectronicsPurchaseFilters()); setAutomobilePurchaseFilters(emptyAutomobilePurchaseFilters()); setSalesDateFrom(''); setSalesDateTo(''); setPurchaseDatePreset('custom'); setPurchaseReportType('purchases'); setPurchaseSupplier(''); setPurchaseStatus(''); setPurchaseGeneralFilters({ purchaseType: '', documentNo: '', supplierCode: '', supplierInvoiceNo: '', paymentStatus: '', paymentMode: '', gstType: '', gstRate: '', branch: '', staff: '', minAmount: '', maxAmount: '' }); setTextilePurchaseFilters({ productCategory: '', subcategory: '', fabricType: '', brand: '', productName: '', skuBarcode: '', barcode: '', color: '', size: '', pattern: '', material: '', hsn: '', batchLot: '', supplier: '', unit: '', minQty: '', maxQty: '', minRate: '', maxRate: '', discountPercent: '', discountAmount: '' }); } if (type === 'inventory') { setInventoryReportType(isAutomobile ? 'auto-part-movement' : isTextile ? 'textile-matrix' : 'balance'); setInventoryCategory(''); setInventoryBrand(''); setInventoryDateFrom(''); setInventoryDateTo(''); } if (type === 'crm') setCrmReportType('history'); if (type === 'collections') { setCollectionReportType('all'); setCollectionDateFrom(''); setCollectionDateTo(''); setCollectionInvoiceDateFrom(''); setCollectionInvoiceDateTo(''); } if (subsectionOptions.length) setSubsectionReportType(subsectionOptions[0].value); }}><X size={14} />{['sales', 'purchase', 'inventory', 'crm', 'collections', ...Object.keys(SUBSECTION_REPORT_OPTIONS)].includes(type) ? 'Reset' : 'Clear Search'}</button>);
  const salesMoreFilters = type === 'sales' && hasSalesFilterPanel ? (<SalesReportFilters invoiceFilters={salesInvoiceFilters} dimensions={salesDimensionFilters} categoryFilters={isAutomobile ? automobileInvoiceFilters : isTextile ? textileInvoiceFilters : electronicsInvoiceFilters} category={isAutomobile ? 'automobile' : isTextile ? 'fashion' : 'electronics'} documentType={salesDocumentType} reportView={textileSalesReportType}
            options={{ documentTypes: SALES_DOCUMENT_OPTIONS, dimensions: salesDimensionOptions, category: isAutomobile ? automobileInvoiceOptions : isTextile ? textileInvoiceOptions : electronicsInvoiceOptions, reportViews: isTextile ? TEXTILE_INVENTORY_OPTIONS : [], taxRates: invoiceTaxRateOptions, branches: invoiceBranchOptions,
              series: invoiceSeriesOptions }}
            onApply={({ invoice, dimensions, categoryFilters, documentType, reportView }) => { setSalesInvoiceFilters(invoice); setSalesDimensionFilters(dimensions); if (isAutomobile) setAutomobileInvoiceFilters(categoryFilters); else if (isTextile) { setTextileInvoiceFilters(categoryFilters); setTextileSalesReportType(reportView); } else setElectronicsInvoiceFilters(categoryFilters); setSalesDocumentType(documentType); }} />) : null;

  const purchasePanelOptions = { suppliers: purchaseSupplierOptions, statuses: purchaseStatusOptions, branches: purchaseBranchOptions, staff: purchaseStaffOptions, gstRates: purchaseGstRateOptions, reportViews: PURCHASE_REPORT_OPTIONS, category: textilePurchaseFilterOptions };
  function changePurchaseDatePreset(preset) {
    setPurchaseDatePreset(preset);
    if (!preset || preset === 'custom') { if (!preset) { setSalesDateFrom(''); setSalesDateTo(''); } return; }
    const start = new Date(); const end = new Date(start);
    if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    if (preset === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (preset === 'month') start.setDate(1);
    if (preset === 'previous-month') { start.setDate(1); start.setMonth(start.getMonth() - 1); end.setDate(0); }
    const dateString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setSalesDateFrom(dateString(start)); setSalesDateTo(dateString(end));
  }
  const purchaseMoreFilters = type === 'purchase' ? <PurchaseReportFilters general={purchaseGeneralFilters}
    categoryFilters={isAutomobile ? automobilePurchaseFilters : isTextile ? textilePurchaseFilters : electronicsPurchaseFilters}
    category={isAutomobile ? 'automobile' : isTextile ? 'fashion' : isElectronics ? 'electronics' : 'general'}
    records={purchaseFilterRecords} products={inventoryProducts} options={purchasePanelOptions}
    onApply={({ general, categoryFilters }) => { setPurchaseGeneralFilters(general); if (isAutomobile) setAutomobilePurchaseFilters(categoryFilters); else if (isTextile) setTextilePurchaseFilters(categoryFilters); else setElectronicsPurchaseFilters(categoryFilters); }} /> : null;

  return (
    <div className="acu-host arh-host"><main className="autop-page acu-page arh-page" data-category="subsection" aria-busy={loading}>
      <div className="autop-header">
        <div>
          <nav className="flex items-center gap-1 text-[13px] text-[#536173] mb-1">
            <a className="text-blue-600 no-underline hover:underline" href="/dashboard">Home</a>
            <span>/</span><span>{config.section}</span><span>/</span><span>Reports</span>
          </nav>
          <h1 className="m-0 text-[22px] font-bold text-[#111827]">{config.title}</h1>
          <p className="m-0 text-[13px] text-[#536173] mt-0.5">{type === 'sales' ? 'Invoice, item, category, brand, hourly, salesperson and channel sales.' : config.description}</p>
        </div>
        <div className={`autop-actions${(type === 'sales' && hasSalesFilterPanel) || type === 'purchase' ? ' esrf-header-actions' : ''}`}>{isSuperAdmin && (
          <SelectDropdown
            aria-label="Branch"
            className="w-[132px] flex-none sm:w-44"
            value={branch}
            onChange={setBranch}
            options={branchOptions}
            buttonClassName="border border-[#dbe4ef] rounded-md px-3 py-2 text-[13px] bg-white font-[inherit] outline-none"
          />
        )}{((type === 'sales' && hasSalesFilterPanel) || type === 'purchase') && <div className="esrf-header-buttons">{type === 'purchase' ? purchaseMoreFilters : salesMoreFilters}{resetButton}</div>}</div>
      </div>

      <section className={`acu-filters arh-filters${type === 'sales' ? ` arh-sales-filters${hasSalesFilterPanel ? ' esrf-page-toolbar' : ''}${salesAnalysis === 'margin' ? ' arh-sales-margin' : ''}` : type === 'purchase' ? ' arh-sales-filters esrf-page-toolbar' : ''}`}>
        {!(type === 'sales' && hasSalesFilterPanel) && type !== 'purchase' && <>
        <label className="arh-filter arh-search"><span>{type === 'sales' ? 'Find sales' : type === 'purchase' ? 'Find purchases' : type === 'crm' ? 'Find customers or documents' : type === 'collections' ? 'Find collection records' : `Search ${config.section} Reports`}</span><div><Search size={16} /><input aria-label={`Search ${config.section} reports`} placeholder={type === 'sales' ? 'Invoice, customer, product or brand' : type === 'purchase' ? 'Supplier, product or document number' : type === 'crm' ? 'Customer, phone, invoice or follow-up' : type === 'collections' ? 'Customer, invoice or reference' : 'Search by report name or description…'} value={search} onChange={(event) => setSearch(event.target.value)} /></div></label>
        </>}
        {type === 'sales' && <>
          {!hasSalesFilterPanel && <>
          <label className="arh-filter"><span>Date preset</span><SelectDropdown aria-label="Choose sales date preset" value={salesDatePreset} onChange={(preset) => {
            setSalesDatePreset(preset);
            if (preset === 'custom') return;
            const today = new Date(); const dateString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const start = new Date(today); const end = new Date(today);
            if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
            if (preset === 'week') { start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); }
            if (preset === 'month') start.setDate(1);
            setSalesDateFrom(dateString(start)); setSalesDateTo(dateString(end));
          }} options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom range' }]} buttonClassName="autop-dropdown-trigger" /></label>
          <label className="arh-filter"><span>From</span><input aria-label="Sales report start date" type="date" value={salesDateFrom} max={salesDateTo || undefined} onChange={(event) => { setSalesDatePreset('custom'); setSalesDateFrom(event.target.value); }} /></label>
          <label className="arh-filter"><span>To</span><input aria-label="Sales report end date" type="date" value={salesDateTo} min={salesDateFrom || undefined} onChange={(event) => { setSalesDatePreset('custom'); setSalesDateTo(event.target.value); }} /></label>
          </>}
          {hasSalesFilterPanel ? <>
            <SalesReportGeneralFilters invoiceFilters={salesInvoiceFilters} documentType={salesDocumentType} seriesOptions={invoiceSeriesOptions} documentTypes={SALES_DOCUMENT_OPTIONS}
              onChange={(key, value) => setSalesInvoiceFilters((current) => ({ ...current, [key]: value }))} onDocumentTypeChange={setSalesDocumentType} />
            </>
            : <label className="arh-filter"><span>Invoice type</span><SelectDropdown aria-label="Sales invoice type" value={salesDocumentType} onChange={setSalesDocumentType} options={SALES_DOCUMENT_OPTIONS} buttonClassName="autop-dropdown-trigger" /></label>}
          {!hasSalesFilterPanel && <><label className="arh-filter"><span>Break down by</span><SelectDropdown aria-label="Sales report breakdown" value={salesAnalysis} onChange={setSalesAnalysis} options={[
            { value: 'all', label: 'All dimensions' }, { value: 'item', label: 'Item / Product' },
            { value: 'category', label: 'Category' }, { value: 'brand', label: 'Brand' },
            { value: 'salesperson', label: 'Salesperson' }, { value: 'invoice', label: 'Invoice' },
            { value: 'channel', label: 'Sales channel' }, { value: 'hourly', label: 'Hourly' },
            { value: 'margin', label: 'Profitability / Margin' },
          ]} buttonClassName="autop-dropdown-trigger" /></label>
          <label className="arh-filter"><span>Show</span><SelectDropdown aria-label="Sales report metric" value={salesMetric} onChange={setSalesMetric} options={[
            { value: 'sales', label: 'Net Sales' }, { value: 'profitability', label: 'Profitability' },
            { value: 'discounts', label: 'Discounted Sales' }, { value: 'below-cost', label: 'Below-Cost Sales' },
          ]} buttonClassName="autop-dropdown-trigger" /></label></>}
          {salesAnalysis === 'margin' && <label className="arh-filter"><span>Margin grouped by</span><SelectDropdown aria-label="Margin breakdown" value={marginBy} onChange={setMarginBy} options={[
            { value: 'product', label: 'Margin by Product' }, { value: 'invoice', label: 'Margin by Invoice' },
            { value: 'customer', label: 'Margin by Customer' }, { value: 'branch', label: 'Margin by Branch' },
          ]} buttonClassName="autop-dropdown-trigger" /></label>}
        </>}
        {type === 'purchase' && <PurchaseReportGeneralFilters general={purchaseGeneralFilters} onGeneralChange={setPurchaseGeneralFilters}
          supplier={purchaseSupplier} onSupplierChange={setPurchaseSupplier} status={purchaseStatus} onStatusChange={setPurchaseStatus}
          options={purchasePanelOptions} reportView={purchaseReportType} onReportViewChange={setPurchaseReportType}
          datePreset={purchaseDatePreset} onDatePresetChange={changePurchaseDatePreset} dateFrom={salesDateFrom} dateTo={salesDateTo}
          onDateFromChange={setSalesDateFrom} onDateToChange={setSalesDateTo} search={search} onSearchChange={setSearch} />}
        {type === 'inventory' && <>
          <label className="arh-filter"><span>Report</span><SelectDropdown aria-label="Inventory report type" value={industryInventoryOptions.some((option) => option.value === inventoryReportType) ? inventoryReportType : industryInventoryOptions[0]?.value || inventoryReportType} onChange={setInventoryReportType} options={industryInventoryOptions} buttonClassName="autop-dropdown-trigger" /></label>
          {(isTextile || inventoryReportType === 'auto-part-movement') && <><label className="arh-filter"><span>From</span><input aria-label="Inventory movement from date" type="date" value={inventoryDateFrom} max={inventoryDateTo || undefined} onChange={(event) => setInventoryDateFrom(event.target.value)} /></label><label className="arh-filter"><span>To</span><input aria-label="Inventory movement to date" type="date" value={inventoryDateTo} min={inventoryDateFrom || undefined} onChange={(event) => setInventoryDateTo(event.target.value)} /></label></>}
          <label className="arh-filter"><span>Category</span><SelectDropdown aria-label="Filter inventory by category" value={inventoryCategory} onChange={setInventoryCategory} options={[{ value: '', label: 'All categories' }, ...inventoryCategories]} buttonClassName="autop-dropdown-trigger" /></label>
          <label className="arh-filter"><span>Brand</span><SelectDropdown aria-label="Filter inventory by brand" value={inventoryBrand} onChange={setInventoryBrand} options={[{ value: '', label: 'All brands' }, ...inventoryBrands]} buttonClassName="autop-dropdown-trigger" /></label>
        </>}
        {type === 'crm' && <label className="arh-filter"><span>CRM Report</span><SelectDropdown aria-label="CRM report type" value={crmReportType} onChange={setCrmReportType} options={CRM_REPORT_OPTIONS} buttonClassName="autop-dropdown-trigger" /></label>}
        {type === 'collections' && <>
          <label className="arh-filter"><span>Collections Report</span><SelectDropdown aria-label="Collections report type" value={collectionReportType} onChange={setCollectionReportType} options={COLLECTION_REPORT_OPTIONS} buttonClassName="autop-dropdown-trigger" /></label>
          <label className="arh-filter"><span>Collection date from</span><input aria-label="Collection date from" type="date" value={collectionDateFrom} max={collectionDateTo || undefined} onChange={(event) => setCollectionDateFrom(event.target.value)} /></label>
          <label className="arh-filter"><span>Collection date to</span><input aria-label="Collection date to" type="date" value={collectionDateTo} min={collectionDateFrom || undefined} onChange={(event) => setCollectionDateTo(event.target.value)} /></label>
          <label className="arh-filter"><span>Invoice date from</span><input aria-label="Invoice date from" type="date" value={collectionInvoiceDateFrom} max={collectionInvoiceDateTo || undefined} onChange={(event) => setCollectionInvoiceDateFrom(event.target.value)} /></label>
          <label className="arh-filter"><span>Invoice date to</span><input aria-label="Invoice date to" type="date" value={collectionInvoiceDateTo} min={collectionInvoiceDateFrom || undefined} onChange={(event) => setCollectionInvoiceDateTo(event.target.value)} /></label>
        </>}
        {subsectionOptions.length > 0 && <label className="arh-filter"><span>{config.section} Report</span><SelectDropdown aria-label={`${config.section} report type`} value={activeSubsection} onChange={setSubsectionReportType} options={subsectionOptions} buttonClassName="autop-dropdown-trigger" /></label>}
        {type === 'sales' && !hasSalesFilterPanel && <div className="arh-invoice-filters">
          <div className="arh-invoice-filters-heading"><div><strong>General invoice filters</strong><span>Combine filters to narrow the report</span></div><span>{(isTextile ? textileSalesRows.length : dimensionFilteredSalesRows.length).toLocaleString('en-IN')} matching records</span></div>
          <div className="arh-invoice-filters-grid">
            <label className="arh-filter"><span>Invoice number</span><input aria-label="Filter by invoice number" placeholder="e.g. INV-001" value={salesInvoiceFilters.invoiceNo} onChange={(event) => setSalesInvoiceFilters((current) => ({ ...current, invoiceNo: event.target.value }))} /></label>
            <label className="arh-filter"><span>Invoice series</span><input aria-label="Filter by invoice series" placeholder="Search series" value={salesInvoiceFilters.invoiceSeries} onChange={(event) => setSalesInvoiceFilters((current) => ({ ...current, invoiceSeries: event.target.value }))} /></label>
            <label className="arh-filter"><span>Customer</span><input aria-label="Filter by customer" placeholder="Name, mobile or customer type" value={salesInvoiceFilters.customer} onChange={(event) => setSalesInvoiceFilters((current) => ({ ...current, customer: event.target.value }))} /></label>
            <label className="arh-filter"><span>Billing type</span><SelectDropdown aria-label="Filter by billing type" value={salesInvoiceFilters.billingType} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, billingType: value }))} options={[{ value: '', label: 'All billing types' }, { value: 'b2b', label: 'B2B' }, { value: 'b2c', label: 'B2C' }]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>Payment status</span><SelectDropdown aria-label="Filter by payment status" value={salesInvoiceFilters.payment} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, payment: value }))} options={[{ value: '', label: 'All payment statuses' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partially paid', label: 'Partially paid' }, { value: 'overdue', label: 'Overdue' }]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>Payment mode</span><SelectDropdown aria-label="Filter by payment mode" value={salesInvoiceFilters.paymentMode} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, paymentMode: value }))} options={[{ value: '', label: 'All payment modes' }, ...['cash', 'upi', 'card', 'bank transfer', 'credit'].map((value) => ({ value, label: value.replace(/^./, (letter) => letter.toUpperCase()) }))]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>Invoice status</span><SelectDropdown aria-label="Filter by invoice status" value={salesInvoiceFilters.invoiceStatus} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, invoiceStatus: value }))} options={[{ value: '', label: 'All statuses' }, ...['draft', 'completed', 'cancelled', 'returned'].map((value) => ({ value, label: value.replace(/^./, (letter) => letter.toUpperCase()) }))]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>GST</span><SelectDropdown aria-label="Filter by GST status" value={salesInvoiceFilters.gst} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, gst: value }))} options={[{ value: '', label: 'All invoices' }, { value: 'gst', label: 'GST invoice' }, { value: 'non-gst', label: 'Non-GST invoice' }]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>Tax rate</span><SelectDropdown aria-label="Filter by tax rate" value={salesInvoiceFilters.taxRate} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, taxRate: value }))} options={[{ value: '', label: 'All tax rates' }, ...invoiceTaxRateOptions]} buttonClassName="autop-dropdown-trigger" /></label>
            <label className="arh-filter"><span>Minimum amount</span><input aria-label="Minimum invoice amount" type="number" min="0" placeholder="₹ 0" value={salesInvoiceFilters.minAmount} onChange={(event) => setSalesInvoiceFilters((current) => ({ ...current, minAmount: event.target.value }))} /></label>
            <label className="arh-filter"><span>Maximum amount</span><input aria-label="Maximum invoice amount" type="number" min="0" placeholder="No limit" value={salesInvoiceFilters.maxAmount} onChange={(event) => setSalesInvoiceFilters((current) => ({ ...current, maxAmount: event.target.value }))} /></label>
            {[
              ['category', 'Category', 'All categories'], ['item', 'Product / item', 'All products'],
              ['brand', 'Brand', 'All brands'], ['salesperson', isAutomobile ? 'Salesperson / billing staff' : 'Salesperson', 'All salespeople'], ['hourly', 'Sale time', 'All hours'],
            ].map(([dimension, label, allLabel]) => <label className="arh-filter" key={dimension}><span>{label}</span><SelectDropdown aria-label={`Filter by ${label}`} value={salesDimensionFilters[dimension]} onChange={(value) => setSalesDimensionFilters((current) => ({ ...current, [dimension]: value }))} options={[{ value: '', label: allLabel }, ...salesDimensionOptions[dimension]]} buttonClassName="autop-dropdown-trigger" /></label>)}
            <label className="arh-filter"><span>Branch / store / warehouse</span><SelectDropdown aria-label="Filter by branch, store or warehouse" value={salesInvoiceFilters.branch} onChange={(value) => setSalesInvoiceFilters((current) => ({ ...current, branch: value }))} options={[{ value: '', label: 'All branches / stores' }, ...invoiceBranchOptions]} buttonClassName="autop-dropdown-trigger" /></label>
          </div>
          {isAutomobile && <div className="arh-textile-invoice-filters arh-automobile-invoice-filters">
            <div className="arh-invoice-filters-heading"><div><strong>Automobile-specific filters</strong><span>Options come from saved product and invoice data</span></div></div>
            <div className="arh-invoice-filters-grid">
              {[
                ['productCategory', 'Product category'], ['partType', 'Part type'], ['vehicleType', 'Vehicle type'], ['vehicleBrand', 'Vehicle brand'],
                ['vehicleModel', 'Vehicle model / compatibility'], ['partNumber', 'Part number'], ['skuBarcode', 'SKU / barcode'], ['brandManufacturer', 'Brand / manufacturer'],
                ['hsn', 'HSN code'], ['warranty', 'Warranty status'], ['serialNumber', 'Serial number'], ['batchLot', 'Batch / lot'],
                ['stockStatus', 'Stock status'], ['supplier', 'Supplier'],
              ].map(([dimension, label]) => <label className="arh-filter" key={dimension}><span>{label}</span><SelectDropdown aria-label={`Automobile filter: ${label}`} value={automobileInvoiceFilters[dimension]} onChange={(value) => setAutomobileInvoiceFilters((current) => ({ ...current, [dimension]: value }))} options={[{ value: '', label: `All ${label.toLowerCase()} values` }, ...automobileInvoiceOptions[dimension]]} buttonClassName="autop-dropdown-trigger" /></label>)}
              <label className="arh-filter"><span>Minimum discount %</span><input aria-label="Minimum automobile discount percentage" type="number" min="0" max="100" placeholder="0%" value={automobileInvoiceFilters.discountPercent} onChange={(event) => setAutomobileInvoiceFilters((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
              <label className="arh-filter"><span>Minimum discount amount</span><input aria-label="Minimum automobile discount amount" type="number" min="0" placeholder="₹ 0" value={automobileInvoiceFilters.discountAmount} onChange={(event) => setAutomobileInvoiceFilters((current) => ({ ...current, discountAmount: event.target.value }))} /></label>
            </div>
          </div>}
          {isElectronics && <div className="arh-textile-invoice-filters arh-electronics-invoice-filters">
            <div className="arh-invoice-filters-heading"><div><strong>Electronics-specific filters</strong><span>Options come from saved product and invoice data</span></div></div>
            <div className="arh-invoice-filters-grid">
              {[
                ['productCategory', 'Product category'], ['subcategory', 'Subcategory'], ['brand', 'Brand'], ['productModel', 'Product model'],
                ['productType', 'Product type / condition'], ['sku', 'SKU / item code'], ['barcode', 'Barcode'], ['serialNumber', 'Serial number'],
                ['imei', 'IMEI number'], ['warrantyStatus', 'Warranty status'], ['warrantyPeriod', 'Warranty period'], ['color', 'Color'],
                ['storage', 'Storage / capacity'], ['ram', 'RAM'], ['processor', 'Processor'], ['supplier', 'Supplier'], ['hsn', 'HSN code'], ['stockStatus', 'Stock status'],
              ].map(([dimension, label]) => <label className="arh-filter" key={dimension}><span>{label}</span><SelectDropdown aria-label={`Electronics filter: ${label}`} value={electronicsInvoiceFilters[dimension]} onChange={(value) => setElectronicsInvoiceFilters((current) => ({ ...current, [dimension]: value }))} options={[{ value: '', label: `All ${label.toLowerCase()} values` }, ...electronicsInvoiceOptions[dimension]]} buttonClassName="autop-dropdown-trigger" /></label>)}
              <label className="arh-filter"><span>Minimum discount %</span><input aria-label="Minimum electronics discount percentage" type="number" min="0" max="100" placeholder="0%" value={electronicsInvoiceFilters.discountPercent} onChange={(event) => setElectronicsInvoiceFilters((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
              <label className="arh-filter"><span>Minimum discount amount</span><input aria-label="Minimum electronics discount amount" type="number" min="0" placeholder="₹ 0" value={electronicsInvoiceFilters.discountAmount} onChange={(event) => setElectronicsInvoiceFilters((current) => ({ ...current, discountAmount: event.target.value }))} /></label>
            </div>
          </div>}
          {isTextile && <div className="arh-textile-invoice-filters">
            <div className="arh-invoice-filters-heading"><div><strong>Textile-specific filters</strong><span>Options are drawn from product and invoice records</span></div></div>
            <div className="arh-invoice-filters-grid">
              {[
                ['productCategory', 'Product category'], ['subcategory', 'Subcategory'], ['fabricType', 'Fabric type'], ['brand', 'Brand'],
                ['size', 'Size'], ['color', 'Color'], ['pattern', 'Design / pattern'], ['skuBarcode', 'SKU / barcode'],
                ['hsn', 'HSN code'], ['batchLot', 'Batch / lot'], ['supplier', 'Supplier'], ['season', 'Season'],
              ].map(([dimension, label]) => <label className="arh-filter" key={dimension}><span>{label}</span><SelectDropdown aria-label={`Textile filter: ${label}`} value={textileInvoiceFilters[dimension]} onChange={(value) => setTextileInvoiceFilters((current) => ({ ...current, [dimension]: value }))} options={[{ value: '', label: `All ${label.toLowerCase()} values` }, ...textileInvoiceOptions[dimension]]} buttonClassName="autop-dropdown-trigger" /></label>)}
              <label className="arh-filter"><span>Minimum discount %</span><input aria-label="Minimum textile discount percentage" type="number" min="0" max="100" placeholder="0%" value={textileInvoiceFilters.discountPercent} onChange={(event) => setTextileInvoiceFilters((current) => ({ ...current, discountPercent: event.target.value }))} /></label>
              <label className="arh-filter"><span>Minimum discount amount</span><input aria-label="Minimum textile discount amount" type="number" min="0" placeholder="₹ 0" value={textileInvoiceFilters.discountAmount} onChange={(event) => setTextileInvoiceFilters((current) => ({ ...current, discountAmount: event.target.value }))} /></label>
            </div>
          </div>}
        </div>}
        {!(type === 'sales' && hasSalesFilterPanel) && type !== 'purchase' && resetButton}
      </section>

      {type !== 'sales' && type !== 'purchase' && type !== 'inventory' && type !== 'crm' && type !== 'collections' && <section className="arh-general-overview report-subsection-stats"><div className="arh-metrics">
        {[[`${config.section} Reports`, filteredReports.length, BarChart3], ['Source Records', filteredReports.reduce((sum, report) => sum + (Number(report.count) || 0), 0), Database], ...(type === 'sales' ? [['Sales Documents', filteredSalesRows.length, FileSpreadsheet]] : [])].map(([label, value, Icon], index) => <article key={label}><span style={{ '--arh-color': ['#0874ff', '#00be8b', '#9745f7'][index % 3] }}><Icon size={22} /></span><div><small>{label}</small><strong>{loading ? '—' : Number(value).toLocaleString('en-IN')}</strong><p>Current branch scope</p></div></article>)}
      </div></section>}

      {type === 'sales' && <section className="acu-card arh-sales-analysis">
        {isTextile ? <>
          <header className="arh-sales-summary-header"><div><span>FASHION SALES & PRODUCT 360</span><h2>{TEXTILE_INVENTORY_OPTIONS.find((option) => option.value === textileSalesReportType)?.label}</h2><p>{textileSalesRows.length.toLocaleString('en-IN')} results · filtered by date, category, brand and product</p></div><div className="arh-sales-export-actions"><button type="button" onClick={() => downloadTableCsv(`fashion-${textileSalesReportType}`, textileSalesColumns, textileSalesRows)}><Download size={15} />CSV</button><button type="button" onClick={() => downloadTablePdf(`Fashion - ${TEXTILE_INVENTORY_OPTIONS.find((option) => option.value === textileSalesReportType)?.label}`, textileSalesColumns, textileSalesRows, 'Current filters').catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
          {Object.entries(industrySourceStatus).some(([, status]) => status === 'rejected') && <p className="arh-note" role="status">Some source data is unavailable. Figures requiring those sources are marked unavailable rather than estimated.</p>}
          <div className="acu-table-scroll"><table><thead><tr>{textileSalesColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
            {textileSalesRows.map((row, index) => <tr key={`${row.product || row.salesperson || 'fashion'}-${index}`}>{textileSalesColumns.map(([key]) => { const value = row[key]; const currencyFields = ['purchaseValue', 'salesValue', 'returnedValue', 'recordedCost', 'margin', 'netSales']; return <td key={key}>{value == null || value === '' ? '—' : currencyFields.includes(key) && typeof value === 'number' ? formatCurrency(value) : typeof value === 'number' ? value.toLocaleString('en-IN') : value}</td>; })}</tr>)}
            {inventoryLoading && !textileSalesRows.length && <tr><td colSpan={textileSalesColumns.length} className="text-center">Loading fashion report data…</td></tr>}
            {!inventoryLoading && !textileSalesRows.length && <tr><td colSpan={textileSalesColumns.length} className="text-center">No fashion records match these filters.</td></tr>}
          </tbody></table></div>
          {textileSalesReportType === 'textile-sell-through' && <p className="arh-note">Sell-through uses units sold ÷ opening sellable stock plus receipts. It shows N/A when opening stock is missing or the denominator is zero.</p>}
        </> : <>
        <header className="arh-sales-summary-header"><div><span>PERFORMANCE SNAPSHOT</span><h2>Sales overview</h2><p>{groupedSalesRows.length.toLocaleString('en-IN')} grouped results · updates with your selected filters</p></div><div className="arh-sales-export-actions"><button type="button" onClick={downloadSalesCsv}><Download size={15} />CSV</button><button type="button" onClick={() => downloadSalesPdf().catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
        <div className="arh-metrics">{[
          ['Net Sales', salesTotals.sales, BarChart3], ['Gross Profit*', salesTotals.margin, Database],
          ['Discounts', salesTotals.discount, FileSpreadsheet], ['Below-Cost Sales', salesTotals.belowCostSales, Search],
        ].map(([label, value, Icon]) => <article key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{formatCurrency(value)}</strong><p>{salesMetric.replace('-', ' ')} · {salesAnalysis === 'margin' ? `margin by ${marginBy}` : `${salesAnalysis} breakdown`}</p></div></article>)}</div>
        <div className="acu-table-scroll"><table><thead><tr>{[
          salesAnalysis === 'margin' ? `Margin by ${marginBy}` : salesAnalysis === 'all' ? 'Item · Category · Brand · Salesperson · Channel' : `${salesAnalysis[0].toUpperCase()}${salesAnalysis.slice(1)}`,
          'Invoices', 'Quantity', 'Net Sales', 'Discounts', 'Cost', 'Costed Sales', 'Gross Profit*', 'Below-Cost Sales',
        ].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
          {groupedSalesRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.invoices}</td><td>{row.quantity.toLocaleString('en-IN')}</td><td>{formatCurrency(row.sales)}</td><td>{formatCurrency(row.discount)}</td><td>{formatCurrency(row.cost)}</td><td>{formatCurrency(row.costedSales)}</td><td>{formatCurrency(row.margin)}</td><td>{formatCurrency(row.belowCostSales)}</td></tr>)}
          {!salesLoading && !groupedSalesRows.length && <tr><td colSpan="9" className="text-center">No sales found for these filters.</td></tr>}
        </tbody></table></div>
        <p className="arh-note">*Gross profit and below-cost sales use the line cost when stored, otherwise the current product or variant purchase price. Costed Sales shows revenue with a recorded cost.</p>
        </>}
      </section>}

      {type === 'purchase' && <section className="acu-card arh-sales-analysis arh-purchase-analysis">
        <header className="arh-sales-summary-header"><div><span>PURCHASE & SUPPLIER OVERVIEW</span><h2>{PURCHASE_REPORT_OPTIONS.find((option) => option.value === purchaseReportType)?.label}</h2><p>{filteredPurchaseRows.length.toLocaleString('en-IN')} results · filtered by supplier, status and date</p></div><div className="arh-sales-export-actions"><button type="button" onClick={downloadPurchaseCsv}><Download size={15} />CSV</button><button type="button" onClick={() => downloadPurchasePdf().catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
        <div className="arh-metrics">{[
          ['Report Rows', filteredPurchaseRows.length, FileSpreadsheet],
          ['Purchase Value', purchaseTotals.amount, BarChart3],
          ['Outstanding Payable', purchaseTotals.balance, Database],
          ['Open Items', purchaseTotals.pending, Search],
        ].map(([label, value, Icon], index) => <article key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{index === 0 || index === 3 ? Number(value).toLocaleString('en-IN') : formatCurrency(value)}</strong><p>{purchaseLoading ? 'Loading purchase data…' : 'Based on current filters'}</p></div></article>)}</div>
        <div className="acu-table-scroll"><table><thead><tr>{purchaseColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredPurchaseRows.map((row, index) => <tr key={`${row.document || row.product || 'purchase'}-${index}`}>{purchaseColumns.map(([key]) => {
            const value = row[key];
            const currencyFields = ['amount', 'balance', 'received', 'previousRate', 'latestRate', 'change'];
            const numberFields = ['items', 'purchases', 'ageDays', 'daysLate'];
            const display = value == null || value === '' ? '—'
              : currencyFields.includes(key) ? formatCurrency(value)
                : key === 'changePercent' ? `${Number(value).toFixed(1)}%`
                  : numberFields.includes(key) ? `${Number(value).toLocaleString('en-IN')}${key === 'ageDays' || key === 'daysLate' ? ' days' : ''}`
                    : ['date', 'dueDate', 'promised', 'receivedDate'].includes(key) ? new Date(value).toLocaleDateString('en-IN')
                      : value;
            return <td key={key}>{display}</td>;
          })}</tr>)}
          {!purchaseLoading && !filteredPurchaseRows.length && <tr><td colSpan={purchaseColumns.length} className="text-center">No purchase records match these filters.</td></tr>}
        </tbody></table></div>
      </section>}

      {type === 'crm' && <section className="acu-card arh-sales-analysis arh-purchase-analysis">
        <header className="arh-sales-summary-header"><div><span>CUSTOMERS / CRM</span><h2>{CRM_REPORT_OPTIONS.find((option) => option.value === crmReportType)?.label}</h2><p>{filteredCrmRows.length.toLocaleString('en-IN')} results · customer purchases, receivables and follow-ups</p></div><div className="arh-sales-export-actions"><button type="button" onClick={() => downloadTableCsv(`crm-${crmReportType}`, crmColumns, filteredCrmRows)}><Download size={15} />CSV</button><button type="button" onClick={() => downloadTablePdf(`CRM - ${CRM_REPORT_OPTIONS.find((option) => option.value === crmReportType)?.label}`, crmColumns, filteredCrmRows, 'Current filters').catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
        <div className="arh-metrics">{[['Report Rows', filteredCrmRows.length, FileSpreadsheet], ['Purchase Value', crmTotals.purchaseValue, BarChart3], ['Receivables', crmTotals.balance, Database], ['Follow-ups', crmFollowUps.length, Search]].map(([label, value, Icon], index) => <article key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{index === 0 || index === 3 ? Number(value).toLocaleString('en-IN') : formatCurrency(value)}</strong><p>{crmLoading ? 'Loading customer data…' : 'Based on current filters'}</p></div></article>)}</div>
        <div className="acu-table-scroll"><table><thead><tr>{crmColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredCrmRows.map((row, index) => <tr key={`${row.document || row.customer || 'crm'}-${index}`}>{crmColumns.map(([key]) => { const value = row[key]; const currencyFields = ['amount', 'balance', 'purchaseValue', 'returns', 'receipts']; const dateFields = ['date', 'lastPurchase']; const display = value == null || value === '' ? '—' : currencyFields.includes(key) ? formatCurrency(value) : dateFields.includes(key) && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN') : typeof value === 'number' ? value.toLocaleString('en-IN') : value; return <td key={key}>{display}</td>; })}</tr>)}
          {!crmLoading && !filteredCrmRows.length && <tr><td colSpan={crmColumns.length} className="text-center">No customer records match these filters.</td></tr>}
        </tbody></table></div>
      </section>}

      {type === 'collections' && <section className="acu-card arh-sales-analysis arh-purchase-analysis">
        <header className="arh-sales-summary-header"><div><span>COLLECTIONS</span><h2>{COLLECTION_REPORT_OPTIONS.find((option) => option.value === collectionReportType)?.label}</h2><p>{filteredCollectionRows.length.toLocaleString('en-IN')} records · collection dates and invoice dates are filtered separately</p></div><div className="arh-sales-export-actions"><button type="button" onClick={() => downloadTableCsv(`collections-${collectionReportType}`, collectionColumns, filteredCollectionRows)}><Download size={15} />CSV</button><button type="button" onClick={() => downloadTablePdf(`Collections - ${COLLECTION_REPORT_OPTIONS.find((option) => option.value === collectionReportType)?.label}`, collectionColumns, filteredCollectionRows, 'Current filters').catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
        <div className="arh-metrics">{[['Collection Records', filteredCollectionRows.length, FileSpreadsheet], ['Collected / Refunded', collectionTotals.amount, BarChart3], ['Payment Methods', collectionTotals.methods, Database], ['Split Payments', collectionReportType === 'split' ? filteredCollectionRows.length : '—', Search]].map(([label, value, Icon], index) => <article key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{index === 0 || index === 2 || index === 3 ? value : formatCurrency(value)}</strong><p>{collectionLoading ? 'Loading collection data…' : 'Based on current filters'}</p></div></article>)}</div>
        <div className="acu-table-scroll"><table><thead><tr>{collectionColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredCollectionRows.map((row, index) => <tr key={`${row.document || row.reference || 'collection'}-${index}`}>{collectionColumns.map(([key]) => { const value = row[key]; const dateFields = ['collectionDate', 'invoiceDate']; const display = value == null || value === '' ? '—' : key === 'amount' ? formatCurrency(value) : dateFields.includes(key) && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN') : value; return <td key={key}>{display}</td>; })}</tr>)}
          {!collectionLoading && !filteredCollectionRows.length && <tr><td colSpan={collectionColumns.length} className="text-center">{['settlements', 'closing'].includes(collectionReportType) ? 'No settlement or counter-closing source records are available yet.' : 'No collection records match these filters.'}</td></tr>}
        </tbody></table></div>
        <p className="arh-note">Receipt records come from recorded invoice payments. Split payments group multiple receipts on the same invoice. Settlement and counter-closing reports need dedicated closing records that are not currently stored.</p>
      </section>}

      {type === 'inventory' && <section className="acu-card arh-sales-analysis arh-purchase-analysis">
        <header className="arh-sales-summary-header"><div><span>{isAutomobile ? 'AUTOMOBILE PARTS & PRODUCT 360' : isTextile ? 'TEXTILE VARIANTS & PRODUCT 360' : 'INVENTORY / BATCH / SERIAL'}</span><h2>{industryInventoryOptions.find((option) => option.value === inventoryReportType)?.label || INVENTORY_REPORT_OPTIONS.find((option) => option.value === inventoryReportType)?.label}</h2><p>{filteredInventoryRows.length.toLocaleString('en-IN')} results · filtered by category and brand</p></div><div className="arh-sales-export-actions"><button type="button" onClick={() => downloadTableCsv(`inventory-${inventoryReportType}`, inventoryColumns, filteredInventoryRows)}><Download size={15} />CSV</button><button type="button" onClick={() => downloadTablePdf(`Inventory - ${industryInventoryOptions.find((option) => option.value === inventoryReportType)?.label || inventoryReportType}`, inventoryColumns, filteredInventoryRows, 'Current filters').catch((error) => window.alert(error.message || 'PDF export failed'))}><FileText size={15} />PDF</button></div></header>
        {Object.entries(industrySourceStatus).some(([, status]) => status === 'rejected') && <p className="arh-note" role="status">Unavailable source data: {Object.entries(industrySourceStatus).filter(([, status]) => status === 'rejected').map(([source]) => ({ products: 'product catalog', stock: 'stock balances', movements: 'movement ledger', sales: 'sales records', purchases: 'purchase records' }[source] || source)).join(', ')}. Affected figures are omitted or marked unavailable.</p>}
        <div className="arh-metrics">{[['Report Rows', filteredInventoryRows.length, FileSpreadsheet], ['Stock Quantity', inventoryTotals.quantity, BarChart3], ['Stock Valuation', inventoryTotals.stockValue, Database], ['Categories', new Set(filteredInventoryRows.map((row) => row.category).filter(Boolean)).size, Search]].map(([label, value, Icon], index) => <article key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{index === 2 && !inventoryHasValuation || index === 1 && !inventoryHasQuantity ? 'N/A' : index === 0 || index === 3 ? Number(value).toLocaleString('en-IN') : index === 1 ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 }) : formatCurrency(value)}</strong><p>{inventoryLoading ? 'Loading inventory data…' : index === 2 && !inventoryHasValuation ? 'Valuation source unavailable' : index === 1 && !inventoryHasQuantity ? 'Stock quantity unavailable' : 'Based on current filters'}</p></div></article>)}</div>
        <div className="acu-table-scroll"><table><thead><tr>{inventoryColumns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredInventoryRows.map((row, index) => <tr key={`${row.sku || row.partNumber || row.product || 'inventory'}-${index}`}>{inventoryColumns.map(([key]) => { const value = row[key]; const currencyFields = ['stockValue', 'unitCost', 'value', 'sales', 'recordedCost', 'margin', 'purchaseValue', 'salesValue', 'returnedValue', 'netSales']; const dateFields = ['date', 'expiry']; const display = value == null || value === '' ? '—' : currencyFields.includes(key) && typeof value === 'number' ? formatCurrency(value) : dateFields.includes(key) && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN') : typeof value === 'number' ? value.toLocaleString('en-IN') : value; return <td key={key}>{display}</td>; })}</tr>)}
          {!inventoryLoading && !filteredInventoryRows.length && <tr><td colSpan={inventoryColumns.length} className="text-center">No inventory records match these filters.</td></tr>}
        </tbody></table></div>
        {(inventoryReportType === 'textile-sell-through' || inventoryReportType === 'textile-matrix') && <p className="arh-note">Sell-through = units sold ÷ (recorded opening stock + receipts in the period). Rows show N/A when opening stock is missing or the denominator is zero. Variant results use recorded size and colour only.</p>}
        {inventoryReportType === 'auto-compatibility' && <p className="arh-note">Vehicle compatibility is shown only when it is explicitly recorded on the product. No compatibility is inferred from part names.</p>}
        {inventoryReportType === 'auto-brand-margin' && <p className="arh-note">Margins use recorded product cost. Supplier margin is unavailable unless supplier attribution is recorded with the sales cost.</p>}
        {inventoryReportType === 'product-360' && <p className="arh-note">Combines product master, stock, purchase entries, sales and returns where product IDs are linked. Missing linked modules or costs are shown as unavailable; values are not fabricated.</p>}
      </section>}

      {type !== 'sales' && type !== 'purchase' && type !== 'inventory' && type !== 'crm' && type !== 'collections' && <section className="acu-card arh-sales-analysis arh-report-directory">
        <header className="arh-sales-summary-header"><div><span>{config.section.toUpperCase()} REPORTS</span><h2>Available reports</h2><p>{loading ? 'Loading report records…' : `${filteredReports.length.toLocaleString('en-IN')} reports · source records for this section`}</p></div></header>
        <div className="acu-table-scroll"><table><thead><tr>{['Report', 'Description', 'Records', 'Updated', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
          {filteredReports.map((report) => <tr key={`${report.category}-${report.name}`}><td><strong>{report.name}</strong><small className="block text-xs text-slate-500">{report.category}</small></td><td>{report.description}</td><td>{Number(report.count || 0).toLocaleString('en-IN')}</td><td>{report.lastGenerated || '—'}</td><td><div className="flex flex-wrap gap-2">{report.downloadKey && <><button type="button" onClick={() => handleOpenReport(report)} className="inline-flex items-center rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">View Data</button><button type="button" onClick={() => handleDownloadReport(report)} className="inline-flex items-center gap-1.5 rounded-md border border-[#dbe4ef] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#374151] hover:bg-gray-50"><Download size={13} />CSV</button><button type="button" onClick={() => handleDownloadReportPdf(report)} className="inline-flex items-center gap-1.5 rounded-md border border-[#dbe4ef] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#374151] hover:bg-gray-50"><FileText size={13} />PDF</button></>}</div></td></tr>)}
          {!loading && !filteredReports.length && <tr><td colSpan="5" className="text-center">No database records found for this report section.</td></tr>}
        </tbody></table></div>
      </section>}

      {activeReport && (
        <div className="mt-5 bg-white border border-[#dfe7f1] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#edf2f7] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-[15px] font-semibold text-[#111827]">{reportData.title || activeReport.name}</h2>
              <p className="m-0 mt-0.5 text-[12.5px] text-[#536173]">{recordsLoading ? 'Loading records...' : `${reportData.count || 0} records from database`}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadReport(activeReport)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-[#374151] bg-white border border-[#dbe4ef] rounded-md cursor-pointer hover:bg-gray-50 font-[inherit]"
              >
                <Download size={13} /> CSV
              </button>
              <button
                type="button"
                onClick={() => handleDownloadReportPdf(activeReport)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-[#374151] bg-white border border-[#dbe4ef] rounded-md cursor-pointer hover:bg-gray-50 font-[inherit]"
              >
                <FileText size={13} /> PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveReport(null);
                  setReportData({ columns: [], rows: [], title: '', count: 0 });
                  setRecordsError('');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-[#374151] bg-white border border-[#dbe4ef] rounded-md cursor-pointer hover:bg-gray-50 font-[inherit]"
              >
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {(reportData.columns || []).map((column) => (
                    <th key={column} className="text-left text-xs font-semibold uppercase tracking-wide text-[#536173] px-5 py-3 border-b border-[#edf2f7]">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recordsLoading && <tr><td className="px-5 py-8 text-center text-[13px] text-[#536173]" colSpan={Math.max(reportData.columns.length, 1)}>Loading report data...</td></tr>}
                {!recordsLoading && recordsError && <tr><td className="px-5 py-8 text-center text-[13px] text-red-600" colSpan={Math.max(reportData.columns.length, 1)}>{recordsError}</td></tr>}
                {!recordsLoading && !recordsError && reportData.rows?.length === 0 && <tr><td className="px-5 py-8 text-center text-[13px] text-[#536173]" colSpan={Math.max(reportData.columns.length, 1)}>No records found for this report.</td></tr>}
                {!recordsLoading && !recordsError && reportData.rows?.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.values.map((value, index) => (
                      <td key={`${row.id}-${index}`} className="px-5 py-3.5 border-b border-[#f3f4f6] text-[13px] text-[#374151] whitespace-nowrap">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {type === 'sales' && activeReport && (
        <div className="mt-5 bg-white border border-[#dfe7f1] rounded-lg overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#edf2f7]">
            <div>
              <h2 className="m-0 text-[15px] font-semibold text-[#111827]">Invoice List</h2>
              <p className="m-0 mt-0.5 text-[12.5px] text-[#536173]">Invoices, bill of supply, and quotations from the database</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <SelectDropdown
                value={salesDocumentType}
                onChange={setSalesDocumentType}
                options={SALES_DOCUMENT_OPTIONS}
                buttonClassName="border border-[#dbe4ef] rounded-md px-3 py-2 text-[13px] bg-white font-[inherit] outline-none min-w-40"
              />
              <span className="text-[12px] font-semibold text-[#475569]">{filteredSalesRows.length} record{filteredSalesRows.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead>
                <tr>
                  {['No.', 'Type', 'Branch', 'Date', 'Customer', 'Phone', 'Amount', 'Status', 'Action'].map((heading) => (
                    <th key={heading} className="text-left text-xs font-semibold uppercase tracking-wide text-[#536173] px-5 py-3 border-b border-[#edf2f7]">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salesLoading && <tr><td colSpan="9" className="px-5 py-8 text-center text-[13px] text-[#536173]">Loading invoices...</td></tr>}
                {!salesLoading && filteredSalesRows.length === 0 && <tr><td colSpan="9" className="px-5 py-8 text-center text-[13px] text-[#536173]">No invoices found.</td></tr>}
                {!salesLoading && filteredSalesRows.map((invoice) => (
                  <tr key={invoice._id || invoice.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] font-semibold text-blue-700">{invoice.number || '-'}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#536173]">{typeLabel(invoice.documentType)}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#536173]">{displayBranchName(invoice.branch)}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#536173]">{reportDate(invoice)}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#111827]">{invoice.customer?.name || 'Walk-in customer'}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#536173]">{invoice.customer?.phone || '-'}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] font-semibold text-[#111827]">{formatCurrency(amountFromInvoice(invoice))}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px] text-[#536173]">{invoice.payStatus || invoice.status || '-'}</td>
                    <td className="px-5 py-3 border-b border-[#f3f4f6] text-[13px]">
                      <a className="text-blue-600 font-semibold no-underline hover:underline" href={`/billing/${invoice.documentType || 'invoice'}/${invoice._id || invoice.id}/view`}>View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main></div>
  );
}

