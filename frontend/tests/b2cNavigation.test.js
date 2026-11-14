import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarSections, canAccessPath } from '../src/constants/navigation.js';

const categories = ['retail', 'school', 'hospital', 'hotel', 'manufacturing', 'construction', 'ngo', 'automobile', 'finance'];
for (const category of categories) {
  test(`${category} has no separate B2C sidebar module`, () => {
    const sections = getSidebarSections(category, { permissions: { modules: ['billing'] } });
    assert.equal(sections.some(section => section.title === 'B2C Billing'), false);
    assert.equal(sections.some(section => section.items.some(item => item.href === '/billing/b2c')), false);
  });
}
test('B2C navigation retains billing permissions', () => {
  assert.equal(canAccessPath('/billing/b2c', { permissions: { modules: [] } }), false);
  assert.equal(canAccessPath('/billing/invoice/123/edit', { permissions: { modules: [] } }), false);
  assert.equal(canAccessPath('/billing/b2c', { permissions: { modules: ['billing'] } }), true);
});
