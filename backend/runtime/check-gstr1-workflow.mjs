import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { gstRouter } from '../src/modules/retail/gst/routes.js';
import { seedGstDashboardFixture } from '../tests/fixtures/gstDashboardFixture.js';
import { Invoice } from '../src/models/Invoice.js';
const dbName = 'gobook_gst_workflow_ui_' + randomUUID().replaceAll('-', '');
await mongoose.connect('mongodb://127.0.0.1:27029', { dbName });
const fixtureData = await seedGstDashboardFixture();
await Invoice.updateMany({ userId: { $in: [fixtureData.owner, fixtureData.member] }, number: { $ne: 'GST-PREVIOUS-1' } }, { $set: { 'customer.state': 'Tamil Nadu', 'meta.date': '2026-11-03', 'items.$[].hsn': '8471' } });
const app = express(), requests = [];
app.use(express.json());
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  req.user = fixtureData.actor;
  const start = performance.now(); res.on('finish', () => requests.push({ path: req.path, method: req.method, status: res.statusCode, ms: Math.round(performance.now() - start) }));
  next();
});
app.use('/api/gst', gstRouter);
app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ message: error.message }));
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{Gstr1Page}from'/src/features/categories/common/modules/gst/Gstr1Page.jsx';import'/src/index.css';
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.includes('/gst/'))url='http://127.0.0.1:${server.address().port}'+address.pathname+address.search;return originalFetch(url,options)};
const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/gstr-1?period=November%202026']},React.createElement(Gstr1Page)));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('../../frontend/gstr1-workflow-qa.html',import.meta.url);");
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix = prefix.replaceAll('9337', '9361').replaceAll('./b2c-chrome-profile', './gstr1-workflow-profile');
const checks = String.raw`
  const button = text => "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+")";
  const click = async text => {assert.equal(await evaluate(button(text)+'.disabled'),false,text+' should be enabled');await evaluate(button(text)+'.click()');};
  const close = async () => evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  const loaded = () => wait("document.querySelector('.ag1-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('Stored GST Business')");
  const steps = () => evaluate("document.querySelectorAll('.ag1-filing-progress .complete').length");
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/gstr1-workflow-qa.html'});await loaded();
  assert.equal(await steps(),1);
  assert.equal(await evaluate(button('Generate Summary')+'.disabled'),true);
  assert.equal(await evaluate(button('Record Portal Filing')+'.disabled'),true);
  assert.equal(await evaluate("document.querySelectorAll('.ag1-stat').length"),5);
  assert.ok(await evaluate("!document.querySelector('.ag1-sidebar')"));
  for(const width of [1672,1366,1024,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await click('Validate Data');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Validation saved: 0 error')");
  assert.equal(await steps(),2);
  await click('Generate Summary');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Summary saved')");
  assert.equal(await steps(),4);
  await evaluate('window.reloadMarker=true');await send('Page.reload');await wait('!window.reloadMarker');await loaded();assert.equal(await steps(),4);
  await click('Prepare GSTR-1 Export');await wait("!!document.querySelector('[role=dialog]')");
  for(const [label,type] of [['Download CSV','csv'],['Download Review JSON','json'],['Download PDF','pdf']]){
    await evaluate('window.lastExport=null');await click(label);await wait('!!window.lastExport');
    if(type==='json')assert.equal(JSON.parse(await evaluate('window.lastExport.text()')).documents.length,5);
    if(type==='csv')assert.ok((await evaluate('window.lastExport.text()')).includes('GST-SALE-2'));
    if(type==='pdf')assert.equal(await evaluate('window.lastExport.slice(0,5).text()'),'%PDF-');
    await wait(button(label)+'.disabled===false');
  }
  await globalThis.changeGstr1BillingSource();
  await click('Download Review JSON');await wait("document.querySelector('[role=dialog] [role=alert]')?.innerText.includes('Billing data changed')");
  await wait(button('Generate Summary')+'.disabled===true');assert.equal(await steps(),1);
  await close();await click('Validate Data');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Validation saved: 0 error')");
  await click('Generate Summary');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Summary saved')");assert.equal(await steps(),4);
  await click('Record Portal Filing');await wait("!!document.querySelector('.ag1-filing-form')");
  assert.ok(await evaluate("document.querySelector('.ag1-filing-form').innerText.includes('does not submit or verify')"));
  await setInput('.ag1-filing-form input:not([type])','AA3311267654321');
  await setInput('.ag1-filing-form input[type=date]','2026-11-14');
  await evaluate("document.querySelector('.ag1-filing-form input[type=checkbox]').click()");
  await click('Save Acknowledgement');await wait("document.querySelector('.ag1-history')?.innerText.includes('AA3311267654321')");
  assert.equal(await steps(),5);
  assert.ok(await evaluate("document.querySelector('.ag1-history').innerText.includes('not verified online')"));
  await evaluate('window.reloadMarker=true');await send('Page.reload');await wait('!window.reloadMarker');await loaded();assert.equal(await steps(),5);
  assert.equal(await evaluate(button('Record Portal Filing')+'.disabled'),true);
  assert.equal(await evaluate(button('Validate Data')+'.disabled'),true);
  await click('Filing History');assert.ok(await evaluate("document.querySelector('.ag1-history').innerText.includes('AA3311267654321')"));
  assert.ok(await evaluate("document.querySelector('.ag1-history').innerText.toLowerCase().includes('exported pdf')"));
  await evaluate('document.querySelector(\'[aria-label="Tax Period"]\').click()');
  await wait("!!document.querySelector('.ag1-dropdown-menu button')");
  await evaluate("Array.from(document.querySelectorAll('.ag1-dropdown-menu button')).find(e=>e.textContent.includes('Apr 2026')).click()");
  await wait("document.querySelector('.ag1-page').getAttribute('aria-busy')==='false' && !!document.querySelector('.ag1-empty-confirm')");
  assert.equal(await steps(),1);
  assert.equal(await evaluate(button('Validate Data')+'.disabled'),true);
  await evaluate("document.querySelector('.ag1-empty-confirm input').click()");
  await click('Validate Data');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Validation saved: 0 error')");
  await click('Generate Summary');await wait("document.querySelector('.ag1-notice')?.innerText.includes('Summary saved')");assert.equal(await steps(),4);
  assert.deepEqual(errors,[]);
  console.log('PASS: real API workflow, validation gating, persisted progress, CSV/JSON/PDF downloads, manual receipt, frozen record, empty month and five responsive widths');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
globalThis.changeGstr1BillingSource = () => Invoice.updateOne({ userId: fixtureData.owner, number: 'GST-SALE-1' }, { $set: { 'items.0.rate': 1200 } });
const runner = new URL('./gstr1-workflow-run.mjs', import.meta.url);
try { await fs.writeFile(runner, prefix + checks); await import(runner.href); console.log(JSON.stringify(requests)); }
finally { await fs.unlink(runner).catch(() => {}); await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
