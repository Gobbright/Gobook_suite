import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from '../../backend/node_modules/express/index.js';
import PDFDocument from '../../backend/node_modules/pdfkit/js/pdfkit.js';
import pngjs from '../node_modules/pngjs/lib/png.js';
import { createCanvas } from '../../backend/node_modules/@napi-rs/canvas/index.js';
import { build, createServer as createViteServer } from '../node_modules/vite/dist/node/index.js';
import configFactory from '../vite.config.js';
const frontend = fileURLToPath(new URL('../', import.meta.url));
const development = process.argv.includes('--dev');
const harness = new URL('../purchase-pdf-production-qa.html', import.meta.url);
const outDir = fileURLToPath(new URL('../../backend/runtime/pdf-worker-production-build/', import.meta.url));
const pdfPath = new URL('../../backend/runtime/purchase-worker-fixture.pdf', import.meta.url);
await fs.mkdir(new URL('../../backend/runtime/', import.meta.url), { recursive: true });
async function makeInvoice(target, includeQuantity) {
  const chunks=[], pdf=new PDFDocument({size:'A4'});pdf.on('data',chunk=>chunks.push(chunk));const done=new Promise(resolve=>pdf.on('end',resolve));
  pdf.fontSize(14).text('Supplier: Worker QA Supplier',40,40).text('Invoice No: PDF-QA-1',40,65).text('Invoice Date: 14/11/2026',40,90);
  pdf.fontSize(10);
  for(const [text,x] of [['Description',40],['Qty',240],['Unit',280],['Rate',340],['Disc %',400],['GST %',460],['Amount',520]])pdf.text(text,x,180,{lineBreak:false});
  for(const [text,x] of [['Worker test item',40],...(includeQuantity?[['5',269]]:[]),['Nos',280],['100',340],['0',400],['18%',460],['590',520]])pdf.text(text,x,205,{lineBreak:false});
  pdf.text('Grand Total: 590.00',40,250);pdf.end();await done;await fs.writeFile(target,Buffer.concat(chunks));
}
await makeInvoice(pdfPath,true);await makeInvoice(new URL('../../backend/runtime/purchase-missing-qty-fixture.pdf',import.meta.url),false);
async function makeVariantInvoice() {
  const chunks=[],pdf=new PDFDocument({size:'A4'});pdf.on('data',chunk=>chunks.push(chunk));const done=new Promise(resolve=>pdf.on('end',resolve));
  const logo=new pngjs.PNG({width:800,height:400});logo.data.fill(230);
  pdf.image(pngjs.PNG.sync.write(logo),500,30,{width:60,height:30});
  pdf.fontSize(12).text('Supplier: Variant QA Supplier',40,40).text('Invoice No: VAR-QA-1',40,65).text('Invoice Date: 14/11/2026',40,90).fontSize(10);
  for(const [label,x] of [['Description',40],['Size',200],['Colour',260],['Qty',340],['Rate',400],['GST %',460],['Amount',520]])pdf.text(label,x,180,{lineBreak:false});
  for(const [i,size,colour,qty] of [[0,'M','Black',2],[1,'L','White',3],[2,'XL','Blue',4]]) {
    for(const [label,x] of [[i===1?'Shirt':'',40],[size,200],[colour,260],[String(qty),340],['100',400],['5%',460],[String(qty*100),520]])if(label)pdf.text(label,x,205+i*25,{lineBreak:false});
  }
  pdf.text('Grand Total: 945.00',40,300);pdf.end();await done;await fs.writeFile(new URL('../../backend/runtime/purchase-variants-fixture.pdf',import.meta.url),Buffer.concat(chunks));
}
await makeVariantInvoice();
async function makeScannedInvoice() {
  const canvas=createCanvas(1800,2520),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1800,2520);ctx.fillStyle='black';ctx.font='30px Arial';
  for(const [label,x,y] of [['Supplier: Local Supplier',40,50],['Invoice No: SCAN-100',40,80],['Invoice Date: 14/11/2026',40,110],['Description',40,180],['Size',200,180],['Colour',260,180],['Qty',340,180],['Rate',400,180],['GST %',460,180],['Amount',520,180],['Shirt',40,230],['M',200,205],['Black',260,205],['2',340,205],['100',400,205],['5%',460,205],['200',520,205],['L',200,230],['White',260,230],['3',340,230],['100',400,230],['5%',460,230],['300',520,230],['XL',200,255],['Blue',260,255],['4',340,255],['100',400,255],['5%',460,255],['400',520,255],['Grand Total: 945.00',40,310]])ctx.fillText(label,x*3,y*3);
  await fs.writeFile(new URL('../../backend/runtime/purchase-scanned-fixture.png',import.meta.url),canvas.toBuffer('image/png'));
  const pdf=new PDFDocument({size:[600,840],margin:0}),chunks=[];pdf.on('data',chunk=>chunks.push(chunk));const done=new Promise(resolve=>pdf.on('end',resolve));pdf.image(canvas.toBuffer('image/png'),0,0,{width:600,height:840});pdf.end();await done;await fs.writeFile(new URL('../../backend/runtime/purchase-scanned-fixture.pdf',import.meta.url),Buffer.concat(chunks));
}
await makeScannedInvoice();
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{PurchasePdfImport}from'/src/features/categories/retail/modules/sales/shared/PurchasePdfImport.jsx';import{api}from'/src/services/api.js';import'/src/index.css';
window.workerUrls=[];window.Worker=new Proxy(window.Worker,{construct(Target,args){window.workerUrls.push(String(args[0]));return Reflect.construct(Target,args)}});
api.purchasePdfCapabilities=async()=>({enabled:!['variants-no-ai','scan-no-ai'].includes(window.qaMode)});api.analysePurchasePdf=async payload=>{window.analysisCalls=(window.analysisCalls||0)+1;window.analysedPages=payload.pages;return{data:{vendor:{name:'Worker QA Supplier',gstin:'33AAAAA1111A1Z5'},invoiceNo:'PDF-QA-1',date:'2026-11-14',invoiceAmount:590,items:[{description:'Worker test item',qty:window.qaMode==='conflict'?6:null,rate:100,gstRate:18,discount:0,sourceAmount:590,sourcePage:1,uncertainFields:window.qaMode==='conflict'?[]:['qty']}],charges:[],warnings:[]}}};
if(new URLSearchParams(location.search).has('entry')) {
  localStorage.setItem('gobook.user',JSON.stringify({id:'pdf-qa',category:'retail',retailSubcategory:'fashion-lifestyle',role:'Super Admin'}));
  window.apiWrites=[];
  for(const name of Object.keys(api))if(typeof api[name]==='function')api[name]=async()=>{if(/create|update|delete|record|upload/i.test(name))window.apiWrites.push(name);return [];};
  api.getSettings=async()=>({businessName:'PDF QA',retailSubcategory:'fashion-lifestyle',state:'Tamil Nadu'});api.getNextNumber=async()=>({number:'PE-QA-1'});api.invListProducts=async()=>({data:[]});
  const [{MemoryRouter},{KeyboardModeProvider},{CreateDocumentPage}]=await Promise.all([import('react-router-dom'),import('/src/app/KeyboardModeContext.jsx'),import('/src/features/categories/retail/modules/sales/shared/CreateDocumentPage.jsx')]);
  createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(KeyboardModeProvider,null,React.createElement(CreateDocumentPage,{documentType:'purchase-entry'}))));
} else createRoot(document.getElementById('root')).render(React.createElement(PurchasePdfImport,{products:[],vendors:[],hasItems:false,onApply:data=>{window.appliedPurchase=data;}}));
</script></body></html>`;
await fs.writeFile(harness,html);
process.env.VITE_API_URL='https://build-check.example.test/api';process.env.VITE_GOOGLE_CLIENT_ID='1234567890-buildcheck.apps.googleusercontent.com';
const config=configFactory({command:development?'serve':'build',mode:development?'development':'production'});
let vite;
if (development) vite=await createViteServer({...config,configFile:false,root:frontend,logLevel:'warn',appType:'mpa',server:{middlewareMode:true}});
else {
  try { await build({...config,configFile:false,root:frontend,logLevel:'warn',build:{outDir,emptyOutDir:true,rolldownOptions:{input:{app:fileURLToPath(new URL('../index.html',import.meta.url)),qa:fileURLToPath(harness)}}}}); }
  finally {await fs.unlink(harness).catch(()=>{});}
}
const app=express(), requests=[];
// Reproduce the production host's binary .mjs response. Corrected workers must use .js.
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.on('finish',()=>requests.push({path:req.path,status:res.statusCode,type:res.get('Content-Type')}));if(!development&&req.path.endsWith('.mjs'))res.type('application/octet-stream');next();});
if (vite) app.use(vite.middlewares);
else app.use(express.static(outDir,{setHeaders:(res,path)=>{if(path.endsWith('.mjs'))res.setHeader('Content-Type','application/octet-stream');}}));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const prefix="import fs from 'node:fs/promises';\nimport { fileURLToPath } from 'node:url';\nimport assert from 'node:assert/strict';\nimport { spawn } from 'node:child_process';\nconst chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9383',`--user-data-dir=${fileURLToPath(new URL('../../backend/runtime/pdf-worker-production-profile',import.meta.url))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});\r\nlet ws;\r\ntry {\r\n  let targets;\r\n  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9383/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}\r\n  assert.ok(targets?.some(t=>t.type==='page'),'QA Chrome did not start');\r\n  await new Promise(r=>setTimeout(r,500));\r\n  targets=await(await fetch('http://127.0.0.1:9383/json')).json();\r\n  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);\r\n  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});\r\n  let id=0;const pending=new Map(),errors=[];\r\n  ws.onclose=event=>{for(const p of pending.values())p.reject(new Error('Browser connection closed: '+event.code+' '+event.reason));pending.clear();};\r\n  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};\r\n  function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}\r\n  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}\r\n  async function wait(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression+'; '+errors.join('\\n')+'; '+await evaluate('document.body.innerText.slice(0,1200)'));}\r\n  await send('Runtime.enable');await send('Page.enable');\r\n\r\n  async function setInput(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,120));}\r\n";
const checks=String.raw`
  await send('Page.navigate',{url:QA_URL});await wait("!!document.querySelector('[aria-label=\"Purchase bill PDF\"]')");
  const doc=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../../backend/runtime/purchase-worker-fixture.pdf',import.meta.url))]});
  await wait("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')");
  assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
  assert.ok(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Review')"));
  const workerUrls=await evaluate('window.workerUrls');assert.ok(workerUrls.some(url=>url.includes('pdf.worker')),JSON.stringify(workerUrls));if(!DEVELOPMENT_MODE){assert.ok(workerUrls.some(url=>/pdf\.worker.*\.js($|\?)/.test(url)),JSON.stringify(workerUrls));assert.ok(workerUrls.every(url=>!url.includes('.mjs')),JSON.stringify(workerUrls));}
  assert.equal(await evaluate('window.analysisCalls||0'),0,'Readable PDF must not call cloud analysis');
  assert.equal(await evaluate('window.appliedPurchase'),undefined);
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");
  await wait('!!window.appliedPurchase');assert.equal(await evaluate('window.appliedPurchase.items[0].description'),'Worker test item');assert.equal(await evaluate('window.appliedPurchase.items[0].qty'),5);
  await evaluate("window.qaMode='unreadable'");
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../../backend/runtime/purchase-missing-qty-fixture.pdf',import.meta.url))]});
  await wait("!!document.querySelector('[role=dialog]')");assert.equal(await evaluate("document.querySelector('[aria-label=\"qty item 1\"]').value"),'');assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').disabled"),true);
  assert.equal(await evaluate('window.appliedPurchase.items[0].qty'),5);
  await evaluate("(()=>{const e=document.querySelector('[aria-label=\"qty item 1\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'5');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await wait("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').disabled===false");
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");await wait("!document.querySelector('[role=dialog]')");
  const analysisCalls=await evaluate('window.analysisCalls||0');await evaluate("window.qaMode='variants-no-ai'");
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../../backend/runtime/purchase-variants-fixture.pdf',import.meta.url))]});
  await wait("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')");
  assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').disabled"),false);
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");await wait("!document.querySelector('[role=dialog]')");
  const variants=await evaluate('window.appliedPurchase.items');assert.equal(variants.length,3);assert.deepEqual(variants.map(item=>item.qty),[2,3,4]);assert.deepEqual(variants.map(item=>item.description),['Shirt','Shirt','Shirt']);assert.deepEqual(variants.map(item=>item.size),['M','L','XL']);assert.deepEqual(variants.map(item=>item.colour),['Black','White','Blue']);assert.ok(variants.every(item=>item.productType==='Matrix'));
  assert.equal(await evaluate('window.analysisCalls||0'),analysisCalls,'Readable variants must not require automatic analysis');
  const { purchasePdfCases } = await import('../tests/fixtures/purchase-pdf/expected.mjs');
  for (const fixture of purchasePdfCases) {
    const workersBefore=await evaluate('window.workerUrls.length');
    await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../tests/fixtures/purchase-pdf/'+fixture.file,import.meta.url))]});
    await wait("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')");
    assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"PDF validation issues\"]')?.innerText||''"),'');
    assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').disabled"),false);
    assert.equal(await evaluate('window.analysisCalls||0'),0);
    assert.ok((await evaluate('window.workerUrls.slice('+workersBefore+')')).every(url=>!url.includes('purchase-ocr')),'Selectable originals must not initialize OCR');
    await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");await wait("!document.querySelector('[role=dialog]')");
    const applied=await evaluate('window.appliedPurchase');
    assert.equal(applied.vendor.name,'Sri Lakshmi Textiles');assert.equal(applied.vendor.gstin,'33AABCS1234F1Z5');assert.equal(applied.invoiceNo,fixture.invoiceNo);assert.equal(applied.date,'2026-11-14');assert.equal(applied.invoiceAmount,fixture.invoiceAmount);
    assert.equal(applied.items.length,fixture.rows.length);
    for(const [index,expected] of fixture.rows.entries())assert.deepEqual(Object.fromEntries(Object.keys(expected).map(field=>[field,applied.items[index][field]])),expected);
    console.log('PASS original PDF upload/review/apply: '+fixture.file);
  }
  await evaluate("window.qaMode='scan-no-ai'");
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('../../backend/runtime/purchase-scanned-fixture.pdf',import.meta.url))]});
  // Local OCR includes the actual same-origin worker, WASM engine and English model.
  for(let n=0;n<600;n++){if(await evaluate("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')"))break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
  assert.ok(await evaluate("document.querySelector('[role=dialog]')?.innerText.includes('local OCR')"),await evaluate('document.body.innerText.slice(0,1800)'));
  assert.deepEqual(await evaluate("[1,2,3].map(index=>document.querySelector('[aria-label=\"qty item '+index+'\"]').value)"),['2','3','4'],await evaluate("JSON.stringify(Array.from(document.querySelectorAll('.purchase-pdf-table input')).map(input=>[input.getAttribute('aria-label'),input.value]))"));
  assert.equal(await evaluate('window.analysisCalls||0'),analysisCalls,'Image-only PDFs must work without the cloud analysis endpoint');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').disabled"),false);
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");await wait("!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate('window.appliedPurchase.vendor.name'),'Local Supplier');
  assert.equal(await evaluate('window.appliedPurchase.invoiceNo'),'SCAN-100');
  assert.deepEqual(await evaluate('window.appliedPurchase.items.map(item=>item.size)'),['M','L','XL']);
  const entryUrl=await evaluate('location.origin+location.pathname+"?entry=1"');
  for (const fixture of purchasePdfCases) {
    await send('Page.navigate',{url:entryUrl});await wait("!!document.querySelector('[aria-label=\"Purchase bill PDF\"]')");
    const entryDoc=await send('DOM.getDocument'),entryInput=await send('DOM.querySelector',{nodeId:entryDoc.root.nodeId,selector:'input[aria-label="Purchase bill PDF"]'});
    await send('DOM.setFileInputFiles',{nodeId:entryInput.nodeId,files:[fileURLToPath(new URL('../tests/fixtures/purchase-pdf/'+fixture.file,import.meta.url))]});
    await wait("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')");
    assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
    await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");await wait("!document.querySelector('[role=dialog]')");
    assert.equal(await evaluate("document.querySelector('[placeholder=\"Vendor invoice number\"]').value"),fixture.invoiceNo);
    assert.equal(Number(await evaluate("document.querySelector('[placeholder=\"Vendor invoice total\"]').value")),fixture.invoiceAmount);
    assert.equal(await evaluate("document.querySelectorAll('[data-col=qty]').length"),fixture.rows.length);
    for(const [index,row] of fixture.rows.entries())for(const field of ['description','qty','rate','hsn','gstRate']) {
      assert.equal(await evaluate("document.querySelector('[data-row=\""+index+"\"][data-col=\""+field+"\"]').value"),String(row[field]),fixture.file+' entry row '+index+' '+field);
    }
    assert.ok(await evaluate("document.body.innerText.includes('Vendor amount matched')"),await evaluate("document.querySelector('.billing-po-match-row')?.innerText||document.body.innerText.slice(-2500)"));
    await setInput('[data-row="0"][data-col="qty"]',String(fixture.rows[0].qty+1));
    await wait("document.body.innerText.includes('Vendor amount mismatch')");
    await setInput('[data-row="0"][data-col="qty"]',String(fixture.rows[0].qty));
    await wait("document.body.innerText.includes('Vendor amount matched')");
    assert.deepEqual(await evaluate('window.apiWrites'),[],'Review/apply must not create purchases, products or stock changes');
    assert.ok((await evaluate('window.workerUrls')).every(url=>!url.includes('purchase-ocr')));
    console.log('PASS actual Purchase Entry form populated without writes: '+fixture.file);
  }
  assert.deepEqual(errors,[]);console.log('PASS production PDF upload without Groq: real text parsing, right-aligned Qty, missing Qty blocked, manual correction, variants and scanned multi-variant PDF through actual local OCR and apply; binary .mjs host emulated');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();}
`.replace('QA_URL',JSON.stringify('http://127.0.0.1:'+server.address().port+'/purchase-pdf-production-qa.html')).replace('DEVELOPMENT_MODE',JSON.stringify(development));
const runner=new URL('./.purchase-pdf-production-run.mjs',import.meta.url);
try{await fs.writeFile(runner,prefix+checks);await import(runner.href);console.log(JSON.stringify(requests.filter(row=>row.path.includes('worker'))));}
finally{await fs.unlink(runner).catch(()=>{});await vite?.close();await fs.unlink(harness).catch(()=>{});await new Promise(resolve=>server.close(resolve));}
