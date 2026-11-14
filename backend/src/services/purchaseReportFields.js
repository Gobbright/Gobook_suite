// Purchase dimensions retained from the original purchase report panels.
export const PURCHASE_DOCUMENT_TYPES = ['purchase-entry', 'purchase-order', 'supplier-return', 'purchase-return', 'debit-note'];
const dimensions = [
  ['supplierCode', 'Supplier Code', ['supplier.code', 'supplier.supplierCode', 'supplier.supplierId', 'customer.code', 'customer.supplierCode', 'customer.supplierId']],
  ['supplierInvoiceNo', 'Supplier Invoice Number', ['vendorInvoiceNo', 'vendorInvoiceNumber', 'supplierInvoiceNo', 'supplierInvoiceNumber', 'extra.vendorInvoiceNo', 'extra.vendorInvoiceNumber', 'extra.supplierInvoiceNo', 'extra.supplierInvoiceNumber']],
  ['staff', 'Created By', ['extra.purchaseStaff', 'extra.purchaseExecutive', 'extra.createdByName', 'createdByName', 'createdBy.name']],
  ['purchaseOrderNo', 'Purchase Order Number', ['extra.linkedPurchaseOrderNo', 'extra.purchaseOrderNo', 'extra.purchaseOrderNumber', 'purchaseOrderNo']],
  ['goodsReceiptStatus', 'Goods Receipt Status', ['goodsReceiptStatus']],
  ['orderStatus', 'Purchase Order Status', ['purchaseOrderStatus', 'orderStatus']],
  ['stockUpdateStatus', 'Stock Update Status', ['stockUpdateStatus']],
  ['qualityInspection', 'Quality Inspection', ['qualityInspection', 'qualityInspectionStatus']],
  ['returnStatus', 'Return Status', ['returnStatus']],
  ['stockLocation', 'Stock Location', ['stockLocation', 'warehouse', 'store', 'rack']],
  ['supplierCategory', 'Supplier Category', ['supplierCategory', 'supplierType']],
  ['subcategory', 'Subcategory', ['subcategory', 'subCategory', 'sub_category'], 'all'],
  ['sku', 'SKU / Item Code', ['sku', 'code', 'itemCode', 'productCode', 'aliasCode'], 'all'],
  ['barcode', 'Barcode', ['barcode', 'upc', 'ean'], 'all'],
  ['hsn', 'HSN Code', ['hsn', 'hsnCode', 'hsnSac'], 'all'],
  ['batchLot', 'Batch / Lot Number', ['batchNumber', 'lotNumber', 'batchNo', 'lotNo', 'batchLot', 'batchLotNo', 'batch'], 'all'],
  ['serialNumber', 'Serial Number', ['serialNumber', 'serialNo', 'serial', 'serialNumbers'], 'technical'],
  ['warrantyPeriod', 'Warranty Period', ['warrantyPeriod', 'warranty'], 'technical'],
  ['warrantyStatus', 'Warranty Status', ['warrantyStatus'], 'technical'],
  ['vehicleType', 'Vehicle Type', ['vehicleType', 'compatibleVehicleType'], 'automobile'],
  ['vehicleBrand', 'Vehicle Brand', ['vehicleBrand', 'vehicleMake', 'compatibleVehicleBrand'], 'automobile'],
  ['vehicleModel', 'Vehicle Model', ['vehicleModel', 'compatibleModel', 'modelName', 'modelNumber'], 'automobile'],
  ['partNumber', 'Part Number', ['partNumber', 'oemPartNumber', 'oemNumber', 'manufacturerPartNumber'], 'automobile'],
  ['partType', 'Part Type', ['partType'], 'automobile'],
  ['productModel', 'Product Model', ['productModel', 'modelName', 'modelNumber', 'modelFamily', 'modelCode'], 'electronics'],
  ['productCondition', 'Product Condition', ['productCondition', 'condition'], 'electronics'],
  ['imei', 'IMEI Number', ['imei', 'imei1', 'imei2', 'imeiNumber', 'imeiNumbers'], 'electronics'],
  ['storage', 'Storage Capacity', ['storage', 'storageCapacity'], 'electronics'],
  ['ram', 'RAM', ['ram', 'ramCapacity'], 'electronics'],
  ['processor', 'Processor', ['processor'], 'electronics'],
  ['screenSize', 'Screen Size', ['screenSize', 'displaySize'], 'electronics'],
  ['fabricType', 'Fabric Type', ['fabricType', 'fabric', 'material'], 'fashion'],
  ['color', 'Color', ['color', 'colour'], 'fashion'],
  ['size', 'Size', ['size', 'variantName'], 'fashion'],
  ['pattern', 'Design / Pattern', ['pattern', 'design'], 'fashion'],
  ['material', 'Material / Composition', ['material', 'composition'], 'fashion'],
  ['unit', 'Unit of Measurement', ['unit', 'uom'], 'fashion'],
];
const documentKeys = new Set(['supplierCode', 'supplierInvoiceNo', 'staff', 'purchaseOrderNo', 'supplierCategory']);
export function purchaseDimensionFields(operators) {
  return dimensions.map(([key, label, , industry]) => ({ key, label, type: 'autocomplete', path: `_purchase.${key}`, operators: operators.autocomplete, options: true, array: true, item: !documentKeys.has(key), industry }));
}
export function purchaseIndustry(user = {}) {
  if (user.category === 'automobile') return 'automobile';
  if (/electronics|technology/i.test(user.retailSubcategory || '')) return 'electronics';
  if (/fashion|textile|apparel|clothing/i.test(user.retailSubcategory || '')) return 'fashion';
  return 'general';
}

