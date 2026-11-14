import { Children, Fragment, cloneElement, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import { SERVER_ORIGIN } from '../../services/apiBase.js';
import { pageSectionOrder, responsiveBuilderCss, storeVisibility } from './storeBuilder.js';

function StoreBlock({ block: sourceBlock, slug, device, visibility }) {
  const block = { ...sourceBlock, ...(device !== 'desktop' ? sourceBlock.deviceContent?.tablet : {}), ...(device === 'mobile' ? sourceBlock.deviceContent?.mobile : {}) };
  const visible = key => visibility?.fields?.[`${block.id}:${key}`] !== false;
  const image = block.imageUrl?.startsWith('/api/') ? `${SERVER_ORIGIN}${block.imageUrl}` : block.imageUrl;
  const href = ['/', '/products', '/categories', '/wishlist', '/cart', '/about', '/offers'].includes(block.buttonUrl) ? `/store/${slug}${block.buttonUrl === '/' ? '' : block.buttonUrl}` : block.buttonUrl;
  return <section data-store-section={block.id} className={`store-custom-block store-block-${block.type}`}>
    {block.type === 'divider' ? <hr /> : block.type === 'spacer' ? <div style={{ minHeight: 40 }} /> : <>
      {visible('imageUrl') && image && <img src={image} alt={block.alt || ''} loading="lazy" />}
      {visible('title') && block.title && <h2>{block.title}</h2>}{visible('text') && block.text && <p style={{ whiteSpace: 'pre-wrap' }}>{block.text}</p>}
      {visible('buttonLabel') && block.buttonLabel && (href?.startsWith('http') ? <a href={href} className="store-block-button">{block.buttonLabel}</a> : <Link to={href || `/store/${slug}/products`} className="store-block-button">{block.buttonLabel}</Link>)}
    </>}
  </section>;
}
function flattenFragments(children) {
  return Children.toArray(children).flatMap((child) => isValidElement(child) && child.type === Fragment ? flattenFragments(child.props.children) : [child]);
}
export function StoreCanvas({ children, theme, page = 'home', slug, preview, selectedSection }) {
  const styles = { ...theme.pageStyles?.[page] };
  for (const block of theme.blocks || []) if (block.page === page) styles[block.id] = { ...block.styles, ...styles[block.id] };
  const root = `.store-design[data-store-page="${page}"]`;
  const css = responsiveBuilderCss(styles, root);
  const visibility = storeVisibility(theme, page, theme.__device || 'desktop');
  const order = pageSectionOrder(theme, page, theme.__device || 'desktop');
  function visit(node) {
    if (!isValidElement(node)) return node;
    if (visibility.sections[node.props['data-store-section']] === false || visibility.fields[node.props['data-store-field']] === false) return null;
    if (!['string', 'symbol'].includes(typeof node.type)) return node;
    let nested = flattenFragments(node.props.children);
    if (node.props['data-store-content']) {
      nested = [...nested, ...(theme.blocks || []).filter((b) => b.page === page && visibility.sections[b.id] !== false).map((b) => <StoreBlock key={b.id} block={b} visibility={visibility} slug={slug} device={theme.__device || 'desktop'} />)];
      const keyOf = (child) => child?.props?.['data-store-section'] || child?.props?.block?.id;
      const sections = nested.filter((child) => keyOf(child));
      sections.sort((a, b) => { const rank = (child) => { const i = order.indexOf(keyOf(child)); return i < 0 ? order.length : i; }; return rank(a) - rank(b); });
      nested = [...nested.filter((child) => !keyOf(child)), ...sections];
    }
    const extra = node.type === 'main' ? { 'data-store-page': page } : {};
    if (node.props['data-store-section'] === 'hero' && visibility.fields.bannerImageUrl === false) extra.style = { ...node.props.style, minHeight: node.props.style?.minHeight || 280 };
    return cloneElement(node, extra, ...nested.map(visit));
  }
  const main = visit(children);
  return <>{main}<style>{css}{`
    .store-custom-block{padding:32px;margin-block:24px;border-radius:12px;max-width:100%;overflow:hidden}
    .store-custom-block h2{font-size:32px;margin:0 0 16px;line-height:1.2}.store-custom-block p{line-height:1.8;margin:12px 0}
    .store-custom-block>img{display:block;width:100%;max-height:600px;object-fit:cover;border-radius:inherit;margin-bottom:20px}
    .store-block-button{display:inline-block;background:${/^#[\da-f]{6}$/i.test(theme.primaryColor) ? theme.primaryColor : '#2563eb'};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px}
    .store-block-divider{padding:0}.store-block-divider hr{border:0;border-top:1px solid currentColor;opacity:.25}.store-block-spacer{padding:0}
    ${preview ? `${root} [data-store-section]{cursor:pointer;outline-offset:-2px}${root} [data-store-section]:hover{outline:2px dashed #60a5fa}${root} [data-store-section="${/^(?:[a-zA-Z]+|block-[a-f0-9]{8,32})$/.test(selectedSection || '') ? selectedSection : 'none'}"]{outline:2px solid #2563eb}` : ''}
  `}</style></>;
}
