import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { gstRouter } from '../src/modules/retail/gst/routes.js';
import { seedGstDashboardFixture } from '../tests/fixtures/gstDashboardFixture.js';
import { Invoice } from '../src/models/Invoice.js';
await mongoose.connect('mongodb://127.0.0.1:27029', { dbName: 'gobook_gst_categories_' + randomUUID().replaceAll('-', '') });
const fixtureData = await seedGstDashboardFixture();
await Invoice.updateMany({ userId: { $in: [fixtureData.owner, fixtureData.member] }, number: { $ne: 'GST-PREVIOUS-1' } }, { $set: { 'customer.state': 'Tamil Nadu', 'meta.date': '2026-11-03', 'items.$[].hsn': '8471' } });
const base = { userId: fixtureData.owner, businessId: fixtureData.businessId, branch: 'HQ', lifecycleStatus: 'posted', documentType: 'invoice', meta: { date: '2026-11-05', invoiceType: 'regular' }, customer: { name: 'Category customer', state: 'Kerala' }, items: [{ qty: 1, rate: 1000, gstRate: 18, hsn: '8471' }] };
await Invoice.collection.insertMany([
  { ...base, number: 'CATEGORY-LARGE', supplyType: 'interstate', items: [{ qty: 1, rate: 150000, gstRate: 18, hsn: '8471' }] },
  { ...base, number: 'CATEGORY-EXPORT', meta: { ...base.meta, invoiceType: 'export-wop' }, customer: { name: 'Export buyer', state: 'Singapore' }, items: [{ qty: 1, rate: 5000, gstRate: 0, hsn: '8471' }] },
  { ...base, number: 'CATEGORY-EINV', documentType: 'e-invoice', customer: { ...base.customer, gstin: '33AAAAA0000A1Z5' } },
  { ...base, number: 'CATEGORY-EWAY', documentType: 'e-way-bill' },
  { ...base, number: 'CATEGORY-DEBIT', documentType: 'debit-note' },
]);
const app = express(), requests = [];
app.use(express.json());
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', '*'); if (req.method === 'OPTIONS') return res.sendStatus(200); req.user = fixtureData.actor; requests.push(req.path); next(); });
app.use('/api/gst', gstRouter);
app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{Gstr1Page}from'/src/features/categories/common/modules/gst/Gstr1Page.jsx';import'/src/index.css';
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.includes('/gst/'))url='http://127.0.0.1:${server.address().port}'+address.pathname+address.search;return originalFetch(url,options)};
window.open=(...args)=>{window.portalOpened=args};const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/gstr-1?period=November%202026']},React.createElement(Gstr1Page)));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('../../frontend/gstr1-categories-qa.html',import.meta.url);");
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix = prefix.replaceAll('9337', '9375').replaceAll('./b2c-chrome-profile', './gstr1-categories-profile');
const checks = String.raw`
  const button = text => "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+")";
  const click = async text => {assert.equal(await evaluate(button(text)+'.disabled'),false,text+' should be enabled');await evaluate(button(text)+'.click()');};
  const card = async label => {await evaluate("Array.from(document.querySelectorAll('.ag1-section-tile')).find(e=>e.querySelector('strong').textContent==="+JSON.stringify(label)+").click()");await wait("!!document.querySelector('.ag1-list table') && document.querySelector('#ag1-records-heading').textContent.includes("+JSON.stringify(label)+")");};
  const rows = () => evaluate("document.querySelectorAll('.ag1-list tbody .ag1-invoice-link').length");
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://localhost:5173/gstr1-categories-qa.html'});
  await wait("document.querySelector('.ag1-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('Stored GST Business')");
  assert.equal(await evaluate(button('File on GST Portal')+'.disabled'),true);const url=await evaluate('location.href');assert.equal(await evaluate("document.querySelectorAll('.ag1-section-tile').length"),8);
  for(const [label,count,invoice] of [['B2B Invoices',2,'CATEGORY-EINV'],['B2C Large',1,'CATEGORY-LARGE'],['B2C Others',4,'CATEGORY-EWAY'],['Exports',1,'CATEGORY-EXPORT'],['Credit / Debit Notes',2,'CATEGORY-DEBIT'],['Documents Issued',10,'GST-SALE-1']]){
    await card(label);assert.equal(await rows(),count,label);assert.ok(await evaluate("document.querySelector('.ag1-list tbody').innerText.includes("+JSON.stringify(invoice)+")"));assert.equal(await evaluate('location.href'),url);
  }
  await card('HSN Summary');assert.ok(await evaluate("document.querySelector('.ag1-list thead').innerText.includes('HSN / SAC')"));
  await card('Advances');assert.ok(await evaluate("document.querySelector('.ag1-list').innerText.includes('Invoice-linked payments are not treated as Table 11 advances')"));
  await card('Exports');await click('Summary');assert.ok(await evaluate("!!document.querySelector('.ag1-summary-view')"));await card('B2C Large');assert.equal(await rows(),1);
  await setInput('[aria-label="Search GSTR-1 records"]','CATEGORY-LARGE');assert.equal(await rows(),1);await setInput('[aria-label="Search GSTR-1 records"]','');
  await evaluate('document.querySelector(\'[aria-label="Export current section"]\').click()');const csv=await evaluate('window.lastExport.text()');assert.ok(csv.includes('CATEGORY-LARGE')&&!csv.includes('CATEGORY-EXPORT'));
  for(const [label,invoice,count] of [['Import E-Invoice','CATEGORY-EINV',1],['Import E-Way Bill','CATEGORY-EWAY',1],['Import from Billing','GST-SALE-1',10]]){
    await click(label);await wait("document.querySelector('.ag1-notice')?.innerText.includes('"+(label==='Import from Billing'?'Billing records refreshed':label==='Import E-Invoice'?'stored e-invoice':'stored e-way-bill')+"')");assert.equal(await rows(),count);assert.ok(await evaluate("document.querySelector('.ag1-list tbody').innerText.includes("+JSON.stringify(invoice)+")"));
  }
  await click('Import E-Invoice');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Loaded')");assert.equal(await evaluate("document.querySelector('.ag1-stat:nth-child(4) strong').textContent"),'7');
  await click('Validate Data');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Validation saved: 0 error')");await click('Generate Summary');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Summary saved')");await card('Exports');assert.equal(await rows(),1);await click('File on GST Portal');assert.equal(await evaluate('window.portalOpened[0]'),'https://www.gst.gov.in/');assert.equal(await evaluate('location.href'),url);
  for(const width of [1672,1366,1024,768,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);}
  assert.deepEqual(errors,[]);console.log('PASS all eight clickable GSTR-1 categories stay on page, B2C/export/note classification, summary-to-detail switching, scoped CSV, stored source imports without duplicates, validation/summary and five responsive widths');await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./gstr1-categories-run.mjs', import.meta.url);
try { await fs.writeFile(runner, prefix + checks); await import(runner.href); console.log('PASS '+requests.length+' actual GST API requests'); }
finally { await fs.unlink(runner).catch(() => {}); await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