const fallback = (...values) => values.reduceRight((next, value) => next === undefined ? value : { $ifNull: [value, next] }, undefined);
const numeric = value => ({ $convert: { input: value, to: 'double', onNull: null, onError: null } });
const firstValue = paths => paths.reduceRight((next, path) => ({ $cond: [{ $and: [{ $ne: [{ $ifNull: [path, ''] }, ''] }, { $ne: [path, []] }] }, path, next] }), null);
// Normalize scalar, array and named-object values for matching and option lists.
const strings = expression => ({ $let: { vars: { raw: expression }, in: { $filter: { input: { $map: {
  input: { $cond: [{ $isArray: '$$raw' }, '$$raw', ['$$raw']] }, as: 'entry', in: { $convert: {
    input: { $cond: [{ $eq: [{ $type: '$$entry' }, 'object'] }, fallback('$$entry.name', '$$entry.label', '$$entry.code', ''), '$$entry'] }, to: 'string', onNull: '', onError: '',
  } },
} }, as: 'value', cond: { $ne: ['$$value', ''] } } } } });
const aliasesAt = (sources, aliases) => sources.flatMap(source => aliases.map(alias => `${source}.${alias}`));
export const purchaseProductProjection = Object.fromEntries(['description', 'category', 'brand', 'manufacturer', 'purchasePrice', 'variants', 'attributes', ...dimensions.flatMap(([, , aliases]) => aliases.filter(alias => !alias.includes('.')))].map(key => [key, 1]));

