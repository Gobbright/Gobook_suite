export const builderPages = [['home', 'Home'], ['products', 'Product list'], ['details', 'Product details'], ['wishlist', 'Wishlist'], ['cart', 'Cart & checkout'], ['about', 'About'], ['contact', 'Contact'], ['offers', 'Offers']];
export const builderSections = {
  home: ['hero', 'collections', 'products', 'benefits'], products: ['products'], details: ['details', 'related'], wishlist: ['wishlist'], cart: ['cart'], about: ['about'], contact: ['contact'], offers: ['benefits', 'products'],
};
export const sectionLabels = { header: 'Header & announcement', hero: 'Image banner', collections: 'Featured collections', products: 'Product catalog', benefits: 'Store benefits', footer: 'Footer', details: 'Product details', related: 'Related products', wishlist: 'Wishlist', cart: 'Cart & checkout', about: 'About the store', contact: 'Contact information', productCard: 'Product cards', productImage: 'Product images', productTitle: 'Product titles', productPrice: 'Product prices', buttons: 'Buttons', navigation: 'Navigation', checkout: 'Checkout form' };
export const elementSelectors = {
  productCard: ':is([data-store-section="products"],[data-store-section="wishlist"],[data-store-section="related"]) article',
  productImage: ':is([data-store-section="products"],[data-store-section="wishlist"],[data-store-section="related"]) article :is(.lux-card-image, a:has(> img))',
  productTitle: ':is([data-store-section="products"],[data-store-section="wishlist"],[data-store-section="related"]) article :is(.lux-card-title a,a.line-clamp-2)',
  productPrice: ':is([data-store-section="products"],[data-store-section="wishlist"],[data-store-section="related"]) article strong',
  buttons: ':is(button.lux-primary,button.lux-outline,button[style*="background"])',
  navigation: 'header nav', checkout: '[data-store-section="cart"] form',
};
export const blockTypes = [['text', 'Text & heading'], ['image', 'Image'], ['banner', 'Call to action'], ['spacer', 'Spacer'], ['divider', 'Divider']];
export const responsiveContentKeys = ['logoUrl', 'bannerImageUrl', 'announcement', 'heroTitle', 'heroText', 'heroButton', 'productsTitle', 'footerText', 'bannerFit', 'bannerPosition', 'showHero', 'showBenefits', 'showFooter', 'primaryColor', 'fontFamily'];
// Content controls exist for every page, while product data stays in the catalog.
export const sectionContentFields = {
  details: [['detailsIntro', 'Product page introduction', 300, true], ['addToCartLabel', 'Add to cart button label', 80]],
  related: [['relatedTitle', 'Related products heading', 120]],
  wishlist: [['wishlistTitle', 'Wishlist heading', 120], ['wishlistText', 'Wishlist introduction', 300, true]],
  cart: [['cartTitle', 'Cart heading', 120], ['cartText', 'Cart introduction', 300, true]],
  checkout: [['checkoutTitle', 'Checkout heading', 120], ['checkoutButton', 'Order button label', 80]],
  about: [['aboutTitle', 'About page heading', 120], ['aboutText', 'About your store', 3000, true]],
  contact: [['contactTitle', 'Contact heading', 120], ['contactText', 'Contact introduction', 300, true]],
  collections: [['collectionsTitle', 'Collections heading', 120]],
  benefits: [['benefitsTitle', 'Benefits heading', 120], ['benefitsText', 'Benefits introduction', 300, true]],
};
export const contentSectionKeys = ['header', 'hero', 'products', 'footer', ...Object.keys(sectionContentFields)];
export function storeVisibility(theme, page, device = 'desktop') {
  const source = theme.pageVisibility?.[page];
  const layers = [source?.desktop, ...(device !== 'desktop' ? [source?.tablet] : []), ...(device === 'mobile' ? [source?.mobile] : [])];
  return layers.reduce((value, layer) => ({ sections: { ...value.sections, ...layer?.sections }, fields: { ...value.fields, ...layer?.fields } }), { sections: {}, fields: {} });
}
export function resolveDeviceContent(theme, device, page = theme.__page || 'home') {
  const content = theme.pageContent?.[page];
  return { ...theme, ...(device !== 'desktop' ? theme.deviceContent?.tablet : {}), ...(device === 'mobile' ? theme.deviceContent?.mobile : {}),
    ...content?.desktop, ...(device !== 'desktop' ? content?.tablet : {}), ...(device === 'mobile' ? content?.mobile : {}), __device: device, __page: page };
}
export function createStoreBlock(type, page) {
  return { id: `block-${globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, type, page, title: type === 'text' ? 'Tell your story' : type === 'banner' ? 'Discover something special' : '', text: type === 'text' || type === 'banner' ? 'Add your own content here.' : '', imageUrl: '', buttonLabel: type === 'banner' ? 'Shop collection' : '', buttonUrl: '/products', alt: '', styles: {} };
}
export function moveStoreSection(order, id, direction) {
  const index = order.indexOf(id), target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
export function pageSectionOrder(theme, page, device = 'desktop') {
  const builtins = (builderSections[page] || []).filter((id) => id !== 'collections' || theme.name === 'goldenhue').filter((id) => page !== 'home' || theme.name !== 'aurora' || id !== 'hero');
  const available = [...builtins, ...(theme.blocks || []).filter((b) => b.page === page).map((b) => b.id)];
  const responsive = device === 'mobile' ? theme.responsiveOrder?.[page]?.mobile || theme.responsiveOrder?.[page]?.tablet : device === 'tablet' ? theme.responsiveOrder?.[page]?.tablet : undefined;
  return [...new Set([...(responsive || theme.sectionOrder?.[page] || []).filter((id) => available.includes(id)), ...available])];
}

export function responsiveBuilderCss(styles, root = '.store-design') {
  let css = '';
  const limits = { width: [20, 100, '%'], height: [0, 1600, 'px'], minHeight: [0, 1200, 'px'], paddingX: [0, 160, 'px'], paddingY: [0, 160, 'px'], marginTop: [0, 160, 'px'], marginBottom: [0, 160, 'px'], radius: [0, 100, 'px'], fontSize: [10, 48, 'px'], headingSize: [12, 120, 'px'], buttonSize: [10, 40, 'px'], gap: [0, 100, 'px'], columns: [1, 6, ''], imageHeight: [60, 900, 'px'], borderWidth: [0, 12, 'px'], lineHeight: [10, 30, ''], letterSpacing: [-2, 12, 'px'], fontWeight: [100, 900, ''], opacity: [0, 100, ''] };
  for (const device of ['desktop', 'tablet', 'mobile']) {
    let rules = '';
    for (const [section, devices] of Object.entries(styles || {})) {
      if (!/^(?:[a-zA-Z]+|block-[a-f0-9]{8,32})$/.test(section)) continue;
      const layout = devices?.[device]; if (!layout) continue;
      const selector = `${root} ${elementSelectors[section] || `[data-store-section="${section}"]`}`;
      const add = (target, property, value) => { rules += `${target}{${property}:${value}!important;}`; };
      const content = ['header', 'footer'].includes(section) ? `${selector} > div` : section === 'hero' ? `${selector} :is(.store-banner-content,.lux-hero-copy)` : selector;
      for (const [key, [min, max, unit]] of Object.entries(limits)) {
        if (layout[key] === undefined || layout[key] === null || layout[key] === '') continue;
        const number = Number(layout[key]); if (!Number.isFinite(number)) continue;
        const n = Math.round(Math.min(max, Math.max(min, number))), value = `${n}${unit}`;
        if (key === 'width') { add(selector, 'width', value); add(selector, 'margin-inline', 'auto'); }
        if (key === 'height') { add(selector, 'height', n ? value : 'auto'); if (section === 'hero') add(`${selector} > img`, 'height', n ? '100%' : 'auto'); else add(selector, 'overflow', n ? 'auto' : 'visible'); }
        if (key === 'minHeight') add(selector, 'min-height', value);
        if (key === 'paddingX') add(content, 'padding-inline', value);
        if (key === 'paddingY') add(content, 'padding-block', value);
        if (key === 'marginTop') add(selector, 'margin-top', value);
        if (key === 'marginBottom') add(selector, 'margin-bottom', value);
        if (key === 'radius') add(selector, 'border-radius', value);
        if (key === 'gap') add(`${selector}, ${selector} > :is(.grid,.lux-grid)`, 'gap', value);
        if (key === 'columns') { add(`${selector} > :is(.grid,.lux-grid),${selector}:is(.grid,.lux-benefits,.lux-detail)`, 'grid-template-columns', `repeat(${n},minmax(0,1fr))`); add(`${selector} > .lux-grid > .lux-card-featured`, 'grid-column', 'auto'); }
        if (key === 'imageHeight') { add(`${selector} :is(.lux-card-image,article>a:has(img))`, 'height', value); add(`${selector} :is(.lux-card-image,article>a:has(img))`, 'aspect-ratio', 'auto'); if (section === 'productImage') add(selector, 'height', value); }
        if (key === 'fontSize') add(`${selector},${selector} :is(p,span,a,input,select)`, 'font-size', value);
        if (key === 'headingSize') add(`${selector} :is(h1,h2,h3,h4)`, 'font-size', value);
        if (key === 'buttonSize') add(`${selector} button,${selector} button span`, 'font-size', value);
        if (key === 'borderWidth') { add(selector, 'border-width', value); add(selector, 'border-style', 'solid'); }
        if (key === 'lineHeight') add(`${selector},${selector} p`, 'line-height', n / 10);
        if (key === 'letterSpacing') add(selector, 'letter-spacing', value);
        if (key === 'fontWeight') add(`${selector},${selector} :is(h1,h2,h3,p,a)`, 'font-weight', n);
        if (key === 'opacity') add(selector, 'opacity', n / 100);
      }
      if (layout.hidden === true) add(selector, 'display', 'none');
      if (layout.hidden === false) add(selector, 'display', { benefits: 'grid', buttons: 'inline-flex', navigation: 'flex' }[section] || 'block');
      if (['left', 'center', 'right'].includes(layout.align)) { add(`${selector},${selector} :is(h1,h2,h3,p)`, 'text-align', layout.align); if (section === 'hero') add(content, 'align-items', { left: 'flex-start', center: 'center', right: 'flex-end' }[layout.align]); }
      for (const [key, property] of [['backgroundColor', 'background'], ['textColor', 'color'], ['borderColor', 'border-color']]) {
        if (/^#[\da-f]{6}$/i.test(layout[key])) add(key === 'textColor' ? `${selector},${selector} :is(h1,h2,h3,h4,p,span,a,strong)` : selector, property, layout[key]);
      }
      if (['cover', 'contain', 'fill'].includes(layout.imageFit)) add(section === 'productImage' ? `${selector} img` : `${selector} img`, 'object-fit', layout.imageFit);
      if (['center', 'top', 'bottom', 'left', 'right'].includes(layout.imagePosition)) add(`${selector} img`, 'object-position', layout.imagePosition);
      if (['none', 'soft', 'strong'].includes(layout.shadow)) add(selector, 'box-shadow', { none: 'none', soft: '0 4px 16px #0002', strong: '0 12px 36px #0005' }[layout.shadow]);
    }
    css += device === 'desktop' ? rules : `@media(max-width:${device === 'tablet' ? 1023 : 767}px){${rules}}`;
  }
  return css;
}
