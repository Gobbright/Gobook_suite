import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { getGstr9 } from '../src/modules/retail/gst/gstr9Controller.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Invoice } from '../src/models/Invoice.js';
import { seedGstDashboardFixture } from '../tests/fixtures/gstDashboardFixture.js';
await mongoose.connect('mongodb://127.0.0.1:27033', { dbName: 'gobook_gst_9_ui_' + randomUUID().replaceAll('-', '') });
const data = await seedGstDashboardFixture();
await Invoice.collection.insertOne({ userId: data.owner, businessId: data.businessId, documentType: 'invoice', number: 'ANNUAL-UI-001', branch: 'HQ', lifecycleStatus: 'posted', meta: { date: '2026-11-05' }, customer: { name: 'Annual test customer', gstin: '33AAAAA0000A1Z5', state: 'Tamil Nadu' }, items: [{ qty: 1, rate: 75000000, gstRate: 18, hsn: '8471' }] });
let annualData;
await getGstr9({ user: data.actor, query: { fy: '2026-27' } }, { json: value => { annualData = value; } }, error => { throw error; });
const expectedTurnover = annualData.table4.filter(row => ['4A', '4B', '4C', '4D', '4E'].includes(row.sno)).reduce((sum, row) => sum + row.taxable, 0);
const app = express(), requests = [];
app.use((req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', '*'); if (req.method === 'OPTIONS') return res.sendStatus(200); req.user = data.actor; next(); });
app.get('/api/gst/gstr9', (req, res, next) => { requests.push(req.query.fy); return getGstr9(req, res, next); });
app.get('/api/settings', async (req, res) => res.json(await BusinessSettings.findOne({ userId: data.owner }).lean()));
app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{Gstr9Page}from'/src/features/categories/common/modules/gst/Gstr9Page.jsx';import'/src/index.css';
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.includes('/gst/')||address.pathname.endsWith('/settings'))url='http://127.0.0.1:${server.address().port}'+address.pathname+address.search;return originalFetch(url,options)};
const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};window.print=()=>{window.printed=(window.printed||0)+1};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(Gstr9Page)));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('../../frontend/gstr9-reference-qa.html',import.meta.url);");
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix = prefix.replaceAll('9337', '9371').replaceAll('./b2c-chrome-profile', './gstr9-reference-profile');
const checks = String.raw`
  const button = text => "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+")";
  const click = async text => {assert.equal(await evaluate(button(text)+'.disabled'),false,text+' should be enabled');await evaluate(button(text)+'.click()');};
  const close = () => evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  const loaded = () => wait("document.querySelector('.ag9-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('Stored GST Business')");
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/gstr9-reference-qa.html'});await loaded();
  assert.equal(await evaluate("document.querySelectorAll('.ag9-stat').length"),5);
  assert.equal(await evaluate("document.querySelectorAll('.ag9-tabs button').length"),5);
  assert.ok(await evaluate("!document.querySelector('.ag9-sidebar') && !document.querySelector('[aria-label=\"GST navigation\"]')"));
  assert.equal(await evaluate("Number(document.querySelector('.ag9-stat strong').textContent.replace(/[^0-9.]/g,''))"),EXPECTED_TURNOVER);
  assert.equal(await evaluate("document.querySelectorAll('.ag9-return-sections tbody tr').length"),7);
  for(const width of [1672,1366,1024,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);
    if(width===1672||width===390){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(new URL('./gstr9-reference-'+width+'.png',import.meta.url),Buffer.from(shot.data,'base64'));}
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await setInput('[aria-label="Search annual table rows"]','reversed');assert.equal(await evaluate("document.querySelectorAll('.ag9-return-sections tbody tr').length"),1);
  await setInput('[aria-label="Search annual table rows"]','');
  await click('4. Outward supplies (B2B, B2C, exports)');await wait("!!document.querySelector('[role=dialog]')");assert.ok(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Net Outward (Notes Already Included)')"));await close();
  await evaluate("document.querySelector('.ag9-compliance-toggle').click()");assert.equal(await evaluate("document.querySelector('.ag9-compliance-tiles')"),null);await evaluate("document.querySelector('.ag9-compliance-toggle').click()");
  await click('Calculate Annual Summary');await wait("document.querySelectorAll('.ag9-summary-panels>.ag9-card').length===4");
  await click('Books vs Returns');await wait("!!document.querySelector('.ag9-chart')");
  await evaluate('document.querySelector(\'[aria-label="Branch summary"]\').click()');await wait("!!document.querySelector('.ag9-dropdown-menu button')");await evaluate("Array.from(document.querySelectorAll('.ag9-dropdown-menu button')).find(e=>e.textContent.trim()==='HQ').click()");
  assert.equal(await evaluate("document.querySelector('table[aria-label=\"Branch annual sources\"] tbody tr:first-child td').textContent"),'HQ');
  await click('Filing History');assert.ok(await evaluate("document.querySelector('.ag9-history').innerText.includes('October 2026')"));
  await click('Validate Return');await wait("document.querySelector('[role=dialog]')?.innerText.includes('Reconciliation Checks')");await close();assert.ok(await evaluate("!!document.querySelector('.ag9-validation')"));
  await click('Preview GSTR-9');await wait("document.querySelector('[role=dialog]')?.innerText.includes('GSTR-9 Annual Preview')");await click('Print Summary');assert.equal(await evaluate('window.printed'),1);await close();
  await click('Download Draft');const draft=JSON.parse(await evaluate('window.lastExport.text()'));assert.equal(draft.fy,'2026-27');assert.equal(draft.exportType,'GoBook annual review data');
  await click('Annual Export');await wait("document.querySelector('[role=dialog]')?.innerText.includes('Annual Review Export')");await click('Download CSV');assert.ok((await evaluate('window.lastExport.text()')).includes('Supplies made to registered persons'));await close();
  await click('Reports');assert.ok(await evaluate("document.querySelector('.ag9-reports').innerText.includes('Downloaded this session')"));
  await click('Return Preparation');await evaluate('document.querySelector(\'[aria-label="Financial Year"]\').click()');await wait("!!document.querySelector('.ag9-dropdown-menu button')");await evaluate("Array.from(document.querySelectorAll('.ag9-dropdown-menu button')).find(e=>e.textContent.includes('2025-26')).click()");
  await wait("document.querySelector('.ag9-page').getAttribute('aria-busy')==='false' && document.querySelector('.ag9-stat strong').textContent.replace(/[^0-9.]/g,'')==='0.00'");
  assert.deepEqual(errors,[]);console.log('PASS GSTR-9 reference layout with real API values, no module sidebar, 5 responsive widths, section search/details, compliance collapse, annual summary, monthly/branch comparison, history, validation, preview/print, CSV/JSON and empty financial year');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./gstr9-reference-run.mjs', import.meta.url);
try { await fs.writeFile(runner, prefix + checks.replace('EXPECTED_TURNOVER', String(expectedTurnover))); await import(runner.href); console.log('PASS '+requests.length+' actual annual API requests'); }
finally { await fs.unlink(runner).catch(() => {}); await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
