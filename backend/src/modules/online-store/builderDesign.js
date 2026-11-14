export const BUILDER_PAGES = ['home', 'products', 'details', 'wishlist', 'cart', 'about', 'contact', 'offers'];
export const BUILDER_SECTIONS = ['header', 'hero', 'collections', 'products', 'benefits', 'footer', 'details', 'related', 'wishlist', 'cart', 'about', 'contact', 'productCard', 'productImage', 'productTitle', 'productPrice', 'buttons', 'navigation', 'checkout'];
export const PAGE_CONTENT_LIMITS = { contactTitle: 120, contactText: 300, heroTitle: 120, heroText: 300, heroButton: 40, productsTitle: 80, detailsIntro: 300, addToCartLabel: 80, relatedTitle: 120, wishlistTitle: 120, wishlistText: 300, cartTitle: 120, cartText: 300, checkoutTitle: 120, checkoutButton: 80, aboutTitle: 120, aboutText: 3000, collectionsTitle: 120, benefitsTitle: 120, benefitsText: 300 };
const limits = { width: [20, 100], height: [0, 1600], minHeight: [0, 1200], paddingX: [0, 160], paddingY: [0, 160], marginTop: [0, 160], marginBottom: [0, 160], radius: [0, 100], fontSize: [10, 48], headingSize: [12, 120], buttonSize: [10, 40], gap: [0, 100], columns: [1, 6], imageHeight: [60, 900], borderWidth: [0, 12], lineHeight: [10, 30], letterSpacing: [-2, 12], fontWeight: [100, 900], opacity: [0, 100] };
export function normalizeResponsiveLayout(styles = {}) {
  const result = {};
  for (const device of ['desktop', 'tablet', 'mobile']) {
    const input = styles?.[device]; if (!input || typeof input !== 'object') continue;
    const layout = {};
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (input[key] === undefined || input[key] === null || input[key] === '') continue;
      const value = Number(input[key]); if (Number.isFinite(value)) layout[key] = Math.round(Math.min(max, Math.max(min, value)));
    }
    for (const [key, values] of Object.entries({ align: ['left', 'center', 'right'], imageFit: ['cover', 'contain', 'fill'], imagePosition: ['center', 'top', 'bottom', 'left', 'right'], shadow: ['none', 'soft', 'strong'] })) if (values.includes(input[key])) layout[key] = input[key];
    for (const key of ['backgroundColor', 'textColor', 'borderColor']) if (/^#[\da-f]{6}$/i.test(input[key])) layout[key] = input[key];
    if (typeof input.hidden === 'boolean') layout.hidden = input.hidden;
    result[device] = layout;
  }
  return result;
}
export function safeBuilderUrl(value, fallback = '') {
  const url = String(value || '').trim().slice(0, 500);
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : fallback;
}
export function normalizeBuilderDesign(source) {
  const blocks = [];
  const ids = new Set();
  for (const input of (Array.isArray(source.blocks) ? source.blocks : []).slice(0, 60)) {
    if (!input || !/^block-[a-f0-9]{8,32}$/.test(input.id) || ids.has(input.id) || !BUILDER_PAGES.includes(input.page) || !['text', 'image', 'banner', 'spacer', 'divider'].includes(input.type)) continue;
    ids.add(input.id);
    const deviceContent = {};
    for (const device of ['tablet', 'mobile']) {
      const content = input.deviceContent?.[device]; if (!content || typeof content !== 'object') continue;
      deviceContent[device] = {};
      for (const [key, max] of Object.entries({ title: 160, text: 3000, alt: 200, buttonLabel: 80 })) if (typeof content[key] === 'string') deviceContent[device][key] = content[key].slice(0, max);
      for (const key of ['imageUrl', 'buttonUrl']) if (typeof content[key] === 'string') deviceContent[device][key] = safeBuilderUrl(content[key], key === 'buttonUrl' ? '/products' : '');
    }
    blocks.push({ id: input.id, type: input.type, page: input.page, title: String(input.title || '').slice(0, 160), text: String(input.text || '').slice(0, 3000), alt: String(input.alt || '').slice(0, 200), imageUrl: safeBuilderUrl(input.imageUrl), buttonLabel: String(input.buttonLabel || '').slice(0, 80), buttonUrl: safeBuilderUrl(input.buttonUrl, '/products'), styles: normalizeResponsiveLayout(input.styles), deviceContent });
  }
  const pageStyles = {}, sectionOrder = {}, responsiveOrder = {};
  for (const page of BUILDER_PAGES) {
    const allowed = [...BUILDER_SECTIONS, ...blocks.filter((b) => b.page === page).map((b) => b.id)];
    pageStyles[page] = {};
    for (const key of allowed) if (source.pageStyles?.[page]?.[key]) pageStyles[page][key] = normalizeResponsiveLayout(source.pageStyles[page][key]);
    sectionOrder[page] = [...new Set((Array.isArray(source.sectionOrder?.[page]) ? source.sectionOrder[page] : []).filter((id) => allowed.includes(id)))];
    responsiveOrder[page] = {};
    for (const device of ['tablet', 'mobile']) if (Array.isArray(source.responsiveOrder?.[page]?.[device])) responsiveOrder[page][device] = [...new Set(source.responsiveOrder[page][device].filter((id) => allowed.includes(id)))];
  }
  const deviceContent = {};
  for (const device of ['tablet', 'mobile']) {
    const input = source.deviceContent?.[device]; if (!input || typeof input !== 'object') continue;
    const content = {};
    for (const [key, max] of Object.entries({ announcement: 180, contactTitle: 120, contactText: 300, heroTitle: 120, heroText: 300, heroButton: 40, productsTitle: 80, footerText: 300 })) if (typeof input[key] === 'string') content[key] = input[key].slice(0, max);
    for (const key of ['logoUrl', 'bannerImageUrl']) if (typeof input[key] === 'string') content[key] = safeBuilderUrl(input[key]);
    for (const key of ['showHero', 'showBenefits', 'showFooter']) if (typeof input[key] === 'boolean') content[key] = input[key];
    if (/^#[\da-f]{6}$/i.test(input.primaryColor)) content.primaryColor = input.primaryColor;
    for (const [key, values] of Object.entries({ fontFamily: ['sans', 'serif', 'mono'], bannerFit: ['cover', 'contain'], bannerPosition: ['center', 'top', 'bottom', 'left', 'right'] })) if (values.includes(input[key])) content[key] = input[key];
    deviceContent[device] = content;
  }
  const pageContent = {};
  for (const page of BUILDER_PAGES) {
    if (!source.pageContent?.[page]) continue;
    pageContent[page] = {};
    for (const device of ['desktop', 'tablet', 'mobile']) {
      const input = source.pageContent[page]?.[device];
      if (!input || typeof input !== 'object') continue;
      const content = {};
      for (const [key, max] of Object.entries(PAGE_CONTENT_LIMITS)) if (typeof input[key] === 'string') content[key] = input[key].slice(0, max);
      for (const key of ['showHero', 'showBenefits']) if (typeof input[key] === 'boolean') content[key] = input[key];
      for (const key of ['bannerImageUrl']) if (typeof input[key] === 'string') content[key] = safeBuilderUrl(input[key]);
      for (const [key, values] of Object.entries({ bannerFit: ['cover', 'contain'], bannerPosition: ['center', 'top', 'bottom', 'left', 'right'] })) if (values.includes(input[key])) content[key] = input[key];
      pageContent[page][device] = content;
    }
  }
  const pageVisibility = {};
  const contentFields = [...Object.keys(PAGE_CONTENT_LIMITS), 'logoUrl', 'announcement', 'footerText', 'bannerImageUrl', 'checkoutEmail', 'checkoutNotes'];
  for (const page of BUILDER_PAGES) {
    if (!source.pageVisibility?.[page]) continue;
    const pageBlocks = blocks.filter(block => block.page === page);
    const sectionKeys = [...BUILDER_SECTIONS, ...pageBlocks.map(block => block.id)];
    const fieldKeys = [...contentFields, ...pageBlocks.flatMap(block => ['title', 'text', 'imageUrl', 'buttonLabel'].map(key => `${block.id}:${key}`))];
    pageVisibility[page] = {};
    for (const device of ['desktop', 'tablet', 'mobile']) {
      const input = source.pageVisibility[page]?.[device];
      if (!input || typeof input !== 'object') continue;
      const sections = {}, fields = {};
      for (const key of sectionKeys) if (typeof input.sections?.[key] === 'boolean') sections[key] = input.sections[key];
      for (const key of fieldKeys) if (typeof input.fields?.[key] === 'boolean') fields[key] = input.fields[key];
      pageVisibility[page][device] = { sections, fields };
    }
  }
  return { blocks, pageStyles, sectionOrder, responsiveOrder, deviceContent, pageContent, pageVisibility };
}
