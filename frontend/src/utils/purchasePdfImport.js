const clean = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const key = (value) => clean(value).toLowerCase();
export const PURCHASE_VARIANT_FIELDS = ['size', 'length', 'colour', 'type', 'material', 'pattern', 'quality', 'ageGroup', 'other', 'ram', 'storage', 'processor', 'display', 'graphics', 'operatingSystem'];
const hasVariantAttributes = (row) => PURCHASE_VARIANT_FIELDS.some((field) => field !== 'material' && row[field]);

function classifyPurchaseRows(items) {
  const groups = new Map();
  for (const row of items) {
    const parent = [row.description, row.brand, row.category].map(key).join('|');
    if (!groups.has(parent)) groups.set(parent, new Set());
    groups.get(parent).add(PURCHASE_VARIANT_FIELDS.map((field) => key(row[field])).join('|'));
  }
  return items.map((row) => ({ ...row, productType: row.productType === 'Matrix' || groups.get([row.description, row.brand, row.category].map(key).join('|')).size > 1 ? 'Matrix' : 'Standard' }));
}
export function pdfNumber(value) {
  const number = clean(value).replace(/(?:INR|Rs\.?|₹|%|,)/gi, '').replace(/\s*\/\s*(?:-|nos?\.?|pcs?\.?|pieces?|mtrs?\.?|meters?|kg)\s*$/i, '').trim();
  return /^-?\d+(?:\.\d+)?$/.test(number) ? Number(number) : '';
}

// Quantity cells often print the unit beside the number ("12 Nos", "2.5 kg").
// Accept only a single explicit quantity, never pack sizes, dimensions or sums.
export function pdfQuantity(value) {
  const numeric = pdfNumber(value);
  if (numeric !== '') return { qty: numeric, unit: '' };
  const match = clean(value).match(/^([\d,]+(?:\.\d+)?)\s*(nos?\.?|pcs?\.?|pieces?|units?|sets?|pairs?|boxes?|box|packs?|pkts?|cartons?|ctns?|rolls?|bags?|bottles?|kg|kgs|g|gms|grams?|ltr|ltrs|litres?|liters?|ml|mtrs?\.?|meters?|metres?|ft|feet|dozens?|dz)\s*$/i);
  return match ? { qty: pdfNumber(match[1]), unit: match[2].replace(/\.$/, '') } : { qty: '', unit: '' };
}

