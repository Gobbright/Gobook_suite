export const TEMPLATE_NAMES = ['boutique', 'marketplace', 'premium'];

export function normalizeThemeDesign(input = {}, fallback = {}) {
  const source = { ...fallback, ...input };
  const result = {};
  const textLimits = { logoUrl: 500, bannerImageUrl: 500, announcement: 180, heroTitle: 120, heroText: 300, heroButton: 40, productsTitle: 80, footerText: 300 };
  result.name = TEMPLATE_NAMES.includes(source.name) ? source.name : 'boutique';
  result.primaryColor = /^#[\da-f]{6}$/i.test(source.primaryColor) ? source.primaryColor : '#2563eb';
  for (const [key, limit] of Object.entries(textLimits)) {
    result[key] = String(source[key] ?? (key === 'productsTitle' ? 'Products' : '')).trim().slice(0, limit);
  }
  for (const key of ['logoUrl', 'bannerImageUrl']) {
    if (result[key] && !/^https?:\/\//i.test(result[key]) && !/^\/(?!\/)/.test(result[key])) result[key] = '';
  }
  result.fontFamily = ['sans', 'serif', 'mono'].includes(source.fontFamily) ? source.fontFamily : 'sans';
  result.productColumns = [0, 2, 3, 4, 5].includes(Number(source.productColumns)) ? Number(source.productColumns) : 0;
  result.bannerFit = source.bannerFit === 'contain' ? 'contain' : 'cover';
  result.bannerPosition = ['center', 'top', 'bottom', 'left', 'right'].includes(source.bannerPosition) ? source.bannerPosition : 'center';
  const limits = { width: [20, 100], height: [0, 1600], paddingX: [0, 160], paddingY: [0, 160], marginTop: [0, 160], radius: [0, 100], fontSize: [10, 48], headingSize: [12, 120], buttonSize: [10, 40] };
  result.sectionStyles = {};
  for (const section of ['header', 'hero', 'products', 'benefits', 'footer']) {
    const styles = source.sectionStyles?.[section];
    if (!styles || typeof styles !== 'object') continue;
    result.sectionStyles[section] = {};
    for (const device of ['desktop', 'tablet', 'mobile']) {
      const input = styles[device];
      if (!input || typeof input !== 'object') continue;
      const layout = {};
      for (const [key, [min, max]] of Object.entries(limits)) {
        if (input[key] === undefined || input[key] === null || input[key] === '') continue;
        const value = Number(input[key]);
        if (Number.isFinite(value)) layout[key] = Math.round(Math.min(max, Math.max(min, value)));
      }
      if (['left', 'center', 'right'].includes(input.align)) layout.align = input.align;
      for (const key of ['backgroundColor', 'textColor']) if (/^#[\da-f]{6}$/i.test(input[key])) layout[key] = input[key];
      result.sectionStyles[section][device] = layout;
    }
  }
  for (const key of ['showHero', 'showBenefits', 'showFooter']) result[key] = typeof source[key] === 'boolean' ? source[key] : true;
  return result;
}
