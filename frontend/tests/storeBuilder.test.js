import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { normalizeThemeDesign } from '../../backend/src/modules/online-store/themeDesign.js';
import { responsiveBuilderCss, resolveDeviceContent, pageSectionOrder, moveStoreSection } from '../src/features/store/storeBuilder.js';

let server, PublicStorePage;
before(async () => {
  server = await createServer({ configFile: false, plugins: [react()], cacheDir: '../backend/runtime/builder-vite-cache', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  ({ PublicStorePage } = await server.ssrLoadModule('/src/features/store/PublicStorePage.jsx'));
});
after(async () => { await server?.close(); });
const product = { id: 'p1', name: 'Test Watch', category: 'Watches', rate: 2500, stock: 5, showOnline: true, imageUrl: '/api/files/watch.jpg' };
const block = { id: 'block-abcdef1234567890', type: 'banner', page: 'home', title: 'Desktop promotion', text: 'Our latest collection', buttonLabel: 'Explore', buttonUrl: '/products', deviceContent: { mobile: { title: 'Mobile promotion' } } };
function render(name, page = 'home', theme = {}, device = 'desktop') {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PublicStorePage, { preview: { store: { slug: 'test', storeName: 'Test Store', theme: { name, ...theme } }, page, device, products: [product] } })));
}
for (const name of ['boutique', 'marketplace', 'premium', 'aurora', 'goldenhue']) {
  for (const [page, section] of [['home', 'products'], ['products', 'products'], ['details', 'details'], ['wishlist', 'wishlist'], ['cart', 'cart']]) {
    test(`${name}: editor renders ${page} using the real storefront`, () => {
      const html = render(name, page);
      assert.ok(html.includes(`data-store-page="${page}"`));
      assert.ok(html.includes(`data-store-section="${section}"`));
      assert.match(html, /Test Watch/);
      if (page === 'details') assert.doesNotMatch(html, /data-store-section="products"/);
    });
  }
  test(`${name}: custom blocks reorder with content sections and respect device content`, () => {
    const theme = { blocks: [block], sectionOrder: { home: [block.id, 'products', 'hero', 'collections', 'benefits'] }, responsiveOrder: { home: { mobile: ['products', block.id, 'hero', 'collections', 'benefits'] } } };
    const desktop = render(name, 'home', theme);
    assert.ok(desktop.indexOf(`data-store-section="${block.id}"`) < desktop.indexOf('data-store-section="products"'));
    assert.match(desktop, /Desktop promotion/);
    assert.match(desktop, /href="\/store\/test\/products"/);
    const mobile = render(name, 'home', theme, 'mobile');
    assert.ok(mobile.indexOf('data-store-section="products"') < mobile.indexOf(`data-store-section="${block.id}"`));
    assert.match(mobile, /Mobile promotion/);
  });
}
test('styles are scoped by page and cascade down desktop, tablet and mobile', () => {
  const css = responsiveBuilderCss({ products: { desktop: { columns: 4, gap: 20 }, tablet: { columns: 3 }, mobile: { columns: 2, hidden: false } }, productCard: { mobile: { backgroundColor: '#102030', radius: 12 } } }, '.store-design[data-store-page="products"]');
  assert.ok(css.indexOf('repeat(4,') < css.indexOf('@media(max-width:1023px)'));
  assert.ok(css.indexOf('repeat(3,') < css.indexOf('@media(max-width:767px)'));
  assert.match(css, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /data-store-page="products"/);
  assert.match(css, /background:#102030!important/);
  assert.match(css, /border-radius:12px!important/);
});
test('responsive content inherits down without overwriting source designs', () => {
  const theme = { heroTitle: 'Desktop', deviceContent: { tablet: { heroTitle: 'Tablet', heroText: 'Tablet text' }, mobile: { heroTitle: 'Mobile' } } };
  assert.equal(resolveDeviceContent(theme, 'desktop').heroTitle, 'Desktop');
  assert.equal(resolveDeviceContent(theme, 'tablet').heroTitle, 'Tablet');
  assert.equal(resolveDeviceContent(theme, 'mobile').heroTitle, 'Mobile');
  assert.equal(resolveDeviceContent(theme, 'mobile').heroText, 'Tablet text');
  assert.equal(theme.heroTitle, 'Desktop');
});
test('section ordering ignores deleted blocks and supports keyboard move controls', () => {
  const order = pageSectionOrder({ name: 'marketplace', blocks: [block], sectionOrder: { home: ['deleted', 'products', block.id, 'hero'] } }, 'home');
  assert.deepEqual(order, ['products', block.id, 'hero', 'benefits']);
  assert.deepEqual(moveStoreSection(order, 'hero', -1), ['products', 'hero', block.id, 'benefits']);
  assert.deepEqual(moveStoreSection(order, 'products', -1), order);
});
test('builder input rejects unsafe URLs and CSS while retaining valid responsive designs', () => {
  const theme = normalizeThemeDesign({ name: 'marketplace', blocks: [{ ...block, buttonUrl: 'javascript:alert(1)', imageUrl: '//bad.example/image', deviceContent: { mobile: { buttonUrl: 'data:text/html,evil' } } }, { ...block }], pageStyles: { home: { products: { mobile: { columns: 99, gap: -4, backgroundColor: 'red;}body{display:none', hidden: true } }, 'bad"]{}': { desktop: { width: 2 } } } }, sectionOrder: { home: [block.id, block.id, 'bad'] }, responsiveOrder: { home: { mobile: ['products', block.id, 'bad'] } } });
  assert.equal(theme.blocks.length, 1);
  assert.equal(theme.blocks[0].buttonUrl, '/products');
  assert.equal(theme.blocks[0].imageUrl, '');
  assert.equal(theme.blocks[0].deviceContent.mobile.buttonUrl, '/products');
  assert.deepEqual(theme.pageStyles.home.products.mobile, { columns: 6, gap: 0, hidden: true });
  assert.deepEqual(theme.sectionOrder.home, [block.id]);
  assert.deepEqual(theme.responsiveOrder.home.mobile, ['products', block.id]);
  const html = render('marketplace', 'home', { blocks: [{ ...block, title: '<script>alert(1)</script>' }] });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});

for (const name of ['boutique', 'marketplace', 'premium', 'aurora', 'goldenhue']) {
  for (const [page, key] of [['products', 'productsTitle'], ['details', 'detailsIntro'], ['wishlist', 'wishlistTitle'], ['cart', 'cartTitle'], ['about', 'aboutTitle'], ['offers', 'productsTitle']]) {
    test(`${name}: ${page} content is independent and inherits per device after normalization`, () => {
      const theme = normalizeThemeDesign({ name, productsTitle: 'Original catalog', pageContent: { [page]: { desktop: { [key]: 'Desktop page content' }, tablet: { [key]: 'Tablet page content' }, mobile: { [key]: 'Mobile page content' } } } });
      for (const [device, expected] of [['desktop', 'Desktop page content'], ['tablet', 'Tablet page content'], ['mobile', 'Mobile page content']]) {
        const html = render(name, page, theme, device);
        assert.ok(html.includes(expected), `${page} ${device} must render edited content`);
      }
      const home = render(name, 'home', theme);
      assert.ok(!home.includes('Desktop page content'), 'Editing another page must preserve the homepage');
    });
  }
  test(`${name}: checkout and related headings render edited content`, () => {
    assert.match(render(name, 'cart', { pageContent: { cart: { desktop: { checkoutTitle: 'Confirm your selection', checkoutButton: 'Send my selection' } } } }), /Confirm your selection/);
    assert.match(render(name, 'cart', { pageContent: { cart: { desktop: { checkoutButton: 'Send my selection' } } } }), /Send my selection/);
    assert.match(render(name, 'details', { pageContent: { details: { desktop: { relatedTitle: 'More from our store' } } } }), /More from our store/);
  });
}
test('page content inherits desktop and tablet values without changing other pages', () => {
  const theme = { productsTitle: 'Global catalog', pageContent: { products: { desktop: { productsTitle: 'All products' }, tablet: { productsTitle: 'Browse products' }, mobile: { cartText: 'Extra mobile text' } } } };
  assert.equal(resolveDeviceContent(theme, 'mobile', 'products').productsTitle, 'Browse products');
  assert.equal(resolveDeviceContent(theme, 'desktop', 'home').productsTitle, 'Global catalog');
  assert.equal(resolveDeviceContent(theme, 'desktop', 'products').productsTitle, 'All products');
});

for (const name of ['boutique', 'marketplace', 'premium', 'aurora', 'goldenhue']) {
  test(`${name}: removed sections and fields stay removed without restoring fallback content`, () => {
    const visibility = { wishlist: { desktop: { fields: { wishlistTitle: false } } }, cart: { desktop: { fields: { cartTitle: false, checkoutTitle: false, checkoutButton: false, checkoutEmail: false, checkoutNotes: false } } }, details: { desktop: { sections: { related: false } } }, about: { desktop: { sections: { about: false } } } };
    const theme = normalizeThemeDesign({ name, pageVisibility: visibility });
    assert.doesNotMatch(render(name, 'wishlist', theme), /data-store-field="wishlistTitle"/);
    const cart = render(name, 'cart', theme);
    for (const field of ['cartTitle', 'checkoutTitle', 'checkoutButton', 'checkoutEmail', 'checkoutNotes']) assert.ok(!cart.includes(`data-store-field="${field}"`), field);
    assert.match(cart, /data-store-section="checkout"/);
    assert.doesNotMatch(render(name, 'details', theme), /data-store-section="related"/);
    assert.doesNotMatch(render(name, 'about', theme), /data-store-section="about"/);
  });
  test(`${name}: removal is page scoped and can be restored on a smaller device`, () => {
    const theme = normalizeThemeDesign({ name, pageVisibility: { products: { desktop: { sections: { products: false } }, mobile: { sections: { products: true } } } } });
    assert.doesNotMatch(render(name, 'products', theme), /data-store-section="products"/);
    assert.doesNotMatch(render(name, 'products', theme, 'tablet'), /data-store-section="products"/);
    assert.match(render(name, 'products', theme, 'mobile'), /data-store-section="products"/);
    assert.match(render(name, 'home', theme), /data-store-section="products"/);
  });
  test(`${name}: custom block fields can be removed without deleting their saved values`, () => {
    const theme = normalizeThemeDesign({ name, blocks: [block], pageVisibility: { home: { desktop: { fields: { [`${block.id}:title`]: false } } } } });
    assert.doesNotMatch(render(name, 'home', theme), /Desktop promotion/);
    assert.match(render(name, 'home', theme), /Our latest collection/);
    assert.equal(theme.blocks[0].title, 'Desktop promotion');
  });
}
test('hero image and call to action removal preserve the remaining content', () => {
  for (const name of ['boutique', 'marketplace', 'premium', 'goldenhue']) {
    const theme = { heroTitle: 'Keep this heading', heroButton: 'Hide this action', pageVisibility: { home: { desktop: { fields: { bannerImageUrl: false, heroButton: false } } } } };
    const html = render(name, 'home', theme);
    assert.doesNotMatch(html, /data-store-field="bannerImageUrl"/);
    assert.doesNotMatch(html, /data-store-field="heroButton"/);
    assert.match(html, /Keep this heading/);
  }
});

for (const name of ['boutique', 'marketplace', 'premium', 'aurora', 'goldenhue']) {
  test(`${name}: navbar contains exactly Home, About, Product and Contact with wishlist and cart icons`, () => {
    const html = render(name, 'home');
    const header = html.match(/<header[^>]*data-store-section="header"[\s\S]*?<\/header>/)?.[0];
    assert.ok(header);
    const nav = header.match(/<nav[^>]*aria-label="Store navigation"[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav);
    assert.deepEqual([...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(match => match[1]), ['Home', 'About', 'Product', 'Contact']);
    for (const path of ['', '/about', '/products', '/contact']) assert.ok(nav.includes(`href="/store/test${path}"`));
    assert.match(header, /aria-label="Wishlist/);
    assert.match(header, /aria-label="Cart/);
    assert.doesNotMatch(header, /placeholder="Search|aria-label="Search products"|lux-category-nav/);
  });
  test(`${name}: contact page renders its own customizable content`, () => {
    const theme = normalizeThemeDesign({ name, pageContent: { contact: { desktop: { contactTitle: 'Talk to our team', contactText: 'We would love to help.' } } } });
    const html = render(name, 'contact', theme);
    assert.match(html, /data-store-page="contact"/);
    assert.match(html, /data-store-section="contact"/);
    assert.match(html, /Talk to our team/);
    assert.match(html, /We would love to help./);
    assert.doesNotMatch(html, /data-store-section="products"/);
  });
}