export function pdfDate(value = '') {
  const source = value.trim();
  const match = source.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const normalized = match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : source;
  const date = new Date(`${normalized}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : '';
}

export function pdfTextLines(items) {
  const lines = [];
  for (const item of items.filter((item) => item.str?.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const y = item.transform[5];
    let line = lines.find((entry) => Math.abs(entry.y - y) < 3);
    if (!line) { line = { y, cells: [] }; lines.push(line); }
    line.cells.push({ text: item.str, x: item.transform[4], width: item.width || 0 });
  }
  return lines.map((line) => ({ ...line, cells: line.cells.sort((a, b) => a.x - b.x) }));
}

const columnPatterns = [
  ['groupNumber', /^(?:#|s\.?\s*no\.?|s\s*\/\s*n)$/i],
  ['variantDetails', /variant\s*(?:details|attributes)|^variants?$/i],
  ['description', /product(?:\s*\/\s*service)?|description|particulars|item\s*name|item\s*description|^item$/i],
  ['productCode', /sku|item\s*code|product\s*code/i], ['barcode', /barcode/i],
  ['hsn', /hsn(?:\s*\/\s*sac)?/i], ['brand', /brand/i], ['category', /^category$/i], ['size', /size|model|waist/i], ['colour', /colou?r/i], ['type', /\bfit\b/i], ['material', /material|fabric/i],
  ['ram', /\bram\b/i], ['storage', /\bstorage\b/i], ['processor', /\bprocessor\b/i], ['display', /\bdisplay\b|\bscreen\b/i], ['graphics', /\bgraphics\b/i], ['operatingSystem', /operating\s*system|^os$/i], ['pattern', /\bpattern\b/i], ['quality', /\bquality\b/i], ['ageGroup', /age\s*group/i],
  ['freeQty', /(?:free|bonus|foc)\s*(?:qty|quantity)?/i],
  ['qty', /quantity|qty/i], ['unit', /uom|unit(?!\s*(?:price|rate))/i],
  ['rate', /purchase\s*rate|unit\s*price|unit\s*rate|rate|price/i],
  ['discount', /discount|disc\.?/i], ['gstRate', /igst|gst(?:\s*(?:rate|%))?|\btax\b(?:\s*(?:rate|%))?/i],
  ['cgst', /cgst/i], ['sgst', /sgst/i], ['amount', /amount|total/i],
];

function headerColumns(line, partial = false) {
  const columns = [];
  for (const cell of line.cells) {
    const matches = [];
    for (const [field, pattern] of columnPatterns) {
      const match = cell.text.match(pattern);
      if (match) matches.push({ field, index: match.index, text: match[0] });
    }
    // CGST/SGST headers must not also become a generic GST column.
    const combinedProductHeading = /product\s*\/\s*(?:brand|material)/i.test(cell.text);
    const filtered = matches.filter((match) => !(combinedProductHeading && ['brand', 'material'].includes(match.field)) && !(match.field === 'gstRate' && /[cs]gst/i.test(cell.text))
      && !(match.field === 'qty' && matches.some((entry) => entry.field === 'freeQty'))
      && !(match.field === 'description' && matches.some((entry) => entry.field === 'productCode'))
      && !(match.field === 'rate' && matches.some((entry) => ['gstRate', 'cgst', 'sgst'].includes(entry.field))));
    for (const match of filtered) {
      if (columns.some((column) => column.field === match.field)) continue;
      columns.push({ field: match.field, x: cell.x + (filtered.length > 1 ? match.index / Math.max(1, cell.text.length) * cell.width : 0), heading: cell.text });
    }
  }
  return partial || columns.some((column) => column.field === 'description') && columns.some((column) => column.field === 'qty') && columns.some((column) => column.field === 'rate')
    ? columns.sort((a, b) => a.x - b.x) : null;
}

function tableValues(line, columns) {
  const values = {};
  for (const cell of line.cells) {
    const column = [...columns].reverse().find((entry) => {
      // Padding helps slightly left-aligned numbers, but must not pull a
      // right-aligned Qty into the next Unit column or a previous numeric cell
      // into Rate when the entire cell is still left of that heading.
      if (entry.field === 'unit') return cell.x >= entry.x;
      const numeric = ['qty', 'freeQty', 'rate', 'discount', 'gstRate', 'cgst', 'sgst', 'amount'].includes(entry.field);
      return cell.x >= entry.x - 12 && (!numeric || cell.x >= entry.x || cell.x + cell.width > entry.x);
    });
    if (column) {
      values[column.field] = clean(`${values[column.field] || ''} ${cell.text}`);
      if (Number.isFinite(cell.confidence) && cell.confidence < 75 && ['description', 'qty', 'rate', 'discount', 'gstRate'].includes(column.field)) values.uncertainFields = [...new Set([...(values.uncertainFields || []), column.field])];
    }
  }
  return values;
}

function variantDetails(description) {
  const labels = [...description.matchAll(/\b(size|waist|length|colou?r|fit|brand|material|fabric|category|sub\s*category|ram|storage|processor|display|screen|graphics|operating\s*system|pattern|quality|age\s*group)\s*:\s*/gi)];
  const result = { description: labels.length ? clean(description.slice(0, labels[0].index)).replace(/[|;,\s]+$/, '') : description };
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index];
    const field = { size: 'size', waist: 'size', length: 'length', color: 'colour', colour: 'colour', fit: 'type', brand: 'brand', material: 'material', fabric: 'material', category: 'category', subcategory: 'subCategory', ram: 'ram', storage: 'storage', processor: 'processor', display: 'display', screen: 'display', graphics: 'graphics', operatingsystem: 'operatingSystem', pattern: 'pattern', quality: 'quality', agegroup: 'ageGroup' }[label[1].toLowerCase().replace(/\s/g, '')];
    const value = clean(description.slice(label.index + label[0].length, labels[index + 1]?.index)).replace(/[|;,\s]+$/, '');
    const parts = value.split(/\s*\|\s*/);
    result[field] = parts[0];
    // Some garment bills use "Waist: 30 | Length: 32 | Blue".
    if (field === 'length' && parts.length === 2 && parts[1]) result.colour = parts[1];
  }
  if (labels.length) result.itemDescription = clean(description.slice(labels[0].index));
  return result;
}

function tableFooter(line) {
  return /^\s*(?:sub\s*total|grand\s*total|total\b|taxable\s*value\b|net\s*(?:payable|amount)|(?:c|s|i)?gst\b|payment\s*details\b|amount\s*(?:paid|in\s*words)|balance\s*due\b|terms|bank\s*details|round\s*off)/i.test(line.cells.map((cell) => cell.text).join(' '));
}

// A separate, explicit parent block may precede a SKU-only variant table.
// Aggregate size/colour lists in that block describe options, not purchased rows.
function productDetails(lines, start) {
  const parents = [];
  let unit = '';
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^product\s*details\s*:?$/i.test(clean(line.cells.map(cell => cell.text).join(' '))) || tableFooter(line)) break;
    const columns = headerColumns(line, true);
    if (columns.some(column => column.field === 'qty') && columns.some(column => column.field === 'rate')) break;
    if (columns.some(column => column.field === 'description') && columns.some(column => ['brand', 'hsn', 'category'].includes(column.field))) {
      for (let next = index + 1; next < lines.length; next++) {
        const nextColumns = headerColumns(lines[next], true);
        if (nextColumns.some(column => ['variantDetails', 'unit'].includes(column.field)) || tableFooter(lines[next])) break;
        const values = tableValues(lines[next], columns);
        if (!values.description || !['brand', 'category', 'hsn', 'material'].some(field => values[field])) break;
        parents.push(Object.fromEntries(['description', 'brand', 'category', 'hsn', 'material'].filter(field => values[field]).map(field => [field, values[field]])));
      }
    }
    if (columns.some(column => column.field === 'unit') && !columns.some(column => column.field === 'qty') && lines[index + 1]) unit = tableValues(lines[index + 1], columns).unit || unit;
  }
  return parents.length === 1 ? { ...parents[0], unit } : null;
}

function groupedVariantRows(lines, columns) {
  const positioned = lines.map((line, index) => ({ ...tableValues(line, columns), y: Number.isFinite(line.y) ? -line.y : index * 12 }));
  const numbers = positioned.filter((row) => /^\d+[.)]?$/.test(row.groupNumber || ''));
  const groups = positioned.flatMap((row) => {
    const details = variantDetails(clean(row.description));
    return details.description ? [{ ...Object.fromEntries(['brand', 'material', 'category', 'hsn'].filter(field => row[field]).map(field => [field, row[field]])), ...details, y: row.y }] : [];
  });
  if (!groups.length) throw new Error('The grouped variant table has no readable parent product names. Please check the PDF.');
  for (const row of positioned.filter((row) => row.description)) {
    const details = variantDetails(clean(row.description));
    if (details.description) continue;
    const group = [...groups].sort((a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y))[0];
    Object.assign(group, Object.fromEntries(Object.entries(details).filter(([field]) => field !== 'description')));
  }
  groups.forEach((group, index) => { group.center = numbers.length === groups.length ? numbers[index].y : group.y; });
  const rows = positioned.filter((row) => row.variantDetails || pdfQuantity(row.qty).qty !== '' || pdfNumber(row.rate) !== '');
  const numeric = (row) => pdfQuantity(row.qty).qty !== '' || pdfNumber(row.rate) !== '' || /\d/.test(row.amount || '');
  const variants = rows.filter(numeric).map((row) => ({ ...row, fragments: [{ y: row.y, text: row.variantDetails || '' }] }));
  for (const row of rows.filter((row) => !numeric(row))) {
    const closest = [...variants].sort((a, b) => Math.abs(a.y - row.y) - Math.abs(b.y - row.y))[0];
    if (closest && Math.abs(closest.y - row.y) < 20) closest.fragments.push({ y: row.y, text: row.variantDetails || '' });
  }
  for (const row of variants) row.variantDetails = clean(row.fragments.sort((a, b) => a.y - b.y).map((fragment) => fragment.text).join(' '));
  if (variants.length < groups.length) throw new Error('Not all grouped variant rows could be read. Please check the PDF before applying.');
  // A merged serial-number cell marks the centre of its group. Partition the
  // ordered variant rows so each group's centre agrees with that cell. This
  // also handles groups containing different numbers of variants.
  const memo = new Map();
  function partition(groupIndex, start) {
    if (groupIndex === groups.length) return start === variants.length ? { cost: 0, ends: [] } : null;
    const memoKey = `${groupIndex}:${start}`;
    if (memo.has(memoKey)) return memo.get(memoKey);
    let best = null;
    for (let end = start + 1; end <= variants.length - (groups.length - groupIndex - 1); end++) {
      const next = partition(groupIndex + 1, end);
      if (!next) continue;
      const center = (variants[start].y + variants[end - 1].y) / 2;
      const cost = (center - groups[groupIndex].center) ** 2 + next.cost;
      if (!best || cost < best.cost) best = { cost, ends: [end, ...next.ends] };
    }
    memo.set(memoKey, best); return best;
  }
  const assignment = partition(0, 0);
  let groupIndex = 0;
  return variants.map((row, index) => {
    while (index >= assignment.ends[groupIndex]) groupIndex++;
    const group = groups[groupIndex];
    const details = variantDetails(clean(row.variantDetails));
    const attributes = Object.fromEntries(PURCHASE_VARIANT_FIELDS.filter(field => row[field]).map(field => [field, row[field]]));
    return { ...group, ...row, ...details, ...attributes, productType: 'Matrix', description: group.description, brand: row.brand || group.brand || '', material: row.material || group.material || '', hsn: row.hsn || group.hsn || '', itemDescription: clean(row.variantDetails || Object.entries(attributes).map(([field, value]) => `${field}: ${value}`).join(' | ')) };
  });
}

function purchaseItem(values, columns, documentGst) {
  const quantity = pdfQuantity(values.qty);
  const parsed = variantDetails(clean(values.description).replace(/^\d+[.)]\s*/, ''));
  const discountColumn = columns.find((entry) => entry.field === 'discount');
  const gstHeading = columns.find((entry) => entry.field === 'gstRate')?.heading || '';
  const taxAmount = /amount|₹|\b(?:rs|inr)\b/i.test(gstHeading);
  const unspecifiedTax = /^tax$/i.test(clean(gstHeading)) && !/%/.test(values.gstRate || '');
  let gstRate = taxAmount || unspecifiedTax ? '' : pdfNumber(values.gstRate);
  if (gstRate === '' && values.cgst && values.sgst && columns.filter((entry) => ['cgst', 'sgst'].includes(entry.field)).every((entry) => /%|rate/i.test(entry.heading))) gstRate = pdfNumber(values.cgst) + pdfNumber(values.sgst);
  if (gstRate === '') gstRate = documentGst;
  return { ...parsed, ...Object.fromEntries(PURCHASE_VARIANT_FIELDS.map((field) => [field, values[field] || parsed[field] || ''])), productType: values.productType || '', description: parsed.description, productCode: values.productCode || '', barcode: values.barcode || '', hsn: values.hsn || '', brand: values.brand || parsed.brand || '', category: values.category || parsed.category || '', subCategory: values.subCategory || parsed.subCategory || '', itemDescription: values.itemDescription || parsed.itemDescription || '', qty: quantity.qty, unit: values.unit || quantity.unit || 'Nos', rate: pdfNumber(values.rate), discount: values.discount ? pdfNumber(values.discount) : 0, discountType: discountColumn && !/%/.test(discountColumn.heading) ? 'amount' : 'percent', gstRate, sourceAmount: pdfNumber(values.amount), uncertainFields: values.uncertainFields || [] };
}

// Read labels within their own PDF cell before falling back to flattened text.
// This prevents a neighbouring date or buyer block becoming part of the value.
function labelledValue(lines, label, valuePattern = /.+/) {
  for (let index = 0; index < lines.length; index++) {
    const cells = lines[index].cells;
    for (let position = 0; position < cells.length; position++) {
      const match = clean(cells[position].text).match(label);
      if (!match) continue;
      const remainder = clean(cells[position].text.slice(match[0].length)).replace(/^\s*[:#：–—-]+\s*/, '');
      const candidates = remainder ? [remainder] : [
        clean(cells.slice(position + 1).map((cell) => cell.text).join(' ')).replace(/^[:#：–—-]+\s*/, ''),
        ...((lines[index + 1]?.cells || []).filter((cell) => Math.abs(cell.x - cells[position].x) < 80).map((cell) => clean(cell.text))),
      ];
      for (const candidate of candidates) {
        if (/^(?:details|name)$/i.test(candidate)) continue;
        if (/^(?:date|due\s*date|place\s*(?:of\s*supply|:)|invoice|inv\.?\s|bill\s|buyer|bill\s*to|ship\s*to|gstin|supplier|vendor|purchase\s*no|no\.?\s*:)/i.test(candidate)) continue;
        const value = candidate.match(valuePattern)?.[0];
        if (value) return clean(value);
      }
    }
  }
  return '';
}

export function parsePurchasePdfPages(pages) {
  const allLines = pages.flat();
  const textLines = allLines.map((line) => line.cells.map((cell) => cell.text).join(' '));
  const text = textLines.join('\n');
  if (text.replace(/\s/g, '').length < 20) throw new Error('This PDF appears to be scanned or image-only. OCR is required. Please use a PDF with selectable text.');
  const pick = (pattern) => clean(text.match(pattern)?.[1] || '');
  const vendorText = text.split(/bill(?:ed)?\s*to|buyer|ship\s*to/i)[0];
  const vendorLines = [];
  for (const line of allLines) {
    if (line.cells.some((cell) => /^\s*(?:bill(?:ed)?\s*to|buyer|ship\s*to)\b/i.test(cell.text))) break;
    vendorLines.push(line);
  }
  const explicitVendor = labelledValue(vendorLines, /^(?:supplier|vendor|seller|sold\s*by|from)\b(?!\s+(?:invoice|gstin|phone)\b)\s*(?:(?:name|details)\b)?\s*[:：–—-]?\s*/i);
  const headerName = vendorLines.filter((line) => !line.cells.some((cell) => /invoice|\binv\.?\s*(?:no|number|#)|\bbill\s*(?:no|number)|purchase\s*order|gstin|date/i.test(cell.text))).flatMap((line) => line.cells.map((cell) => clean(cell.text))).find((value) => value && /[a-z]/i.test(value) && !/invoice|purchase\s*order|tax\s*bill|gstin|date|\bpage\b|^\s*(?:supplier|vendor|seller|from|phone|email|address|www\.|https?:|\d)/i.test(value));
  const vendorName = clean(explicitVendor || headerName || '');
  const invoiceLabel = /^(?:(?:supplier|vendor)\s+)?(?:invoice|inv\.?|bill)\s*(?:number\b|no\.?\b\.?|#)\s*[:：–—-]?\s*/i;
  const invoiceCandidate = labelledValue(allLines, /^(?:supplier|vendor)\s+invoice\s*:\s*/i, /^[\w][\w/().-]*/)
    || labelledValue(allLines, invoiceLabel, /^[\w][\w/().-]*/)
    || pick(/\b(?:invoice|inv\.?|bill)\s*(?:number\b|no\.?\b\.?|#)\s*[:：–—-]?\s*([\w][\w/().-]*)/i);
  const invoiceNo = /^(?:invoice|date|bill|gstin|buyer|supplier|vendor|purchase|order|no\.?|number)$/i.test(invoiceCandidate) ? '' : invoiceCandidate;
  const poReference = pick(/(?:purchase\s*order|p\.?o\.?)\s*(?:no\.?|number|#)\s*[:-]?\s*([\w/.-]+)/i);
  const datePattern = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})(?=\s|$)/;
  const dateText = labelledValue(allLines, /^(?:invoice\s*date|bill\s*date)\s*[:：–—-]?\s*/i, datePattern)
    || labelledValue(allLines, /^date\s*[:：–—-]?\s*/i, datePattern);
  const gstin = vendorText.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/i)?.[0]?.toUpperCase() || '';
  const totalText = labelledValue(allLines, /^(?:grand\s*total|invoice\s*(?:amount|total)|net\s*(?:payable|amount)|bill\s*total)\s*[:：–—-]?\s*/i, /\d[\d,]*(?:\.\d+)?/);
  const gst = text.match(/\b(?:IGST|GST)\s*(?:@|rate\s*[:-]?)?\s*(\d+(?:\.\d+)?)\s*%/i);
  const cgst = text.match(/\bCGST\s*(?:@)?\s*(\d+(?:\.\d+)?)\s*%/i);
  const sgst = text.match(/\bSGST\s*(?:@)?\s*(\d+(?:\.\d+)?)\s*%/i);
  const documentGst = gst ? Number(gst[1]) : cgst && sgst ? Number(cgst[1]) + Number(sgst[1]) : '';
  const warnings = [];
  if (!explicitVendor) warnings.push('Vendor name was inferred from the document header. Verify it before applying.');
  if (!invoiceNo) warnings.push('No supplier invoice number found. A purchase-order reference is not a supplier invoice number.');
  if (!pdfDate(dateText)) warnings.push('Invoice date was not recognized. Enter or confirm it below.');
  const items = [];
  let unassignedRows = 0;
  for (const [pageIndex, lines] of pages.entries()) {
    let columns = null;
    let pending = null;
    let parent = null;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (/^product\s*details\s*:?$/i.test(clean(line.cells.map(cell => cell.text).join(' ')))) {
        parent = productDetails(lines, index); columns = null; pending = null;
        continue;
      }
      const header = headerColumns(line);
      const candidates = headerColumns(line, true);
      const variantOnly = !header && candidates.some(column => column.field === 'productCode')
        && candidates.some(column => PURCHASE_VARIANT_FIELDS.includes(column.field))
        && ['qty', 'rate'].every(field => candidates.some(column => column.field === field));
      if (variantOnly) {
        if (!parent) throw new Error('The variant table has no single unambiguous Product Details parent. Confirm the product before applying.');
        let end = index + 1;
        while (end < lines.length && !tableFooter(lines[end]) && !headerColumns(lines[end]) && !/^product\s*details\s*:?$/i.test(clean(lines[end].cells.map(cell => cell.text).join(' ')))) end++;
        for (const row of lines.slice(index + 1, end)) {
          const values = tableValues(row, candidates);
          if (!values.productCode && pdfQuantity(values.qty).qty === '' && pdfNumber(values.rate) === '') continue;
          items.push({ ...purchaseItem({ ...parent, ...values, description: parent.description, productType: 'Matrix' }, candidates, documentGst), sourcePage: pageIndex + 1 });
        }
        index = end - 1; columns = null; pending = null; parent = null;
        continue;
      }
      if (header) {
        parent = null;
        columns = header;
        let end = index + 1;
        while (end < lines.length && !headerColumns(lines[end]) && !tableFooter(lines[end])) end++;
        const tableRows = lines.slice(index + 1, end).map(row => tableValues(row, columns));
        const separateVariants = columns.some(column => PURCHASE_VARIANT_FIELDS.includes(column.field))
          && tableRows.some(row => !clean(row.description) && (pdfQuantity(row.qty).qty !== '' || pdfNumber(row.rate) !== ''))
          && tableRows.some(row => clean(row.description));
        if (columns.some((column) => column.field === 'variantDetails') || separateVariants) {
          items.push(...groupedVariantRows(lines.slice(index + 1, end), columns).map((values) => ({ ...purchaseItem(values, columns, documentGst), sourcePage: pageIndex + 1 })));
          index = end - 1; columns = null;
        }
        continue;
      }
      // Some bills place Qty / Unit on one line and Price on the next.
      const partial = headerColumns(line, true);
      if (!columns && partial.some((entry) => entry.field === 'description') && partial.some((entry) => entry.field === 'qty') && lines[index + 1]) {
        const next = lines[index + 1];
        const combined = line.cells.map((cell) => ({ ...cell, text: `${cell.text} ${next.cells.filter((other) => Math.abs(other.x - cell.x) < 20).map((other) => other.text).join(' ')}` }));
        const splitHeader = headerColumns({ cells: combined });
        if (splitHeader) { columns = splitHeader; index++; continue; }
      }
      if (tableFooter(line)) { columns = null; pending = null; parent = null; continue; }
      if (!columns) continue;
      let values = tableValues(line, columns);
      const rawDescription = clean(values.description).replace(/^\d+[.)]\s*/, '');
      const details = variantDetails(rawDescription);
      const hasNumbers = pdfNumber(values.qty) !== '' || pdfNumber(values.rate) !== '' || /\d/.test(values.amount || '') || Boolean(values.productCode);
      if (!hasNumbers && rawDescription) {
        if (details.itemDescription && !details.description) {
          const target = pending || items.at(-1);
          if (target) Object.assign(target, details, { description: target.description });
          continue;
        }
        const next = lines[index + 1] && tableValues(lines[index + 1], columns);
        // Vertically centred numeric cells may lie between the product name
        // and its size/colour line rather than sharing either text baseline.
        if (pending || !items.length || next && !next.description && (next.qty || next.rate || next.productCode)) {
          pending = { ...pending, ...values, ...details, description: clean(`${pending?.description || ''} ${details.description}`) };
        } else items.at(-1).description += ` ${rawDescription}`;
        continue;
      }
      if (pending) { values = { ...pending, ...values, description: clean(`${pending.description} ${rawDescription}`) }; pending = null; }
      const qty = pdfQuantity(values.qty).qty;
      const rate = pdfNumber(values.rate);
      const parsed = variantDetails(clean(values.description).replace(/^\d+[.)]\s*/, ''));
      const description = parsed.description;
      if (!description) { if (hasNumbers) unassignedRows++; continue; }
      if (qty === '' && rate === '' && items.length && !/\d/.test(values.amount || '')) {
        items[items.length - 1].description += ` ${description}`;
        continue;
      }
      items.push({ ...purchaseItem(values, columns, documentGst), sourcePage: pageIndex + 1 });
    }
  }
  if (unassignedRows) throw new Error(`${unassignedRows} purchased row(s) could not be associated with a product. Automatic layout analysis is required to preserve all variants.`);
  if (!items.length) throw new Error('No item table could be recognized. Use a text PDF with Product/Description, Qty and Rate column headings. Your current entry has not changed.');
  if (items.some((item) => item.qty === '' || item.rate === '' || item.gstRate === '')) warnings.push('Some quantities, rates or GST rates are uncertain. Complete highlighted fields before applying.');
  const charges = [];
  for (const line of textLines) {
    const match = line.match(/^\s*(freight|packing|insurance|shipping|transport|loading(?:\s*\/\s*unloading)?)\s*[:-]?\s+(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*$/i);
    if (match) charges.push({ label: match[1], amount: pdfNumber(match[2]), gstRate: '' });
  }
  return { vendor: { name: vendorName, gstin }, invoiceNo, poReference, date: pdfDate(dateText), invoiceAmount: pdfNumber(totalText), items: classifyPurchaseRows(items), charges, warnings };
}

export function matchPurchaseImport(data, products, vendors) {
  const vendorMatches = vendors.filter((vendor) => data.vendor.gstin ? key(vendor.gstin) === key(data.vendor.gstin) : key(vendor.name) === key(data.vendor.name));
  return { ...data, vendorMatch: vendorMatches.length === 1 ? vendorMatches[0] : null,
    items: data.items.map((row) => {
      const barcodeMatches = row.barcode ? products.filter((product) => key(product.barcode) === key(row.barcode) || product.variants?.some((variant) => key(variant.barcode) === key(row.barcode))) : [];
      const codeMatches = row.productCode ? products.filter((product) => [product.code, product.sku].some((code) => code && key(code) === key(row.productCode)) || product.variants?.some((variant) => [variant.modelCode, variant.sku].some((code) => code && key(code) === key(row.productCode)))) : [];
      const identityConflict = barcodeMatches.length && codeMatches.length && !barcodeMatches.some((product) => codeMatches.includes(product));
      const matches = identityConflict ? [...new Set([...barcodeMatches, ...codeMatches])] : barcodeMatches.length ? barcodeMatches : codeMatches.length ? codeMatches : products.filter((product) => [product.description, product.name].some((name) => name && key(name) === key(row.description)) && (!row.brand || !product.brand || key(product.brand) === key(row.brand)));
      const product = matches.length === 1 ? matches[0] : null;
      const catalogVariants = product?.variants || [];
      const barcodeVariants = row.barcode ? catalogVariants.filter((variant) => key(variant.barcode) === key(row.barcode)) : [];
      const codeVariants = row.productCode ? catalogVariants.filter((variant) => [variant.modelCode, variant.sku].some((code) => code && key(code) === key(row.productCode))) : [];
      const attributes = PURCHASE_VARIANT_FIELDS.filter((field) => row[field]);
      const variantValue = (variant, field) => field === 'size' ? variant.size || variant.modelName : field === 'colour' ? variant.colour || variant.color : field === 'material' ? variant.material || product?.material : variant[field];
      const attributeKey = (field, value) => ['ram', 'storage'].includes(field) ? key(value).replace(/\s/g, '') : key(value);
      const fits = (variant) => attributes.some((field) => attributeKey(field, variantValue(variant, field)) === attributeKey(field, row[field])) && attributes.every((field) => field === 'material' && !variantValue(variant, field) || attributeKey(field, variantValue(variant, field)) === attributeKey(field, row[field]));
      const variants = barcodeVariants.length ? barcodeVariants : codeVariants.length ? codeVariants : catalogVariants.filter((variant) => !row.barcode && attributes.length && fits(variant));
      const variantConflict = barcodeVariants.length && codeVariants.length && !barcodeVariants.some((variant) => codeVariants.includes(variant)) || (barcodeVariants.length || codeVariants.length) && variants.some((variant) => attributes.some((field) => variantValue(variant, field) && attributeKey(field, variantValue(variant, field)) !== attributeKey(field, row[field])));
      const missingIdentity = catalogVariants.length && !attributes.length && !barcodeVariants.length && !codeVariants.length;
      const variant = variants.length === 1 && !variantConflict ? variants[0] : null;
      return { ...row, ...Object.fromEntries(PURCHASE_VARIANT_FIELDS.map((field) => [field, row[field] || variant?.[field] || ''])), productType: variant || product?.productType === 'Matrix' || row.productType === 'Matrix' ? 'Matrix' : 'Standard', productId: product?._id || product?.id || null, variantId: variant?._id, modelCode: (hasVariantAttributes(row) ? row.productCode : '') || variant?.modelCode || row.modelCode || '', matchLabel: product ? variant ? 'Matched product and variant' : product.variants?.length ? variants.length > 1 || variantConflict || missingIdentity ? 'Ambiguous variant — review' : 'New variant — review' : 'Matched product' : matches.length > 1 ? 'Ambiguous product — review' : 'New product — review',
        barcode: row.barcode || variant?.barcode || (!product?.variants?.length && !hasVariantAttributes(row) ? product?.barcode : '') || '',
        hsn: row.hsn || product?.hsn || '', brand: row.brand || product?.brand || '', size: row.size || variant?.size || variant?.modelName || '', length: row.length || variant?.length || '', colour: row.colour || variant?.colour || variant?.color || '', type: row.type || variant?.type || '', material: row.material || variant?.material || '' };
    }) };
}

// Keep model output outside the form until every field has a known type.
export function normalizePurchaseAnalysis(raw) {
  if (!raw || !Array.isArray(raw.items) || !raw.items.length) throw new Error('No purchase products could be identified in this PDF.');
  const text = (value) => typeof value === 'string' || typeof value === 'number' ? clean(value) : '';
  const number = (value, max = Infinity) => {
    const parsed = value == null ? '' : pdfNumber(value);
    return parsed !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : '';
  };
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((entry) => typeof entry === 'string').map(clean) : [];
  const items = raw.items.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error('PDF analysis returned an invalid product row. Please retry.');
    const item = Object.fromEntries(['description', 'productCode', 'barcode', 'hsn', 'brand', 'category', 'subCategory', ...PURCHASE_VARIANT_FIELDS, 'itemDescription'].map((field) => [field, text(row[field])]));
    item.productType = row.productType === 'Matrix' ? 'Matrix' : 'Standard';
    const quantity = pdfQuantity(row.qty ?? row.quantity);
    Object.assign(item, { unit: text(row.unit) || quantity.unit || 'Nos', qty: number(quantity.qty), rate: number(row.rate), discount: row.discount === undefined ? 0 : number(row.discount), discountType: row.discountType === 'amount' ? 'amount' : 'percent', gstRate: number(row.gstRate, 100), sourceAmount: number(row.sourceAmount), sourcePage: Number.isInteger(row.sourcePage) ? row.sourcePage : null });
    item.uncertainFields = Array.isArray(row.uncertainFields) ? [...new Set(row.uncertainFields.filter((field) => typeof field === 'string' && Object.hasOwn(item, field)))] : [];
    for (const field of item.uncertainFields) item[field] = '';
    if (!item.description || item.qty === '' || item.rate === '' || item.gstRate === '' || item.discount === '') warnings.push(`Item ${index + 1}: confirm the highlighted missing or uncertain fields.`);
    if (item.sourceAmount !== '' && item.qty !== '' && item.rate !== '' && item.discount !== '') {
      const net = item.qty * item.rate - (item.discountType === 'amount' ? item.discount : item.qty * item.rate * item.discount / 100);
      const taxed = item.gstRate === '' ? net : net * (1 + item.gstRate / 100);
      if (Math.min(Math.abs(net - item.sourceAmount), Math.abs(taxed - item.sourceAmount)) > Math.max(1, item.sourceAmount * 0.001)) warnings.push(`Item ${index + 1}: quantity, rate and discount do not match the printed amount (${item.sourceAmount}). Check this row.`);
    }
    return item;
  });
  const vendor = Object.fromEntries(['name', 'gstin', 'address', 'phone', 'email'].map((field) => [field, text(raw.vendor?.[field])]));
  vendor.gstin = vendor.gstin.toUpperCase();
  for (const field of ['address', 'phone', 'email']) if (!vendor[field]) delete vendor[field];
  const additionalDiscount = { type: raw.additionalDiscount?.type === 'percent' ? 'percent' : 'amount', value: raw.additionalDiscount ? number(raw.additionalDiscount.value) : 0 };
  const tds = { enabled: raw.tds?.enabled === true, section: text(raw.tds?.section), rate: raw.tds?.enabled === true ? number(raw.tds.rate, 100) : 0 };
  const tcs = { enabled: raw.tcs?.enabled === true, rate: raw.tcs?.enabled === true ? number(raw.tcs.rate, 100) : 0 };
  return { vendor, invoiceNo: text(raw.invoiceNo), poReference: text(raw.poReference), date: pdfDate(text(raw.date)), invoiceAmount: number(raw.invoiceAmount), additionalDiscount, tds, tcs, items: classifyPurchaseRows(items),
    charges: (Array.isArray(raw.charges) ? raw.charges : []).filter((row) => row && typeof row === 'object').map((row) => ({ label: text(row.label), amount: number(row.amount), gstRate: number(row.gstRate, 100) })), warnings: [...new Set(warnings)] };
}

export function purchasePageText(lines) {
  // Coordinates retain column structure even when headings differ or cells merge.
  return lines.map((line) => `[y=${Math.round(line.y)}] ${line.cells.map((cell) => `[x=${Math.round(cell.x)}] ${cell.text}`).join(' | ')}`).join('\n');
}

// PDF images are painted into a unit square under the current transformation.
// Original bitmap resolution says nothing about its size on the invoice.
export function purchasePageNeedsVision(operators, ops, pageWidth, pageHeight) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const multiply = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  const sizeable = value => {
    const corners = [[0,0], [1,0], [0,1], [1,1]].map(([x,y]) => [value[0]*x+value[2]*y+value[4], value[1]*x+value[3]*y+value[5]]);
    const width = Math.max(0, Math.min(pageWidth, Math.max(...corners.map(point => point[0]))) - Math.max(0, Math.min(...corners.map(point => point[0]))));
    const height = Math.max(0, Math.min(pageHeight, Math.max(...corners.map(point => point[1]))) - Math.max(0, Math.min(...corners.map(point => point[1]))));
    return width * height >= pageWidth * pageHeight * .15 || width >= pageWidth * .5 && height >= pageHeight * .12;
  };
  for (let index = 0; index < operators.fnArray.length; index++) {
    const operator = operators.fnArray[index], args = operators.argsArray[index];
    if (operator === ops.save) stack.push([...matrix]);
    else if (operator === ops.restore) matrix = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (operator === ops.transform) matrix = multiply(matrix, args);
    else if (operator === ops.paintImageXObject || operator === ops.paintInlineImageXObject) {
      if (sizeable(matrix)) return true;
    } else if (operator === ops.paintImageXObjectRepeat) {
      const [, scaleX, scaleY, positions] = args;
      for (let position = 0; position < positions.length; position += 2) {
        if (sizeable(multiply(matrix, [scaleX, 0, 0, scaleY, positions[position], positions[position + 1]]))) return true;
      }
    }
  }
  return false;
}

export function reconcilePurchaseQuantities(local, analyzed) {
  if (!local?.items?.length) return analyzed;
  const known = value => value !== '' && value != null && Number.isFinite(Number(value));
  const sameIdentity = (left, right) => {
    if (left.sourcePage && right.sourcePage && left.sourcePage !== right.sourcePage) return false;
    for (const field of ['barcode', 'productCode', 'brand', ...PURCHASE_VARIANT_FIELDS]) if (left[field] && right[field] && key(left[field]) !== key(right[field])) return false;
    if (left.barcode && right.barcode) return key(left.barcode) === key(right.barcode);
    if (left.productCode && right.productCode) return key(left.productCode) === key(right.productCode);
    return Boolean(left.description) && key(left.description) === key(right.description)
      && PURCHASE_VARIANT_FIELDS.every(field => key(left[field]) === key(right[field]));
  };
  const warnings = [...analyzed.warnings];
  const items = analyzed.items.map((row, index) => {
    const candidates = local.items.filter(item => sameIdentity(item, row));
    if (candidates.length !== 1) return row;
    const printed = candidates[0];
    if (analyzed.items.filter(item => sameIdentity(printed, item)).length !== 1) return row;
    if (!['qty', 'rate', 'discount', 'gstRate', 'sourceAmount'].every(field => known(printed[field])) || printed.qty <= 0 || printed.rate <= 0) return row;
    // Only corroborate the same row. Do not transfer a quantity when prices,
    // discounts or printed amounts disagree, or infer it by division.
    if (!['rate', 'discount', 'gstRate'].every(field => known(row[field]) && Math.abs(row[field] - printed[field]) < .01) || row.discountType !== printed.discountType) return row;
    if (known(row.sourceAmount) && Math.abs(row.sourceAmount - printed.sourceAmount) > .51) return row;
    const gross = printed.qty * printed.rate;
    const net = gross - (printed.discountType === 'amount' ? printed.discount : gross * printed.discount / 100);
    if (Math.min(Math.abs(net - printed.sourceAmount), Math.abs(net * (1 + printed.gstRate / 100) - printed.sourceAmount)) > .51) return row;
    if (!known(row.qty)) {
      warnings.push(`Item ${index + 1}: quantity ${printed.qty} was recovered from the readable Qty cell and checked against the printed line amount. Review it against the PDF.`);
      return { ...row, qty: printed.qty, quantitySource: 'pdf-text-checked', uncertainFields: (row.uncertainFields || []).filter(field => field !== 'qty') };
    }
    if (Math.abs(row.qty - printed.qty) >= .000001) {
      warnings.push(`Item ${index + 1}: visual quantity ${row.qty} disagrees with readable Qty ${printed.qty}. Confirm the quantity against the PDF.`);
      return { ...row, qty: '', uncertainFields: [...new Set([...(row.uncertainFields || []), 'qty'])] };
    }
    return row;
  });
  const currentWarnings = warnings.filter(warning => {
    if (/^Quantity is missing or uncertain in item\(s\)/.test(warning)) return items.some(row => !known(row.qty) || row.qty <= 0 || row.uncertainFields?.includes('qty'));
    const genericMissing = warning.match(/^Item (\d+): confirm the highlighted missing or uncertain fields\.$/);
    if (genericMissing) {
      const row = items[Number(genericMissing[1]) - 1];
      return !row || !['qty', 'rate', 'discount', 'gstRate'].every(field => known(row[field])) || row.uncertainFields?.length;
    }
    return true;
  });
  return { ...analyzed, items, warnings: [...new Set(currentWarnings)] };
}

export async function analysePurchasePages(pages, { service, renderPage, recognizePages, needsVision, onProgress = () => {} }) {
  let local, localError;
  try { local = parsePurchasePdfPages(pages); } catch (error) { localError = error; }
  const sparse = needsVision || pages.map((lines) => lines.flatMap((line) => line.cells.map((cell) => cell.text)).join('').replace(/\s/g, '').length < 20);
  let capabilities, capabilityError;
  try { capabilities = await service.purchasePdfCapabilities(); } catch (error) { capabilityError = error; }
  const fallback = async (message) => {
    if (local && !sparse.some(Boolean)) return { ...local, warnings: [...local.warnings, message, 'Automatic visual verification was unavailable. These text-extracted fields require review.'] };
    if (recognizePages) {
      const recognized = await recognizePages(pages.map((_, index) => sparse[index] || !local));
      if (recognized.length !== pages.length || recognized.some(lines => !lines.some(line => line.cells.some(cell => cell.text.trim())))) throw new Error('Some PDF pages could not be read locally. Upload a clearer PDF; no partial purchase was applied.');
      let result;
      try { result = parsePurchasePdfPages(recognized); }
      catch (error) { throw new Error(`Local PDF reading could not identify the complete item table. ${error.message} Please upload a clearer PDF or enter these details manually.`, { cause: error }); }
      return { ...result, warnings: [...result.warnings, 'Read using local OCR. Compare every product, variant, quantity, price and tax with the PDF before applying.'] };
    }
    throw new Error(message);
  };
  if (!capabilities?.enabled) {
    if (local && !sparse.some(Boolean)) return { ...local, warnings: [...local.warnings, 'Automatic visual verification is not enabled. These text-extracted fields require review.'] };
    const reason = localError && !sparse.some(Boolean) ? `${localError.message} ` : '';
    return fallback(capabilityError
      ? 'Automatic PDF reading is temporarily unavailable. Please try again shortly. Your purchase entry has not changed.'
      : `${reason}Automatic reading for scanned or complex PDFs is not enabled. Use a selectable-text PDF, enter the purchase details manually, or contact your administrator. Your purchase entry has not changed.`);
  }
  const extract = async (useImages) => {
    const results = [];
    const textSize = pages.reduce((sum, lines) => sum + purchasePageText(lines).length, 0);
    const batchSize = useImages || textSize > 180000 ? 3 : pages.length;
    for (let start = 0; start < pages.length; start += batchSize) {
      onProgress(`${useImages ? 'Checking pages' : 'Checking PDF'} ${start + 1}-${Math.min(start + batchSize, pages.length)}...`);
      const batch = [];
      for (let index = start; index < Math.min(start + batchSize, pages.length); index++) batch.push({ number: index + 1, text: purchasePageText(pages[index]), ...(useImages ? { image: await renderPage(index + 1) } : {}) });
      const previous = results.at(-1);
      const context = previous ? JSON.stringify({ vendor: results[0].vendor, lastProduct: previous.items?.at(-1) }).slice(0, 6000) : '';
      const response = await service.analysePurchasePdf({ pages: batch, context });
      if (!response?.data || !Array.isArray(response.data.items)) throw new Error('PDF analysis returned incomplete purchase details.');
      results.push(response.data);
    }
    const metadata = (field) => results.map((result) => result[field]).find((value) => value != null && value !== '');
    return normalizePurchaseAnalysis({ ...results[0], vendor: results.find((result) => result.vendor?.name)?.vendor || {},
      invoiceNo: metadata('invoiceNo'), poReference: metadata('poReference'), date: metadata('date'), invoiceAmount: [...results].reverse().map((result) => result.invoiceAmount).find((value) => value != null && value !== ''),
      additionalDiscount: [...results].reverse().map((result) => result.additionalDiscount).find((discount) => discount && Number(discount.value) !== 0) || { type: 'amount', value: 0 },
      tds: [...results].reverse().map((result) => result.tds).find((tax) => tax?.enabled), tcs: [...results].reverse().map((result) => result.tcs).find((tax) => tax?.enabled),
      items: results.flatMap((result) => result.items), charges: results.flatMap((result) => result.charges || []), warnings: results.flatMap((result) => result.warnings || []) });
  };
  try {
    let result;
    // Read the visual layout for every document, including selectable-text PDFs:
    // merged cells and group boundaries cannot be verified from text alone.
    if (renderPage) result = await extract(true);
    else {
      try { result = await extract(false); }
      catch (error) {
        // An image-backed bill can have selectable headers but no item text.
        if (local || !renderPage || !/No purchase products|incomplete purchase details/.test(error.message)) throw error;
        result = await extract(true);
      }
    }
    if (local && result.items.length !== local.items.length) result.warnings.push(`The visual analysis found ${result.items.length} rows; the text parser found ${local.items.length}. Check the row count against the PDF.`);
    return reconcilePurchaseQuantities(local, result);
  } catch (error) { return fallback(`${error.message || localError?.message || 'Unable to analyse this PDF.'} Check extracted fields before applying.`); }
}

export async function readPurchasePdf(file, { onProgress = () => {} } = {}) {
  if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Choose a PDF file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('PDF must be 10 MB or smaller.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-')) throw new Error('This file is not a valid PDF.');
  const pdfjs = await import('pdfjs-dist');
  // Bundle the module worker as JavaScript instead of copying a raw .mjs asset.
  // Some production hosts serve .mjs as application/octet-stream, which browsers reject.
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 30) throw new Error('Upload a purchase bill with 30 pages or fewer.');
    const pages = [];
    const needsVision = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = (await page.getTextContent()).items;
      pages.push(pdfTextLines(content));
      const operators = await page.getOperatorList();
      const viewport = page.getViewport({ scale: 1 });
      needsVision.push(!content.some(item => item.str?.trim()) || purchasePageNeedsVision(operators, pdfjs.OPS, viewport.width, viewport.height));
      page.cleanup();
    }
    const renderPage = async (number) => {
      const page = await pdf.getPage(number);
      const initial = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 2200 / Math.max(initial.width, initial.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.88);
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
    };
    // Uploads use the local text/OCR path without depending on backend or AI
    // availability. Existing cloud analysis endpoints remain optional.
    return await analysePurchasePages(pages, { service: { purchasePdfCapabilities: async () => ({ enabled: false }) }, onProgress, needsVision, renderPage, recognizePages: async selected => {
      const { createPurchaseOcr } = await import('./purchasePdfOcr.js');
      let reader;
      try {
        reader = await createPurchaseOcr(onProgress);
        const result = [];
        for (let index = 0; index < pages.length; index++) result.push(selected[index] ? await reader.recognize(await renderPage(index + 1), index + 1) : pages[index]);
        return result;
      } catch (error) { throw new Error(`Could not finish local PDF reading. ${error.message || 'Refresh and retry.'} Your purchase entry has not changed.`, { cause: error }); }
      finally { await reader?.terminate(); }
    } });
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('This PDF is password-protected. Upload an unlocked copy.', { cause: error });
    if (['InvalidPDFException', 'MissingPDFException'].includes(error.name)) throw new Error('This PDF is damaged or unreadable. Please upload another copy.', { cause: error });
    throw error;
  } finally { await task.destroy(); }
}
