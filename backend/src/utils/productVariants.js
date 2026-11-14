const fields = ['size', 'modelName', 'modelCode', 'length', 'colour', 'type', 'material', 'pattern', 'quality', 'ageGroup', 'other', 'processor', 'ram', 'storage', 'display', 'graphics', 'operatingSystem', 'barcode'];

// Stable identity excludes mutable prices and stock. The same attributes are
// used by purchase matching and both sides of the product editor. Keep this
// module free of server dependencies so the browser can use the same rules.
export function productVariantKey(variant = {}) {
  return JSON.stringify(fields.map((field) => {
    const value = String(variant[field] ?? '').trim().toLowerCase();
    return ['ram', 'storage'].includes(field) ? value.replace(/\s/g, '') : value;
  }));
}

export function productHasVariants(product = {}) {
  if (product.itemType === 'Service' || product.productType === 'Bundle') return false;
  if (product.variantMode === 'variants') return true;
  const rows = product.variants || [];
  // Distinct stored options always remain visible, including older products
  // whose type was saved as Standard or Serialized.
  if (new Set(rows.map(productVariantKey)).size > 1) return true;
  if (product.variantMode === 'single') return false;
  if (product.productType === 'Matrix') return true;
  if (!rows.length) return false;
  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s/g, '');
  const names = new Set([product.description, product.shortName, product.modelNumber, product.modelFamily, product.size].map(normalize).filter(Boolean));
  return rows.some(row => {
    if ([row.size, row.modelName].some(value => normalize(value) && !names.has(normalize(value)))) return true;
    if (normalize(row.modelCode) && ![product.code, product.modelNumber].some(value => normalize(value) === normalize(row.modelCode))) return true;
    return fields.filter(field => !['size', 'modelName', 'modelCode', 'barcode'].includes(field)).some(field => {
      const parent = field === 'other' ? product.other || product.brand : field === 'material' ? product.material || product.fabric : product[field];
      return normalize(row[field]) && normalize(row[field]) !== normalize(parent);
    });
  });
}

// Legacy single products may have internal rows referenced by old bills.
// Retain their IDs and distribute a deliberate total correction over them.
export function singleProductVariants(product, targetStock) {
  const rows = (product.variants || []).map(row => ({ ...row }));
  if (!rows.length || Number(targetStock) === Number(product.stock || 0)) return rows;
  const target = Number(targetStock);
  if (!Number.isFinite(target) || target < 0) throw new Error('Stock must be 0 or more');
  let difference = target - rows.reduce((total, row) => total + Number(row.stock || 0), 0);
  if (difference >= 0) {
    const row = rows.find(value => Number(value.stock) > 0) || rows[0];
    row.stock = Number(row.stock || 0) + difference;
  } else {
    for (const row of [...rows].reverse()) {
      const reduction = Math.min(Number(row.stock || 0), -difference);
      row.stock = Number(row.stock || 0) - reduction;
      difference += reduction;
    }
  }
  return rows;
}

export function productInventoryOptions(product) {
  if (!productHasVariants(product)) return [{ ...product, barcode: product.barcode || product.variants?.[0]?.barcode || '' }];
  return (product.variants || []).map(row => ({
    ...product, productId: product._id || product.id, variantId: String(row._id),
    optionId: `${product._id || product.id}:${row._id}`,
    description: [...new Set([product.description, row.modelName, row.size, row.colour, row.length, row.type,
      row.material, row.ram, row.storage].map(value => String(value || '').trim()).filter(Boolean))].join(' - '),
    barcode: row.barcode || '', stock: Number(row.stock || 0), rate: row.rate ?? product.rate,
  }));
}

export function hasNewDuplicateVariants(variants = [], previous = []) {
  const oldGroups = new Map();
  for (const row of previous) {
    const key = productVariantKey(row);
    if (!oldGroups.has(key)) oldGroups.set(key, new Set());
    if (row._id) oldGroups.get(key).add(String(row._id));
  }
  const groups = new Map();
  const ids = new Set();
  for (const row of variants) {
    if (row._id) {
      if (ids.has(String(row._id))) return true;
      ids.add(String(row._id));
    }
    const key = productVariantKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    // Retain legacy rows by ID, so metadata edits cannot lose their movement
    // references or copy another row's balance. New duplicates remain invalid.
    const oldIds = oldGroups.get(key);
    if (!oldIds || rows.some((row) => !row._id || !oldIds.has(String(row._id)))) return true;
  }
  return false;
}

// Send stock-edit intent only when the user changed a quantity. Ordinary
// product edits must not restore stale balances from a previously opened form.
export function productStockAdjustment(previous, next) {
  const oldVariants = previous.variants || [];
  const variants = next.variants || [];
  const changed = Number(previous.stock || 0) !== Number(next.stock || 0)
    || variants.some(row => Number(row.stock || 0) !== Number(oldVariants.find(old => String(old._id) === String(row._id))?.stock || 0));
  if (!changed) return undefined;
  return {
    expectedStock: Number(previous.stock || 0),
    expectedVariants: oldVariants.map(row => ({ _id: String(row._id), stock: Number(row.stock || 0) })),
  };
}
