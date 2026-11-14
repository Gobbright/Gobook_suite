import test from 'node:test';
import assert from 'node:assert/strict';
import { analysePurchasePages, normalizePurchaseAnalysis, matchPurchaseImport, parsePurchasePdfPages, pdfDate, pdfNumber, pdfTextLines, pdfQuantity, reconcilePurchaseQuantities, purchasePageNeedsVision } from '../src/utils/purchasePdfImport.js';
import { purchaseImportIssues } from '../src/utils/purchasePdfValidation.js';

const line = (values) => ({ cells: values.map(([text, x]) => ({ text, x, width: text.length * 5 })) });
const header = () => line([['Description', 40], ['HSN', 180], ['Qty', 240], ['Unit', 280], ['Rate', 340], ['Disc %', 400], ['GST %', 460], ['Amount', 520]]);
const item = (description, qty = '2', rate = '100', gst = '5%') => line([[description, 40], ['5208', 180], [qty, 240], ['Nos', 280], [rate, 340], ['10', 400], [gst, 460], ['180', 520]]);
const page = () => [line([['Supplier: Lakshmi Textiles', 40]]), line([['GSTIN: 33ABCDE1234F1Z5', 40]]), line([['Invoice No: SUP-101', 40]]), line([['Invoice Date: 04/11/2026', 40]]), header(), item('Cotton Saree'), line([['Grand Total: 189.00', 40]])];

const aiBill = (overrides = {}) => ({ vendor: { name: 'Supplier' }, invoiceNo: 'AI-1', date: '2026-11-04', items: [{ description: 'Plain Product', productCode: '00123', qty: 2, rate: 100, gstRate: 5, sourceAmount: 200 }], charges: [], warnings: [], ...overrides });

test('scan detection uses displayed image area instead of logo bitmap resolution', () => {
  const ops = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintInlineImageXObject: 5, paintImageXObjectRepeat: 6 };
  const operators = { fnArray: [1, 3, 4, 2], argsArray: [[], [80, 0, 0, 40, 40, 740], ['logo', 2400, 1200], []] };
  assert.equal(purchasePageNeedsVision(operators, ops, 600, 840), false);
  operators.argsArray[1] = [520, 0, 0, 400, 40, 200];
  assert.equal(purchasePageNeedsVision(operators, ops, 600, 840), true);
  const repeated = { fnArray: [6], argsArray: [['scan', 520, 400, [40, 200]]] };
  assert.equal(purchasePageNeedsVision(repeated, ops, 600, 840), true);
  repeated.argsArray[0] = ['logo', 80, 40, [40, 740]];
  assert.equal(purchasePageNeedsVision(repeated, ops, 600, 840), false);
});

test('a readable unsupported table reports the parser failure when automatic analysis is disabled', async () => {
  await assert.rejects(analysePurchasePages([[line([['Supplier: Sample invoice without a recognized table', 40]])]], {
    service: { purchasePdfCapabilities: async () => ({ enabled: false }) }, needsVision: [false],
  }), /No item table could be recognized/);
});

test('explicit quantity-unit cells normalize without interpreting packs or dimensions as quantities', () => {
  assert.deepEqual(pdfQuantity('12 Nos'), { qty: 12, unit: 'Nos' });
  assert.deepEqual(pdfQuantity('2.5 kg'), { qty: 2.5, unit: 'kg' });
  assert.deepEqual(pdfQuantity('1,200pcs'), { qty: 1200, unit: 'pcs' });
  for (const value of ['2 x 12', '12 + 2', '6/12', '12 GB', 'unreadable', null]) assert.equal(pdfQuantity(value).qty, '');
  const normalized = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Product', quantity: '12 Nos', rate: 100, gstRate: 5 }] }));
  assert.equal(normalized.items[0].qty, 12); assert.equal(normalized.items[0].unit, 'Nos');
});

test('right-aligned Qty stays out of the next Unit column and does not take Free Qty', () => {
  const result = parsePurchasePdfPages([[header(), line([['Product', 40], ['5208', 180], ['12', 269], ['Nos', 280], ['100', 340], ['0', 400], ['5%', 460], ['1200', 520]])]]);
  assert.equal(result.items[0].qty, 12); assert.equal(result.items[0].unit, 'Nos');
  const free = parsePurchasePdfPages([[line([['Description', 40], ['Qty', 220], ['Free Qty', 280], ['Unit', 320], ['Rate', 370], ['GST %', 460], ['Amount', 520]]), line([['Product', 40], ['2', 220], ['5', 280], ['Nos', 320], ['100', 370], ['0%', 460], ['200', 520]])]]);
  assert.equal(free.items[0].qty, 2);
});

test('inline decimal quantity units are retained from the actual item table', () => {
  const result = parsePurchasePdfPages([[line([['Description', 40], ['Qty', 240], ['Rate', 340], ['GST %', 460], ['Amount', 520]]), line([['Measured product', 40], ['2.5 kg', 240], ['100', 340], ['0%', 460], ['250', 520]])]]);
  assert.equal(result.items[0].qty, 2.5); assert.equal(result.items[0].unit, 'kg');
});

