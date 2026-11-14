import mongoose, { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { AuditLog } from '../models/AuditLog.js';
import { inventoryBaseQuantity } from './inventoryStockCalculation.js';
import { assertUnreservedInventory } from './inventoryReservations.js';
import { assertLocationInventory } from './inventoryAvailability.js';
import { isFinanciallyActive } from './salesLifecycle.js';
import { inventoryTransaction } from './inventoryTransaction.js';
import { productVariantKey, productHasVariants } from '../utils/productVariants.js';

import { BusinessSettings } from '../models/BusinessSettings.js';
import { Product } from '../models/Product.js';
import { ProductBrand } from '../models/ProductBrand.js';
import { StockIn } from '../models/StockIn.js';
import { StockOut } from '../models/StockOut.js';
import { httpError } from '../utils/httpError.js';

function clean(value) {
  return String(value ?? '').trim();
}

function plain(value = {}) {
  return typeof value?.toObject === 'function' ? value.toObject() : value;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function escapeRegex(str) {
  return clean(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureProductBrands(userId, ...sources) {
  const names = new Set();
  for (const source of sources) {
    if (!source) continue;
    names.add(clean(source.brand));
    names.add(clean(source.other));
    names.add(clean(source.variantBrand));
    for (const variant of source.variants || []) {
      names.add(clean(variant.other));
      names.add(clean(variant.brand));
    }
  }
  for (const name of [...names].filter(Boolean)) await ProductBrand.updateOne(
    { userId, name },
    { $setOnInsert: { userId, name, status: 'Active' } },
    { upsert: true },
  );
}

function variantName(variant = {}) {
  return clean(variant.size || variant.modelName);
}

function uniqueTextParts(parts = []) {
  const seen = new Set();
  return parts
    .map((part) => clean(part))
    .filter((part) => {
      if (!part) return false;
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function currentBarcodePeriod(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${year}`;
}

function ean13CheckDigit(first12Digits) {
  const sum = String(first12Digits)
    .slice(0, 12)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

function hashToDigits(text, length = 4) {
  let hash = 5381;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  let digits = String(hash);
  while (digits.length < length) {
    hash = ((hash << 5) + hash + 1) >>> 0;
    digits += String(hash);
  }
  return digits.slice(0, length);
}

function productBarcodeIdentity(value = {}) {
  return [
    value.code,
    value.productCode,
    value.description,
    value.name,
    value.productName,
    value.category,
    value.subCategory,
    value.itemGroup,
    value.productType,
    value.hsn,
    value.unit,
  ]
    .map((part) => clean(part).toLowerCase())
    .filter(Boolean)
    .join('|');
}

function variantBarcodeIdentity(value = {}) {
  return [
    value.brand,
    value.other,
    value.variantBrand,
    value.size,
    value.length,
    value.modelName,
    value.modelCode,
    value.modelNumber,
    value.material,
    value.fabric,
    value.variantMaterial,
    value.colour,
    value.color,
    value.pattern,
    value.type,
    value.quality,
    value.ageGroup,
    value.gender,
    value.collection,
    value.processor,
    value.ram,
    value.storage,
    value.display,
    value.graphics,
    value.operatingSystem,
  ]
    .map((part) => clean(part).toLowerCase())
    .filter(Boolean)
    .join('|');
}

function generateBarcode(value = {}) {
  const productIdentity = productBarcodeIdentity(value) || clean(value.description || value.name || value.productName);
  const variantIdentity = variantBarcodeIdentity(value) || 'base';
  const first12Digits = `${hashToDigits(`${productIdentity}|prefix`, 4)}${currentBarcodePeriod()}${hashToDigits(`${productIdentity}|series`, 2)}${hashToDigits(`${variantIdentity}|variant`, 2)}`;
  return `${first12Digits}${ean13CheckDigit(first12Digits)}`;
}

function unusedVariantBarcode(barcode, product) {
  const used = new Set([product.barcode, ...(product.variants || []).map((variant) => clean(variant.barcode))].filter(Boolean));
  while (used.has(barcode)) {
    const digits = String((Number(barcode.slice(0, 12)) + 1) % 1e12).padStart(12, '0');
    barcode = `${digits}${ean13CheckDigit(digits)}`;
  }
  return barcode;
}

function isFashionRetailSubcategory(value) {
  const normalized = clean(value).toLowerCase();
  return ['fashion-lifestyle', 'fashion & lifestyle', 'fashion & style'].includes(normalized);
}

function isElectronicsRetailSubcategory(value) {
  const normalized = clean(value).toLowerCase();
  return ['electronics-technology', 'electronics & technology'].includes(normalized);
}

async function retailSubcategoryForInvoice(invoice, userId) {
  if (invoice.businessSettingsSnapshot?.documentWorkflow === 'electronics-technology') {
    return 'electronics-technology';
  }
  const snapshotSubcategory = invoice.businessSettingsSnapshot?.retailSubcategory
    || invoice.businessSettings?.retailSubcategory;
  if (snapshotSubcategory) return snapshotSubcategory;
  const settings = await BusinessSettings.findOne({ userId }, { retailSubcategory: 1 }).lean();
  return settings?.retailSubcategory || '';
}

async function shouldGeneratePurchaseBarcodes(invoice, userId) {
  if (invoice.documentType !== 'purchase-entry') return false;
  return isFashionRetailSubcategory(await retailSubcategoryForInvoice(invoice, userId));
}

function variantDisplayName(variant = {}) {
  const base = clean(variant.size || variant.modelName || variant.modelCode || variant.barcode);
  const attributes = uniqueTextParts([
    variant.colour || variant.color,
    variant.length && `Length ${variant.length}`,
    variant.type,
    variant.material,
    variant.pattern,
    variant.ageGroup,
    variant.quality,
    variant.other,
    variant.ram,
    variant.storage,
    variant.processor,
    variant.display,
    variant.operatingSystem,
  ].filter((part) => clean(part).toLowerCase() !== base.toLowerCase()));
  return uniqueTextParts([base, ...attributes]).join(' - ');
}

const extraVariantFields = ['ram', 'storage', 'processor', 'display', 'graphics', 'operatingSystem', 'pattern', 'quality', 'ageGroup'];
const extraVariantAttrs = (item) => Object.fromEntries(extraVariantFields.map((field) => [field, clean(item[field] || item.variant?.[field])]));
const variantAttributeKey = (field, value) => ['ram', 'storage'].includes(field) ? clean(value).toLowerCase().replace(/\s/g, '') : clean(value).toLowerCase();

function unambiguousVariant(matches, product) {
  if (matches.length <= 1) return matches[0] || null;
  // Legacy purchase imports could leave an empty duplicate with the same
  // barcode. Reuse the one stocked row, without merging IDs used by bills.
  if (new Set(matches.map(productVariantKey)).size === 1) {
    const stocked = matches.filter((variant) => Number(variant.stock) > 0);
    if (stocked.length === 1) return stocked[0];
    if (!stocked.length) return [...matches].sort((a, b) => String(a._id).localeCompare(String(b._id)))[0];
  }
  throw httpError(400, `Multiple inventory variants match ${product.description}. Select the exact variant or scan its unique barcode.`);
}

function findProductVariant(product, value, attrs = {}) {
  const variants = product?.variants ?? [];
  if (attrs.variantId) {
    const variant = variants.find((row) => String(row._id) === String(attrs.variantId));
    if (!variant) throw httpError(400, `Select a valid inventory variant for ${product.description}`);
    return variant;
  }
  const barcode = clean(attrs.barcode);
  if (barcode) {
    const scanned = variants.filter((variant) => clean(variant.barcode) === barcode);
    if (scanned.length) return unambiguousVariant(scanned, product);
  }
  const name = clean(value);
  const modelCode = clean(attrs.modelCode).toLowerCase();
  if (modelCode) {
    const byCode = variants.filter((variant) => clean(variant.modelCode).toLowerCase() === modelCode);
    if (byCode.length) return unambiguousVariant(byCode, product);
  }
  const brand = clean(attrs.brand).toLowerCase();
  const material = clean(attrs.material).toLowerCase();
  const colour = clean(attrs.colour || attrs.color).toLowerCase();
  const length = clean(attrs.length).toLowerCase();
  const type = clean(attrs.type).toLowerCase();
  const extraFields = extraVariantFields.filter((field) => clean(attrs[field]));
  if (!name && !brand && !material && !colour && !type && !length && !extraFields.length) {
    if (barcode || modelCode) return null;
    if (variants.length === 1) return variants[0];
    if (variants.length && new Set(variants.map(productVariantKey)).size === 1) return unambiguousVariant(variants, product);
    return null;
  }
  const normalizedName = name.toLowerCase();
  const attributed = variants.filter((variant) => (
    (!brand || clean(variant.other).toLowerCase() === brand)
    && (!material || clean(variant.material).toLowerCase() === material)
  ));
  // Older bills also store the parent product's brand on each line. It may
  // differ from variant attributes, so retain a unique legacy name match.
  const candidates = (attributed.length || !name ? attributed : variants).filter((variant) => (!colour || clean(variant.colour || variant.color).toLowerCase() === colour) && (!type || clean(variant.type).toLowerCase() === type) && (!length || clean(variant.length).toLowerCase() === length)
    && extraFields.every((field) => variantAttributeKey(field, variant[field]) === variantAttributeKey(field, attrs[field])));
  const exact = name ? candidates.filter((variant) => clean(variantDisplayName(variant)).toLowerCase() === normalizedName) : [];
  const matches = exact.length ? exact : candidates.filter((variant) => !name || clean(variantName(variant)).toLowerCase() === normalizedName);
  return unambiguousVariant(matches, product);
}

function itemHasVariantAttrs(item = {}, { itemGroup = '' } = {}) {
  if (itemGroup === 'Electronics') {
    return Boolean(clean(item.size || item.modelName || item.modelNumber || item.variant?.size || item.variant?.modelName)
      || item.productType === 'Matrix' && (clean(item.colour || item.type || item.modelCode) || Object.values(extraVariantAttrs(item)).some(Boolean)));
  }
  return Boolean(clean(item.size || item.modelName || item.modelNumber || item.variant?.size || item.variant?.modelName)
    || clean(item.brand || item.other || item.variantBrand || item.variant?.other || item.variant?.brand)
    || clean(item.material || item.fabric || item.variantMaterial || item.variant?.material || item.variant?.fabric)
    || clean(item.colour || item.type || item.modelCode)
    || clean(item.barcode || item.variant?.barcode));
}

function buildVariantFromItem(item = {}, qty = 0, { generateMissingBarcode = true } = {}) {
  const purchasePrice = Number(item.rate) || 0;
  const sellingPrice = Number(item.sellingPrice) || purchasePrice;
  const mrp = Number(item.mrp) || 0;
  const size = clean(item.size || item.modelName || item.modelNumber || item.variant?.size || item.variant?.modelName);
  const brand = clean(item.brand || item.other || item.variantBrand || item.variant?.other || item.variant?.brand);
  const material = clean(item.material || item.fabric || item.variantMaterial || item.variant?.material || item.variant?.fabric);
  const barcode = clean(item.barcode || item.variant?.barcode)
    || (generateMissingBarcode ? generateBarcode({
      ...item,
      size,
      modelName: size || clean(item.description),
      other: brand,
      brand,
      material,
      fabric: material,
    }) : '');
  return {
    ...extraVariantAttrs(item),
    size,
    modelCode: clean(item.modelCode),
    length: clean(item.length),
    colour: clean(item.colour || item.color),
    type: clean(item.type),
    modelName: clean(item.description),
    other: brand,
    material,
    barcode,
    rate: sellingPrice,
    purchasePrice,
    mrp,
    stock: Math.max(0, Number(qty) || 0),
  };
}

async function addMissingProductVariantFromItem(product, item, qty = 0, { generateMissingBarcode = true, itemGroup = 'Textile' } = {}) {
  if (!product || !itemHasVariantAttrs(item, { itemGroup })) return { product, variant: null, created: false };
  const itemSize = clean(item.size || item.modelName || item.modelNumber || item.variant?.size || item.variant?.modelName);
  const itemBrand = clean(item.brand || item.other || item.variantBrand || item.variant?.other || item.variant?.brand);
  const itemMaterial = clean(item.material || item.fabric || item.variantMaterial || item.variant?.material || item.variant?.fabric);
  const attrs = { ...extraVariantAttrs(item), brand: itemBrand, material: itemMaterial, colour: item.colour, type: item.type, modelCode: item.modelCode, length: item.length, barcode: item.barcode || item.variant?.barcode, variantId: item.variantId || item.variant?._id };
  const existing = findProductVariant(product, itemSize, attrs);
  if (existing) {
    await ensureProductBrands(product.userId, product, item, existing);
    if (generateMissingBarcode && !clean(existing.barcode) && itemHasVariantAttrs(item, { itemGroup })) {
      const barcode = generateBarcode({
        ...plain(product),
        ...plain(existing),
        ...item,
        size: existing.size || itemSize,
        modelName: existing.modelName || itemSize || product.description,
        other: existing.other || itemBrand,
        brand: existing.other || itemBrand || product.brand,
        material: existing.material || itemMaterial,
      });
      await Product.updateOne(
        { _id: product._id, 'variants._id': existing._id },
        { $set: { 'variants.$.barcode': barcode } },
      );
      const refreshed = await Product.findById(product._id);
      const updatedVariant = findProductVariant(refreshed, itemSize, attrs);
      return { product: refreshed || product, variant: updatedVariant || { ...existing, barcode }, created: false };
    }
    return { product, variant: existing, created: false };
  }

  const variant = buildVariantFromItem(item, qty, { generateMissingBarcode });
  if (generateMissingBarcode && !clean(item.barcode || item.variant?.barcode)) variant.barcode = unusedVariantBarcode(variant.barcode, product);
  const variantMode = productHasVariants({ ...plain(product), variantMode: '', variants: [...(product.variants || []), variant] }) ? 'variants' : 'single';
  await Product.updateOne(
    { _id: product._id },
    {
      $set: {
        itemGroup: product.itemGroup === 'General' ? itemGroup : product.itemGroup,
        variantMode,
        ...(itemGroup === 'Textile' ? { productType: 'Matrix' } : {}),
        brand: product.brand || variant.other,
        size: product.size || variant.size,
        material: product.material || variant.material,
        fabric: product.fabric || variant.material,
        rate: Number(product.rate) > 0 ? product.rate : variant.rate,
        purchasePrice: Number(product.purchasePrice) > 0 ? product.purchasePrice : variant.purchasePrice,
        mrp: Number(product.mrp) > 0 ? product.mrp : variant.mrp,
      },
      $inc: { stock: Number(qty) || 0 },
      $push: { variants: variant },
    },
  );
  const refreshed = await Product.findById(product._id);
  await ensureProductBrands(product.userId, refreshed || product, item, variant);
  const createdVariant = findProductVariant(refreshed, itemSize, attrs);
  return { product: refreshed || product, variant: createdVariant || variant, created: true };
}

async function nextStockNo(Model, userId, field, prefix) {
  const last = await Model.findOne({ userId }, { [field]: 1 }, { sort: { createdAt: -1 } }).lean();
  let seq = 1;
  if (last?.[field]) {
    const n = parseInt(String(last[field]).split('-').pop(), 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}-${new Date().getFullYear()}-${String(seq).padStart(3, '0')}`;
}

async function generateNextProductCode(userId) {
  const products = await Product.find({ userId }, { code: 1 }).lean();
  const existingCodes = new Set(products.map((p) => String(p.code ?? '').trim().toUpperCase()));
  let max = 1000;
  products.forEach(({ code }) => {
    const n = parseInt(code, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  let candidate = max + 1;
  while (existingCodes.has(String(candidate))) {
    candidate++;
  }
  return String(candidate);
}

// A direct Purchase Entry is often how a brand-new product first enters the
// catalog (no matching Purchase Order to have introduced it already), so
// unlike other inbound/outbound documents it creates the Product on the fly
// instead of silently skipping the line.
async function createProductFromItem(userId, item, qty = 0, { generateMissingBarcode = true, itemGroup = 'General' } = {}) {
  const description = clean(item.description);
  if (!description) return null;
  if (item.itemType === 'Service') return null;
  const code = await generateNextProductCode(userId);
  const openingQty = Math.max(0, Number(qty) || 0);
  const purchasePrice = Number(item.rate) || 0;
  const sellingPrice = Number(item.sellingPrice) || purchasePrice;
  const mrp = Number(item.mrp) || 0;
  const size = clean(item.size);
  const brand = clean(item.brand);
  const category = clean(item.category);
  const subCategory = clean(item.subCategory);
  const material = clean(item.material);
  const barcode = clean(item.barcode);
  const hasVariant = itemHasVariantAttrs(item, { itemGroup });
  const variants = hasVariant
    ? [buildVariantFromItem(item, openingQty, { generateMissingBarcode })]
    : [];
  const productType = clean(item.productType) || (itemGroup === 'Electronics' ? 'Serialized' : variants.length ? 'Matrix' : 'Standard');
  const productBarcode = variants.length
    ? ''
    : barcode || (generateMissingBarcode ? generateBarcode({ ...item, description, brand, size, material, fabric: material }) : '');
  const product = await Product.create({
    ...extraVariantAttrs(item),
    userId,
    code,
    description,
    imageUrl: clean(item.imageUrl),
    hsn: clean(item.hsn),
    unit: clean(item.unit) || 'Nos',
    rate: sellingPrice,
    purchasePrice,
    mrp,
    gstRate: [0, 5, 12, 18, 28].includes(Number(item.gstRate)) ? Number(item.gstRate) : 18,
    stock: openingQty,
    openingStockValue: money(openingQty * purchasePrice),
    itemGroup: itemGroup || (variants.length ? 'Textile' : 'General'),
    productType,
    brand,
    category,
    subCategory,
    size,
    material,
    fabric: material,
    barcode: productBarcode,
    variants,
    status: 'Active',
  });
  await ensureProductBrands(userId, product, item);
  return product;
}

async function findProduct(userId, item) {
  if (item.productId) {
    if (!Types.ObjectId.isValid(String(item.productId))) return null;
    return Product.findOne({ _id: item.productId, userId });
  }

  const productCode = clean(item.productCode || item.code);
  if (productCode) {
    const byCode = await Product.findOne({ userId, code: productCode.toUpperCase() });
    if (byCode) return byCode;
  }

  const barcode = clean(item.barcode);
  if (barcode) {
    const byBarcode = await Product.findOne({ userId, barcode });
    if (byBarcode) return byBarcode;
    const byVariantBarcode = await Product.findOne({ userId, 'variants.barcode': barcode });
    if (byVariantBarcode) return byVariantBarcode;
  }

  const description = clean(item.description);
  if (!description) return null;
  return Product.findOne({ userId, description: new RegExp(`^${escapeRegex(description)}$`, 'i') });
}

async function collectMovableItems(invoice, userId, { generatePurchaseBarcodes = true } = {}) {
  const rows = [];
  const retailSubcategory = invoice.documentType === 'purchase-entry'
    ? await retailSubcategoryForInvoice(invoice, userId)
    : '';
  const purchaseItemGroup = isElectronicsRetailSubcategory(retailSubcategory)
    ? 'Electronics'
    : isFashionRetailSubcategory(retailSubcategory)
      ? 'Textile'
      : 'General';
  for (const [lineIndex, item] of (invoice.items ?? []).entries()) {
    const qty = Number(invoice.documentType === 'sales-return' && invoice.returnStatus ? item.restockQty : item.qty) || 0;
    if (qty <= 0) continue;
    if (item.itemType === 'Service') continue;
    let product = await findProduct(userId, item);
    if (!product && !item.productId && invoice.documentType === 'purchase-entry') {
      product = await createProductFromItem(userId, item, 0, { generateMissingBarcode: generatePurchaseBarcodes, itemGroup: purchaseItemGroup });
    }
    if (!product) {
      if (inventoryMode(invoice.documentType)) {
        throw httpError(400, `${clean(item.description) || 'Invoice item'} is not linked to an inventory product. Select the product from inventory before saving.`);
      }
      continue;
    }
    if (product.itemType === 'Service') continue;
    if (product.trackInventory === false) continue;
    const converted = inventoryBaseQuantity({ ...item, qty }, product);
    await ensureProductBrands(userId, product, item);
    const itemVariantName = clean(item.size || item.modelName || item.modelNumber || item.variant?.size || item.variant?.modelName);
    const itemVariantBrand = clean(item.brand || item.other || item.variantBrand || item.variant?.other || item.variant?.brand);
    const itemVariantMaterial = clean(item.material || item.fabric || item.variantMaterial || item.variant?.material || item.variant?.fabric);
    let matchedVariant = findProductVariant(product, itemVariantName, { ...extraVariantAttrs(item), brand: itemVariantBrand, material: itemVariantMaterial, colour: item.colour, type: item.type, modelCode: item.modelCode, length: item.length, variantId: item.variantId || item.variant?._id, barcode: item.barcode || item.variant?.barcode });
    if (!matchedVariant && invoice.documentType === 'purchase-entry') {
      const result = await addMissingProductVariantFromItem(product, item, 0, { generateMissingBarcode: generatePurchaseBarcodes, itemGroup: purchaseItemGroup });
      product = result.product;
      matchedVariant = result.variant;
    }
    if (generatePurchaseBarcodes && invoice.documentType === 'purchase-entry' && !matchedVariant && !clean(product.barcode)) {
      const barcode = generateBarcode({
        ...plain(product),
        ...item,
        description: clean(item.description || product.description),
      });
      await Product.updateOne({ _id: product._id }, { $set: { barcode } });
      product = await Product.findById(product._id) || product;
    }
    if (product.variants?.length && !matchedVariant && inventoryMode(invoice.documentType)) {
      throw httpError(400, `Select a valid inventory variant for ${product.description}`);
    }
    rows.push({
      product,
      qty: converted.quantity,
      rate: Number(item.rate ?? product.rate ?? 0) || 0,
      sourceLineId: String(item._id || lineIndex),
      costSourceId: invoice.documentType === 'sales-return' ? invoice.extra?.originalSalesId : undefined,
      costSourceLineId: item.originalLineId,
      converted,
      batchNumber: clean(item.batchNumber || item.batchLotNo || invoice.extra?.batchNumber),
      warehouse: clean(invoice.extra?.warehouse || product.warehouse), branch: clean(invoice.branch || product.branch),
      unitCost: invoice.documentType === 'purchase-entry'
        ? Math.max(0, Number(item.rate || 0) * qty - (item.discountType === 'amount' ? Number(item.discount || 0) : Number(item.rate || 0) * qty * Number(item.discount || 0) / 100)) / converted.quantity
        : Number(product.purchasePrice || 0),
      description: clean(item.description || product.description),
      variantName: matchedVariant ? variantDisplayName(matchedVariant) : '',
      variantBrand: itemVariantBrand,
      variantMaterial: itemVariantMaterial,
      variantId: matchedVariant?._id,
    });
  }
  return rows;
}

async function collectRowsFromMovements(movements, userId) {
  const rows = [];
  for (const movement of movements ?? []) {
    const qty = Number(movement.totalQty) || 0;
    if (qty <= 0) continue;
    let product = null;
    if (movement.productId && Types.ObjectId.isValid(String(movement.productId))) {
      product = await Product.findOne({ _id: movement.productId, userId });
    }
    if (!movement.productId && !product && movement.productName) {
      product = await Product.findOne({
        userId,
        description: new RegExp(`^${escapeRegex(movement.productName)}$`, 'i'),
      });
    }
    if (!product) throw httpError(409, `Cannot reverse stock: inventory product ${movement.productName || movement.productId} is missing`);
    rows.push({
      product,
      qty,
      rate: Number(movement.totalValue || 0) / qty,
      description: clean(movement.productName || product.description),
      variantName: clean(movement.variantName),
      variantId: movement.variantId,
      sourceLineId: movement.sourceLineId || String(movement._id),
      warehouse: movement.warehouse, branch: movement.branch, batchNumber: movement.batchNumber || movement.batchSerialNo || '',
    });
  }
  return rows;
}

function inventoryMode(documentType) {
  if (['invoice', 'bill-of-supply', 'supplier-return', 'pharmacy-bill', 'e-invoice'].includes(documentType)) return 'out';
  if (['purchase-entry', 'sales-return'].includes(documentType)) return 'in';
  return '';
}

async function applyRows(rows, direction, { allowNegative = false } = {}) {
  if (!allowNegative && direction < 0) {
    const locations = new Map();
    for (const row of rows) {
      const key = JSON.stringify([String(row.product._id), row.branch, row.warehouse, String(row.variantId || ''), row.batchNumber]);
      const group = locations.get(key) || { ...row, qty: 0 };
      group.qty += row.qty;
      locations.set(key, group);
    }
    for (const row of locations.values()) await assertLocationInventory(row.product, row.qty, row);
  }
  const grouped = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.qty) || row.qty <= 0) throw httpError(400, 'Stock quantities must be finite and greater than zero');
    const id = String(row.product._id);
    let group = grouped.get(id);
    if (!group) { group = { product: row.product, qty: 0, variants: new Map() }; grouped.set(id, group); }
    group.qty += row.qty;
    const variant = row.variantId
      ? row.product.variants?.find((value) => String(value._id) === String(row.variantId))
      : findProductVariant(row.product, row.variantName, { brand: row.variantBrand, material: row.variantMaterial });
    // Legacy movements may have neither a variant ID nor a name. Never
    // reverse only the parent when there are multiple possible model rows.
    if ((row.product.variants?.length || row.variantId || row.variantName) && !variant) {
      throw httpError(409, `Inventory variant is missing for ${row.product.description}. This bill needs its original model reference before it can change stock. Use Edit Product to correct quantities separately.`);
    }
    if (variant) {
      const key = String(variant._id);
      const entry = group.variants.get(key) || { variant, qty: 0 };
      entry.qty += row.qty;
      group.variants.set(key, entry);
    }
  }

  for (const { product, qty, variants } of grouped.values()) {
    if (!allowNegative && direction > 0 && Number(product.inventoryRevision) > 0) {
      const projected = { ...plain(product), stock: Number(product.stock) + qty,
        variants: (product.variants || []).map((variant) => ({ ...plain(variant), stock: Number(variant.stock) + (variants.get(String(variant._id))?.qty || 0) })) };
      await assertUnreservedInventory(projected, 0);
      for (const variant of projected.variants) await assertUnreservedInventory(projected, 0, variant._id, { variantQuantity: 0 });
    }
    if (!allowNegative && direction < 0) {
      await assertUnreservedInventory(product, qty);
      for (const { variant, qty: required } of variants.values()) await assertUnreservedInventory(product, qty, variant._id, { variantQuantity: required });
    }
    if (!allowNegative && Number(product.stock || 0) + direction * qty < 0) {
      throw httpError(409, `Insufficient stock for ${product.description}. Available ${product.stock || 0}, required ${qty}`);
    }
    for (const { variant, qty: required } of variants.values()) {
      if (!allowNegative && Number(variant.stock || 0) + direction * required < 0) {
        throw httpError(409, `Insufficient variant stock for ${product.description} (${variantName(variant)}). Available ${variant.stock || 0}, required ${required}`);
      }
    }
  }

  for (const { product, qty, variants } of grouped.values()) {
    const filter = { _id: product._id, userId: product.userId };
    const increments = { stock: direction * qty };
    const arrayFilters = [];
    const variantConditions = [];
    for (const { variant, qty: required } of variants.values()) {
      const alias = `v${arrayFilters.length}`;
      increments[`variants.$[${alias}].stock`] = direction * required;
      arrayFilters.push({ [`${alias}._id`]: variant._id });
      variantConditions.push({ $elemMatch: { _id: variant._id, ...(!allowNegative ? { stock: { $gte: -direction * required } } : {}) } });
    }
    if (!allowNegative) filter.stock = { $gte: -direction * qty };
    if (variantConditions.length) filter.variants = { $all: variantConditions };
    const result = await Product.updateOne(filter, { $inc: increments }, arrayFilters.length ? { arrayFilters } : {});
    if (result.matchedCount !== 1) throw httpError(409, `Stock changed or product was removed for ${product.description}. Refresh and retry.`);
  }
}

async function reverseInventory(invoice, userId, { allowNegative = false } = {}) {
  const mode = inventoryMode(invoice.documentType);
  if (!mode || !invoice?._id) return null;

  const sourceFilter = { userId, sourceType: invoice.documentType, sourceId: invoice._id };
  const existingMovements = mode === 'out'
    ? await StockOut.find(sourceFilter).lean()
    : await StockIn.find(sourceFilter).lean();
  if (!existingMovements.length) return { reversed: 0 };

  if (mongoose.connection.readyState === 1) await AuditLog.create({
    businessId: invoice.businessId, action: 'update', modelName: 'InventoryStockPosting', documentId: invoice._id,
    documentLabel: invoice.number, performedBy: { userId },
    meta: { event: 'reversed-before-correction', sourceType: invoice.documentType, movements: existingMovements },
  });

  const rows = await collectRowsFromMovements(existingMovements, userId);
  if (rows.length > 0) {
    await applyRows(rows, mode === 'out' ? 1 : -1, { allowNegative });
  }

  await StockOut.deleteMany(sourceFilter);
  await StockIn.deleteMany(sourceFilter);
  return { reversed: rows.length };
}

async function postInventory(invoice, userId) {
  const mode = inventoryMode(invoice.documentType);
  if (!mode || !invoice?._id) return null;

  const postingFingerprint = createHash('sha256').update(JSON.stringify({
    type: invoice.documentType, date: invoice.meta?.date, branch: invoice.branch, warehouse: invoice.extra?.warehouse,
    number: invoice.number, party: invoice.customer?.name, items: invoice.items,
  })).digest('hex');
  const previous = await (mode === 'out' ? StockOut : StockIn).find({ userId, sourceType: invoice.documentType, sourceId: invoice._id }).lean();
  if (previous.length && previous.every((movement) => movement.postingFingerprint === postingFingerprint)) {
    if (previous.some((movement) => movement.postingLineCount != null && movement.postingLineCount !== previous.length)) throw httpError(409, 'Source stock posting is incomplete; reconciliation is required');
    return { posted: true, duplicate: true, itemCount: previous.length };
  }

  await reverseInventory(invoice, userId, { allowNegative: true });

  const generatePurchaseBarcodes = await shouldGeneratePurchaseBarcodes(invoice, userId);
  const rows = await collectMovableItems(invoice, userId, { generatePurchaseBarcodes });
  if (rows.length === 0) return { posted: false, reason: 'No matching inventory products found' };
  if (new Set(rows.map((row) => row.sourceLineId)).size !== rows.length) throw httpError(400, 'Duplicate document stock line references');

  await applyRows(rows, mode === 'out' ? -1 : 1);
  const date = invoice.meta?.date ? new Date(invoice.meta.date) : new Date();

  if (mode === 'out') {
    for (const row of rows) {
      const stockOutNo = await nextStockNo(StockOut, userId, 'stockOutNo', 'SOUT');
      await StockOut.create({
        businessId: invoice.businessId, sourceLineId: row.sourceLineId,
        movementKey: `${invoice.documentType}:${invoice._id}:${row.sourceLineId}`, postingFingerprint, postingLineCount: rows.length,
        warehouse: clean(invoice.extra?.warehouse || row.product.warehouse),
        baseQty: row.qty, enteredQuantity: row.converted.enteredQuantity, unit: row.converted.unit,
        baseUnit: row.converted.baseUnit, conversionFactor: row.converted.conversionFactor,
        batchNumber: row.batchNumber, unitCost: row.unitCost, costEstimated: true,
        userId,
        branch: row.branch,
        stockOutNo,
        date,
        productId: row.product._id,
        productName: row.product.description,
        variantName: row.variantName,
        variantId: row.variantId,
        to: invoice.customer?.name || 'Customer',
        itemCount: 1,
        totalQty: row.qty,
        totalValue: money(row.converted.enteredQuantity * row.rate),
        status: 'Completed',
        sourceType: invoice.documentType,
        sourceId: invoice._id,
        sourceNo: invoice.number,
      });
    }
  } else {
    for (const row of rows) {
      const stockInNo = await nextStockNo(StockIn, userId, 'stockInNo', 'SIN');
      await StockIn.create({
        costSourceId: row.costSourceId, costSourceLineId: row.costSourceLineId,
        businessId: invoice.businessId, sourceLineId: row.sourceLineId,
        movementKey: `${invoice.documentType}:${invoice._id}:${row.sourceLineId}`, postingFingerprint, postingLineCount: rows.length,
        warehouse: clean(invoice.extra?.warehouse || row.product.warehouse),
        baseQty: row.qty, enteredQuantity: row.converted.enteredQuantity, unit: row.converted.unit,
        baseUnit: row.converted.baseUnit, conversionFactor: row.converted.conversionFactor,
        batchNumber: row.batchNumber, unitCost: row.unitCost, costEstimated: invoice.documentType !== 'purchase-entry',
        userId,
        branch: row.branch,
        stockInNo,
        date,
        productId: row.product._id,
        productName: row.product.description,
        variantName: row.variantName,
        variantId: row.variantId,
        supplier: invoice.customer?.name || 'Vendor',
        itemCount: 1,
        totalQty: row.qty,
        totalValue: money(row.converted.enteredQuantity * row.rate),
        status: 'Completed',
        sourceType: invoice.documentType,
        sourceId: invoice._id,
        sourceNo: invoice.number,
      });
    }
  }

  return {
    posted: true,
    itemCount: rows.length,
    totalQty: rows.reduce((sum, row) => sum + row.qty, 0),
    totalValue: money(rows.reduce((sum, row) => sum + row.converted.enteredQuantity * row.rate, 0)),
  };
}

export function postInventoryForDocument(invoice, userId) {
  if (!inventoryMode(invoice.documentType) || !invoice?._id || !isFinanciallyActive(invoice)) return Promise.resolve(null);
  return inventoryTransaction(() => postInventory(invoice, userId));
}

export function reverseInventoryForDocument(invoice, userId) {
  if (!inventoryMode(invoice.documentType) || !invoice?._id) return Promise.resolve(null);
  return inventoryTransaction(() => reverseInventory(invoice, userId));
}

// Cancellation is a traceable receipt, not deletion of the original dispatch
// movement. It runs in the same transaction as the invoice cancellation.
export function cancelInventoryForDocument(invoice, userId) {
  return inventoryTransaction(async () => {
    const previous = await StockIn.find({ userId, sourceType: 'invoice-cancellation', sourceId: invoice._id }).lean();
    if (previous.length) return;
    const source = invoice.extra?.stockHandledByOnlineOrder ? { sourceType: 'online-order', sourceId: invoice.extra.onlineOrderId } : { sourceType: invoice.documentType, sourceId: invoice._id };
    if (!source.sourceId) throw httpError(409, 'The original stock movement reference is missing');
    const movements = await StockOut.find({ userId, ...source }).lean();
    if (!movements.length && invoice.items.some((item) => item.itemType !== 'Service' && Number(item.qty) > 0)) throw httpError(409, 'Original stock movements are missing. Reconcile this invoice before cancellation.');
    const rows = await collectRowsFromMovements(movements, userId);
    await applyRows(rows, 1);
    for (const row of rows) await StockIn.create({
      warehouse: row.warehouse || '', batchNumber: row.batchNumber,
      sourceLineId: row.sourceLineId,
      movementKey: `invoice-cancellation:${invoice._id}:${row.sourceLineId}`,
      baseQty: row.qty, unitCost: Number(row.product.purchasePrice || 0), costEstimated: true,
      userId, branch: row.branch || '', stockInNo: await nextStockNo(StockIn, userId, 'stockInNo', 'SIN'), date: new Date(),
      productId: row.product._id, productName: row.product.description, variantName: row.variantName, variantId: row.variantId,
      supplier: `Cancellation ${invoice.number}`, itemCount: 1, totalQty: row.qty, totalValue: money(row.qty * row.rate),
      status: 'Completed', sourceType: 'invoice-cancellation', sourceId: invoice._id, sourceNo: invoice.number,
    });
  });
}
