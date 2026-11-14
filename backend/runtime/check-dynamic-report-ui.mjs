import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { Invoice } from '../src/models/Invoice.js';
import { Product } from '../src/models/Product.js';
import { AppUser } from '../src/models/AppUser.js';
import { dynamicSalesReport } from '../src/modules/retail/sales/shared/dynamicSalesReport.js';

const reportType = process.argv.includes('--purchase') ? 'purchase' : 'sales';
const purchase = reportType === 'purchase';
const dbName = `gobook_report_ui_test_${randomUUID().replaceAll('-', '')}`;
await mongoose.connect('mongodb://127.0.0.1:27029', { dbName });
const owner = new mongoose.Types.ObjectId(), businessId = new mongoose.Types.ObjectId();
const user = { id: String(owner), businessId: String(businessId), accountType: 'owner', category: 'retail', name: 'Report UI Test' };
await Promise.all([Invoice.init(), Product.init(), AppUser.init()]);
await AppUser.collection.insertOne({ _id: owner, businessId, accountType: 'owner', name: 'UI Test', email: 'ui@report.test' });
await Invoice.collection.insertMany([
  { _id: new mongoose.Types.ObjectId(), userId: owner, businessId, number: 'INV-ABC', documentType: 'invoice', customer: { name: 'ABC Traders' }, meta: { date: '2026-11-13' }, items: [{ description: 'Laptop', productCode: 'LAP-1', category: 'Electronics', brand: 'Dell', qty: 0.4, rate: 100, gstRate: 18, purchasePrice: 70 }, { description: 'Laptop', productCode: 'LAP-1', category: 'Electronics', brand: 'Dell', qty: 0.6, rate: 100, gstRate: 18, purchasePrice: 70 }], totals: { finalTotal: 118, totalGst: 18 }, paymentMethod: 'Cash', createdAt: new Date('2026-11-13T08:00:00Z') },
  { _id: new mongoose.Types.ObjectId(), userId: owner, businessId, number: 'INV-XYZ', documentType: 'invoice', customer: { name: 'XYZ' }, meta: { date: '2026-11-13' }, items: [{ description: 'Phone', category: 'Electronics', brand: 'Apple', qty: 1, rate: 200, gstRate: 5 }], totals: { finalTotal: 210, totalGst: 10 }, paymentMethod: 'UPI', createdAt: new Date('2026-11-13T09:00:00Z') },
].map(row => purchase ? { ...row, documentType: 'purchase-entry', number: row.number.replace('INV-', 'PE-') } : row));
if (purchase) await Invoice.collection.insertMany([
  { _id: new mongoose.Types.ObjectId(), userId: owner, businessId, number: 'INV-IGNORE', documentType: 'invoice', customer: { name: 'Sales only' }, items: [{ description: 'Sales only product', qty: 1, rate: 999 }], totals: { finalTotal: 999 } },
  { _id: new mongoose.Types.ObjectId(), userId: owner, businessId, number: 'PO-IGNORE', documentType: 'purchase-order', customer: { name: 'Order only' }, items: [{ description: 'Order only product', qty: 1, rate: 999 }], totals: { finalTotal: 999 } },
]);
const requests = [];
const app = express();
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', '*'); if (req.method === 'OPTIONS') return res.sendStatus(200); req.user = user; next(); });
app.get('/api/sales/invoices', async (req, res) => { requests.push(req.query); try { await dynamicSalesReport(req, res); } catch (error) { res.status(error.statusCode || 500).json({ message: error.message }); } });
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root" style="height:100vh"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{${purchase ? 'DynamicPurchaseReportPage' : 'DynamicSalesReportPage'} as ReportPage}from'/src/features/categories/common/modules/reports/DynamicSalesReportPage.jsx';import'/src/index.css';
localStorage.setItem('gobook.user',${JSON.stringify(JSON.stringify(user))});
sessionStorage.setItem('gobook.report.${user.businessId}.${user.id}.${reportType}.session',JSON.stringify({filters:{logic:'and',conditions:[{id:'stale-product',field:'product',operator:'equals',values:['Laptop'],labels:['Laptop']}]},analysis:'transactions',layoutVersion:2}));
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.endsWith('/sales/invoices'))url='http://127.0.0.1:${server.address().port}/api/sales/invoices'+address.search;return originalFetch(url,options)};
const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};
new MutationObserver(()=>{for(const frame of document.querySelectorAll('iframe[title^="Print "]')){if(!frame.dataset.qaPrint){frame.dataset.qaPrint='1';frame.contentWindow.print=()=>{window.printedReport=frame.contentDocument.body.innerText;frame.contentWindow.dispatchEvent(new Event('afterprint'))}}}}).observe(document.body,{childList:true,subtree:true});
createRoot(document.getElementById('root')).render(React.createElement(ReportPage));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
const checks = `
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:960,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html'});
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===2");
  assert.equal(await evaluate("document.querySelectorAll('.drf-chip').length"),0,'A stale product filter must not be restored on opening');
  const click = async text => evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+").click()");
  const apply = async () => { await click('Apply'); await new Promise(r=>setTimeout(r,300)); await wait("document.querySelector('main').getAttribute('aria-busy')==='false'"); };
  const pick = async field => { await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim().startsWith('Add Filter')).click()"); await evaluate("Array.from(document.querySelectorAll('.drf-picker nav button')).find(e=>e.textContent.startsWith("+JSON.stringify(field)+")).click()"); };
  assert.ok(await evaluate("document.querySelector('.dsr-filter-card').getBoundingClientRect().width<=1120"),'Filter bar should have a compact maximum width');
  for (const target of ['.drf-main-input', '.drf-search-icon', '.drf-chips']) {
    await evaluate("document.querySelector("+JSON.stringify(target)+").dispatchEvent(new MouseEvent('click',{bubbles:true}))");
    await wait("!!document.querySelector('.drf-picker')");
    await evaluate("document.querySelector('.drf-picker header button').click()");
  }
  await evaluate("document.querySelector('.drf-main-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await wait("!!document.querySelector('.drf-picker')");
  await evaluate("document.querySelector('.drf-picker header button').click()");
  const switchField = async field => { await evaluate("Array.from(document.querySelectorAll('.drf-picker nav button')).find(e=>e.textContent.startsWith("+JSON.stringify(field)+")).click()"); await wait("document.querySelector('.drf-value-heading h3')?.textContent==="+JSON.stringify(field)+" && document.querySelectorAll('.drf-options input').length===2"); };
  const chooseOption = async label => evaluate("Array.from(document.querySelectorAll('.drf-options label')).find(e=>e.querySelector('span')?.firstChild?.textContent==="+JSON.stringify(label)+").querySelector('input').click()");
  await pick('Customer');await wait("document.querySelectorAll('.drf-options input').length===2");
  await chooseOption('ABC Traders');
  await switchField('Product');await chooseOption('Laptop');
  await switchField('Customer');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.drf-options label')).find(e=>e.textContent==='ABC Traders')?.querySelector('input').checked"),true,'Customer selection must survive switching fields');
  await chooseOption('XYZ');
  await switchField('Product');await chooseOption('Phone');
  await click('Add filters');
  assert.equal(await evaluate("document.querySelectorAll('.drf-chip').length"),2);
  await apply();await wait("document.querySelectorAll('.dsr-results tbody tr').length===2");
  await evaluate("Array.from(document.querySelectorAll('.drf-chip button[title]')).find(e=>e.textContent.includes('Product:')).click()");
  await wait("document.querySelectorAll('.drf-options input').length===2");
  await click('Clear Selection');assert.equal(await evaluate("document.querySelectorAll('.drf-options input:checked').length"),0);
  await click('Select All');assert.equal(await evaluate("document.querySelectorAll('.drf-options input:checked').length"),2);
  await chooseOption('Phone');await click('Update filter');await apply();
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===1 && document.querySelector('.dsr-results tbody').innerText.includes('INV-ABC')");
  await pick('Customer');await wait("document.querySelectorAll('.drf-options input').length===2");
  await chooseOption('XYZ');await click('Add');
  assert.equal(await evaluate("document.querySelectorAll('.drf-chip').length"),2,'Adding options to an existing field must update its chip');
  await apply();
  await click('Clear All');await apply();await wait("document.querySelectorAll('.dsr-results tbody tr').length===2");
  console.log('PASS multiple values, retained selections across fields, Select All, Clear Selection and updating existing filters');
  await pick('Customer');
  await wait("document.querySelectorAll('.drf-options input').length===2");
  await evaluate("Array.from(document.querySelectorAll('.drf-options label')).find(e=>e.textContent==='ABC Traders').querySelector('input').click()");
  await click('Add');
  assert.equal(await evaluate("document.querySelectorAll('.dsr-results tbody tr').length"),2,'Draft must not alter results before Apply');
  await apply();
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===1 && document.querySelector('.dsr-results tbody').innerText.includes('INV-ABC')");
  await click('Report options');
  await evaluate("(()=>{const e=document.querySelector('.dsr-report-options select');e.value='transactions';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===2 && document.querySelector('main').getAttribute('aria-busy')==='false'");
  await evaluate("(()=>{const e=document.querySelector('.dsr-report-options select');e.value='documents';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===1 && document.querySelector('main').getAttribute('aria-busy')==='false'");
  assert.ok(await evaluate("document.querySelector('.dsr-results tbody tr td:nth-child(5)').innerText==='1'"),'Repeated product lines must have a combined quantity');
  await click('Report options');
  await pick('Amount');
  await evaluate("(()=>{const e=document.querySelector('[aria-label=\\\"Filter operator\\\"]');e.value='greaterThan';e.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await setInput('[aria-label="Amount value"]','150');
  await click('Add');await apply();
  await wait("document.body.innerText.includes('No sales match your filters')");
  await evaluate("document.querySelector('[aria-label=\\\"Remove Customer filter\\\"]').click()");
  await apply();await wait("document.querySelector('.dsr-results tbody').innerText.includes('INV-XYZ')");
  await click('Save Filter');await setInput('[aria-label="Saved filter name"]','Large bills');await click('Save');
  await click('Clear All');await apply();await wait("document.querySelectorAll('.dsr-results tbody tr').length===2");
  await evaluate("document.querySelector('[aria-label=\\\"Saved Filters\\\"]').click()");
  await evaluate("Array.from(document.querySelectorAll('.drf-saved button')).find(e=>e.textContent.startsWith('Large bills')).click()");
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===1 && document.querySelector('.dsr-results tbody').innerText.includes('INV-XYZ')");
  await click('Export');await click('CSV');await wait('!!window.lastExport');
  const csv=await evaluate('window.lastExport.text()');assert.ok(csv.includes('INV-XYZ'));assert.ok(!csv.includes('INV-ABC'));
  await click('Export');await click('PDF');await wait("window.lastExport?.type==='application/pdf'");
  const pdfHeader=await evaluate('window.lastExport.slice(0,5).text()');assert.equal(pdfHeader,'%PDF-');
  await wait("!Array.from(document.querySelectorAll('.dsr-header-actions button')).find(e=>e.textContent==='Print').disabled");
  await click('Print');await wait('!!window.printedReport');
  assert.ok(await evaluate("window.printedReport.includes('INV-XYZ') && !window.printedReport.includes('INV-ABC')"));
  await send('Page.reload');
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===2 && document.querySelectorAll('.drf-chip').length===0");
  await evaluate("document.querySelector('[aria-label=\\\"Saved Filters\\\"]').click()");
  await evaluate("Array.from(document.querySelectorAll('.drf-saved button')).find(e=>e.textContent.startsWith('Large bills')).click()");
  await wait("document.querySelectorAll('.dsr-results tbody tr').length===1 && document.querySelector('.dsr-results tbody').innerText.includes('INV-XYZ')");
  for(const width of [1366,768,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:960,deviceScaleFactor:1,mobile:width<500});
    const size=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
    assert.ok(size.scroll<=size.width+1,'Page overflow '+JSON.stringify(size));
    await pick('Brand');await wait("!!document.querySelector('.drf-options input')");
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Picker overflows at '+width);
    await evaluate("document.querySelector('[aria-label=\\\"Close filter picker\\\"]').click()");
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:960,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate("document.querySelectorAll('.dsr-metrics article').length"),5);
  assert.ok(await evaluate("document.querySelector('.dsr-summary-net strong').innerText.includes('210.00')"));
  await click('Clear All');
  await pick('Date');
  await setInput('[aria-label="Filter from date"]','2026-11-01');
  await setInput('[aria-label="Filter to date"]','2026-11-13');await click('Add');
  await pick('Customer');await wait("document.querySelectorAll('.drf-options input').length===2");
  await evaluate("Array.from(document.querySelectorAll('.drf-options label')).find(e=>e.textContent==='ABC Traders').querySelector('input').click()");await click('Add');
  await pick('Product');await wait("document.querySelectorAll('.drf-options input').length===2");
  await evaluate("Array.from(document.querySelectorAll('.drf-options label')).find(e=>e.textContent.includes('Laptop')).querySelector('input').click()");await click('Add');
  await apply();await wait("document.querySelector('.dsr-results tbody').innerText.includes('INV-ABC')");
  await evaluate("Array.from(document.querySelectorAll('.drf-chip button[title]')).find(e=>e.textContent.includes('Product:')).click()");
  await wait("document.querySelector('.drf-options input')?.checked");
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await fs.writeFile(new URL('./dynamic-${reportType}-report-desktop.png',import.meta.url),Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(errors,[]);
  console.log('PASS empty filters on opening/reload despite stale session, explicit saved filter loading, filtering, CSV/PDF/print and responsive picker');
  await send('Browser.close').catch(error=>{if(!String(error.message).includes('Browser connection closed'))throw error});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./dynamic-report-browser-run.mjs', import.meta.url);
try {
  await fs.writeFile(runner, prefix + (purchase ? checks.replaceAll('Customer', 'Supplier').replaceAll('INV-', 'PE-').replaceAll('No sales', 'No purchases') : checks));
  await import(runner.href);
  if (requests.some(query => query.report !== reportType)) throw new Error('Report requests crossed report scopes');
  console.log('PASS '+reportType+' browser used live isolated report API: '+requests.length+' report requests');
} finally {
  await fs.unlink(runner).catch(() => {});
  await new Promise(resolve => server.close(resolve));
  if (!mongoose.connection.name.startsWith('gobook_report_ui_test_')) throw new Error('Unexpected test database');
  await mongoose.connection.dropDatabase();await mongoose.disconnect();
}