test('missing visual quantity recovers only from a unique matching printed row with reconciled amounts', async () => {
  const service = { purchasePdfCapabilities: async () => ({ enabled: true }), analysePurchasePdf: async () => ({ data: aiBill({ invoiceAmount: 189, items: [{ description: 'Cotton Saree', qty: null, rate: 100, discount: 10, discountType: 'percent', gstRate: 5, sourceAmount: 180, sourcePage: 1, uncertainFields: ['qty'] }] }) }) };
  const result = await analysePurchasePages([page()], { service, renderPage: async () => 'image' });
  assert.equal(result.items[0].qty, 2); assert.equal(result.items[0].quantitySource, 'pdf-text-checked');
  assert.deepEqual(result.items[0].uncertainFields, []); assert.deepEqual(purchaseImportIssues(result), []);
});

test('ambiguous rows, different variants and different rates never borrow another product quantity', () => {
  const local = parsePurchasePdfPages([page()]);
  const missing = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Cotton Saree', qty: null, rate: 100, discount: 10, gstRate: 5, sourceAmount: 180 }] }));
  assert.equal(reconcilePurchaseQuantities({ ...local, items: [local.items[0], local.items[0]] }, missing).items[0].qty, '');
  const differentRate = structuredClone(missing); differentRate.items[0].rate = 200;
  assert.equal(reconcilePurchaseQuantities(local, differentRate).items[0].qty, '');
  const differentVariant = structuredClone(missing); differentVariant.items[0].size = 'XL';
  assert.equal(reconcilePurchaseQuantities(local, differentVariant).items[0].qty, '');
  const unknownAmount = structuredClone(local); unknownAmount.items[0].sourceAmount = '';
  assert.equal(reconcilePurchaseQuantities(unknownAmount, missing).items[0].qty, '');
});

test('conflicting quantities and missing critical columns are blocking review issues', () => {
  const local = parsePurchasePdfPages([page()]);
  const conflict = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Cotton Saree', qty: 3, rate: 100, discount: 10, gstRate: 5, sourceAmount: 180 }] }));
  const result = reconcilePurchaseQuantities(local, conflict);
  assert.equal(result.items[0].qty, '');
  assert.ok(purchaseImportIssues(result).some(issue => issue.fields.includes('qty')));
  const missing = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Product', qty: null, rate: 100, gstRate: 5 }] }));
  assert.ok(purchaseImportIssues(missing).some(issue => /quantity.*missing/.test(issue.message)));
});

test('layout-independent checks reject shifted amounts, metadata products and mismatched invoice totals', () => {
  const valid = normalizePurchaseAnalysis(aiBill({ invoiceAmount: 210 }));
  assert.deepEqual(purchaseImportIssues(valid), []);
  valid.items[0].sourceAmount = 210;
  assert.deepEqual(purchaseImportIssues(valid), []); // Tax-inclusive line totals are valid too.
  valid.items[0].rate = 200;
  assert.ok(purchaseImportIssues(valid).some((issue) => issue.row === 0 && issue.fields.includes('rate')));
  valid.items[0].rate = 100; valid.items[0].description = 'Category: Mobile Phone';
  assert.ok(purchaseImportIssues(valid).some((issue) => issue.fields.includes('description')));
  valid.items[0].description = 'Phone'; valid.invoiceAmount = 200;
  assert.ok(purchaseImportIssues(valid).some((issue) => issue.fields.includes('invoiceAmount')));
});

test('invoice checks account for taxable charges, global discounts and currency rounding', () => {
  const valid = normalizePurchaseAnalysis(aiBill({ charges: [{ label: 'Freight', amount: 10, gstRate: 18 }], additionalDiscount: { type: 'amount', value: 20 }, invoiceAmount: 202 }));
  assert.deepEqual(purchaseImportIssues(valid), []); // 210 + 11.8 - 20 = 201.8, rounded to 202.
  valid.additionalDiscount = { type: 'percent', value: 10 }; valid.invoiceAmount = 200;
  assert.deepEqual(purchaseImportIssues(valid), []); // 221.8 * .9 = 199.62.
  valid.additionalDiscount.value = 200;
  assert.ok(purchaseImportIssues(valid).some((issue) => issue.fields.includes('additionalDiscount')));
  const statutory = normalizePurchaseAnalysis(aiBill({ invoiceAmount: 208, tds: { enabled: true, rate: 2, section: '194C' }, tcs: { enabled: true, rate: 1 } }));
  assert.deepEqual(purchaseImportIssues(statutory), []);
  statutory.tds.section = '';
  assert.ok(purchaseImportIssues(statutory).some((issue) => issue.fields.includes('tds')));
});

