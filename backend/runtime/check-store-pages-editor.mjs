import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=new URL('../../frontend/store-pages-qa.html',import.meta.url);
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {ThemeCustomizer} from '/src/features/categories/common/modules/online-store/ThemeCustomizer.jsx';import '/src/index.css';
const name=new URLSearchParams(location.search).get('theme')||'marketplace';
const settings={id:'page-edit-qa',slug:'page-edit-qa',storeName:'QA Store',featureEnabled:true,theme:{name,productsTitle:'Original catalog',heroTitle:'Original homepage'}};
const products=[{id:'qa-product',name:'QA Product',description:'QA description',rate:100,stock:10,showOnline:true,imageUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="tan"/></svg>'}];
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeCustomizer,{settings,name,preset:{label:name,color:'#2563eb'},products,onSave:async(theme)=>{window.savedTheme=theme;return {...settings,theme}},onClose:()=>{}})));
</script></body></html>`;
await fs.writeFile(fixture,html);
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9338',`--user-data-dir=${fileURLToPath(new URL('./store-pages-chrome-profile',import.meta.url))}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let ws;
try {
  let targets;
  for(let n=0;n<100;n++){try{targets=await(await fetch('http://127.0.0.1:9338/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(targets?.some(t=>t.type==='page'),'QA Chrome did not start');
  await new Promise(r=>setTimeout(r,500));
  targets=await(await fetch('http://127.0.0.1:9338/json')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
  let id=0;const pending=new Map(),errors=[];
  ws.onclose=event=>{for(const p of pending.values())p.reject(new Error('Browser connection closed: '+event.code+' '+event.reason));pending.clear();};
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function wait(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression+'; '+errors.join('\n')+'; '+await evaluate('document.body.innerText.slice(0,1200)'));}
  await send('Runtime.enable');await send('Page.enable');


  async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await new Promise(r=>setTimeout(r,80));}
  async function page(label){await evaluate(`Array.from(document.querySelectorAll('.editor-page-navigation button')).find(e=>e.textContent===${JSON.stringify(label)}).click()`);await new Promise(r=>setTimeout(r,100));}
  async function editField(label,value){await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('aside label')).find(e=>e.firstChild.textContent===${JSON.stringify(label)}).querySelector('input,textarea');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));}
  const cases=[['Product list','Product catalog','Section heading','products','productsTitle'],['Product details','Product details','Product page introduction','details','detailsIntro'],['Wishlist','Wishlist','Wishlist heading','wishlist','wishlistTitle'],['Cart & checkout','Cart & checkout','Cart heading','cart','cartTitle'],['About','About the store','About page heading','about','aboutTitle'],['Offers','Product catalog','Section heading','offers','productsTitle']];
  const frame="document.querySelector('iframe').contentDocument";
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  for(const name of ['boutique','marketplace','premium','aurora','goldenhue']){
    await send('Page.navigate',{url:'http://localhost:5173/store-pages-qa.html?theme='+name});
    await wait("document.querySelectorAll('.editor-page-navigation button').length===7");
    for(const [pageLabel,sectionLabel,field,pageKey,key] of cases){
      await click('[aria-label="desktop preview"]');await page(pageLabel);await click('[aria-label="Edit '+sectionLabel+'"]');
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.editor-inspector-tabs button')).find(e=>e.textContent==='Content').disabled"),false);
      const desktop=name+' '+pageKey+' desktop',mobile=name+' '+pageKey+' mobile';
      await editField(field,desktop);await wait(`${frame}.body.textContent.includes(${JSON.stringify(desktop)})`);
      await click('[aria-label="mobile preview"]');await editField(field,mobile);await wait(`${frame}.body.textContent.includes(${JSON.stringify(mobile)})`);
      await click('[aria-label="desktop preview"]');await wait(`${frame}.body.textContent.includes(${JSON.stringify(desktop)})`);
      await click('.editor-save');await wait('!!window.savedTheme');
      const saved=await evaluate('window.savedTheme');assert.equal(saved.pageContent[pageKey].desktop[key],desktop);assert.equal(saved.pageContent[pageKey].mobile[key],mobile);
      await evaluate('window.savedTheme=null');
      console.log('PASS editable page with isolated desktop/mobile content: '+name+' '+pageKey);
    }
    await page('Cart & checkout');await click('[aria-label="Edit Checkout form"]');await editField('Checkout heading',name+' checkout');await wait(`${frame}.body.textContent.includes(${JSON.stringify(name+' checkout')})`);
    await page('Home');await wait(`${frame}.body.textContent.includes('Original catalog')`);
    assert.ok(!await evaluate(`${frame}.body.textContent.includes(${JSON.stringify(name+' products desktop')})`));
    console.log('PASS checkout content access and homepage preservation: '+name);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const dimensions=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('./store-pages-mobile-editor.png',import.meta.url),Buffer.from(shot.data,'base64'));
  assert.deepEqual(errors,[]);await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