export function purchaseFilterStages() {
  const documentValues = Object.fromEntries(dimensions.filter(([key]) => documentKeys.has(key)).map(([key, , aliases]) => {
    let paths = aliasesAt(['$extra', '$$ROOT'], aliases);
    if (['supplierCode', 'supplierInvoiceNo', 'staff'].includes(key)) paths = aliases.map(alias => `$${alias}`);
    if (key === 'supplierCategory') paths.unshift('$supplier.category', '$supplier.supplierCategory', '$supplier.type', '$customer.category', '$customer.supplierCategory', '$customer.type');
    const value = key === 'purchaseOrderNo' ? { $cond: [{ $eq: ['$documentType', 'purchase-order'] }, '$number', firstValue([...paths, '$_purchaseOrder.number'])] } : firstValue(paths);
    return [key, strings(value)];
  }));
  const itemValues = Object.fromEntries(dimensions.filter(([key]) => !documentKeys.has(key)).map(([key, , aliases]) => {
    const sources = ['$$item', '$$item.extra', '$$item.attributes', '$$item.variant', '$$variant', '$$product', '$$product.attributes', '$extra', '$$ROOT'];
    // Devices can save IMEI 1/2 or several serial numbers on a single purchased line.
    const values = ['imei', 'serialNumber'].includes(key)
      ? firstValue([sources.slice(0, 4), [sources[4]], sources.slice(5, 7), sources.slice(7)].map(tier => ({ $concatArrays: aliasesAt(tier, aliases).map(path => strings(path)) })))
      : firstValue(aliasesAt(sources, aliases));
    return [key, strings(values)];
  }));
  const eligible = fallback('$inputTaxCreditEligible', '$itcEligible', '$extra.inputTaxCreditEligible', null);
  const gross = { $multiply: [numeric('$$item.qty'), numeric('$$item.rate')] };
  const discount = numeric(fallback('$$item.discountPercent', '$$item.discount'));
  const discountAmount = { $cond: [{ $eq: ['$$item.discountType', 'amount'] }, discount, { $divide: [{ $multiply: [gross, discount] }, 100] }] };
  return [
    { $set: { _purchase: {
      ...documentValues,
      type: { $cond: [{ $eq: ['$documentType', 'purchase-return'] }, 'supplier-return', '$documentType'] },
      branch: strings(firstValue(['$branch', '$extra.branch', '$extra.store', '$extra.warehouse'])),
      supplier: firstValue(['$supplier.name', '$customer.name']),
      gstType: { $concatArrays: [[{ $cond: [{ $or: [
        { $gt: [numeric(fallback('$totals.tax', '$totals.totalTax', '$totals.totalGst', '$tax', '$gstAmount')), 0] },
        { $eq: ['$isGstInvoice', true] }, { $eq: ['$gstApplicable', true] },
        { $ne: [{ $ifNull: ['$gstin', ''] }, ''] },
        { $anyElementTrue: [{ $map: { input: '$_reportItems', as: 'line', in: { $gt: ['$$line.gstRate', 0] } } }] },
      ] }, 'gst', 'non-gst'] }], { $cond: [{ $eq: [eligible, true] }, ['itc'], []] }] },
      itcStatus: firstValue(['$extra.itcStatus', '$itcStatus', { $switch: { branches: [{ case: { $eq: [eligible, true] }, then: 'Eligible' }, { case: { $eq: [eligible, false] }, then: 'Ineligible' }], default: null } }]),
    } } },
    { $set: { _reportItems: { $map: { input: '$_reportItems', as: 'item', in: { $let: { vars: {
      product: { $arrayElemAt: [{ $filter: { input: '$_reportProducts', as: 'product', cond: { $eq: ['$$product._id', '$$item.productId'] } } }, 0] },
    }, in: { $let: { vars: {
      variant: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$$product.variants', []] }, as: 'variant', cond: { $and: [
        { $ne: [{ $ifNull: [fallback('$$item.variantId', '$$item.variant._id', '$$item.size'), ''] }, ''] },
        { $in: [{ $toString: fallback('$$item.variantId', '$$item.variant._id', '$$item.size') }, { $map: { input: ['$$variant._id', '$$variant.modelName', '$$variant.modelCode', '$$variant.size'], as: 'key', in: { $convert: { input: '$$key', to: 'string', onNull: '', onError: '' } } } }] },
      ] } } }, 0] },
    }, in: { $mergeObjects: ['$$item', { _purchase: {
      ...itemValues, quantity: numeric(fallback('$$item.qty', '$$item.quantity')), rate: numeric(fallback('$$item.rate', '$$item.purchaseRate')),
      discountAmount, discountPercent: { $cond: [{ $eq: ['$$item.discountType', 'amount'] }, { $cond: [{ $gt: [gross, 0] }, { $multiply: [{ $divide: [discount, gross] }, 100] }, null] }, discount] },
    } }] } } } } } } } } },
  ];
}