test('uncertain model fields stay empty and remain blocked until explicitly corrected', () => {
  const data = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Guessed parent', brand: 'Guessed brand', qty: 2, rate: 100, gstRate: 5, uncertainFields: ['description', 'brand', 'unknownField'] }] }));
  assert.equal(data.items[0].description, ''); assert.equal(data.items[0].brand, '');
  assert.deepEqual(data.items[0].uncertainFields, ['description', 'brand']);
  assert.ok(purchaseImportIssues(data).some((issue) => issue.fields.includes('brand')));
});

test('product classification keeps standalone specifications standard and groups genuinely different variants', () => {
  const standalone = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Laptop', ram: '8 GB', storage: '256 GB', colour: 'Silver', qty: 1, rate: 1000, gstRate: 18 }] }));
  assert.equal(standalone.items[0].productType, 'Standard');
  const data = normalizePurchaseAnalysis(aiBill({ items: [128, 256].map((storage) => ({ description: 'Phone', ram: '6 GB', storage: `${storage} GB`, colour: 'Black', qty: 1, rate: 1000, gstRate: 18 })) }));
  assert.ok(data.items.every((row) => row.productType === 'Matrix'));
  const catalog = [{ _id: 'phone', name: 'Phone', variants: [{ _id: '128', ram: '6GB', storage: '128GB', colour: 'Black' }, { _id: '256', ram: '6GB', storage: '256GB', colour: 'Black' }] }];
  assert.deepEqual(matchPurchaseImport(data, catalog, []).items.map((row) => row.variantId), ['128', '256']);
});

test('selectable PDFs also use visual analysis when a renderer is available', async () => {
  const rendered = [], requests = [];
  await analysePurchasePages([page()], { renderPage: async (number) => { rendered.push(number); return 'data:image/jpeg;base64,YWJj'; }, service: {
    purchasePdfCapabilities: async () => ({ enabled: true }), analysePurchasePdf: async (request) => { requests.push(request); return { data: aiBill() }; },
  } });
  assert.deepEqual(rendered, [1]);
  assert.equal(requests[0].pages[0].image, 'data:image/jpeg;base64,YWJj');
});

test('layout analysis maps unfamiliar headings and normalizes unknown fields without inventing tax', async () => {
  const sent = [];
  const result = await analysePurchasePages([[line([['Article Units Cost: unusual invoice arrangement', 30]])]], {
    service: { purchasePdfCapabilities: async () => ({ enabled: true }), analysePurchasePdf: async (request) => { sent.push(request); return { data: aiBill() }; } },
  });
  assert.equal(result.items[0].productCode, '00123');
  assert.equal(result.items[0].rate, 100);
  assert.equal(result.items[0].size, '');
  assert.match(sent[0].pages[0].text, /x=30.*Article/);
  const uncertain = normalizePurchaseAnalysis(aiBill({ items: [{ description: 'Unknown', qty: null, rate: 'invalid', gstRate: null, discount: null }, { description: 'Known exempt', qty: 1, rate: 200, gstRate: 0, sourceAmount: 100 }] }));
  assert.equal(uncertain.items[0].qty, ''); assert.equal(uncertain.items[0].rate, ''); assert.equal(uncertain.items[0].gstRate, '');
  assert.equal(uncertain.items[0].discount, '');
  assert.equal(uncertain.items[1].gstRate, 0); assert.ok(uncertain.warnings.some((entry) => entry.includes('printed amount')));
});

test('scanned pages are batched with continuation context and no purchased rows are deduplicated', async () => {
  const requests = [], rendered = [];
  const result = await analysePurchasePages(Array.from({ length: 4 }, () => []), {
    renderPage: async (number) => { rendered.push(number); return 'data:image/jpeg;base64,YWJj'; },
    service: { purchasePdfCapabilities: async () => ({ enabled: true }), analysePurchasePdf: async (request) => { requests.push(request); return { data: aiBill() }; } },
  });
  assert.deepEqual(rendered, [1, 2, 3, 4]);
  assert.deepEqual(requests.map((request) => request.pages.length), [3, 1]);
  assert.match(requests[1].context, /Plain Product/);
  assert.equal(result.items.length, 2);
});

test('missing AI setup and partial scanned failures never silently apply only text rows', async () => {
  const disabled = { purchasePdfCapabilities: async () => ({ enabled: false }) };
  const local = await analysePurchasePages([page()], { service: disabled });
  assert.equal(local.items.length, 1);
  await assert.rejects(analysePurchasePages([[]], { service: disabled }), /not enabled/);
  await assert.rejects(analysePurchasePages([page(), []], { service: disabled, needsVision: [false, true] }), /not enabled/);
  const failure = { purchasePdfCapabilities: async () => ({ enabled: true }), analysePurchasePdf: async () => { throw new Error('service unavailable'); } };
  const retained = await analysePurchasePages([page()], { service: failure });
  assert.equal(retained.items.length, 1); assert.ok(retained.warnings.some((warning) => /service unavailable/.test(warning)));
  await assert.rejects(analysePurchasePages([page(), []], { service: failure, renderPage: async () => 'image', needsVision: [false, true] }), /service unavailable/);
});

