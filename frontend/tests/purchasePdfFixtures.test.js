import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDocument } from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { analysePurchasePages, parsePurchasePdfPages, pdfTextLines } from '../src/utils/purchasePdfImport.js';
import { purchaseImportIssues } from '../src/utils/purchasePdfValidation.js';
import { purchasePdfCases } from './fixtures/purchase-pdf/expected.mjs';

async function readFixture(file) {
  const task = getDocument({ data: new Uint8Array(await fs.readFile(new URL(`./fixtures/purchase-pdf/${file}`, import.meta.url))), isEvalSupported: false,
    standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replace(/\\/g, '/') });
  try {
    const pdf = await task.promise, pages = [];
    for (let number = 1; number <= pdf.numPages; number++) pages.push(pdfTextLines((await (await pdf.getPage(number)).getTextContent()).items));
    return pages;
  } finally { await task.destroy(); }
}

for (const fixture of purchasePdfCases) test(`original PDF imports every printed row without OCR or cloud: ${fixture.file}`, async () => {
  const pages = await readFixture(fixture.file);
  assert.equal(pages.length, 2);
  const result = await analysePurchasePages(pages, {
    service: { purchasePdfCapabilities: async () => ({ enabled: false }) },
    renderPage: async () => { throw new Error('Text fixtures must never be rendered for OCR'); },
    recognizePages: async () => { throw new Error('Text fixtures must never initialize OCR'); },
  });
  assert.deepEqual(result.vendor, { name: 'Sri Lakshmi Textiles', gstin: '33AABCS1234F1Z5' });
  assert.equal(result.invoiceNo, fixture.invoiceNo); assert.equal(result.date, '2026-11-14'); assert.equal(result.invoiceAmount, fixture.invoiceAmount);
  assert.equal(result.items.length, fixture.rows.length);
  for (const [index, expected] of fixture.rows.entries()) {
    const row = result.items[index];
    assert.deepEqual(Object.fromEntries(Object.keys(expected).map(field => [field, row[field]])), expected);
    assert.equal(row.sourcePage, 1); assert.deepEqual(row.uncertainFields, []);
  }
  assert.equal(result.items.reduce((sum, row) => sum + row.qty, 0), fixture.quantity);
  assert.equal(result.items.reduce((sum, row) => sum + row.sourceAmount, 0), fixture.taxable);
  assert.deepEqual(result.charges, []); assert.deepEqual(purchaseImportIssues(result), []);
});

test('variant-only tables reject missing and ambiguous separate parents', async () => {
  const [page] = await readFixture(purchasePdfCases[0].file);
  const start = page.findIndex(line => line.cells.some(cell => cell.text === 'SKU / Variant'));
  const table = page.slice(start);
  assert.throws(() => parsePurchasePdfPages([table]), /unambiguous Product Details parent/);
  const parent = page.findIndex(line => line.cells.some(cell => cell.text === "Men's Cotton T-Shirt"));
  const ambiguous = [...page.slice(0, parent + 1), structuredClone(page[parent]), ...page.slice(parent + 1)];
  assert.throws(() => parsePurchasePdfPages([ambiguous]), /unambiguous Product Details parent/);
});

test('new parent blocks and independent tables invalidate an earlier parent', async () => {
  const [page] = await readFixture(purchasePdfCases[0].file);
  const start = page.findIndex(line => line.cells.some(cell => cell.text === 'SKU / Variant'));
  const line = cells => ({ cells: cells.map(([text, x]) => ({ text, x, width: text.length * 4 })) });
  const prefix = page.slice(0, start), table = page.slice(start);
  assert.throws(() => parsePurchasePdfPages([[...prefix, line([['Product Details', 50]]), ...table]]), /unambiguous Product Details parent/);
  const independent = [line([['Description', 40], ['Qty', 300], ['Rate', 370], ['GST %', 440]]), line([['Independent Shirt', 40], ['1', 300], ['100', 370], ['5%', 440]])];
  assert.throws(() => parsePurchasePdfPages([[...prefix, ...independent, ...table]]), /unambiguous Product Details parent/);
});
