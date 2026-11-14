import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import { OnlineStoreSettings } from '../src/models/OnlineStoreSettings.js';
import { Product } from '../src/models/Product.js';
import { normalizeThemeDesign } from '../src/modules/online-store/themeDesign.js';
import { sectionStylesCss } from '../../frontend/src/features/store/sectionStyles.js';

process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/unused-test-db';
process.env.JWT_SECRET ||= 'online-store-theme-test';
process.env.ONLINE_STORE_ENABLED = 'true';
const { updateStoreSettings, getPublicStore } = await import('../src/modules/online-store/onlineStoreController.js');
const { validateStoreImage } = await import('../src/modules/online-store/storeImages.js');
afterEach(() => mock.restoreAll());

test('page layouts, blocks, device content and device ordering survive saving and public reads', async () => {
  const current = settings();
  const theme = { ...current.theme.toObject(), blocks: [{ id: 'block-abcdef1234567890', page: 'home', type: 'text', title: 'Our story', deviceContent: { mobile: { title: 'Mobile story' } } }], pageStyles: { home: { products: { desktop: { columns: 4 }, tablet: { columns: 3 }, mobile: { columns: 2, gap: 10 } } }, cart: { checkout: { mobile: { paddingX: 12 } } } }, deviceContent: { mobile: { heroTitle: 'Mobile hero', bannerImageUrl: '/api/files/mobile.jpg' } }, sectionOrder: { home: ['block-abcdef1234567890', 'products', 'hero'] }, responsiveOrder: { home: { mobile: ['products', 'block-abcdef1234567890', 'hero'] } } };
  theme.pageContent = { products: { desktop: { productsTitle: 'Shop all' }, mobile: { productsTitle: 'Shop mobile' } }, cart: { tablet: { cartTitle: 'Your selection', checkoutTitle: 'Delivery details' } } };
  theme.pageVisibility = { cart: { mobile: { fields: { checkoutEmail: false }, sections: { footer: false } } } };
  const result = await save(current, { ...current.toObject(), theme });
  const persisted = new OnlineStoreSettings({ ...result, userId: current.userId });
  assert.equal(persisted.validateSync(), undefined);
  assert.equal(persisted.theme.pageStyles.home.products.mobile.columns, 2);
  assert.equal(persisted.theme.pageStyles.cart.checkout.mobile.paddingX, 12);
  assert.equal(persisted.theme.blocks[0].deviceContent.mobile.title, 'Mobile story');
  assert.equal(persisted.theme.deviceContent.mobile.heroTitle, 'Mobile hero');
  assert.deepEqual(persisted.theme.responsiveOrder.home.mobile, ['products', 'block-abcdef1234567890', 'hero']);
  assert.equal(result.templateDesigns.boutique.pageStyles.home.products.tablet.columns, 3);
  mock.restoreAll();
  mock.method(OnlineStoreSettings, 'findOne', () => ({ lean: async () => ({ ...persisted.toObject(), enabled: true }) }));
  mock.method(Product, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  let response;
  await getPublicStore({ params: { slug: 'my-store' } }, { json: (value) => { response = value; } }, (error) => { throw error; });
  assert.equal(response.store.theme.pageVisibility.cart.mobile.fields.checkoutEmail, false);
  assert.equal(result.templateDesigns.boutique.pageVisibility.cart.mobile.sections.footer, false);
  assert.equal(response.store.theme.pageContent.products.mobile.productsTitle, 'Shop mobile');
  assert.equal(response.store.theme.pageContent.cart.tablet.checkoutTitle, 'Delivery details');
  assert.equal(result.templateDesigns.boutique.pageContent.products.desktop.productsTitle, 'Shop all');
  assert.equal(response.store.theme.blocks[0].title, 'Our story');
  assert.equal(response.store.theme.pageStyles.home.products.mobile.gap, 10);
  assert.equal(response.store.templateDesigns, undefined);
});

for (const [name, color] of [['aurora', '#00e6a0'], ['goldenhue', '#e6b96e']]) {
  test(`${name} can be applied, saved in the library, and returned by the public store`, async () => {
    const current = settings();
    const result = await save(current, { ...current.toObject(), theme: { name, primaryColor: color, heroTitle: 'My luxury collection', showHero: true } });
    assert.equal(result.theme.name, name);
    assert.equal(result.theme.primaryColor, color);
    assert.equal(result.templateDesigns[name].heroTitle, 'My luxury collection');
    const persisted = new OnlineStoreSettings({ ...result, userId: current.userId });
    assert.equal(persisted.validateSync(), undefined);
    assert.equal(persisted.templateDesigns[name].name, name);
    assert.equal(persisted.templateDesigns.boutique.heroTitle, 'Original boutique');
    mock.restoreAll();
    mock.method(OnlineStoreSettings, 'findOne', () => ({ lean: async () => ({ ...persisted.toObject(), enabled: true }) }));
    mock.method(Product, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
    let response;
    await getPublicStore({ params: { slug: 'my-store' } }, { json: (value) => { response = value; } }, (error) => { throw error; });
    assert.equal(response.store.theme.name, name);
    assert.equal(response.store.theme.primaryColor, color);
    assert.equal(response.store.templateDesigns, undefined);
  });
}

function settings() {
  return new OnlineStoreSettings({ userId: '507f1f77bcf86cd799439021', storeName: 'My Store', slug: 'my-store', enabled: true,
    theme: { name: 'boutique', primaryColor: '#9d174d', heroTitle: 'Original boutique', showHero: false },
    templateDesigns: { premium: { name: 'premium', heroTitle: 'Saved premium', primaryColor: '#7c3aed' } },
  });
}

async function save(current, body) {
  mock.method(OnlineStoreSettings, 'findOne', (query) => query.slug
    ? { select: () => ({ lean: async () => null }) }
    : Promise.resolve(current));
  mock.method(OnlineStoreSettings, 'findByIdAndUpdate', async (id, update, options) => {
    assert.equal(String(id), String(current._id));
    assert.equal(options.runValidators, true);
    return new OnlineStoreSettings({ ...current.toObject(), ...update.$set });
  });
  let result;
  await updateStoreSettings({ user: { id: String(current.userId) }, body }, { json: (value) => { result = value.settings; } }, (error) => { throw error; });
  return result;
}

test('normalization bounds input, validates appearance, and preserves hidden sections', () => {
  const design = normalizeThemeDesign({ heroTitle: 'A'.repeat(200), primaryColor: 'invalid', productColumns: 99, fontFamily: 'unknown', showHero: false, showFooter: 'false', logoUrl: 'javascript:alert(1)', bannerImageUrl: '//untrusted.example/banner' });
  assert.equal(design.heroTitle.length, 120);
  assert.equal(design.primaryColor, '#2563eb');
  assert.equal(design.productColumns, 0);
  assert.equal(design.fontFamily, 'sans');
  assert.equal(design.showHero, false);
  assert.equal(design.showFooter, true);
  assert.equal(design.logoUrl, '');
  assert.equal(design.bannerImageUrl, '');
});

test('editing a library template persists its design without changing the active store', async () => {
  const current = settings();
  const result = await save(current, { ...current.toObject(), theme: current.theme.toObject(), templateDesigns: { premium: { name: 'premium', heroTitle: 'Edited premium', productColumns: 3 } } });
  assert.equal(result.theme.name, 'boutique');
  assert.equal(result.theme.heroTitle, 'Original boutique');
  assert.equal(result.theme.showHero, false);
  assert.equal(result.templateDesigns.premium.heroTitle, 'Edited premium');
  assert.equal(result.templateDesigns.premium.primaryColor, '#7c3aed');
  assert.equal(result.templateDesigns.premium.productColumns, 3);
  assert.equal(result.templateDesigns.boutique.heroTitle, 'Original boutique');
  assert.equal(result.theme.$__, undefined);
});

test('applying another template preserves the previous design and survives serialization', async () => {
  const current = settings();
  const result = await save(current, { ...current.toObject(), theme: { ...current.templateDesigns.premium.toObject(), name: 'premium' } });
  const persisted = new OnlineStoreSettings(result).toObject();
  assert.equal(result.theme.name, 'premium');
  assert.equal(result.theme.heroTitle, 'Saved premium');
  assert.equal(persisted.templateDesigns.boutique.heroTitle, 'Original boutique');
  assert.equal(persisted.templateDesigns.boutique.showHero, false);
});

test('saving the active design updates both the live theme and its saved copy', async () => {
  const current = settings();
  const result = await save(current, { ...current.toObject(), theme: { ...current.theme.toObject(), heroTitle: 'New collection', showFooter: false } });
  assert.equal(result.theme.heroTitle, 'New collection');
  assert.equal(result.templateDesigns.boutique.heroTitle, 'New collection');
  assert.equal(result.templateDesigns.boutique.showFooter, false);
});

test('public store returns the active design without exposing library designs', async () => {
  mock.method(OnlineStoreSettings, 'findOne', () => ({ lean: async () => settings().toObject() }));
  mock.method(Product, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  let response;
  await getPublicStore({ params: { slug: 'my-store' } }, { json: (value) => { response = value; } }, (error) => { throw error; });
  assert.equal(response.store.theme.heroTitle, 'Original boutique');
  assert.equal(response.store.templateDesigns, undefined);
});

test('section sizes and typography survive save for each device and template', async () => {
  const current = settings();
  const result = await save(current, { ...current.toObject(), theme: { ...current.theme.toObject(), bannerFit: 'contain', bannerPosition: 'top', bannerImageUrl: '/api/files/store-images/example', sectionStyles: {
    hero: { desktop: { height: 250, width: 80, headingSize: 60 }, mobile: { height: 160, width: 100, headingSize: 24 } },
    footer: { desktop: { paddingY: 0, fontSize: 12 } },
  } } });
  assert.equal(result.theme.bannerImageUrl, '/api/files/store-images/example');
  assert.equal(result.theme.bannerFit, 'contain');
  assert.equal(result.theme.bannerPosition, 'top');
  assert.equal(result.templateDesigns.boutique.sectionStyles.hero.desktop.height, 250);
  assert.equal(result.templateDesigns.boutique.sectionStyles.hero.mobile.headingSize, 24);
  assert.equal(result.theme.sectionStyles.footer.desktop.paddingY, 0);
  assert.equal(result.templateDesigns.premium.heroTitle, 'Saved premium');
});

test('section settings reject CSS injection and clamp invalid sizes', () => {
  const design = normalizeThemeDesign({ sectionStyles: { hero: { desktop: { height: -5, width: 500, headingSize: 999, fontSize: '16; background:url(evil)', backgroundColor: 'red;}body{display:none', unknown: 10 } }, unknown: { desktop: { height: 200 } } } });
  assert.deepEqual(design.sectionStyles, { hero: { desktop: { width: 100, height: 0, headingSize: 120 } } });
  const css = sectionStylesCss(design.sectionStyles);
  assert.match(css, /height:auto!important/);
  assert.doesNotMatch(css, /evil|display:none|unknown/);
});

test('responsive styles cascade from desktop to tablet and mobile', () => {
  const css = sectionStylesCss({ hero: { desktop: { height: 430 }, tablet: { height: 300 }, mobile: { height: 160 } } });
  assert.ok(css.indexOf('430px') < css.indexOf('@media(max-width:1023px)'));
  assert.ok(css.indexOf('300px') < css.indexOf('@media(max-width:767px)'));
  assert.match(css, /height:160px!important/);
  assert.equal(sectionStylesCss({}), '@media(max-width:1023px){}@media(max-width:767px){}');
});

test('image uploads require real supported image content and enforce size limits', () => {
  assert.throws(() => validateStoreImage(), /Choose an image/);
  assert.throws(() => validateStoreImage({ mimetype: 'image/png', buffer: Buffer.from('not an image') }), /not a valid/);
  assert.throws(() => validateStoreImage({ mimetype: 'image/svg+xml', buffer: Buffer.from('<svg></svg>') }), /not a valid/);
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  assert.doesNotThrow(() => validateStoreImage({ mimetype: 'image/png', buffer: png }));
  const oversized = Buffer.alloc(8 * 1024 * 1024 + 1); png.copy(oversized);
  assert.throws(() => validateStoreImage({ mimetype: 'image/png', buffer: oversized }), /smaller than 8 MB/);
});

test('page content accepts only supported pages, devices, keys and bounded values', () => {
  const theme = normalizeThemeDesign({ pageContent: { fake: { desktop: { cartTitle: 'ignored' } }, cart: { unknown: { cartTitle: 'ignored' }, desktop: { cartTitle: 'C'.repeat(200), checkoutButton: 'Order now', injected: 'bad', bannerImageUrl: 'javascript:bad()' }, mobile: { cartText: 'Mobile cart' } } } });
  assert.equal(theme.pageContent.fake, undefined);
  assert.equal(theme.pageContent.cart.unknown, undefined);
  assert.equal(theme.pageContent.cart.desktop.cartTitle.length, 120);
  assert.equal(theme.pageContent.cart.desktop.checkoutButton, 'Order now');
  assert.equal(theme.pageContent.cart.desktop.injected, undefined);
  assert.equal(theme.pageContent.cart.desktop.bannerImageUrl, '');
  assert.equal(theme.pageContent.cart.mobile.cartText, 'Mobile cart');
});

test('visibility accepts booleans for known sections and fields on their own page only', () => {
  const theme = normalizeThemeDesign({ blocks: [{ id: 'block-12345678', type: 'text', page: 'home', title: 'Keep me' }], pageVisibility: { fake: { desktop: { sections: { hero: false } } }, home: { desktop: { sections: { hero: false, injected: false }, fields: { heroTitle: false, injected: false, 'block-12345678:title': false, 'block-99999999:title': false } } }, cart: { mobile: { fields: { checkoutEmail: false, checkoutTitle: 'false', 'block-12345678:title': false } } } } });
  assert.equal(theme.pageVisibility.fake, undefined);
  assert.deepEqual(theme.pageVisibility.home.desktop.sections, { hero: false });
  assert.deepEqual(theme.pageVisibility.home.desktop.fields, { heroTitle: false, 'block-12345678:title': false });
  assert.deepEqual(theme.pageVisibility.cart.mobile.fields, { checkoutEmail: false });
});