test('one merged product with separate Size and Colour columns imports every variant without AI', async () => {
  const at = (y, cells) => ({ ...line(cells), y: -y });
  const rows = [
    at(0, [['Description', 40], ['Size', 200], ['Colour', 260], ['Qty', 340], ['Rate', 400], ['GST %', 460], ['Amount', 520]]),
    at(30, [['M', 200], ['Black', 260], ['2', 340], ['100', 400], ['5%', 460], ['200', 520]]),
    at(50, [['Shirt', 40], ['L', 200], ['White', 260], ['3', 340], ['100', 400], ['5%', 460], ['300', 520]]),
    at(70, [['XL', 200], ['Blue', 260], ['4', 340], ['100', 400], ['5%', 460], ['400', 520]]),
  ];
  const result = await analysePurchasePages([rows], { service: { purchasePdfCapabilities: async () => ({ enabled: false }) } });
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map(row => row.description), ['Shirt', 'Shirt', 'Shirt']);
  assert.deepEqual(result.items.map(row => row.size), ['M', 'L', 'XL']);
  assert.deepEqual(result.items.map(row => row.qty), [2, 3, 4]);
  assert.ok(result.items.every(row => row.productType === 'Matrix'));
});

test('separate RAM and Storage columns retain each electronics variant under the merged product', () => {
  const result = parsePurchasePdfPages([[
    line([['Description', 40], ['RAM', 200], ['Storage', 260], ['Qty', 340], ['Rate', 400], ['GST %', 460], ['Amount', 520]]),
    line([['Laptop', 40], ['8 GB', 200], ['256 GB', 260], ['2', 340], ['1000', 400], ['18%', 460], ['2000', 520]]),
    line([['16 GB', 200], ['512 GB', 260], ['3', 340], ['1200', 400], ['18%', 460], ['3600', 520]]),
  ]]);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(row => [row.description, row.ram, row.storage, row.qty]), [['Laptop', '8 GB', '256 GB', 2], ['Laptop', '16 GB', '512 GB', 3]]);
});

test('capability outages are not reported as missing provider keys, and unmatched rows cannot disappear', async () => {
  await assert.rejects(analysePurchasePages([[]], { service: { purchasePdfCapabilities: async () => { throw new Error('Network error'); } } }), error => /temporarily unavailable/.test(error.message) && !/GROQ_API_KEY/.test(error.message));
  assert.throws(() => parsePurchasePdfPages([[
    line([['Description', 40], ['Qty', 240], ['Rate', 340], ['GST %', 460]]),
    line([['Product', 40], ['2', 240], ['100', 340], ['5%', 460]]),
    line([['3', 240], ['100', 340], ['5%', 460]]),
  ]]), /preserve all variants/);
});

test('catalog matching uses colour-only variants and blocks contradictory identities or attributes', () => {
  const variants = [{ _id: 'black', colour: 'Black', size: 'M', modelCode: 'BLK', barcode: '111' }, { _id: 'white', colour: 'White', size: 'M', modelCode: 'WHT', barcode: '222' }];
  const products = [{ _id: 'shirt', description: 'Shirt', variants }, { _id: 'other', description: 'Other', code: 'OTHER', barcode: '333' }];
  const match = (row) => matchPurchaseImport(aiBill({ items: [{ description: 'Shirt', ...row }] }), products, []).items[0];
  assert.equal(match({ colour: 'White' }).variantId, 'white');
  assert.match(match({ barcode: '111', productCode: 'WHT' }).matchLabel, /Ambiguous/);
  assert.match(match({ barcode: '111', colour: 'White' }).matchLabel, /Ambiguous/);
  assert.match(match({ barcode: '111', productCode: 'OTHER' }).matchLabel, /Ambiguous product/);
  assert.match(match({}).matchLabel, /Ambiguous variant/);
  assert.equal(match({ colour: 'White', material: 'Cotton' }).variantId, 'white');
  variants[1].sku = 'SUPPLIER-001';
  assert.equal(match({ productCode: 'SUPPLIER-001' }).variantId, 'white');
});

test('extracts supplier details and fashion line items with exact numerical values', () => {
  const result = parsePurchasePdfPages([page()]);
  assert.equal(result.vendor.name, 'Lakshmi Textiles');
  assert.equal(result.vendor.gstin, '33ABCDE1234F1Z5');
  assert.equal(result.invoiceNo, 'SUP-101');
  assert.equal(result.date, '2026-11-04');
  assert.equal(result.invoiceAmount, 189);
  assert.deepEqual(result.items.map(({ description, qty, rate, discount, discountType, gstRate, hsn }) => ({ description, qty, rate, discount, discountType, gstRate, hsn })), [{ description: 'Cotton Saree', qty: 2, rate: 100, discount: 10, discountType: 'percent', gstRate: 5, hsn: '5208' }]);
});

