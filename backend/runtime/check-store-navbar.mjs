import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const fixture=new URL('../../frontend/store-navbar-qa.html',import.meta.url);
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {PublicStorePage} from '/src/features/store/PublicStorePage.jsx';import '/src/index.css';
const name=new URLSearchParams(location.search).get('theme');
const store={slug:'navbar-qa',storeName:'QA Store',phone:'1234567890',email:'qa@example.com',address:'QA address',theme:{name,primaryColor:'#2563eb',productsTitle:'Products'}};
const products=[{id:'qa-product',name:'QA Product',rate:100,stock:10,imageUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}];
window.fetch=async()=>({ok:true,json:async()=>({store,products})});
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/store/navbar-qa']},React.createElement(Routes,null,React.createElement(Route,{path:'/store/:slug',element:React.createElement(PublicStorePage)}),React.createElement(Route,{path:'/store/:slug/:storePage',element:React.createElement(PublicStorePage)}))));
</script></body></html>`;
await fs.writeFile(fixture,html);
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9340',`--user-data-dir=${fileURLToPath(new URL('./store-navbar-chrome-profile',import.meta.url))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let targets;
  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9340/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(targets?.some(t=>t.type==='page'),'QA Chrome did not start');
  await new Promise(r=>setTimeout(r,500));
  targets=await(await fetch('http://127.0.0.1:9340/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0;const pending=new Map(),errors=[];
  ws.onclose=event=>{for(const p of pending.values())p.reject(new Error('Browser connection closed: '+event.code+' '+event.reason));pending.clear();};
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function wait(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression+'; '+errors.join('\n')+'; '+await evaluate('document.body.innerText.slice(0,1200)'));}
  await send('Runtime.enable');await send('Page.enable');



  for(const name of ['boutique','marketplace','premium','aurora','goldenhue']){
    for(const width of [1440,768,390]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      await send('Page.navigate',{url:'http://localhost:5173/store-navbar-qa.html?theme='+name});
      await wait("!!document.querySelector('nav[aria-label=\"Store navigation\"]')");
      if(width<=800&&['aurora','goldenhue'].includes(name))await evaluate("document.querySelector('[aria-label=\"Toggle navigation\"]').click()");
      const nav=await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Store navigation\"] a')).map(e=>({text:e.textContent,visible:!!e.getClientRects().length}))");
      assert.deepEqual(nav.map(e=>e.text),['Home','About','Product','Contact']);assert.ok(nav.every(e=>e.visible));
      await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Store navigation\"] a')).find(e=>e.textContent==='Contact').click()");
      await wait("!!document.querySelector('[data-store-section=contact]')");
      assert.ok(await evaluate("document.body.textContent.includes('qa@example.com')"));
      const dimensions=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(dimensions.scroll<=dimensions.width+1,name+' '+JSON.stringify(dimensions));
      if(width<=800&&['aurora','goldenhue'].includes(name))await evaluate("document.querySelector('[aria-label=\"Toggle navigation\"]').click()");
      await evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Store navigation\"] a')).find(e=>e.textContent==='Product').click()");
      await wait("!!document.querySelector('[data-store-section=products]')");
      console.log('PASS navbar links, contact page and responsive layout: '+name+' '+width);
    }
  }
  assert.deepEqual(errors,[]);await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
