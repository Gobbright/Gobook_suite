import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { gstRouter } from '../src/modules/retail/gst/routes.js';
import { seedGstDashboardFixture } from '../tests/fixtures/gstDashboardFixture.js';
import { Invoice } from '../src/models/Invoice.js';
await mongoose.connect('mongodb://127.0.0.1:27031/?replicaSet=gstr3bQaRs', { dbName: 'gobook_gst_3b_browser_' + randomUUID().replaceAll('-', '') });
const data = await seedGstDashboardFixture();
const app = express(), requests = [];
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', '*'); res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  req.user = data.actor;
  const start = performance.now(); res.on('finish', () => requests.push({ path: req.path, status: res.statusCode, ms: Math.round(performance.now() - start) })); next();
});
app.use('/api/gst', gstRouter);
app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{Gstr3bPage}from'/src/features/categories/common/modules/gst/Gstr3bPage.jsx';import'/src/index.css';
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.includes('/gst/'))url='http://127.0.0.1:${server.address().port}'+address.pathname+address.search;return originalFetch(url,options)};
const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/gstr-3b?period=November%202026']},React.createElement(Gstr3bPage)));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('../../frontend/gstr3b-live-qa.html',import.meta.url);");
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix = prefix.replaceAll('9337', '9367').replaceAll('./b2c-chrome-profile', './gstr3b-live-profile');
globalThis.addGstr3bLivePurchase = () => Invoice.collection.insertOne({ userId: data.member, businessId: data.businessId, branch: 'B1', number: 'LIVE-NEW-PURCHASE', documentType: 'purchase-entry', lifecycleStatus: 'posted', meta: { date: '2026-11-10' }, items: [{ qty: 1, rate: 100, gstRate: 18 }] });
const checks = String.raw`
  const button = text => "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+")";
  const click = async text => {assert.equal(await evaluate(button(text)+'.disabled'),false,text+' should be enabled');await evaluate(button(text)+'.click()');};
  const loaded = () => wait("document.querySelector('.ag3-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('Stored GST Business')");
  const amount = index => evaluate("document.querySelectorAll('.ag3-stat strong')["+index+"].textContent.replace(/[^0-9.]/g,'')");
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/gstr3b-live-qa.html'});await loaded();
  assert.equal(await amount(0),'187.00');assert.equal(await amount(1),'154.00');assert.equal(await amount(2),'33.00');
  assert.ok(await evaluate("document.querySelector('.ag3-validation').innerText.includes('4 outward, 2 purchases')"));
  assert.ok(await evaluate("!document.body.innerText.includes('27ZZZZZ9999A1Z5') && !document.querySelector('.ag3-sidebar')"));
  for(const width of [1672,1366,1024,768,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);}
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await click('ITC Details');assert.ok(await evaluate("document.querySelector('.ag3-details').innerText.includes('144.00')"));
  await click('Import from GSTR-2B');await wait("document.querySelector('[role=dialog]')?.innerText.includes('Linked statement invoices')");await click('Refresh Saved Statement');await loaded();await wait("!document.querySelector('[role=dialog]')");
  await click('Return Details');assert.ok(await evaluate("document.querySelector('.ag3-details').innerText.includes('inward supplies') && !document.querySelector('.ag3-details table[aria-label=\"Payment of tax\"]')"));
  await click('Import from GSTR-1');await wait("document.querySelector('[role=dialog]')?.innerText.includes('latest source totals')");await click('Import Latest Billing Totals');await loaded();await wait("!document.querySelector('[role=dialog]')");
  await click('Proceed to Payment');await wait("document.querySelector('[role=dialog]')?.innerText.includes('No GST API provider')");await evaluate('window.portalCalls=[];window.open=(...args)=>{window.portalCalls.push(args);return null;}');await click('Open GST Portal');assert.equal(await evaluate('window.portalCalls[0][0]'),'https://services.gst.gov.in/services/login');assert.ok(await evaluate("!document.querySelector('.ag3-progress li:last-child').classList.contains('complete')"));
  await click('File GSTR-3B');await wait("document.querySelector('[role=dialog]')?.innerText.includes('No GST API provider')");await evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  await click('ITC Details');await setInput('[aria-label="All other ITC (purchase entries) CGST"]','67');
  await click('Auto Populate');await wait("document.querySelector('.ag3-notice')?.innerText.includes('unsaved changes have been kept')");assert.equal(await evaluate("document.querySelector('[aria-label=\"All other ITC (purchase entries) CGST\"]').value"),'67');
  await click('Payment & Liability');await setInput('[aria-label="CGST Late Fee"]','12');
  await click('Save as Draft *');await wait("document.querySelector('.ag3-notice')?.innerText.includes('draft saved')");assert.equal(await amount(2),'55.00');
  await evaluate('window.reloadMarker=true');await send('Page.reload');await wait('!window.reloadMarker');await loaded();assert.equal(await amount(2),'55.00');
  await globalThis.addGstr3bLivePurchase();await click('Save as Draft');await wait("document.querySelector('[role=alert]')?.innerText.includes('Billing data changed')");
  await click('Retry');await loaded();await wait("document.querySelector('.ag3-validation').innerText.includes('4 outward, 3 purchases')");assert.equal(await amount(1),'162.00');assert.equal(await amount(2),'37.00');
  await click('Preview Return');await wait("!!document.querySelector('.ag3-preview-dialog table[aria-label=\"GSTR-3B return details\"]')");await evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  await click('Download Draft');await wait("!!document.querySelector('[role=dialog]')");await click('Review JSON');
  const review=JSON.parse(await evaluate('window.lastExport.text()'));assert.equal(review.summary.payable,37);assert.equal(review.invoiceCount,4);assert.equal(review.purchaseCount,3);assert.equal(review.business.name,'Stored GST Business');assert.ok(review.sourceHash);assert.equal(review.gstr2b.totalItc,144);assert.equal(review.capabilities.portalPayment,false);
  await evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  await click('Post Accounting Adjustment');await wait(button('Accounting Posted')+'?.disabled===true');
  await click('Filing History');assert.ok(await evaluate("document.querySelector('.ag3-history').innerText.includes('GST-')"));
  await evaluate('document.querySelector(\'[aria-label="Tax Period"]\').click()');await wait("!!document.querySelector('.ag3-dropdown-menu button')");await evaluate("Array.from(document.querySelectorAll('.ag3-dropdown-menu button')).find(e=>e.textContent.includes('Apr 2026')).click()");
  await wait("document.querySelector('.ag3-page').getAttribute('aria-busy')==='false' && document.querySelector('.ag3-stat strong').textContent.replace(/[^0-9.]/g,'')==='0.00'");assert.equal(await amount(1),'0.00');
  assert.deepEqual(errors,[]);console.log('PASS real MongoDB + API GSTR-3B values, business/member scope, saved edits, reload, purchase freshness, stale-save protection, review JSON, actual accounting voucher, empty period, responsive layout');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./gstr3b-live-run.mjs', import.meta.url);
try { await fs.writeFile(runner, prefix + checks); await import(runner.href); console.log(JSON.stringify(requests)); }
finally { await fs.unlink(runner).catch(() => {}); await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