test('multiple pages, repeated headers and wrapped names retain the correct rows', () => {
  const result = parsePurchasePdfPages([[...page().slice(0, -1), line([['Premium cotton', 40]])], [header(), item('Silk Saree', '3', '1,200.50'), line([['Grand Total: 4,000', 40]])]]);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].description, 'Cotton Saree Premium cotton');
  assert.equal(result.items[1].rate, 1200.5);
});

test('missing GST and unreadable numeric cells stay uncertain instead of becoming zero', () => {
  const result = parsePurchasePdfPages([[header(), item('Cotton Saree', 'unclear', '100', '')]]);
  assert.equal(result.items[0].qty, '');
  assert.equal(result.items[0].gstRate, '');
  assert.ok(result.warnings.some((warning) => warning.includes('uncertain')));
  assert.equal(pdfNumber('Rs. 1,250.50'), 1250.5);
  assert.equal(pdfNumber('12abc'), '');
  assert.equal(pdfDate('31/02/2026'), '');
});

test('PO references never replace the supplier invoice number', () => {
  const result = parsePurchasePdfPages([[line([['Purchase Order No: PO-12', 40]]), header(), item('Cotton Saree')]]);
  assert.equal(result.poReference, 'PO-12');
  assert.equal(result.invoiceNo, '');
});

test('ambiguous catalog names are not linked and exact variant barcodes select the right variant', () => {
  const data = parsePurchasePdfPages([page()]);
  const vendor = { _id: 'vendor1', name: 'Other spelling', gstin: data.vendor.gstin };
  const result = matchPurchaseImport(data, [{ _id: 'one', description: 'Cotton Saree' }, { _id: 'two', description: 'Cotton Saree' }], [vendor]);
  assert.equal(result.vendorMatch._id, 'vendor1');
  assert.equal(result.items[0].productId, null);
  data.items[0].barcode = 'SAREE-L';
  const matched = matchPurchaseImport(data, [{ _id: 'one', description: 'Saree', variants: [{ _id: 'small', barcode: 'SAREE-S', size: 'S' }, { _id: 'large', barcode: 'SAREE-L', size: 'L' }] }], []);
  assert.equal(matched.items[0].variantId, 'large');
  assert.equal(matched.items[0].size, 'L');
});

test('rejects image-only and unrecognized tables without fabricated items', () => {
  assert.throws(() => parsePurchasePdfPages([[]]), /OCR is required/);
  assert.throws(() => parsePurchasePdfPages([[line([['A bill with no recognizable product table or amounts', 40]])]]), /No item table/);
});

test('PDF text coordinates group cells by visual row and sort them left to right', () => {
  const lines = pdfTextLines([{ str: 'Qty', width: 20, transform: [1, 0, 0, 1, 200, 400] }, { str: 'Description', width: 60, transform: [1, 0, 0, 1, 40, 401] }, { str: 'Cotton', width: 30, transform: [1, 0, 0, 1, 40, 380] }]);
  assert.deepEqual(lines.map((row) => row.cells.map((cell) => cell.text)), [['Description', 'Qty'], ['Cotton']]);
});

test('SKU before Item Description and GST Rate headers map to distinct fields', () => {
  const result = parsePurchasePdfPages([[line([['Supplier: Lakshmi Textiles', 40]]), line([['Product Code', 30], ['Item Description', 120], ['Qty', 300], ['Rate', 370], ['GST Rate', 450]]), line([['S-01', 30], ['Cotton Saree', 120], ['2', 300], ['150', 370], ['5', 450]])]]);
  assert.equal(result.items[0].productCode, 'S-01');
  assert.equal(result.items[0].description, 'Cotton Saree');
  assert.equal(result.items[0].rate, 150);
  assert.equal(result.items[0].gstRate, 5);
});

test('tax amount columns are not misread as percentage rates', () => {
  const result = parsePurchasePdfPages([[line([['Supplier: Lakshmi Textiles', 40]]), line([['Description', 40], ['Qty', 300], ['Rate', 370], ['CGST', 450], ['SGST', 500]]), line([['Cotton Saree', 40], ['2', 300], ['150', 370], ['7.5', 450], ['7.5', 500]])]]);
  assert.equal(result.items[0].gstRate, '');
});

test('seller name and abbreviated invoice labels fill from separate cells and rows', () => {
  const result = parsePurchasePdfPages([[
    line([['TAX INVOICE', 40]]),
    line([['Seller Name', 40]]), line([['Lakshmi Textiles', 40]]),
    line([['Inv. No.:', 40], ['LT/26-27/009', 160], ['Date: 04/11/2026', 350]]),
    header(), item('Cotton Saree', '2', 'Rs. 250/-'),
  ]]);
  assert.equal(result.vendor.name, 'Lakshmi Textiles');
  assert.equal(result.invoiceNo, 'LT/26-27/009');
  assert.equal(result.items[0].rate, 250);
});

