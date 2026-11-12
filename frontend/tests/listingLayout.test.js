import test from 'node:test';
import assert from 'node:assert/strict';
import { usesAutomobileListingLayout } from '../src/utils/listingLayout.js';

test('automobile retains its listing layout', () => {
  assert.equal(usesAutomobileListingLayout({ category: 'automobile' }), true);
});
test('fashion and electronics accounts share the automobile listing layout', () => {
  for (const retailSubcategory of ['electronics-technology', 'Electronics & Technology', 'fashion-lifestyle', 'Fashion & Lifestyle', 'Fashion & Style']) {
    assert.equal(usesAutomobileListingLayout({ category: 'retail', retailSubcategory }), true, retailSubcategory);
    assert.equal(usesAutomobileListingLayout({ category: 'retail' }, { retailSubcategory }), true, retailSubcategory);
  }
});
test('unrelated retail and other business categories keep their existing layouts', () => {
  for (const user of [null, {}, { category: 'hospital' }, { category: 'retail', retailSubcategory: 'food-grocery' }, { category: 'retail', retailSubcategory: 'home-living' }]) {
    assert.equal(usesAutomobileListingLayout(user), false);
  }
  assert.equal(usesAutomobileListingLayout({ category: 'hospital' }, { retailSubcategory: 'fashion-lifestyle' }), false);
});
test('server settings take precedence over a stale account subcategory', () => {
  assert.equal(usesAutomobileListingLayout({ category: 'retail', retailSubcategory: 'fashion-lifestyle' }, { retailSubcategory: 'food-grocery' }), false);
});
