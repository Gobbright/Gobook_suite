import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseExcelRows } from '../src/utils/excelImport.js';
import { createSubscriptionInvoicePdf } from '../src/services/subscriptionInvoice.js';

test('updated spreadsheet dependencies preserve styled XLSX imports', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.addRow(['Product', 'Quantity']);
  sheet.addRow(['Silk Saree', 2]);
  sheet.getRow(1).font = { bold: true };
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const rows = await parseExcelRows({ originalname: 'products.xlsx', buffer }, { product: 'name', quantity: 'quantity' }, 'Product, Quantity');
  assert.deepEqual(rows, [{ rowNumber: 2, record: { name: 'Silk Saree', quantity: 2 } }]);
});

test('streamed XLSX exports remain readable by the application importer', async () => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useSharedStrings: true });
  const sheet = writer.addWorksheet('Stock');
  sheet.addRow(['Product', 'Stock']).commit();
  sheet.addRow(['Filter', 7]).commit();
  await writer.commit();
  const buffer = Buffer.concat(chunks);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  const restoredSheet = restored.getWorksheet('Stock');
  assert.deepEqual([restoredSheet.getRow(1).values.slice(1), restoredSheet.getRow(2).values.slice(1)], [['Product', 'Stock'], ['Filter', 7]]);
  const rows = await parseExcelRows({ originalname: 'stock.xlsx', buffer }, { product: 'name', stock: 'stock' }, 'Product, Stock');
  assert.deepEqual(rows, [{ rowNumber: 2, record: { name: 'Filter', stock: 7 } }]);
});

test('updated fast-csv preserves quoted commas and escaped quotes', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Products').addRow(['Cotton, "Premium"', 2]);
  const buffer = await workbook.csv.writeBuffer();
  const restored = new ExcelJS.Workbook();
  const sheet = await restored.csv.read(Readable.from([buffer]));
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['Cotton, "Premium"', 2]);
});

test('updated PDFKit renders a readable subscription invoice with its logo', async () => {
  const date = new Date('2026-11-03T12:00:00Z');
  const buffer = await createSubscriptionInvoicePdf({ invoiceNumber: 'GB-TEST-001', paidAt: date, customerName: 'Test Customer', planName: 'Standard', category: 'retail', amount: 1000 }, { subscriptionStartDate: date, subscriptionExpiresAt: new Date('2027-11-03T12:00:00Z') });
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    assert.match(text, /GB-TEST-001/);
    assert.match(text, /Test Customer/);
    assert.match(text, /1,000\.00/);
  } finally {
    await loadingTask.destroy();
  }
});