test('multiline Unit Price heading and slightly left-aligned rate values are recognized', () => {
  const result = parsePurchasePdfPages([[
    line([['Vendor Name: Lakshmi Textiles', 40]]),
    line([['Bill Number', 40]]), line([['B-102', 40]]),
    line([['Description', 40], ['Qty', 240], ['Unit', 340], ['GST %', 460], ['Amount', 520]]),
    line([['Price', 340]]),
    line([['Cotton Saree', 40], ['2', 240], ['1,250.50 / Nos', 330], ['5%', 460], ['2501', 520]]),
  ]]);
  assert.equal(result.vendor.name, 'Lakshmi Textiles');
  assert.equal(result.invoiceNo, 'B-102');
  assert.equal(result.items[0].rate, 1250.5);
  assert.equal(result.items[0].unit, 'Nos');
});

test('company header ignores document title and invoice metadata without using buyer name', () => {
  const result = parsePurchasePdfPages([[
    line([['TAX INVOICE', 40]]), line([['Invoice No.:', 350], ['TX-99', 440]]),
    line([['Lakshmi Textiles', 40]]), line([['Buyer: Our Retail Store', 40]]),
    header(), item('Cotton Saree'),
  ]]);
  assert.equal(result.vendor.name, 'Lakshmi Textiles');
  assert.equal(result.invoiceNo, 'TX-99');
  assert.equal(pdfNumber('250 / kg'), 250);
  assert.equal(pdfNumber('250 unknown'), '');
});

test('an empty invoice label does not use the following date label as an invoice number', () => {
  const result = parsePurchasePdfPages([[line([['Invoice No.:', 40]]), line([['Invoice Date: 04/11/2026', 40]]), header(), item('Cotton Saree')]]);
  assert.equal(result.invoiceNo, '');
});

test('multi-variant PDF keeps vertically centred purchase rows and separates attributes', () => {
  const rows = [
    ['Cotton T-Shirt', 'S', 'Black', '', 'TS-BLK-S', '10', '350.00'],
    ['Cotton T-Shirt', 'M', 'Black', '', 'TS-BLK-M', '15', '350.00'],
    ['Cotton T-Shirt', 'M', 'White', '', 'TS-WHT-M', '8', '350.00'],
    ['Denim Jeans', '30', 'Blue', 'Slim', 'DJ-BLU-30', '6', '950.00'],
    ['Denim Jeans', '34', 'Blue', 'Regular', 'DJ-BLU-34', '5', '950.00'],
  ];
  const result = parsePurchasePdfPages([[
    line([['SUPPLIER DETAILS', 40]]), line([['Chennai Exports', 40]]),
    line([['#', 40], ['Product / Variant', 80], ['SKU', 300], ['HSN', 420], ['Qty', 500], ['Rate', 560], ['GST', 660], ['Amount', 730]]),
    ...rows.flatMap(([name, size, colour, fit, sku, qty, rate], index) => [
      line([[name, 80]]),
      line([[String(index + 1), 40], [sku, 300], ['610910', 420], [qty, 500], [rate, 560], ['5%', 660], [String(Number(qty) * Number(rate)), 730]]),
      line([[`${fit ? 'Waist' : 'Size'}: ${size} | ${fit ? `Fit: ${fit} | ` : ''}Colour: ${colour}`, 80]]),
    ]),
  ]]);
  assert.equal(result.vendor.name, 'Chennai Exports');
  assert.equal(result.items.length, 5);
  assert.deepEqual(result.items.map(({ description, size, colour, type, productCode, qty, rate }) => [description, size, colour, type, productCode, qty, rate]), rows.map(([name, size, colour, fit, sku, qty, rate]) => [name, size, colour, fit, sku, Number(qty), Number(rate)]));
});

test('variant SKU links to its parent and colour disambiguates identical sizes', () => {
  const data = parsePurchasePdfPages([page()]);
  const products = [{ _id: 'parent', description: 'Cotton Saree', variants: [{ _id: 'black', size: 'M', colour: 'Black', modelCode: 'TS-BLK-M' }, { _id: 'white', size: 'M', colour: 'White', modelCode: 'TS-WHT-M' }] }];
  data.items[0] = { ...data.items[0], productCode: 'TS-WHT-M', size: 'M', colour: 'White' };
  const result = matchPurchaseImport(data, products, []);
  assert.equal(result.items[0].productId, 'parent');
  assert.equal(result.items[0].variantId, 'white');
  assert.equal(result.items[0].modelCode, 'TS-WHT-M');
  data.items[0] = { ...data.items[0], productCode: 'TS-RED-M', colour: 'Red' };
  const added = matchPurchaseImport(data, products, []);
  assert.equal(added.items[0].productId, 'parent');
  assert.equal(added.items[0].variantId, undefined);
  const standardParent = matchPurchaseImport(data, [{ _id: 'parent', description: 'Cotton Saree', barcode: 'PARENT-CODE', variants: [] }], []);
  assert.equal(standardParent.items[0].productId, 'parent');
  assert.equal(standardParent.items[0].barcode, '');
});

