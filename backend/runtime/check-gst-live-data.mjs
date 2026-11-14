import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { getGstDashboard } from '../src/modules/retail/gst/dashboardController.js';
import { seedGstDashboardFixture } from '../tests/fixtures/gstDashboardFixture.js';
const dbName='gobook_gst_browser_'+randomUUID().replaceAll('-','');
await mongoose.connect('mongodb://127.0.0.1:27029',{dbName});
const fixtureData=await seedGstDashboardFixture();
const app=express();const requests=[];
app.use((req,res,next)=>{res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS')return res.sendStatus(200);req.user=fixtureData.actor;next();});
app.get('/api/gst/dashboard',(req,res,next)=>{requests.push(req.query.period);return getGstDashboard(req,res,next);});
app.use((error,req,res,next)=>res.status(500).json({message:error.message}));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{GstDashboard}from'/src/features/categories/common/modules/gst/GstDashboard.jsx';import'/src/index.css';
const originalFetch=window.fetch;window.fetch=(url,options)=>{const address=new URL(url,location.href);if(address.pathname.endsWith('/gst/dashboard'))url='http://127.0.0.1:${server.address().port}/api/gst/dashboard'+address.search;return originalFetch(url,options)};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/gst-dashboard']},React.createElement(GstDashboard)));
</script></body></html>`;
const original=await fs.readFile(new URL('./check-b2c-application.mjs',import.meta.url),'utf8');
let prefix=original.slice(0,original.indexOf('  const cases='));
prefix=prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);","const fixture=new URL('../../frontend/gst-live-qa.html',import.meta.url);");
prefix=prefix.slice(0,prefix.indexOf('const html='))+'const html='+JSON.stringify(html)+';\n'+prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix=prefix.replaceAll('9337','9353').replaceAll('./b2c-chrome-profile','./gst-live-chrome-profile');
const checks=`
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/gst-live-qa.html'});
  await wait("document.querySelector('.agd-page')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("document.querySelector('.agd-business strong').textContent"),'Stored GST Business');
  const values=await evaluate("Array.from(document.querySelectorAll('.agd-stat strong')).map(e=>e.textContent)");
  assert.ok(values[0].includes('187.00'),JSON.stringify(values));assert.ok(values[1].includes('154.00'));assert.ok(values[2].includes('33.00'));assert.equal(values[3],'0 / 2');
  assert.equal(await evaluate("document.querySelectorAll('.agd-filing-table tbody tr').length"),2);
  assert.ok(await evaluate("document.querySelector('.agd-period-card').innerText.includes('4')"));
  assert.ok(await evaluate("document.querySelector('.agd-actions-card').innerText.includes('1 purchase invoice')"));
  assert.ok(await evaluate("document.querySelector('.agd-activity-card').innerText.includes('GST-SALE-1')"));
  assert.equal(await evaluate("!!document.querySelector('.agd-sidebar')"),false);
  assert.ok(await evaluate("!document.body.innerText.includes('27ZZZZZ9999A1Z5') && !document.body.innerText.includes('FOREIGN')"));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(new URL('./gst-dashboard-live-data.png',import.meta.url),Buffer.from(shot.data,'base64'));
  for(const width of [1672,1366,768,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);}
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelector('[aria-label=\\\"Filing period\\\"]').click()");await wait("!!document.querySelector('.agd-dropdown-menu button')");
  await evaluate("Array.from(document.querySelectorAll('.agd-dropdown-menu button')).find(e=>e.textContent.includes('Oct 2026')).click()");
  await wait("document.querySelector('.agd-page').getAttribute('aria-busy')==='false' && document.querySelector('.agd-stat strong').textContent.includes('103.00')");
  assert.ok(await evaluate("document.querySelectorAll('.agd-stat strong')[1].textContent.includes('11.00')"));
  assert.deepEqual(errors,[]);console.log('PASS dashboard displays tax, counts, filings, reconciliation and invoice activity from MongoDB through the real API; month selection and responsive layout');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner=new URL('./gst-live-browser-run.mjs',import.meta.url);
try{await fs.writeFile(runner,prefix+checks);await import(runner.href);console.log('PASS '+requests.length+' live GST API requests');}finally{await fs.unlink(runner).catch(()=>{});await new Promise(resolve=>server.close(resolve));await mongoose.connection.dropDatabase();await mongoose.disconnect();}
