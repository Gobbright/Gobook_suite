import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture = new URL('../../frontend/store-editor-qa.html', import.meta.url);
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {ThemeCustomizer} from '/src/features/categories/common/modules/online-store/ThemeCustomizer.jsx';
import '/src/index.css';
const settings={id:'browser-qa-only',slug:'editor-qa-only',storeName:'Editor QA Store',featureEnabled:true,theme:{name:'marketplace',primaryColor:'#ea580c',heroTitle:'Desktop heading',heroText:'Your collection, your way',heroButton:'Shop now',showHero:true,showBenefits:true,showFooter:true}};
const products=Array.from({length:6},(_,i)=>({id:'qa-'+i,name:'Product '+(i+1),description:'A carefully selected piece',category:'Collection',rate:2500+i*500,stock:10,showOnline:true,imageUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#f1e4d5"/><circle cx="300" cy="200" r="90" fill="#c5996e"/></svg>')}));
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeCustomizer,{settings,name:'marketplace',preset:{label:'Marketplace',color:'#ea580c'},products,onSave:async(theme)=>{window.savedTheme=theme;return {...settings,theme}},onClose:()=>{window.editorClosed=true}})));
</script></body></html>`;
await fs.writeFile(fixture, html);
const targets = await (await fetch('http://127.0.0.1:9334/json')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => {ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();const errors=[];
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p.reject(message.error);else p.resolve(message.result);}if(message.method==='Log.entryAdded') console.log('Browser log',message.params.entry.text);if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text+': '+message.params.exceptionDetails.exception?.description);};
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+expression);}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await new Promise(r=>setTimeout(r,100));}
async function select(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));}
async function input(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await new Promise(r=>setTimeout(r,100));}
async function section(label){if(await evaluate("!!document.querySelector('.editor-back-to-sections')"))await click('.editor-back-to-sections');await click('[aria-label="Edit '+label+'"]');}

const frame=`document.querySelector('iframe').contentDocument`;
try{
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://localhost:5173/store-editor-qa.html'});
await wait(`!!document.querySelector('iframe')?.contentDocument?.querySelector('[data-store-section="products"]')`);
assert.equal(await evaluate(`document.querySelector('iframe').contentWindow.innerWidth`),1440);
await click('[aria-label="mobile preview"]');
assert.equal(await evaluate(`document.querySelector('iframe').contentWindow.innerWidth`),390);
await section('Product catalog');await evaluate("Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='Appearance').click()");await input('[aria-label="Grid columns"]','2');
assert.equal(await evaluate(`getComputedStyle(${frame}.querySelector('[data-store-section="products"] > .grid')).gridTemplateColumns.split(' ').length`),2);
await click('[aria-label="desktop preview"]');
assert.equal(await evaluate(`getComputedStyle(${frame}.querySelector('[data-store-section="products"] > .grid')).gridTemplateColumns.split(' ').length`),5);
await click('[aria-label="tablet preview"]');await input('[aria-label="Grid columns"]','3');
assert.equal(await evaluate(`getComputedStyle(${frame}.querySelector('[data-store-section="products"] > .grid')).gridTemplateColumns.split(' ').length`),3);
await click('[aria-label="mobile preview"]');
assert.equal(await evaluate(`getComputedStyle(${frame}.querySelector('[data-store-section="products"] > .grid')).gridTemplateColumns.split(' ').length`),2);
await section('Image banner');await evaluate("Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='Content').click()");
await evaluate("(()=>{const e=Array.from(document.querySelectorAll('aside label')).find(x=>x.textContent==='Heading').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Mobile heading');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
await wait(`${frame}.body.textContent.includes('Mobile heading')`);
await click('[aria-label="desktop preview"]');assert.ok(await evaluate(`${frame}.body.textContent.includes('Desktop heading')`));
await click('[aria-label="mobile preview"]');await click('.editor-back-to-sections');await click('.editor-add-button');
await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('aside label')).find(x=>x.textContent==='Block heading').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Mobile story');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await wait(`${frame}.body.textContent.includes('Mobile story')`);
await click('[aria-label="Undo change"]');
assert.equal(await evaluate(`${frame}.body.textContent.includes('Mobile story')`),false);
await click('[aria-label="Redo change"]');
assert.equal(await evaluate(`${frame}.body.textContent.includes('Mobile story')`),true);
await click('.editor-back-to-sections');await click('[aria-label="Move Tell your story up"]');await click('[aria-label="Move Tell your story up"]');
assert.ok(await evaluate(`(()=>{const d=${frame};return [...d.querySelector('[data-store-content]').children].findIndex(e=>e.dataset.storeSection?.startsWith('block-')) < [...d.querySelector('[data-store-content]').children].findIndex(e=>e.dataset.storeSection==='products')})()`));
await select('[aria-label="Page to edit"]','cart');
await wait(`!!${frame}.querySelector('[data-store-section="cart"] form')`);
assert.ok(await evaluate(`${frame}.body.textContent.includes('Product 1')`));
await select('[aria-label="Page to edit"]','home');
await wait(`!!${frame}.querySelector('[data-store-section="products"]')`);
await click('.app-save-button');await wait('!!window.savedTheme');
assert.equal(await evaluate('window.savedTheme.pageStyles.home.products.mobile.columns'),2);
assert.equal(await evaluate('window.savedTheme.pageStyles.home.products.tablet.columns'),3);
assert.equal(await evaluate('window.savedTheme.blocks[0].deviceContent.mobile.title'),'Mobile story');
const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('./store-editor-mobile.png',import.meta.url),Buffer.from(shot.data,'base64'));
assert.equal(await evaluate('document.querySelectorAll("aside").length'),1);
assert.ok(await evaluate("document.querySelector('aside').getBoundingClientRect().width >= 370"));
await section('Product catalog');
assert.ok(await evaluate("document.querySelector('.editor-sidebar-heading h3').textContent==='Product catalog'"));
assert.ok(await evaluate("!document.querySelector('aside nav')"));
await evaluate("Array.from(document.querySelectorAll('aside button')).find(b=>b.textContent==='Appearance').click()");
assert.ok(await evaluate("document.querySelector('details.editor-control-group[open] summary').textContent==='Layout'"));
const inspector=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('./store-editor-friendly-inspector.png',import.meta.url),Buffer.from(inspector.data,'base64'));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
await new Promise(r=>setTimeout(r,250));
assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-preview')).display"),'none');
assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));
await click('.editor-mobile-view');
assert.equal(await evaluate("getComputedStyle(document.querySelector('.editor-sidebar')).display"),'none');
assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.editor-preview')).display"),'none');
const narrow=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('./store-editor-friendly-phone.png',import.meta.url),Buffer.from(narrow.data,'base64'));
await click('.editor-mobile-view');assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.editor-sidebar')).display"),'none');
assert.deepEqual(errors,[]);
console.log('Browser checks passed: true viewport sizes; mobile/tablet grid independence; blocks; undo/redo; cart preview; save payload; no browser exceptions.');
}catch(error){console.log('Browser errors:',errors);console.log(await evaluate('JSON.stringify({html:document.documentElement.outerHTML.slice(0,3000),resources:performance.getEntriesByType("resource").map(x=>({name:x.name,status:x.responseStatus}))})'));const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(new URL('./store-editor-failure.png',import.meta.url),Buffer.from(shot.data,'base64'));throw error;}finally{ws.close();await fs.unlink(fixture);}