test('merged product cells expand to all eight variant rows with inherited brand and material', () => {
  const at = (y, cells) => ({ ...line(cells), y: -y });
  const result = parsePurchasePdfPages([[
    at(0, [['Product / Brand / Material', 40], ['Variant Details', 300], ['Qty', 500], ['Rate', 560], ['GST', 660], ['Amount', 730], ['#', 10]]),
    at(30, [['Size: S | Colour: Black', 300], ['10', 500], ['350', 560], ['5%', 660], ['3500', 730]]),
    at(60, [['Size: M | Colour: Black', 300], ['15', 500], ['350', 560], ['5%', 660], ['5250', 730]]),
    at(65, [['Premium Cotton T-Shirt', 40]]),
    at(75, [['1', 10], ['Brand: UrbanWeave', 40]]),
    at(85, [['Material: 100% Cotton', 40]]),
    at(90, [['Size: L | Colour: Black', 300], ['12', 500], ['350', 560], ['5%', 660], ['4200', 730]]),
    at(120, [['Size: M | Colour: White', 300], ['8', 500], ['350', 560], ['5%', 660], ['2800', 730]]),
    at(150, [['Waist: 30 | Length: 32 | Blue', 300], ['6', 500], ['950', 560], ['5%', 660], ['5700', 730]]),
    at(180, [['Waist: 32 | Length: 32 | Blue', 300], ['10', 500], ['950', 560], ['5%', 660], ['9500', 730]]),
    at(185, [['Classic Denim Jeans', 40]]),
    at(195, [['2', 10], ['Brand: BluePeak', 40]]),
    at(205, [['Material: 98% Cotton, 2% Elastane', 40]]),
    at(210, [['Waist: 34 | Length: 34 | Blue', 300], ['8', 500], ['950', 560], ['5%', 660], ['7600', 730]]),
    at(240, [['Waist: 32 | Length: 32 | Black', 300], ['5', 500], ['950', 560], ['5%', 660], ['4750', 730]]),
  ]]);
  assert.equal(result.items.length, 8);
  assert.deepEqual(result.items.map((row) => row.qty), [10, 15, 12, 8, 6, 10, 8, 5]);
  assert.deepEqual(result.items.map((row) => row.size), ['S', 'M', 'L', 'M', '30', '32', '34', '32']);
  assert.ok(result.items.slice(0, 4).every((row) => row.description === 'Premium Cotton T-Shirt' && row.brand === 'UrbanWeave' && row.material === '100% Cotton' && row.rate === 350));
  assert.ok(result.items.slice(4).every((row) => row.description === 'Classic Denim Jeans' && row.brand === 'BluePeak' && row.material === '98% Cotton, 2% Elastane' && row.rate === 950));
  assert.deepEqual(result.items.slice(4).map((row) => [row.length, row.colour]), [['32', 'Blue'], ['32', 'Blue'], ['34', 'Blue'], ['32', 'Black']]);
  assert.equal(result.items.reduce((sum, row) => sum + row.sourceAmount, 0), 43300);
});

test('merged parent groups with unequal variant counts do not steal neighbouring rows', () => {
  const at = (y, cells) => ({ ...line(cells), y: -y });
  const result = parsePurchasePdfPages([[
    at(0, [['#', 10], ['Product / Brand / Material', 40], ['Variant Details', 300], ['Qty', 500], ['Rate', 560], ['GST', 660]]),
    at(30, [['1', 10], ['Single Shirt', 40], ['Size: S | Colour: Black', 300], ['1', 500], ['350', 560], ['5%', 660]]),
    at(60, [['Size: M | Colour: White', 300], ['2', 500], ['950', 560], ['5%', 660]]),
    at(90, [['Size: L | Colour: White', 300], ['3', 500], ['950', 560], ['5%', 660]]),
    at(110, [['Five Jackets', 40]]),
    at(120, [['2', 10], ['Size: XL | Colour: White', 300], ['4', 500], ['950', 560], ['5%', 660]]),
    at(150, [['Size: XXL | Colour: White', 300], ['5', 500], ['950', 560], ['5%', 660]]),
    at(180, [['Size: XXXL | Colour: White', 300], ['6', 500], ['950', 560], ['5%', 660]]),
  ]]);
  assert.deepEqual(result.items.map(row => row.description), ['Single Shirt', ...Array(5).fill('Five Jackets')]);
});

