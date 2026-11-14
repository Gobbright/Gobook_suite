import fs from 'node:fs/promises';
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
const prefix = original.slice(0, original.indexOf('  const cases='));
const checks = `
  for (const mode of ['b2b', 'b2c']) {
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html?category=retail'+(mode==='b2b'?'&b2b=1':'')});
  await wait("!!document.querySelector('.billing-payment-grid-with-multiple')");
  if (mode==='b2c') {
    assert.ok(await evaluate("!!document.querySelector('.fbc-document-header input[type=date]')"));
    await evaluate("document.querySelector('.fbc-more').click()");
    assert.equal(await evaluate("document.querySelectorAll('.fbc-options input').length"),0);
    await evaluate("document.querySelector('.fbc-more').click()");
    await evaluate("document.querySelector('.fbc-document-header button').click()");
    await setInput('.fbc-document-header > input','INV-TOP-123');
    await evaluate("document.querySelector('.fbc-document-header > input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
    await wait("document.querySelector('.fbc-document-header button')?.textContent.includes('INV-TOP-123')");
    await setInput('.fbc-document-header input[type=date]','2026-11-12');
    assert.equal(await evaluate("document.querySelector('.fbc-document-header input[type=date]').value"),'2026-11-12');
  }
  for (const width of [1366,768,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
    if(mode==='b2c') console.log('HEADER '+await evaluate("JSON.stringify({display:getComputedStyle(document.querySelector('.fbc-document-header')).display,height:document.querySelector('.fbc-document-header').getBoundingClientRect().height})"));
    if(mode==='b2c') {
      const placement=await evaluate("(()=>{const a=document.querySelector('.fbc-top-save-actions'),s=document.querySelector('.fashion-billing-switch');return {top:a.getBoundingClientRect().top,switchBottom:s.getBoundingClientRect().bottom,buttons:a.querySelectorAll('button').length,summaryButtons:document.querySelectorAll('.billing-summary-card .fbc-save-actions').length,right:a.getBoundingClientRect().right,width:innerWidth}})()");
      assert.ok(await evaluate("Array.from(document.querySelectorAll('.fbc-top-save-actions button')).every(e=>getComputedStyle(e).display!=='none' && e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0)"),'Both Save and Print Bill must be visible');
      assert.equal(placement.buttons,2); assert.equal(placement.summaryButtons,0);
      assert.ok(placement.top>=placement.switchBottom,'Save and Print must be below the mode switch');
      assert.ok(placement.right<=placement.width,'Header buttons must fit on screen');
    }
    const buttons = await evaluate("Array.from(document.querySelectorAll('.billing-payment-grid-with-multiple > button')).map(e=>({label:e.innerText.trim(),top:e.getBoundingClientRect().top,left:e.getBoundingClientRect().left,width:e.getBoundingClientRect().width}))");
    assert.equal(buttons.length,6);
    assert.equal(buttons[0].top,buttons[1].top);
    assert.equal(buttons[1].top,buttons[2].top);
    assert.equal(buttons[3].top,buttons[4].top);
    assert.equal(buttons[4].top,buttons[5].top);
    assert.ok(buttons[3].top>buttons[0].top);
    assert.equal(buttons[5].label,'Multiple Payment');
    const quick = await evaluate("Array.from(document.querySelectorAll('.document-quick-action-icons > button')).map(e=>({label:e.getAttribute('aria-label'),icon:!!e.querySelector('svg'),top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width}))");
    assert.deepEqual(quick.map(e=>e.label),['Print','WhatsApp','Email','Download PDF','SMS']);
    assert.ok(quick.every(e=>e.icon && e.width>0));
    assert.ok(quick[0].top>buttons[5].top,'Quick actions should be below payment methods');
    assert.equal(await evaluate("document.querySelectorAll('.document-quick-actions').length"),0,'Sales quick actions should no longer use a dropdown');
    console.log('PASS '+mode+' 3 + 3 payment layout at '+width+'px');
  }
  await evaluate("document.querySelector('.billing-payment-grid-with-multiple [aria-label=\\\"Multiple Payment\\\"]').click()");
  await wait("!!document.querySelector('[role=dialog][aria-label=\\\"Multiple payment\\\"]')");
  assert.deepEqual(errors,[]);
  console.log('PASS '+mode+' Multiple Payment opens split payment dialog');
  }
  await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./b2b-payments-browser-run.mjs', import.meta.url);
await fs.writeFile(runner, prefix + checks);
try { await import(runner.href); }
finally { await fs.unlink(runner).catch(() => {}); }
