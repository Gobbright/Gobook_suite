import fs from 'node:fs/promises';
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
const prefix = original.slice(0, original.indexOf('  const cases='));
const checks = `
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html?category=retail'});
  await wait("!!document.querySelector('.fbc-top-save-actions')");
  console.log(await evaluate("JSON.stringify(Array.from(document.querySelectorAll('.billing-v2,.fashion-billing-mode,.fbc-top-save-actions,.fashion-checkout,.fbc-document-header,.fbc-cart,.billing-summary-card,.document-quick-action-icons')).map(e=>({c:e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height,overflow:getComputedStyle(e).overflow})))"));
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await fs.writeFile(new URL('./b2c-layout.png',import.meta.url),Buffer.from(screenshot.data,'base64'));
  await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./b2c-layout-browser-run.mjs', import.meta.url);
await fs.writeFile(runner, prefix + checks);
try { await import(runner.href); }
finally { await fs.unlink(runner).catch(() => {}); }
