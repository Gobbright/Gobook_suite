import test from 'node:test';
import assert from 'node:assert/strict';
import { purchaseOcrLines } from '../src/utils/purchasePdfOcr.js';
import { analysePurchasePages } from '../src/utils/purchasePdfImport.js';
import { purchaseImportIssues } from '../src/utils/purchasePdfValidation.js';

const word = (text, x, y, confidence = 95) => ({ text, bbox: { x0: x, y0: y, x1: x + text.length * 7, y1: y + 12 }, confidence });
const data = words => ({ blocks: [{ paragraphs: [{ lines: [{ words }] }] }] });
const invoice = () => purchaseOcrLines(data([
  word('Supplier: Local Vendor',40,20),word('Invoice No: OCR-1',40,45),word('Invoice Date: 14/11/2026',40,70),
  ...[['Description',40],['Qty',240],['Rate',340],['GST %',440],['Amount',520]].map(([text,x]) => word(text,x,120)),
  ...[['Shirt',40],['2',240],['100',340],['5%',440],['200',520]].map(([text,x]) => word(text,x,150)),
  word('Grand Total: 210.00',40,200),
]));

test('OCR retains row and column positions across independently detected text blocks', () => {
  const lines = purchaseOcrLines(data([word('White',250,50),word('3',350,50),word('300',500,50),word('Cotton',40,50),word('Shirt',86,50),word('Qty',350,20)]));
  assert.equal(lines.length,2);
  assert.equal(lines[1].cells[0].text,'Cotton Shirt');
  assert.deepEqual(lines[1].cells.slice(1).map(cell=>cell.text),['White','3','300']);
});

test('image-only PDF uses local OCR when no cloud provider is configured', async () => {
  const result = await analysePurchasePages([[]], {
    service: { purchasePdfCapabilities: async () => ({enabled:false}) }, needsVision:[true],
    recognizePages: async selected => { assert.deepEqual(selected,[true]);return [invoice()]; },
  });
  assert.equal(result.vendor.name,'Local Vendor');assert.equal(result.items[0].qty,2);
  assert.equal(result.items[0].rate,100);assert.equal(result.invoiceAmount,210);
  assert.deepEqual(purchaseImportIssues(result),[]);assert.match(result.warnings.at(-1),/local OCR/);
});

test('low-confidence OCR quantity requires explicit confirmation despite matching arithmetic', async () => {
  const lines=invoice();lines.find(line=>line.cells[0].text==='Shirt').cells.find(cell=>cell.text==='2').confidence=40;
  const result=await analysePurchasePages([[]], { service:{purchasePdfCapabilities:async()=>({enabled:false})},needsVision:[true],recognizePages:async()=>[lines] });
  assert.ok(purchaseImportIssues(result).some(issue=>issue.fields.includes('qty')));
});

test('mixed PDFs never apply a readable first page when the scanned page remains unreadable', async () => {
  await assert.rejects(analysePurchasePages([invoice(),[]], {
    service:{purchasePdfCapabilities:async()=>({enabled:false})},needsVision:[false,true],
    recognizePages:async selected=>{assert.deepEqual(selected,[false,true]);return [invoice(),[]];},
  }),/no partial purchase/);
});
