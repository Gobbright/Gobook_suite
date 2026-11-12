import assert from 'node:assert/strict';
import test from 'node:test';
import { requireCategoryModule } from '../src/middleware/requireCategoryModule.js';

function checkAccess(category, moduleKey) {
  let result = 'not-called';
  requireCategoryModule(moduleKey)({ user: { category } }, {}, (error) => { result = error; });
  return result;
}

test('Automobile has the same sales and purchase API access as Retail', () => {
  for (const category of ['retail', 'automobile']) assert.equal(checkAccess(category, 'sales'), undefined);
});

test('enabling Automobile billing preserves category boundaries', () => {
  for (const category of ['school', 'hotel', 'finance', 'ngo', 'construction']) {
    assert.equal(checkAccess(category, 'sales').statusCode, 404);
  }
  assert.equal(checkAccess('automobile', 'hospital').statusCode, 404);
  assert.equal(checkAccess('automobile', 'finance').statusCode, 404);
  assert.equal(checkAccess('hospital', 'sales'), undefined);
});
