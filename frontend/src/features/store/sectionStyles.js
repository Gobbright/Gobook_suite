export const sectionLayoutControls = [
  ['width', 'Width', 20, 100, '%'],
  ['height', 'Height (0 = automatic)', 0, 1600, 'px'],
  ['paddingX', 'Horizontal padding', 0, 160, 'px'],
  ['paddingY', 'Vertical padding', 0, 160, 'px'],
  ['marginTop', 'Space above', 0, 160, 'px'],
  ['radius', 'Corner radius', 0, 100, 'px'],
  ['fontSize', 'Text size', 10, 48, 'px'],
  ['headingSize', 'Heading size', 12, 120, 'px'],
  ['buttonSize', 'Button text size', 10, 40, 'px'],
];

// The same rules style the public storefront and the editor's isolated preview.
export function sectionStylesCss(styles = {}) {
  let css = '';
  for (const device of ['desktop', 'tablet', 'mobile']) {
    let rules = '';
    for (const section of ['header', 'hero', 'products', 'benefits', 'footer']) {
      const layout = styles?.[section]?.[device];
      if (!layout) continue;
      const selector = `.store-design [data-store-section="${section}"]`;
      const content = ['header', 'footer'].includes(section) ? `${selector} > div` : section === 'hero' ? `${selector} > .store-banner-content` : selector;
      const add = (target, property, value) => { rules += `${target}{${property}:${value}!important;}`; };
      for (const [key, , min, max] of sectionLayoutControls) {
        if (layout[key] === undefined || layout[key] === null || layout[key] === '') continue;
        const number = Number(layout[key]);
        if (!Number.isFinite(number)) continue;
        const value = Math.round(Math.max(min, Math.min(max, number)));
        if (key === 'width') { add(selector, 'width', `${value}%`); add(selector, 'margin-inline', 'auto'); }
        if (key === 'height') {
          add(selector, 'height', value ? `${value}px` : 'auto');
          if (section === 'hero') add(`${selector} > img`, 'height', value ? '100%' : 'clamp(260px, 35vw, 430px)');
          else add(selector, 'overflow', value ? 'auto' : 'visible');
        }
        if (key === 'paddingX') add(content, 'padding-inline', `${value}px`);
        if (key === 'paddingY') add(content, 'padding-block', `${value}px`);
        if (key === 'marginTop') add(selector, 'margin-top', `${value}px`);
        if (key === 'radius') add(selector, 'border-radius', `${value}px`);
        if (key === 'fontSize') add(`${selector}, ${selector} :is(p,span,a,input,select)`, 'font-size', `${value}px`);
        if (key === 'headingSize') add(`${selector} :is(h1,h2,h3,h4,strong)`, 'font-size', `${value}px`);
        if (key === 'buttonSize') add(`${selector} button, ${selector} button span`, 'font-size', `${value}px`);
      }
      if (['left', 'center', 'right'].includes(layout.align)) {
        add(`${selector}, ${selector} :is(h1,h2,h3,p)`, 'text-align', layout.align);
        if (section === 'hero') add(content, 'align-items', { left: 'flex-start', center: 'center', right: 'flex-end' }[layout.align]);
      }
      for (const [key, property] of [['backgroundColor', 'background-color'], ['textColor', 'color']]) {
        if (/^#[\da-f]{6}$/i.test(layout[key])) add(key === 'textColor' ? `${selector}, ${selector} :is(h1,h2,h3,h4,p,span,a,strong)` : selector, property, layout[key]);
      }
    }
    css += device === 'desktop' ? rules : `@media(max-width:${device === 'tablet' ? 1023 : 767}px){${rules}}`;
  }
  return css;
}
