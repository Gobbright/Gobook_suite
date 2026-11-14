import fs from 'node:fs/promises';

// Reuse the local browser harness and its fully stubbed billing API.
const original = await fs.readFile(new URL('./check-b2c-application.mjs', import.meta.url), 'utf8');
const prefix = original.slice(0, original.indexOf('  const cases='));
const checks = `
  await send('Page.navigate',{url:'http://127.0.0.1:5173/b2c-qa.html?category=retail'});
  await wait("!!document.querySelector('[data-testid=fashion-b2c-checkout]')");
  await new Promise(r=>setTimeout(r,700));
  const mode = async name => {
    await evaluate("Array.from(document.querySelectorAll('[aria-label=\\\"Billing mode\\\"] button')).find(e=>e.textContent==='"+name+"').click()");
    await wait(name==='B2C' ? "!!document.querySelector('[data-testid=fashion-b2c-checkout]')" : "!document.querySelector('[data-testid=fashion-b2c-checkout]')");
  };
  await setInput('[data-fkey=product]','Sample item');
  await evaluate("document.querySelector('[aria-label=\\\"Add selected product\\\"]').click()");
  await wait("document.querySelectorAll('.fbc-table tbody tr').length===1");
  await setInput('[aria-label="Quantity for Sample item"]','2');
  await mode('B2B');
  assert.equal(await evaluate("document.body.innerText.includes('Sample item')"),false,'B2C item must not appear in B2B');
  await setInput('[data-fkey=product]','B2B only product');
  await mode('B2C');
  await wait("document.querySelectorAll('.fbc-table tbody tr').length===1");
  assert.equal(await evaluate("document.querySelector('[aria-label=\\\"Quantity for Sample item\\\"]').value"),'2');
  assert.equal(await evaluate("document.querySelector('[data-fkey=product]').value"),'','B2B search must not leak');
  await mode('B2B');
  assert.equal(await evaluate("document.querySelector('[data-fkey=product]').value"),'B2B only product','B2B quick draft must be restored');
  await evaluate("document.querySelector('[data-fkey=quick-add]').click()");
  await wait("Array.from(document.querySelectorAll('tbody input')).some(e=>e.value==='B2B only product')");
  await mode('B2C');
  assert.equal(await evaluate("document.querySelectorAll('.fbc-table tbody tr').length"),1,'B2B item must not appear in B2C');
  await mode('B2B');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('tbody input')).some(e=>e.value==='B2B only product')"),true,'B2B cart must be restored');
  await mode('B2C');
  await evaluate("document.querySelector('.billing-generate-btn').click()");
  await wait("!!sessionStorage.getItem('b2c-qa-saved')");
  const payload=await evaluate("JSON.parse(sessionStorage.getItem('b2c-qa-saved'))");
  assert.equal(payload.extra.billingMode,'b2c');
  assert.equal(payload.items.length,1);
  assert.equal(payload.items[0].description,'Sample item');
  assert.equal(payload.items[0].qty,2);
  assert.deepEqual(errors,[]);
  console.log('PASS independent carts, restored quantity/search, and B2C save payload');
  await send('Browser.close');
}finally{ws?.close();chrome.kill();await fs.unlink(fixture).catch(()=>{});}
`;
const runner = new URL('./billing-drafts-browser-run.mjs', import.meta.url);
await fs.writeFile(runner, prefix + checks);
try { await import(runner.href); }
finally { await fs.unlink(runner).catch(() => {}); }
