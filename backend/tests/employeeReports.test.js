import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { employeeReportExcel, employeeReportPdf } from '../src/services/employeeReports.js';
import { buildBrandedEmail, GOBOOK_LOGO_CID } from '../src/utils/mailer.js';

test('business employee emails use the supplied logo and escape business names', () => {
  const html = buildBrandedEmail({ title: 'Employee OTP', otp: '123456', branding: { name: 'Anbu <Retail>', logoCid: 'own-logo@test' }, footerText: 'Sent by Anbu' });
  assert.ok(html.includes('cid:own-logo@test'));
  assert.ok(html.includes('Anbu &lt;Retail&gt;'));
  assert.equal(html.includes(`cid:${GOBOOK_LOGO_CID}`), false);
  const fallback = buildBrandedEmail({ title: 'Notice', branding: { name: 'Own Business' } });
  assert.ok(fallback.includes('Own Business'));
  assert.equal(fallback.includes('cid:'), false);
  assert.ok(buildBrandedEmail({ title: 'Platform email' }).includes(`cid:${GOBOOK_LOGO_CID}`));
});
test('Excel exports are genuine workbooks, preserve account-like strings and treat formulas as text', async () => {
  const data = [{ title: 'Employee Directory', columns: [{ label: 'Employee ID' }, { label: 'Name' }, { label: 'Amount' }], rows: [['000123', '=HYPERLINK("bad")', 0], ['EMP-002', 'A & B', 12.5]] }];
  const buffer = await employeeReportExcel(data, 'Anbu Retail', '2026-11');
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('A1').value, 'Anbu Retail');
  assert.equal(sheet.getCell('A4').value, '000123');
  assert.equal(sheet.getCell('B4').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('C4').value, 0);
  assert.equal(sheet.getCell('C5').value, 12.5);
});
test('PDF exports are readable files with all records and multiple pages', async () => {
  const buffer = await employeeReportPdf([{ title: 'Attendance', columns: [{ label: 'Employee' }, { label: 'Break minutes' }], rows: Array.from({ length: 120 }, (_, index) => [`Employee ${index}`, 15]) }], 'Anbu Retail', '2026-11');
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const document = await loading.promise;
  assert.ok(document.numPages > 1);
  let text = '';
  for (let number = 1; number <= document.numPages; number++) text += (await (await document.getPage(number)).getTextContent()).items.map((item) => item.str).join(' ');
  assert.ok(text.includes('Employee 119'));
  assert.ok(text.includes('Anbu Retail'));
  await loading.destroy();
});
