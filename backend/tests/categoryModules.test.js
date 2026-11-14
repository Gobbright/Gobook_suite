import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORIES } from '../src/constants/categories.js';
import { requireCategoryModule } from '../src/middleware/requireCategoryModule.js';

function checkAccess(category, moduleKey) {
  let result = 'not-called';
  requireCategoryModule(moduleKey)({ user: { category } }, {}, (error) => { result = error; });
  return result;
}

for (const category of CATEGORIES) {
  test(`${category} can use the shared consumer billing engine`, () => {
    assert.equal(checkAccess(category, 'sales'), undefined);
  });
}

test('shared billing preserves specialty module boundaries', () => {
  for (const category of CATEGORIES) {
    assert.equal(checkAccess(category, 'hospital')?.statusCode, category === 'hospital' ? undefined : 404);
    assert.equal(checkAccess(category, 'finance')?.statusCode, category === 'finance' ? undefined : 404);
    assert.equal(checkAccess(category, 'unknown').statusCode, 404);
  }
  for (const category of ['unknown', '', undefined]) assert.equal(checkAccess(category, 'sales').statusCode, 404);
});
