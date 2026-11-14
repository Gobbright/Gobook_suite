import fs from 'node:fs/promises';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{Gstr3bPage}from'/src/features/categories/common/modules/gst/Gstr3bPage.jsx';import{gstService}from'/src/services/gstService.js';import{api}from'/src/services/api.js';import'/src/index.css';
// Browser fixture only. Never reads or writes customer data.
localStorage.setItem('gobook.user',JSON.stringify({name:'Test Owner',businessName:'Recorded Test Business'}));
const row=(key,label,taxable,cgst,sgst,igst=0)=>({key,label,taxable,cgst,sgst,igst,cess:0});
const initial={business:{name:'Recorded Test Business'},gstin:'33AABCG1234M1ZP',status:'draft',invoiceCount:125,purchaseCount:67,outwardRows:[row('a','Outward taxable supplies (other than zero rated, nil rated and exempted)',5824000,336170,336170,376000),row('b','Outward taxable supplies (zero rated)',0,0,0),row('c','Other outward supplies (nil rated, exempted)',15000,0,0),row('d','Inward supplies liable to reverse charge',10000,900,900),row('e','Non-GST outward supplies',20000,0,0)],itcAvailable:[row('A(1)','Import of goods',0,0,0),row('A(2)','Import of services',0,0,0),row('A(3)','Inward supplies from ISD',0,0,0),row('A(5)','All other ITC (incl. from GSTR-2B)',0,246415,246415,0)],itcReversed:[row('B(1)','As per Rule 42 & 43 of CGST Rules',0,0,0),row('B(2)','Other reversals',0,0,0)],lateFeeCgst:0,lateFeeSgst:0};
let saved=null;window.apiCalls=[];
api.getSettings=async()=>({businessName:'Recorded Test Business'});
gstService.getGstr3b=async period=>{window.apiCalls.push(['load',period]);return structuredClone(saved&&saved.period===period?saved:period==='November 2026'?initial:{...initial,invoiceCount:0,purchaseCount:0,outwardRows:[],itcAvailable:[],itcReversed:[]})};
gstService.saveGstr3b=async data=>{window.apiCalls.push(['save',data]);if(window.failSave)throw new Error('Test save failure');saved={...structuredClone(data),gstin:initial.gstin,_id:'test-draft',updatedAt:new Date().toISOString()};return saved};
gstService.postGstr3bAccountingAdjustment=async period=>{window.apiCalls.push(['post',period]);saved={...saved,accountingVoucherNo:'GST-TEST-001'};return{record:saved}};
window.print=()=>{window.printed=(window.printed||0)+1};
const originalBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.lastExport=blob;return originalBlob(blob)};
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/gstr-3b?period=November%202026']},React.createElement(Gstr3bPage)));
</script></body></html>`;
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
let prefix = original.slice(0, original.indexOf('  const cases='));
prefix = prefix.replace("const fixture=new URL('../../frontend/b2c-qa.html',import.meta.url);", "const fixture=new URL('../../frontend/gstr3b-reference-qa.html',import.meta.url);");
prefix = prefix.slice(0, prefix.indexOf('const html=')) + 'const html=' + JSON.stringify(html) + ';\n' + prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
prefix = prefix.replaceAll('9337', '9363').replaceAll('./b2c-chrome-profile', './gstr3b-reference-profile');
const checks = String.raw`
  const button = text => "Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==="+JSON.stringify(text)+")";
  const click = async text => {assert.equal(await evaluate(button(text)+'.disabled'),false,text+' should be enabled');await evaluate(button(text)+'.click()');};
  const close = () => evaluate('document.querySelector(\'[aria-label="Close dialog"]\').click()');
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/gstr3b-reference-qa.html'});
  await wait("document.querySelector('.ag3-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('Recorded Test Business')");
  assert.equal(await evaluate("document.querySelectorAll('.ag3-stat').length"),4);
  assert.equal(await evaluate("document.querySelectorAll('.ag3-tabs button').length"),5);
  assert.ok(await evaluate("!document.querySelector('.ag3-sidebar') && !document.querySelector('[aria-label=\"GST navigation\"]')"));
  assert.ok(await evaluate("document.querySelector('.ag3-ledgers').innerText.includes('Not available')"));
  assert.equal(await evaluate("document.querySelector('.ag3-stat:first-child strong').textContent.replace(/[^0-9.]/g,'')"),'1048340.00');
  for(const width of [1672,1366,1024,768,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Overflow at '+width);
    if(width===1672||width===390){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(new URL('./gstr3b-reference-'+width+'.png',import.meta.url),Buffer.from(shot.data,'base64'));}
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1672,height:1000,deviceScaleFactor:1,mobile:false});
  await setInput('[aria-label="Search descriptions or sections"]','zero rated');
  assert.ok(await evaluate("document.querySelector('.ag3-return-table tbody').innerText.includes('zero rated')"));
  await setInput('[aria-label="Search descriptions or sections"]','');
  await click('ITC Details');await wait("!!document.querySelector('input[aria-label=\"All other ITC (incl. from GSTR-2B) CGST\"]')");
  await setInput('[aria-label="All other ITC (incl. from GSTR-2B) CGST"]','240000');
  assert.ok(await evaluate("document.querySelector('.ag3-actionbar').innerText.includes('Save as Draft *')"));
  await click('Save as Draft *');await wait("document.querySelector('.ag3-notice')?.innerText.includes('draft saved')");
  assert.equal(await evaluate("window.apiCalls.filter(c=>c[0]==='save').at(-1)[1].itcAvailable.find(r=>r.key==='A(5)').cgst"),'240000');
  await setInput('[aria-label="All other ITC (incl. from GSTR-2B) CGST"]','-1');await click('Validate');
  assert.ok(await evaluate("document.querySelector('.ag3-validation-result').innerText.includes('nonnegative')"));
  await setInput('[aria-label="All other ITC (incl. from GSTR-2B) CGST"]','240000');await click('Validate');
  assert.equal(await evaluate("document.querySelectorAll('.ag3-progress .complete').length"),4);
  await click('Payment & Liability');await setInput('[aria-label="CGST Late Fee"]','25');
  await click('Save as Draft *');await wait("document.querySelector('.ag3-notice')?.innerText.includes('draft saved')");
  await click('Preview Return');await wait("!!document.querySelector('[role=dialog]')");await click('Print Summary');assert.equal(await evaluate('window.printed'),1);await close();
  await click('Download Draft');await wait("!!document.querySelector('[role=dialog]')");await click('Review JSON');
  const review=JSON.parse(await evaluate('window.lastExport.text()'));assert.equal(review.outwardRows.length,5);assert.equal(review.lateFeeCgst,25);assert.equal(Number(review.itcAvailable.find(r=>r.key==='A(5)').cgst),240000);
  await click('Download CSV');assert.ok((await evaluate('window.lastExport.text()')).includes('Outward taxable supplies'));await close();
  await click('Filing History');assert.ok(await evaluate("document.querySelector('.ag3-history').innerText.includes('Saved record')"));
  await click('Reports');assert.ok(await evaluate("!!document.querySelector('table[aria-label=\"Payment of tax\"]')"));
  await click('Post Accounting Adjustment');await wait(button('Accounting Posted')+'?.disabled===true');
  assert.ok(await evaluate("window.apiCalls.some(c=>c[0]==='post'&&c[1]==='November 2026')"));
  await click('Return Details');await click('Auto Populate');await wait("document.querySelector('.ag3-page')?.getAttribute('aria-busy')==='false' && document.body.innerText.includes('GST-TEST-001')===false");
  await evaluate('document.querySelector(\'[aria-label="Tax Period"]\').click()');await wait("!!document.querySelector('.ag3-dropdown-menu button')");
  await evaluate("Array.from(document.querySelectorAll('.ag3-dropdown-menu button')).find(e=>e.textContent.includes('Oct 2026')).click()");
  await wait("document.querySelector('.ag3-page').getAttribute('aria-busy')==='false' && document.querySelector('.ag3-stat strong').textContent.replace(/[^0-9.]/g,'')==='0.00'");
  assert.deepEqual(errors,[]);
  console.log('PASS GSTR-3B reference layout without module sidebar; 5 responsive widths, period selection, search, ITC and fee editing, validation, saving, preview/print, CSV/JSON, history, reports, refresh and accounting action');
  await send('Browser.close').catch(()=>{});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./gstr3b-reference-run.mjs', import.meta.url);
try { await fs.writeFile(runner, prefix + checks); await import(runner.href); }
finally { await fs.unlink(runner).catch(() => {}); }
