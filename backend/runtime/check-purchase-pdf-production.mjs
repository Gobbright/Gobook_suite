import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import PDFDocument from 'pdfkit';
import { build } from '../../frontend/node_modules/vite/dist/node/index.js';
import configFactory from '../../frontend/vite.config.js';
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const harness = new URL('../../frontend/purchase-pdf-production-qa.html', import.meta.url);
const outDir = fileURLToPath(new URL('./pdf-worker-production-build/', import.meta.url));
const pdfPath = new URL('./purchase-worker-fixture.pdf', import.meta.url);
const chunks = [], pdf = new PDFDocument({ size: 'A4' });pdf.on('data',chunk=>chunks.push(chunk));
const pdfDone = new Promise(resolve=>pdf.on('end',resolve));
pdf.fontSize(14).text('Supplier: Worker QA Supplier').text('Invoice No: PDF-QA-1').text('Invoice Date: 14/11/2026');
pdf.moveDown().fontSize(11).text('Product                         Qty       Rate       GST       Amount').text('Worker test item                 1        100        18%       118');pdf.text('Grand Total: 118.00');pdf.end();await pdfDone;await fs.writeFile(pdfPath,Buffer.concat(chunks));
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import{PurchasePdfImport}from'/src/features/categories/retail/modules/sales/shared/PurchasePdfImport.jsx';import{api}from'/src/services/api.js';import'/src/index.css';
window.workerUrls=[];window.Worker=new Proxy(window.Worker,{construct(Target,args){window.workerUrls.push(String(args[0]));return Reflect.construct(Target,args)}});
api.purchasePdfCapabilities=async()=>({enabled:true});api.analysePurchasePdf=async payload=>{window.analysedPages=payload.pages;return{data:{vendor:{name:'Worker QA Supplier',gstin:'33AAAAA1111A1Z5'},invoiceNo:'PDF-QA-1',date:'2026-11-14',invoiceAmount:118,items:[{description:'Worker test item',qty:1,rate:100,gstRate:18,discount:0,sourceAmount:118}],charges:[],warnings:[]}}};
createRoot(document.getElementById('root')).render(React.createElement(PurchasePdfImport,{products:[],vendors:[],hasItems:false,onApply:data=>{window.appliedPurchase=data;}}));
</script></body></html>`;
await fs.writeFile(harness,html);
process.env.VITE_API_URL='https://build-check.example.test/api';process.env.VITE_GOOGLE_CLIENT_ID='1234567890-buildcheck.apps.googleusercontent.com';
const config=configFactory({command:'build',mode:'production'});
try { await build({...config,configFile:false,root:frontend,logLevel:'warn',build:{outDir,emptyOutDir:true,rolldownOptions:{input:{app:fileURLToPath(new URL('../../frontend/index.html',import.meta.url)),qa:fileURLToPath(harness)}}}}); }
finally {await fs.unlink(harness).catch(()=>{});}
const app=express(), requests=[];
// Reproduce the production host's binary .mjs response. Corrected workers must use .js.
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.on('finish',()=>requests.push({path:req.path,status:res.statusCode,type:res.get('Content-Type')}));if(req.path.endsWith('.mjs'))res.type('application/octet-stream');next();});
app.use(express.static(outDir,{setHeaders:(res,path)=>{if(path.endsWith('.mjs'))res.setHeader('Content-Type','application/octet-stream');}}));
const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
const original=await fs.readFile(new URL('./check-b2c-application.mjs',import.meta.url),'utf8');let prefix=original.slice(0,original.indexOf('  const cases='));
prefix=prefix.replaceAll('9337','9383').replaceAll('./b2c-chrome-profile','./pdf-worker-production-profile');
prefix=prefix.slice(0,prefix.indexOf('const html='))+prefix.slice(prefix.indexOf('const chrome='));
prefix=prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('./unused-pdf-worker-fixture.html',import.meta.url);");
const checks=String.raw`
  await send('Page.navigate',{url:QA_URL});await wait("!!document.querySelector('[aria-label=\"Purchase bill PDF\"]')");
  const doc=await send('DOM.getDocument');const input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[fileURLToPath(new URL('./purchase-worker-fixture.pdf',import.meta.url))]});
  await wait("!!document.querySelector('[role=dialog]') || !!document.querySelector('.purchase-pdf-upload-error')");
  assert.equal(await evaluate("document.querySelector('.purchase-pdf-upload-error')?.innerText||''"),'');
  assert.ok(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Review')"));
  const workerUrls=await evaluate('window.workerUrls');assert.ok(workerUrls.some(url=>/pdf\.worker.*\.js($|\?)/.test(url)),JSON.stringify(workerUrls));assert.ok(workerUrls.every(url=>!url.includes('.mjs')),JSON.stringify(workerUrls));
  assert.ok(await evaluate("window.analysedPages[0].text.includes('PDF-QA-1') && window.analysedPages[0].image.startsWith('data:image/jpeg')"),'Actual PDF parsing and page rendering completed');
  assert.equal(await evaluate('window.appliedPurchase'),undefined);
  await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Apply to Purchase Entry').click()");
  await wait('!!window.appliedPurchase');assert.equal(await evaluate('window.appliedPurchase.items[0].description'),'Worker test item');
  assert.deepEqual(errors,[]);console.log('PASS production build PDF upload: separate .js module worker, selectable text extraction, actual page rendering, review and apply; binary .mjs host emulated');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();}
`.replace('QA_URL',JSON.stringify('http://127.0.0.1:'+server.address().port+'/purchase-pdf-production-qa.html'));
const runner=new URL('./pdf-worker-production-run.mjs',import.meta.url);
try{await fs.writeFile(runner,prefix+checks);await import(runner.href);console.log(JSON.stringify(requests.filter(row=>row.path.includes('worker'))));}
finally{await fs.unlink(runner).catch(()=>{});await new Promise(resolve=>server.close(resolve));}
