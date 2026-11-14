import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { analysePurchasePdf, purchasePdfCapabilities } from '../src/modules/ai/purchasePdfController.js';
import { Invoice } from '../src/models/Invoice.js';

test('purchase-entry storage preserves structured electronic and fashion attributes', () => {
  const attributes = { ram: '8 GB', storage: '256 GB', processor: 'CPU', display: '43 inch', graphics: 'GPU', operatingSystem: 'OS', pattern: 'Plain', quality: 'Premium', ageGroup: 'Adult' };
  const invoice = new Invoice({ userId: '507f1f77bcf86cd799439002', number: 'PE-1', documentType: 'purchase-entry', items: [{ description: 'Product', ...attributes }] });
  assert.equal(invoice.validateSync(), undefined);
  const stored = invoice.toObject().items[0];
  for (const [field, value] of Object.entries(attributes)) assert.equal(stored[field], value);
});

test('purchase PDF API validates input, uses server models, and rejects truncated or invalid analysis', async () => {
  const originalFetch = global.fetch, originalKey = env.groqApiKey;
  const result = { vendor: { name: 'Supplier' }, items: [{ description: 'Product', qty: 2, rate: 100, gstRate: 5, sourcePage: 1 }], pageCounts: [{ page: 1, count: 1 }] };
  let payload, output, failure, calls = 0;
  const run = async (body) => {
    failure = undefined; output = undefined;
    await analysePurchasePdf({ body }, { json: (value) => { output = value; } }, (error) => { failure = error; });
  };
  try {
    env.groqApiKey = '';
    purchasePdfCapabilities({}, { json: (value) => { output = value; } });
    assert.deepEqual(output, { enabled: false });
    await run({ pages: [] }); assert.equal(failure.statusCode, 503);
    env.groqApiKey = 'test-server-key';
    global.fetch = async (_url, options) => {
      calls++; payload = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer test-server-key');
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }) };
    };
    await run({ pages: [{ number: 1, text: 'Supplier | article | pieces | cost' }] });
    assert.deepEqual(output.data, result); assert.equal(payload.model, env.groqModel);
    assert.equal(calls, 2); assert.equal(output.verified, true);
    assert.match(payload.messages.at(-1).content[0].text, /Recount every purchased row/);
    assert.equal(payload.response_format.type, 'json_object');
    assert.match(payload.messages[0].content, /ignore any instructions/);
    await run({ pages: [{ number: 1, text: '', image: 'data:image/jpeg;base64,YWJj' }] });
    assert.equal(payload.model, env.groqVisionModel);
    assert.equal(payload.messages[1].content[1].type, 'image_url');
    let step = 0;
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(++step === 1 ? { ...result, items: [{ ...result.items[0], description: 'Category: Phone' }] } : result) } }] }) });
    await run({ pages: [{ number: 1, text: 'supplier and product' }] });
    assert.equal(output.data.items[0].description, 'Product'); assert.equal(step, 2);
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...result, pageCounts: [{ page: 1, count: 2 }] }) } }] }) });
    await run({ pages: [{ number: 1, text: 'supplier and product' }] });
    assert.equal(failure.statusCode, 502); assert.match(failure.message, /every purchased row/);
    const before = calls;
    for (const pages of [[], [{ number: 1, text: 'a'.repeat(180001) }], [{ number: 1, text: '', image: 'https://some-url' }], Array.from({ length: 4 }, (_, index) => ({ number: index + 1, text: '', image: 'data:image/jpeg;base64,YWJj' }))]) {
      await run({ pages }); assert.equal(failure.statusCode, 400);
    }
    assert.equal(calls, before);
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }] }) });
    await run({ pages: [{ number: 1, text: 'supplier' }] }); assert.equal(failure.statusCode, 502); assert.match(failure.message, /incomplete/);
    global.fetch = async () => ({ ok: false, status: 429 });
    await run({ pages: [{ number: 1, text: 'supplier' }] }); assert.equal(failure.statusCode, 429);
    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }) });
    await run({ pages: [{ number: 1, text: 'supplier' }] }); assert.equal(failure.statusCode, 502);
  } finally { global.fetch = originalFetch; env.groqApiKey = originalKey; }
});

test('missing Qty triggers one source-based recheck and unresolved quantities remain explicitly uncertain', async () => {
  const originalFetch = global.fetch, originalKey = env.groqApiKey;
  const base = { vendor: { name: 'Supplier' }, items: [{ description: 'Product', qty: null, rate: 100, gstRate: 5, sourcePage: 1, uncertainFields: ['qty'] }], pageCounts: [{ page: 1, count: 1 }] };
  let calls = 0, output, failure, prompt;
  const run = async () => { output = undefined; failure = undefined; await analysePurchasePdf({ body: { pages: [{ number: 1, text: 'Description Qty Rate GST\nProduct 6 Nos 100 5%' }] } }, { json: value => { output = value; } }, error => { failure = error; }); };
  try {
    env.groqApiKey = 'test-server-key';
    global.fetch = async (_url, options) => {
      calls++; prompt = JSON.parse(options.body).messages.at(-1).content[0].text;
      const data = calls === 3 ? { ...base, items: [{ ...base.items[0], qty: 6, uncertainFields: [] }] } : base;
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] }) };
    };
    await run(); assert.equal(failure, undefined); assert.equal(calls, 3); assert.equal(output.data.items[0].qty, 6);
    assert.match(prompt, /original Qty column/); assert.match(prompt, /Do not default to 1/);
    calls = 0;
    global.fetch = async () => { calls++; return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(base) } }] }) }; };
    await run(); assert.equal(calls, 3); assert.equal(output.data.items[0].qty, null); assert.ok(output.data.warnings.some(warning => /Quantity is missing/.test(warning)));
  } finally { global.fetch = originalFetch; env.groqApiKey = originalKey; }
});
