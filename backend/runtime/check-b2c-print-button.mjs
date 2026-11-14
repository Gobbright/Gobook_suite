import fs from 'node:fs/promises';
const original=await fs.readFile(new URL('./check-b2c-application.mjs',import.meta.url),'utf8');
const prefix=original.slice(0,original.indexOf('  const cases='));
const checks=`
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html?category=retail'});
  await wait("!!document.querySelector('.fbc-header-print')");
  assert.equal(await evaluate("document.querySelector('.fbc-header-print').disabled"),false);
  await evaluate("document.querySelector('.fbc-header-print').click()");
  await wait("!!document.querySelector('.fbc-cart .fbc-error')");
  assert.equal(await evaluate('!!window.savedPayload'),false,'An empty invoice must not be saved');
  await setInput('[data-fkey=product]','Sample item');
  await setInput('[data-fkey=quick-qty]','0');
  await evaluate("document.querySelector('.fbc-product-search > button').click()");
  await wait("document.body.innerText.includes('Enter a quantity greater than zero.')");
  assert.equal(await evaluate("document.querySelectorAll('.fbc-table tbody tr').length"),0);
  await setInput('[data-fkey=quick-qty]','2.5');
  await evaluate("document.querySelector('.fbc-quantity-arrows button:first-child').click()");
  await wait("document.querySelector('[data-fkey=quick-qty]').value==='3.5'");
  await evaluate("document.querySelector('.fbc-quantity-arrows button:last-child').click()");
  await wait("document.querySelector('[data-fkey=quick-qty]').value==='2.5'");
  assert.ok(await evaluate("document.querySelector('.fbc-entry-quantity').getBoundingClientRect().width<=86"));
  await evaluate("document.querySelector('.fbc-product-search > button').click()");
  await wait("document.querySelectorAll('.fbc-table tbody tr').length===1");
  assert.equal(await evaluate("document.querySelector('.fbc-quantity input').value"),'2.5');
  assert.equal(await evaluate("document.querySelector('[data-fkey=quick-qty]').value"),'1');
  for(const width of [1366,768,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'No page overflow at '+width);
    assert.ok(await evaluate("(()=>{const a=document.querySelector('.fbc-product-search'),b=document.querySelector('.fbc-entry-quantity'),c=document.querySelector('.fbc-model-entry');return a.nextElementSibling===b && b.nextElementSibling===c})()"));
  }

  assert.equal(await evaluate("document.querySelector('.fbc-header-print').disabled"),false);
  await evaluate("document.querySelector('[data-fkey=product]').focus()");
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await wait('!!window.savedPayload');
  assert.equal(await evaluate('window.savedPayload.items.length'),1);
  assert.equal(await evaluate('window.savedPayload.items[0].qty'),2.5);
  assert.equal(await evaluate('window.savedPayload.extra.invoicePrintFormat'),'thermal80');
  await wait("!!document.querySelector('.invoice-preview') || !!document.querySelector('.erp-invoice-preview')");
  assert.deepEqual(errors,[]);
  console.log('PASS Print Bill is clickable, empty bills show validation, and Space saves a valid bill for thermal printing');
  await send('Browser.close').catch(error=>{if(!String(error.message).includes('Browser connection closed'))throw error});
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner=new URL('./b2c-print-button-run.mjs',import.meta.url);
await fs.writeFile(runner,prefix+checks);
try{await import(runner.href)}finally{await fs.unlink(runner).catch(()=>{})}
