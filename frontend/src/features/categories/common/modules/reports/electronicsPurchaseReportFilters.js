import { AUTOMOBILE_PURCHASE_FILTER_GROUPS, automobilePurchaseValues, matchesPurchaseDimensions } from '../../../automobile/automobilePurchaseReportFilters.js';

export const ELECTRONICS_PURCHASE_FILTER_GROUPS = [
  ['Electronics-specific advanced filters', [
    ['productCategory', 'Product category', ['Mobiles', 'Laptops', 'Desktops', 'TVs', 'Cameras', 'Audio', 'Accessories']],
    ['subcategory', 'Subcategory', ['Smartphones', 'Tablets', 'Monitors', 'Printers', 'Headphones', 'Speakers']],
    ['brand', 'Brand', ['Apple', 'Samsung', 'Dell', 'HP', 'Lenovo', 'Sony', 'LG', 'Xiaomi']],
    ['productModel', 'Product model'], ['productCondition', 'Product condition', ['New', 'Refurbished', 'Used']],
    ['sku', 'SKU / item code'], ['barcode', 'Barcode'], ['serialNumber', 'Serial number'], ['imei', 'IMEI number'],
    ['warrantyPeriod', 'Warranty period'], ['warrantyStatus', 'Warranty status', ['Under Warranty', 'Expired', 'No Warranty']],
    ['storage', 'Storage capacity', ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']],
    ['ram', 'RAM', ['4 GB', '8 GB', '16 GB', '32 GB', '64 GB']],
    ['processor', 'Processor', ['Intel', 'AMD', 'Apple Silicon', 'Snapdragon']],
    ['screenSize', 'Screen size'], ['hsn', 'HSN code'],
    ['supplierCategory', 'Supplier category', ['Manufacturer', 'Distributor', 'Wholesaler', 'Dealer']],
  ]],
  AUTOMOBILE_PURCHASE_FILTER_GROUPS[1],
];
export const emptyElectronicsPurchaseFilters = () => Object.fromEntries(ELECTRONICS_PURCHASE_FILTER_GROUPS.flatMap(([, fields]) => fields.map(([key]) => [key, ''])));

const aliases = {
  productModel: ['productModel', 'modelName', 'modelNumber', 'modelFamily', 'modelCode'],
  productCondition: ['productCondition', 'condition'],
  imei: ['imei', 'imei1', 'imei2', 'imeiNumber', 'imeiNumbers'],
  serialNumber: ['serialNumber', 'serialNo', 'serial', 'serialNumbers'],
  storage: ['storage', 'storageCapacity'], ram: ['ram', 'ramCapacity'], processor: ['processor'],
  screenSize: ['screenSize', 'displaySize'],
};
const supplied = (value) => value !== undefined && value !== null && value !== '';
export function electronicsPurchaseValues(key, record, item = {}, product = {}) {
  if (!aliases[key]) return automobilePurchaseValues(key, record, item, product);
  // Use the purchased variant only; other models in the catalog are unrelated to this line.
  const variantId = item.variantId || item.variant?._id || item.size;
  const variant = product.variants?.find((entry) => variantId && [entry._id, entry.modelName, entry.modelCode, entry.size].some((value) => supplied(value) && String(value) === String(variantId)));
  const read = (sources) => sources.flatMap((source) => aliases[key].flatMap((field) => {
    const value = source?.[field];
    return (Array.isArray(value) ? value : [value]).filter(supplied).map(String);
  }));
  const tiers = [[item, item.extra, item.attributes, item.variant], [variant], [product, product.attributes]];
  const values = tiers.map(read).find((entries) => entries.length) || [];
  return ['storage', 'ram'].includes(key) ? values.map((value) => value.replace(/\s*(GB|TB)\b/ig, ' $1').trim().toUpperCase()) : values;
}

export function matchesElectronicsPurchase(record, filters, products = []) {
  const normalized = { ...filters };
  for (const key of ['storage', 'ram']) {
    if (normalized[key]) normalized[key] = normalized[key].replace(/\s*(GB|TB)\b/ig, ' $1').trim();
  }
  return matchesPurchaseDimensions(record, normalized, products, electronicsPurchaseValues,
    ['productModel', 'sku', 'barcode', 'serialNumber', 'imei', 'warrantyPeriod', 'processor', 'screenSize', 'hsn', 'stockLocation']);
}
