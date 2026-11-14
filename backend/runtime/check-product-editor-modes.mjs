import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, RETAIL_SUBCATEGORIES } from '../src/constants/categories.js';
const fixture = new URL('../../frontend/product-mode-qa.html', import.meta.url);
const html = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ProductModal} from '/src/features/categories/common/modules/inventory/ProductsPage.jsx';
import {MedicineModal} from '/src/features/categories/hospital/modules/pharmacy/MedicinesPage.jsx';
import {CatalogProductModal} from '/src/features/categories/common/modules/more-modules/WhatsAppBusinessPage.jsx';
import {api} from '/src/services/api.js';
import '/src/index.css';
const name=new URLSearchParams(location.search).get('case');
const [scope,category,kind]=name.split(':');
const globalCase=['category','retail','medicine','catalog'].includes(scope);
const id='507f1f77bcf86cd799439002', a='507f1f77bcf86cd799439004', b='507f1f77bcf86cd799439005';
let initial={_id:id,description:'Speaker',code:'1014',itemType:'Product',productType:'Standard',itemGroup:'Electronics',stock:4,rate:200,purchasePrice:100,mrp:250,unit:'Nos',gstRate:18,variants:[]};
if(name==='legacy')initial.variants=[{_id:a,modelName:'Speaker',barcode:'123',stock:0,rate:200},{_id:b,modelName:'Speaker',barcode:'123',stock:4,rate:200}];
if(name==='serialized')initial={...initial,productType:'Serialized',variants:[{_id:a,modelName:'Speaker',barcode:'123',stock:4,rate:200}]};
if(name==='variants')initial.variants=[{_id:a,modelName:'Black Model',colour:'Black',stock:2,rate:200},{_id:b,modelName:'White Model',colour:'White',stock:2,rate:200}];
if(name==='matrix')initial={...initial,productType:'Matrix',variants:[{_id:a,modelName:'Speaker',stock:4,rate:200}]};
if(name==='fashion')initial={...initial,description:'Plain shirt',itemGroup:'Textile',stock:3};
if(name==='home')initial={...initial,description:'Table',itemGroup:'General',category:'Furniture',variants:[{_id:a,size:'Small',modelName:'Table',stock:2,rate:200},{_id:b,size:'Large',modelName:'Table',stock:2,rate:200}]};
if(globalCase){initial.itemGroup=scope==='medicine'?'Pharma':'General';initial.variants=kind==='single'?[{_id:a,modelName:'Speaker',barcode:'123',stock:0,rate:200},{_id:b,modelName:'Speaker',barcode:'123',stock:4,rate:200}]:[{_id:a,size:'Small',colour:'Black',stock:2,rate:200},{_id:b,size:'Large',colour:'White',stock:2,rate:200}];}
localStorage.setItem('gobook.user',JSON.stringify({id:'qa-only',category:scope==='category'?category:scope==='medicine'?'hospital':'retail',retailSubcategory:scope==='retail'?category:name==='fashion'?'fashion-lifestyle':name==='home'?'home-living':'electronics-technology'}));
api.invListProducts=async()=>({data:[]});
api.invProductNextCode=async()=>({code:'1015'});
api.listInvoices=async()=>{window.purchaseHistoryRead=true;return {data:[]}};
api.invUpdateProduct=async(id,payload)=>{window.savedPayload=payload;return {...payload,_id:id}};
api.invCreateProduct=async(payload)=>{window.savedPayload=payload;return {...payload,_id:id}};
window.fixtureInitial=initial;
const props={mode:name==='add'?'add':'edit',initial:name==='add'?undefined:initial,initialProductType:'Standard',nextCode:'1015',forceElectronicsRetail:!globalCase&&!['fashion','home'].includes(name),forceFashionRetail:name==='fashion',forceHomeLivingRetail:name==='home',categories:[],brands:[],sizes:[],fabrics:[],colours:[],types:[],onSave:()=>{},onClose:()=>{}};
const editor=scope==='medicine'?React.createElement(MedicineModal,props):scope==='catalog'?React.createElement(CatalogProductModal,{product:initial,categories:[],onSaved:()=>{},onClose:()=>{}}):React.createElement(ProductModal,props);
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,editor));
</script></body></html>`;
await fs.writeFile(fixture,html);
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9336',`--user-data-dir=${fileURLToPath(new URL('./product-mode-chrome-profile',import.meta.url))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let targets;
  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9336/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(targets?.some(t=>t.type==='page'),'QA Chrome did not start');
  await new Promise(r=>setTimeout(r,500));
  targets=await(await fetch('http://127.0.0.1:9336/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0;const pending=new Map(),errors=[];
  ws.onclose=event=>{for(const p of pending.values())p.reject(new Error('Browser connection closed: '+event.code+' '+event.reason));pending.clear();};
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function wait(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression+'; '+errors.join('\n'));}
  await send('Runtime.enable');await send('Page.enable');
  const cases=['legacy','serialized','variants','matrix','fashion','home','add',
    ...CATEGORIES.flatMap(category=>['single','variants'].map(kind=>'category:'+category+':'+kind)),
    ...RETAIL_SUBCATEGORIES.flatMap(category=>['single','variants'].map(kind=>'retail:'+category+':'+kind)),
    'medicine:hospital:single','medicine:hospital:variants','catalog:retail:single','catalog:retail:variants'];
  for(const name of cases){
    await send('Page.navigate',{url:'http://localhost:5173/product-mode-qa.html?case='+name});
    await wait("!!document.getElementById('product-form')");
    await new Promise(r=>setTimeout(r,350));
    const state=await evaluate(`({tables:document.querySelectorAll('#product-form table tbody tr').length,text:document.getElementById('product-form').innerText,history:!!window.purchaseHistoryRead})`);
    const globalSingle=name.endsWith(':single'),globalVariant=name.endsWith(':variants');
    if(globalSingle||['legacy','serialized','fashion','add'].includes(name)){
      assert.equal(state.tables,0,name+' should show a single form');
      assert.match(state.text,name==='add'?/Opening Stock/i:/Current Stock/i,name);
      assert.equal(state.history,false,'Editor must use saved catalog values');
    }else{
      assert.match(state.text,/Edit each model or size quantity/,name+' should show its respective variants');
      const values=await evaluate("Array.from(document.querySelectorAll('#product-form input')).map(e=>e.value)");
      if(name==='variants'){assert.ok(values.includes('Black Model'));assert.ok(values.includes('White Model'));}
      if(name==='home'){assert.ok(values.includes('Small'));assert.ok(values.includes('Large'));}
      if(globalVariant){assert.ok(values.includes('Small'),name+' must retain the first size');assert.ok(values.includes('Large'),name+' must retain the second size');}
    }
    if(name==='legacy'||globalSingle){
      await evaluate(`(()=>{const label=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.trim().toLowerCase()==='current stock');const e=label.querySelector('input')||label.parentElement.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'0');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await new Promise(r=>setTimeout(r,100));
      await evaluate("document.getElementById('product-form').requestSubmit()");
      await wait('!!window.savedPayload');
      const saved=await evaluate('window.savedPayload');
      assert.equal(saved.variantMode,'single');assert.equal(saved.stock,0);assert.equal(saved.stockAdjustment.expectedStock,4);
      assert.deepEqual(saved.variants.map(row=>row.stock),[0,0]);assert.equal(saved.variants.length,2);
    }
    console.log('PASS browser editor: '+name);
  }
  assert.deepEqual(errors,[]);
  await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
