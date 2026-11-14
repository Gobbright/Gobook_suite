import fs from 'node:fs/promises';
const original=await fs.readFile(new URL('./check-b2c-application.mjs',import.meta.url),'utf8');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
import React,{useEffect}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useNavigate}from'react-router-dom';
import{ThemeProvider}from'/src/app/ThemeContext.jsx';import{FullAppRoutes}from'/src/routes/AppRouter.jsx';import{api}from'/src/services/api.js';import'/src/index.css';
const user={id:'qa-performance',category:'retail',role:'Super Admin',accountType:'owner',businessId:'qa-business',subscriptionStatus:'active',subscriptionExpiresAt:'2099-01-01',onboardingCompleted:true};
localStorage.setItem('gobook.user',JSON.stringify(user));const now=Math.floor(Date.now()/1000);localStorage.setItem('gobook.token','qa.'+btoa(JSON.stringify({iat:now,exp:now+3600}))+'.qa');
window.fetch=async url=>new Response(JSON.stringify(String(url).includes('/auth/me')?user:String(url).includes('/sales/invoices')?{fields:[],data:[],total:0,recordCount:0,totals:{}}:[]),{status:200,headers:{'Content-Type':'application/json'}});
for(const key of Object.keys(api))if(typeof api[key]==='function')api[key]=async()=>[];
api.getSettings=async()=>({businessName:'Performance QA',state:'Tamil Nadu'});api.getNextNumber=async()=>({number:'INV-QA-0001'});api.listProducts=async()=>[];api.invListProducts=async()=>({data:[]});
function Harness(){const navigate=useNavigate();useEffect(()=>{window.qaNavigate=navigate},[navigate]);return React.createElement(ThemeProvider,null,React.createElement(FullAppRoutes))}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/billing/invoice/new']},React.createElement(Harness)));
</script></body></html>`;
let prefix=original.slice(0,original.indexOf('  const cases='));
prefix=prefix.slice(0,prefix.indexOf('const html='))+'const html='+JSON.stringify(html)+';\n'+prefix.slice(prefix.indexOf('await fs.writeFile(fixture,html);'));
const checks=`
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html'});
  await wait("!!document.querySelector('.billing-payment-grid') && !!window.qaNavigate");
  assert.ok(await evaluate("!!document.querySelector('.app-shell')"));
  const loaded=await evaluate("performance.getEntriesByType('resource').map(e=>e.name)");
  assert.ok(!loaded.some(name=>['hospital','hotel','school','finance'].some(industry=>name.includes('/categories/'+industry+'/') && name.endsWith('Page.jsx'))),'Unrelated industry pages should not load with billing');
  assert.ok(!loaded.some(name=>name.includes('@react-pdf_renderer')||name.includes('zxing')||name.includes('/ProductsPage.jsx')),'Optional PDF, scanner and product editor should not load before use');
  await evaluate("document.querySelector('.fashion-billing-switch button:last-child').click()");
  await wait("!!document.querySelector('.fbc-header-print')");
  for(const [route,selector] of [['/sales-reports','.dsr-page[data-report-type=sales]'],['/purchase-reports','.dsr-page[data-report-type=purchase]'],['/products','h1']]){
    await evaluate('window.qaNavigate('+JSON.stringify(route)+')');
    await wait('!!document.querySelector('+JSON.stringify(selector)+')');
    console.log('PASS lazy route '+route);
  }
  await evaluate("window.qaNavigate('/billing/invoice/new')");
  await wait("!!document.querySelector('.billing-payment-grid')");
  assert.deepEqual(errors,[]);
  console.log('PASS route loading preserves shell, B2C switching and billing; optional libraries and unrelated industries are deferred');
  await send('Browser.close').catch(error=>{if(!String(error.message).includes('Browser connection closed'))throw error});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner=new URL('./performance-routes-run.mjs',import.meta.url);await fs.writeFile(runner,prefix+checks);
try{await import(runner.href)}finally{await fs.unlink(runner).catch(()=>{})}