test('standard product table keeps Tax percentages out of the purchase rate column', () => {
  const rates = ['850.00', '180.00', '1,250.00', '6,800.00', '420.00'];
  const names = ['Wireless Keyboard & Mouse Combo', 'USB-C Fast Charging Cable 1m', 'Bluetooth Speaker 10W', '24-inch LED Monitor', 'Wireless Optical Mouse'];
  const qtys = ['10', '25', '6', '3', '12'];
  const amounts = ['8,500.00', '4,500.00', '7,500.00', '20,400.00', '5,040.00'];
  const result = parsePurchasePdfPages([[
    line([['#', 60], ['Product / Description', 99], ['HSN', 359], ['Qty', 439], ['Unit', 496], ['Rate (Rs.)', 562], ['Tax', 666], ['Amount', 732]]),
    ...rates.map((rate, index) => line([[String(index + 1), 60], [names[index], 99], ['847160', 359], [qtys[index], 439], [index ? 'Pcs' : 'Set', 496], [rate, 600], ['18%', 689], [amounts[index], 790]])),
  ]]);
  assert.deepEqual(result.items.map(row => row.rate), [850, 180, 1250, 6800, 420]);
  assert.deepEqual(result.items.map(row => row.gstRate), [18, 18, 18, 18, 18]);
  assert.deepEqual(result.items.map(row => row.sourceAmount), [8500, 4500, 7500, 20400, 5040]);
});

test('a numeric Tax amount stays separate from rate without being assumed to be a percentage', () => {
  const result = parsePurchasePdfPages([[
    line([['Product / Description', 40], ['Qty', 240], ['Rate', 340], ['Tax', 460], ['Amount', 520]]),
    line([['Wireless Mouse', 40], ['10', 240], ['850', 340], ['1530', 460], ['8500', 520]]),
  ]]);
  assert.equal(result.items[0].rate, 850);
  assert.equal(result.items[0].gstRate, '');
});

test('merged electronics categories remain metadata and all seven variants keep the correct parent and brand', () => {
  const at = (y, cells) => ({ ...line(cells), y: -y });
  const quantities = [5, 4, 3, 2, 3, 2, 2];
  const rows = [at(0, [['#', 10], ['Product / Brand', 55], ['Variant Attributes', 300], ['Qty', 500], ['Rate', 560], ['GST %', 660]])];
  quantities.forEach((qty, index) => {
    const y = 40 + index * 76;
    const specs = index < 4 ? `Storage: ${index < 2 ? '128' : '256'} GB | RAM: ${index < 2 ? '6' : '8'} GB` : `Screen: ${[43, 50, 55][index - 4]} inch | Resolution: 4K UHD`;
    const attributes = index < 4 ? `Colour: ${index % 2 ? 'Ocean Blue' : 'Midnight Black'} | 5G` : `Panel: ${index === 6 ? 'QLED' : 'LED'} | Wi-Fi`;
    rows.push(at(y, [[specs, 300]]), at(y + 18, [[attributes, 300], [String(qty), 500], ['1000', 560], ['18', 660]]), at(y + 36, [['Warranty: 1 Year', 300]]));
  });
  for (const [y, name, brand, category, serial] of [[154, 'Smartphone - Nova X5', 'NovaTech', 'Mobile Phone', 1], [420, 'LED Smart TV - Vision 4K', 'ViewMax', 'Television', 2]]) {
    rows.push(at(y, [[name, 55]]), at(y + 18, [[String(serial), 10]]), at(y + 20, [[`Brand: ${brand}`, 55]]), at(y + 40, [[`Category: ${category}`, 55]]));
  }
  const result = parsePurchasePdfPages([rows.sort((a, b) => b.y - a.y)]);
  assert.equal(result.items.length, 7);
  assert.deepEqual(result.items.map((row) => row.description), [...Array(4).fill('Smartphone - Nova X5'), ...Array(3).fill('LED Smart TV - Vision 4K')]);
  assert.deepEqual(result.items.map((row) => row.brand), [...Array(4).fill('NovaTech'), ...Array(3).fill('ViewMax')]);
  assert.deepEqual(result.items.map((row) => row.category), [...Array(4).fill('Mobile Phone'), ...Array(3).fill('Television')]);
  assert.deepEqual(result.items.map((row) => row.qty), quantities);
  assert.deepEqual(result.items.slice(0, 4).map((row) => row.storage), ['128 GB', '128 GB', '256 GB', '256 GB']);
  assert.deepEqual(result.items.slice(0, 4).map((row) => row.ram), ['6 GB', '6 GB', '8 GB', '8 GB']);
  assert.match(result.items[0].itemDescription, /^Storage: 128 GB \| RAM: 6 GB Colour: Midnight Black \| 5G Warranty: 1 Year$/);
  assert.match(result.items[3].itemDescription, /Storage: 256 GB \| RAM: 8 GB Colour: Ocean Blue/);
  assert.match(result.items[6].itemDescription, /Screen: 55 inch.*Panel: QLED.*Warranty: 1 Year/);
});
