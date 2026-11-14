import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

let server;
let LuxuryStorefront;
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: '../backend/runtime/luxury-vite-cache', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ LuxuryStorefront } = await server.ssrLoadModule('/src/features/store/LuxuryStorefront.jsx'));
});
after(async () => { await server?.close(); });

const product = { id: 'p1', name: 'Signature Pendant', category: 'Jewelry', rate: 2450, mrp: 2800, stock: 5, imageUrl: '/api/files/pendant.jpg', description: 'Handcrafted pendant', featured: true };
const noop = () => {};
function render(name, extra = {}) {
  const props = {
    store: { storeName: 'Test Store', theme: { name }, orderMode: 'cod' }, products: [product], filteredProducts: [product], slug: 'test-store',
    cart: [], wishlist: [], wishlistProducts: [], itemCount: 0, total: 0, customer: { customerName: '', customerPhone: '', customerEmail: '', deliveryAddress: '', notes: '' },
    query: '', category: 'All', categories: ['All', 'Jewelry'], sortMode: 'newest', productFilter: 'all',
    setQuery: noop, setCategory: noop, setSortMode: noop, setProductFilter: noop, addToCart: noop, toggleWishlist: noop, changeQty: noop, removeFromCart: noop, placeOrder: noop, updateCustomer: noop, openStorePath: noop,
    ...extra,
  };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(LuxuryStorefront, props)));
}

for (const name of ['aurora', 'goldenhue']) {
  test(`${name} home renders themed cards and real product links`, () => {
    const html = render(name);
    assert.match(html, new RegExp(name === 'aurora' ? 'lux-aurora' : 'lux-gold'));
    assert.match(html, /href="\/store\/test-store\/product\/p1"/);
    assert.match(html, /Save Signature Pendant to wishlist/);
    assert.match(html, /Buy now/);
    assert.match(html, name === 'aurora' ? /lux-mosaic/ : /Timeless Elegance/);
  });
  test(`${name} product list exposes search, category, price filters and sorting`, () => {
    const html = render(name, { storePage: 'products' });
    for (const label of ['Search the collection', 'Product category', 'Filter products', 'Sort products']) assert.ok(html.includes(`aria-label="${label}"`));
    assert.doesNotMatch(html, /class="lux-hero"/);
  });
  test(`${name} product detail resolves local uploads and renders shopping controls`, () => {
    const html = render(name, { productId: 'p1', productDetail: product });
    assert.match(html, /http:\/\/localhost:5000\/api\/files\/pendant.jpg/);
    assert.match(html, /5 available/);
    assert.match(html, /Increase Signature Pendant quantity/);
    assert.match(html, /Handcrafted pendant/);
    assert.doesNotMatch(html, /id="products"/);
  });
  test(`${name} wishlist shows saved items and a helpful empty state`, () => {
    assert.match(render(name, { storePage: 'wishlist' }), /Your favorites belong here/);
    const html = render(name, { storePage: 'wishlist', wishlist: ['p1'], wishlistProducts: [product] });
    assert.match(html, /Remove Signature Pendant from wishlist/);
    assert.match(html, /aria-pressed="true"/);
    assert.doesNotMatch(html, /Your favorites belong here/);
  });
  test(`${name} cart renders quantities, totals and actual order form`, () => {
    assert.match(render(name, { storePage: 'cart' }), /Your bag is waiting/);
    const html = render(name, { storePage: 'cart', cart: [{ ...product, qty: 2 }], total: 4900, itemCount: 2 });
    for (const content of ['Rs. 4,900', 'Full name', 'Phone number', 'Delivery address', 'Place cash on delivery order', 'Remove Signature Pendant from cart']) assert.ok(html.includes(content));
    assert.match(html, /<form/);
    assert.doesNotMatch(html, /Your bag is waiting/);
  });
  test(`${name} empty catalog and unavailable product have recovery actions`, () => {
    assert.match(render(name, { storePage: 'products', filteredProducts: [] }), /No pieces found/);
    assert.match(render(name, { productId: 'missing' }), /Product unavailable/);
    const html = render(name, { storePage: 'products', filteredProducts: [{ ...product, stock: 0 }] });
    assert.match(html, /disabled="">Out of stock/);
  });
}
