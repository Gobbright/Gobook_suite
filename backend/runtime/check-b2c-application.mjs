import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CATEGORIES,RETAIL_SUBCATEGORIES} from '../src/constants/categories.js';
const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {CreateDocumentPage} from '/src/features/categories/retail/modules/sales/shared/CreateDocumentPage.jsx';
import {KeyboardModeProvider} from '/src/app/KeyboardModeContext.jsx';
import {api} from '/src/services/api.js';
import '/src/index.css';
const params=new URLSearchParams(location.search),category=params.get('category')||'school',subcategory=params.get('subcategory')||'';
localStorage.setItem('gobook.user',JSON.stringify({id:'qa-only',category,retailSubcategory:subcategory,role:'Super Admin'}));
// Stub every API method: these browser checks must never write customer data.
for(const key of Object.keys(api))if(typeof api[key]==='function')api[key]=async()=>[];
const single={_id:'507f1f77bcf86cd799439002',description:'Sample item',code:'P1',barcode:'8901234567890',itemType:'Product',productType:'Standard',variants:[],stock:10,rate:100,gstRate:0,unit:'Kg'};
const service={...single,_id:'507f1f77bcf86cd799439003',description:'Sample service',code:'S1',barcode:'',itemType:'Service',rate:50,unit:'Hours'};
const variant={...single,_id:'507f1f77bcf86cd799439004',description:'Sample variants',code:'P2',variants:[{_id:'507f1f77bcf86cd799439005',size:'Small',stock:5,rate:100},{_id:'507f1f77bcf86cd799439006',size:'Large',stock:5,rate:150}]};
api.listCustomers=async()=>[];api.getSettings=async()=>({businessName:'QA Business',retailSubcategory:subcategory,state:'Tamil Nadu'});
api.listProducts=async()=>[single,service,variant];api.invListProducts=async()=>({data:[single,service,variant]});api.getNextNumber=async()=>({number:'INV-QA-0001'});
api.createInvoice=async(payload)=>{window.savedPayload=payload;sessionStorage.setItem('b2c-qa-saved',JSON.stringify(payload));return {...payload,_id:'507f1f77bcf86cd799439007',lifecycleStatus:'posted'}};
api.updateInvoice=async(id,payload)=>{window.savedPayload=payload;return {...payload,_id:id,lifecycleStatus:'posted'}};
api.getInvoice=async()=>({...JSON.parse(sessionStorage.getItem('b2c-qa-saved')),_id:'507f1f77bcf86cd799439007',lifecycleStatus:'posted'});
api.recordPayment=async(id,payload)=>{window.savedPayment=payload;return payload};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(KeyboardModeProvider,null,React.createElement(CreateDocumentPage,{documentType:'invoice',defaultBillingMode:params.get('b2b')?'b2b':'b2c',invoiceId:params.has('edit')?'507f1f77bcf86cd799439007':undefined}))));
window.qaReady=true;
</script></body></html>`;
await fs.writeFile(fixture,html);
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9337',`--user-data-dir=${fileURLToPath(new URL('./b2c-chrome-profile',import.meta.url))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let targets;
  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9337/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(targets?.some(t=>t.type==='page'),'QA Chrome did not start');
  await new Promise(r=>setTimeout(r,500));
  targets=await(await fetch('http://127.0.0.1:9337/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0;const pending=new Map(),errors=[];
  ws.onclose=event=>{for(const p of pending.values())p.reject(new Error('Browser connection closed: '+event.code+' '+event.reason));pending.clear();};
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function wait(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression+'; '+errors.join('\n')+'; '+await evaluate('document.body.innerText.slice(0,1200)'));}
  await send('Runtime.enable');await send('Page.enable');

  async function setInput(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,120));}
  const cases=[...CATEGORIES.map(category=>({category})),...RETAIL_SUBCATEGORIES.map(subcategory=>({category:'retail',subcategory}))];
  for(const item of cases){
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://localhost:5173/b2c-qa.html?'+new URLSearchParams(item)});
    await wait("!!document.querySelector('[data-testid=fashion-b2c-checkout]')");
    await new Promise(r=>setTimeout(r,500));
    await setInput('[data-fkey=product]','Sample item');
    await evaluate("document.querySelector('[aria-label=\"Add selected product\"]').click()");
    await wait("document.querySelectorAll('.fbc-table tbody tr').length===1");
    await setInput('[aria-label="Quantity for Sample item"]','0.5');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Quantity for Sample item\"]').checkValidity()"),true);
    await setInput('[data-fkey=product]','Sample service');
    await evaluate("document.querySelector('[aria-label=\"Add selected product\"]').click()");
    await wait("document.querySelectorAll('.fbc-table tbody tr').length===2");
    await setInput('[data-fkey=product]','Sample variants');
    await evaluate("document.querySelector('.fbc-model-entry [aria-label=\"Product Model\"]').click()");
    await wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Large')");
    await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Large').click()");
    await evaluate("document.querySelector('.fbc-model-entry > button').click()");
    await wait("document.querySelectorAll('.fbc-table tbody tr').length===3");
    for(const width of [768,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
      const layout=await evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,summary:!!document.querySelector('.billing-generate-btn'),search:!!document.querySelector('[data-fkey=product]')})");
      assert.ok(layout.scroll<=layout.width+1,JSON.stringify(item)+' overflow '+JSON.stringify(layout));assert.ok(layout.summary&&layout.search);
    }
    await evaluate("sessionStorage.removeItem('b2c-qa-saved');document.querySelector('.billing-generate-btn').click()");
    await wait("!!sessionStorage.getItem('b2c-qa-saved')");
    const payload=await evaluate("JSON.parse(sessionStorage.getItem('b2c-qa-saved'))");
    assert.equal(payload.extra.billingMode,'b2c');assert.equal(payload.extra.invoicePrintFormat,'thermal80');
    assert.equal(payload.customer.name,'Walk-in Customer');assert.equal(payload.items.length,3);assert.equal(payload.items[2].variantId,'507f1f77bcf86cd799439006');
    assert.equal(payload.items[0].qty,0.5);assert.equal(payload.items[1].itemType,'Service');
    console.log('PASS B2C category, service, quantity and responsive save: '+JSON.stringify(item));
  }
  await send('Page.navigate',{url:'http://localhost:5173/b2c-qa.html?category=school&edit=1&b2b=1'});
  await wait("!!document.querySelector('[data-testid=fashion-b2c-checkout]') && document.querySelectorAll('.fbc-table tbody tr').length===3");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Quantity for Sample item\"]').value"),'0.5');
  console.log('PASS saved B2C mode and quantities reopen from default B2B editor');
  await setInput('[data-fkey=product]','9999999999999');
  await evaluate("document.querySelector('[aria-label=\"Add selected product\"]').click()");
  await wait("document.body.innerText.includes('Item not found.')");
  assert.ok(await evaluate("location.pathname==='/b2c-qa.html'"));
  await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Billing mode\"] button')).find(e=>e.textContent==='B2B').click()");
  await wait("!document.querySelector('[data-testid=fashion-b2c-checkout]')");
  await evaluate("Array.from(document.querySelectorAll('[aria-label=\"Billing mode\"] button')).find(e=>e.textContent==='B2C').click()");
  await wait("document.querySelectorAll('.fbc-table tbody tr').length===3");
  console.log('PASS unknown barcode retains bill and switching modes preserves cart');
  assert.deepEqual(errors,[]);
  await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
