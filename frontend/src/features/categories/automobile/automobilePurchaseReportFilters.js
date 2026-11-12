export const AUTOMOBILE_PURCHASE_FILTER_GROUPS = [
  ['Automobile-specific advanced filters', [
    ['productCategory', 'Product category', ['Engine Parts', 'Brake Parts', 'Electrical Parts', 'Suspension', 'Lubricants', 'Tyres', 'Batteries']],
    ['subcategory', 'Subcategory', ['Filters', 'Spark Plugs', 'Brake Pads', 'Clutch Plates', 'Headlights', 'Bearings']],
    ['vehicleType', 'Vehicle type', ['Two-Wheeler', 'Three-Wheeler', 'Car', 'SUV', 'LCV', 'HCV']],
    ['vehicleBrand', 'Vehicle brand', ['Maruti Suzuki', 'Hyundai', 'Tata', 'Honda', 'TVS', 'Bajaj', 'Hero']],
    ['vehicleModel', 'Vehicle model'], ['partNumber', 'Part number'],
    ['partType', 'Part type', ['OEM', 'Genuine', 'Aftermarket', 'Used']],
    ['brand', 'Product brand'], ['sku', 'SKU / item code'], ['barcode', 'Barcode'], ['hsn', 'HSN code'],
    ['batchLot', 'Batch / lot number'], ['serialNumber', 'Serial number'], ['warrantyPeriod', 'Warranty period'],
    ['warrantyStatus', 'Warranty status'],
    ['supplierCategory', 'Supplier category', ['Manufacturer', 'Distributor', 'Wholesaler', 'Dealer']],
  ]],
  ['Procurement and inventory filters', [
    ['goodsReceiptStatus', 'Goods receipt status', ['Pending', 'Partially Received', 'Fully Received']],
    ['orderStatus', 'Purchase order status', ['Open', 'Partially Fulfilled', 'Fulfilled', 'Cancelled']],
    ['stockUpdateStatus', 'Stock update status', ['Updated', 'Not Updated']],
    ['qualityInspection', 'Quality inspection', ['Pending', 'Passed', 'Failed']],
    ['returnStatus', 'Return status', ['No Return', 'Partial Return', 'Full Return']],
    ['stockLocation', 'Stock location'],
    ['minQty', 'Minimum quantity', 'number'], ['maxQty', 'Maximum quantity', 'number'],
    ['minRate', 'Minimum purchase rate', 'number'], ['maxRate', 'Maximum purchase rate', 'number'],
    ['discountPercent', 'Minimum discount percentage', 'number'], ['discountAmount', 'Minimum discount amount', 'number'],
    ['itcStatus', 'GST / ITC status', ['Eligible', 'Ineligible', 'Pending Verification']],
  ]],
];
export const AUTOMOBILE_PURCHASE_PRIMARY_FIELDS = [
  ['dateRange', 'Date range'], ['purchaseType', 'Purchase type'], ['supplier', 'Supplier'],
  ['goodsReceiptStatus', 'Goods receipt status', ['Pending', 'Partially Received', 'Fully Received']],
  ['productCategory', 'Product category', ['Engine Parts', 'Brake Parts', 'Electrical Parts', 'Tyres', 'Batteries', 'Lubricants']],
  ['paymentStatus', 'Payment status', ['Paid', 'Unpaid', 'Partially Paid', 'Overdue']],
];
export const AUTOMOBILE_PURCHASE_ADVANCED_FIELDS = [
  ['documentNo', 'Purchase invoice number'], ['supplierInvoiceNo', 'Supplier invoice number'], ['purchaseOrderNo', 'Purchase order number'],
  ['vehicleType', 'Vehicle type', ['Two-Wheeler', 'Three-Wheeler', 'Car/SUV', 'LCV', 'HCV']],
  ['vehicleBrand', 'Vehicle brand', ['Tata', 'Hyundai', 'Maruti Suzuki', 'Honda', 'TVS', 'Bajaj', 'Hero']],
  ['vehicleModel', 'Vehicle model'], ['brand', 'Part brand'], ['partNumber', 'Part number'], ['productSku', 'Product / SKU'],
  ['barcode', 'Barcode'], ['serialNumber', 'Serial number'], ['hsn', 'HSN code'],
  ['warrantyStatus', 'Warranty status', ['Under Warranty', 'Expired', 'No Warranty']], ['batchLot', 'Batch / lot number'],
  ['branch', 'Warehouse / branch'], ['gstRate', 'GST rate'], ['itcStatus', 'GST / ITC status', ['Eligible', 'Ineligible', 'Pending Verification']],
  ['minQty', 'Minimum quantity', 'number'], ['maxQty', 'Maximum quantity', 'number'],
  ['minRate', 'Minimum purchase rate', 'number'], ['maxRate', 'Maximum purchase rate', 'number'],
  ['minAmount', 'Minimum amount', 'number'], ['maxAmount', 'Maximum amount', 'number'],
  ['qualityInspection', 'Quality inspection', ['Pending', 'Passed', 'Failed']], ['stockUpdateStatus', 'Stock update status', ['Updated', 'Not Updated']],
  ['returnStatus', 'Return status', ['No Return', 'Partial Return', 'Full Return']], ['staff', 'Created by'],
];
export const emptyAutomobilePurchaseFilters = () => ({ ...Object.fromEntries(AUTOMOBILE_PURCHASE_FILTER_GROUPS.flatMap(([, fields]) => fields.map(([key]) => [key, '']))), purchaseOrderNo: '', productSku: '' });
export function automobilePurchaseDocuments(purchases, returns, type) {
  const types = { 'purchase-invoice': 'purchase-entry', 'purchase-order': 'purchase-order', 'purchase-return': 'supplier-return', 'debit-note': 'debit-note' };
  return [...purchases, ...returns].filter((record) => !type || (type === 'purchase-return' ? ['supplier-return', 'purchase-return'].includes(record.documentType) : record.documentType === types[type]));
}
const aliases = {
  productCategory: ['productCategory', 'category'], subcategory: ['subcategory', 'subCategory'],
  vehicleModel: ['vehicleModel', 'compatibleModel', 'modelName', 'modelNumber'],
  vehicleType: ['vehicleType', 'compatibleVehicleType'], vehicleBrand: ['vehicleBrand', 'vehicleMake', 'compatibleVehicleBrand'],
  partNumber: ['partNumber', 'oemPartNumber', 'oemNumber', 'manufacturerPartNumber'], brand: ['brand', 'manufacturer', 'brandManufacturer'],
  sku: ['sku', 'code', 'itemCode', 'productCode', 'aliasCode'], barcode: ['barcode', 'upc', 'ean'], hsn: ['hsn', 'hsnCode', 'hsnSac'],
  batchLot: ['batchNumber', 'lotNumber', 'batchNo', 'lotNo', 'batchLot', 'batchLotNo'], serialNumber: ['serialNumber', 'serialNo', 'serial'],
  warrantyPeriod: ['warrantyPeriod', 'warranty'], orderStatus: ['purchaseOrderStatus', 'orderStatus'],
  qualityInspection: ['qualityInspection', 'qualityInspectionStatus'], stockLocation: ['stockLocation', 'warehouse', 'store', 'rack'],
  supplierCategory: ['supplierCategory', 'supplierType'],
  productSku: ['description', 'productName', 'name', 'sku', 'code', 'itemCode', 'productCode', 'aliasCode'],
  purchaseOrderNo: ['linkedPurchaseOrderNo', 'purchaseOrderNo', 'purchaseOrderNumber'],
};
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
const supplied = (value) => value !== undefined && value !== null && value !== '';
export function automobilePurchaseValues(key, record, item = {}, product = {}) {
  const supplier = record.supplier || record.customer || {};
  const sources = [item, item.extra, item.attributes, product, product.attributes, record.extra, record];
  if (key === 'supplierCategory') sources.unshift({ supplierCategory: supplier.category || supplier.supplierCategory || supplier.type });
  if (key === 'itcStatus') {
    const explicit = record.extra?.itcStatus ?? record.itcStatus;
    if (supplied(explicit)) return [explicit];
    const eligible = record.inputTaxCreditEligible ?? record.itcEligible ?? record.extra?.inputTaxCreditEligible;
    return typeof eligible === 'boolean' ? [eligible ? 'Eligible' : 'Ineligible'] : [];
  }
  return sources.flatMap((source) => (aliases[key] || [key]).flatMap((field) => {
    const value = source?.[field];
    return (Array.isArray(value) ? value : [value]).filter(supplied).map((entry) => typeof entry === 'object' ? entry.name || entry.label || entry.code || '' : entry).filter(supplied);
  }));
}
// All selected line dimensions must match one item; never combine attributes from unrelated parts.
export function matchesAutomobilePurchase(record, filters, products = [], orders = []) {
  const readValues = (key, source, item, product) => {
    if (key === 'purchaseOrderNo') {
      const linked = orders.find((order) => order.documentType === 'purchase-order' && String(order._id || order.id) === String(source.extra?.linkedPurchaseOrderId || ''));
      return [...automobilePurchaseValues(key, source, item, product), ...(source.documentType === 'purchase-order' ? [source.number] : []), linked?.number].filter(Boolean);
    }
    const values = automobilePurchaseValues(key, source, item, product);
    return key === 'vehicleType' ? values.map((value) => ['car', 'suv', 'car/suv'].includes(normalize(value)) ? 'Car/SUV' : value) : values;
  };
  return matchesPurchaseDimensions(record, filters, products, readValues,
    ['vehicleModel', 'partNumber', 'sku', 'productSku', 'barcode', 'hsn', 'batchLot', 'serialNumber', 'warrantyPeriod', 'stockLocation']);
}
export function matchesPurchaseDimensions(record, filters, products, readValues, textKeys = []) {
  const active = Object.entries(filters).filter(([, value]) => supplied(value));
  if (!active.length) return true;
  return (record.items?.length ? record.items : [{}]).some((item) => {
    const productId = item.productId || item.product?._id || item.product?.id;
    const product = products.find((entry) => productId && String(entry._id || entry.id) === String(productId)) || item.product || {};
    return active.every(([key, selected]) => {
      const qty = item.qty ?? item.quantity; const rate = item.rate ?? item.purchaseRate;
      if (['minQty', 'maxQty', 'minRate', 'maxRate'].includes(key)) {
        const value = key.endsWith('Qty') ? qty : rate;
        return supplied(value) && Number.isFinite(Number(value)) && (key.startsWith('min') ? Number(value) >= Number(selected) : Number(value) <= Number(selected));
      }
      if (key === 'discountPercent' || key === 'discountAmount') {
        const gross = Number(qty) * Number(rate);
        const discount = item.discountPercent ?? item.discount;
        if (!supplied(discount)) return false;
        const amount = item.discountType === 'amount' ? Number(discount) : gross * Number(discount) / 100;
        const percent = item.discountType === 'amount' ? (gross > 0 ? amount / gross * 100 : 0) : Number(discount);
        return Number.isFinite(amount) && (key === 'discountAmount' ? amount : percent) >= Number(selected);
      }
      return readValues(key, record, item, product).some((value) => textKeys.includes(key) ? normalize(value).includes(normalize(selected)) : normalize(value) === normalize(selected));
    });
  });
}
