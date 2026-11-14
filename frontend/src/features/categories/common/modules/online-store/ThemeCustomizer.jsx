import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, ArrowDown, Copy, Trash2, Plus, Undo2, Redo2, Monitor, Smartphone, Tablet, ChevronLeft, ChevronRight, LayoutGrid, SlidersHorizontal, CircleHelp, Save } from 'lucide-react';
import { PublicStorePage } from '../../../../store/PublicStorePage.jsx';
import { EditorSectionControls as SectionControls } from './EditorSectionControls.jsx';
import './themeCustomizer.css';
import { builderPages, sectionLabels, blockTypes, createStoreBlock, moveStoreSection, pageSectionOrder, responsiveContentKeys, resolveDeviceContent, sectionContentFields, contentSectionKeys, storeVisibility } from '../../../../store/storeBuilder.js';
import { api, SERVER_ORIGIN } from '../../../../../services/api.js';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const defaults = { announcement: '', heroTitle: '', heroText: '', heroButton: '', productsTitle: 'Products', footerText: '', fontFamily: 'sans', productColumns: 0, showHero: true, showBenefits: true, showFooter: true };

export function designForTemplate(settings, name, preset) {
  return { ...defaults, fontFamily: name === 'goldenhue' ? 'serif' : 'sans', primaryColor: preset.color, logoUrl: '', bannerImageUrl: '', ...(settings.theme?.name === name ? settings.theme : settings.templateDesigns?.[name]), name };
}

function PreviewFrame({ children, width, zoom, selectedSection }) {
  const [frameBody, setFrameBody] = useState(null);
  const host = useRef(null);
  const [space, setSpace] = useState({ width: 1000, height: 750 });
  useEffect(() => {
    if (!frameBody || !selectedSection) return;
    const target = { productCard: 'products', productImage: 'products', productTitle: 'products', productPrice: 'products', buttons: 'products', navigation: 'header', checkout: 'cart', style: 'header' }[selectedSection] || selectedSection;
    const timer = setTimeout(() => {
      const section = [...frameBody.querySelectorAll('[data-store-section]')].find((element) => element.dataset.storeSection === target);
      if (section) frameBody.ownerDocument.defaultView.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + frameBody.ownerDocument.defaultView.scrollY - 100), behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(timer);
  }, [frameBody, selectedSection]);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(host.current); return () => observer.disconnect(); }, []);
  const scale = zoom === 'fit' ? Math.min(1, Math.max(.2, (space.width - 24) / width)) : Number(zoom);
  return <div ref={host} className="h-full w-full overflow-auto"><div className="mx-auto" style={{ width: width * scale, height: Math.max(200, space.height - 12) }}><iframe title="Live storefront preview" className="shrink-0 border-0 bg-white shadow-lg" style={{ width, maxWidth: 'none', height: Math.max(200, space.height - 12) / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body style='margin:0'><div id='preview-root'></div></body></html>" onLoad={(event) => {
    const frame = event.currentTarget.contentDocument;
    frame.head.querySelectorAll('[data-preview-style]').forEach((node) => node.remove());
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const copy = node.cloneNode(true);
      if (copy.tagName === 'LINK') copy.href = node.href;
      copy.setAttribute('data-preview-style', '');
      frame.head.appendChild(copy);
    });
    setFrameBody(frame.getElementById('preview-root'));
  }}>{frameBody ? createPortal(children, frameBody) : null}</iframe></div></div>;
}

function Field({ label, value, onChange, multiline = false, removed, onToggleVisibility, ...props }) {
  const Control = multiline ? 'textarea' : 'input';
  return <div className="editor-removable-field"><label className="grid gap-2 text-sm font-semibold text-slate-700"><span>{label}</span><Control className={inputClass} value={value || ''} onChange={(event) => onChange(event.target.value)} rows={multiline ? 4 : undefined} {...props} disabled={removed || props.disabled} /></label>{onToggleVisibility && <button type="button" className={removed ? 'editor-restore-field' : 'editor-remove-field'} aria-label={`${removed ? 'Restore' : 'Remove'} ${label}`} onClick={onToggleVisibility}>{removed ? 'Restore field' : 'Remove field'}</button>}</div>;
}

function ImagePicker({ label, value, removed, onToggleVisibility, disabled, onChange, onUploadState, onError }) {
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 8 * 1024 * 1024) { onError('Choose a JPG, PNG, WebP, or GIF image up to 8 MB.'); return; }
    setUploading(true); onUploadState(true); onError('');
    try {
      const data = new FormData(); data.append('image', file);
      const result = await api.uploadOnlineStoreImage(data);
      if (mounted.current) onChange(result.url);
    } catch (error) { if (mounted.current) onError(error.message || 'Image upload failed. Try again.'); }
    finally { if (mounted.current) setUploading(false); onUploadState(false); }
  }
  const image = value?.startsWith('/api/') ? `${SERVER_ORIGIN}${value}` : value;
  return <div className="grid gap-3"><span className="text-sm font-semibold">{label}</span>{onToggleVisibility && <button type="button" className={removed ? 'editor-restore-field' : 'editor-remove-field'} aria-label={`${removed ? 'Restore' : 'Remove'} ${label}`} onClick={onToggleVisibility}>{removed ? 'Restore image' : 'Remove image from page'}</button>}{image ? <img src={image} alt={`${label} preview`} className="h-28 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" /> : null}<label className={`cursor-pointer rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-3 text-center text-sm font-semibold text-blue-700 ${disabled || uploading ? 'opacity-50' : ''}`}>{uploading ? 'Uploading image...' : 'Upload your image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={`Upload ${label.toLowerCase()}`} disabled={disabled || uploading || removed} onChange={upload} className="sr-only" /></label><p className="m-0 text-xs text-slate-500">JPG, PNG, WebP or GIF, up to 8 MB. Save the design to use this image.</p><details className="editor-image-link"><summary>Use an image link instead</summary><Field label="Or use image URL" value={value} onChange={onChange} disabled={disabled || uploading} maxLength={500} placeholder="https://..." /></details>{value && !onToggleVisibility ? <button type="button" disabled={disabled || uploading} onClick={() => onChange('')} className="text-left text-xs font-semibold text-red-600">Remove image</button> : null}</div>;
}

export function ThemeCustomizer({ settings, name, preset, products, onSave, onClose }) {
  const initial = useRef(designForTemplate(settings, name, preset));
  const [draft, setDraft] = useState(initial.current);
  const [section, setSection] = useState(name === 'aurora' ? 'products' : 'hero');
  const [device, setDevice] = useState('desktop');
  const [editorPage, setEditorPage] = useState('home');
  const [zoom, setZoom] = useState('fit');
  const [blockType, setBlockType] = useState('text');
  const [inspectorTab, setInspectorTab] = useState('content');
  const [sidebarView, setSidebarView] = useState('sections');
  const [sectionTab, setSectionTab] = useState('sections');
  const [mobileView, setMobileView] = useState('edit');
  const sidebarScroll = useRef(null);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [recovery, setRecovery] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  const order = pageSectionOrder(draft, editorPage, device);
  const rawBlock = draft.blocks?.find((item) => item.id === section);
  const block = rawBlock ? { ...rawBlock, ...(device !== 'desktop' ? rawBlock.deviceContent?.tablet : {}), ...(device === 'mobile' ? rawBlock.deviceContent?.mobile : {}) } : null;
  const activeInspector = rawBlock || [...contentSectionKeys, 'style'].includes(section) ? inspectorTab : 'style';
  const sections = [['header', sectionLabels.header], ...order.map((key) => [key, sectionLabels[key] || draft.blocks?.find((item) => item.id === key)?.title || blockTypes.find(([type]) => type === draft.blocks?.find((item) => item.id === key)?.type)?.[1] || 'Block']), ['footer', sectionLabels.footer], ...['productCard', 'productImage', 'productTitle', 'productPrice', 'buttons', 'navigation', 'checkout'].map((key) => [key, sectionLabels[key]]), ['style', 'Theme settings']];
  const visibility = storeVisibility(draft, editorPage, device);
  const contentValue = (key) => resolveDeviceContent(draft, device, editorPage)[key];
  const preview = { store: { ...settings, theme: draft }, page: editorPage, device, selectedSection: sidebarView === 'inspector' ? section : undefined, products: products.filter((product) => product.showOnline).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).slice(0, 200) };
  const recoveryKey = `store-design-draft:${settings.id || settings.slug}:${name}`;

  useEffect(() => { try { const value = JSON.parse(localStorage.getItem(recoveryKey)); if (value?.name === name && JSON.stringify(value) !== JSON.stringify(initial.current)) setRecovery(value); } catch { /* Draft recovery is optional. */ } }, [recoveryKey, name]);
  useEffect(() => { if (!dirty) return; const timer = setTimeout(() => { try { localStorage.setItem(recoveryKey, JSON.stringify(draft)); } catch { /* Keep editing when storage is unavailable. */ } }, 500); return () => clearTimeout(timer); }, [draft, dirty, recoveryKey]);

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    function trapFocus(event) {
      if (event.key !== 'Tab') return;
      const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), iframe')];
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', trapFocus);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, []);

  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeDesign(next) {
    const value = typeof next === 'function' ? next(draft) : next;
    setHistory((current) => ({ past: [...current.past.slice(-49), draft], future: [] })); setDraft(value); setSaved(false);
  }
  function update(key, value) {
    if (['pageStyles', 'sectionOrder', 'responsiveOrder'].includes(key)) { changeDesign({ ...draft, [key]: value }); return; }
    if (!['header', 'footer', 'style'].includes(section)) {
      changeDesign({ ...draft, pageContent: { ...draft.pageContent, [editorPage]: { ...draft.pageContent?.[editorPage], [device]: { ...draft.pageContent?.[editorPage]?.[device], [key]: value } } } });
      return;
    }
    if (device !== 'desktop' && responsiveContentKeys.includes(key)) changeDesign({ ...draft, deviceContent: { ...draft.deviceContent, [device]: { ...draft.deviceContent?.[device], [key]: value } } });
    else changeDesign({ ...draft, [key]: value });
  }
  function setVisibility(kind, key, visible) {
    const page = draft.pageVisibility?.[editorPage] || {};
    const current = page[device] || {};
    changeDesign({ ...draft, pageVisibility: { ...draft.pageVisibility, [editorPage]: { ...page, [device]: { ...current, [kind]: { ...current[kind], [key]: visible } } } } });
  }
  function removalProps(key) { return { removed: visibility.fields[key] === false, onToggleVisibility: () => setVisibility('fields', key, visibility.fields[key] === false) }; }
  function undo() { if (!history.past.length || saving || uploading) return; setDraft(history.past.at(-1)); setHistory({ past: history.past.slice(0, -1), future: [draft, ...history.future] }); setSaved(false); }
  function redo() { if (!history.future.length || saving || uploading) return; setDraft(history.future[0]); setHistory({ past: [...history.past, draft], future: history.future.slice(1) }); setSaved(false); }
  function updateBlock(key, value) { changeDesign({ ...draft, blocks: draft.blocks.map((item) => item.id === section ? device === 'desktop' ? { ...item, [key]: value } : { ...item, deviceContent: { ...item.deviceContent, [device]: { ...item.deviceContent?.[device], [key]: value } } } : item) }); }
  function switchPage(page) { setEditorPage(page); setSidebarView('sections'); setSectionTab('sections'); if (sidebarScroll.current) sidebarScroll.current.scrollTop = 0; }
  function selectSection(key) { setSection(key); setSidebarView('inspector'); setInspectorTab('content'); setMobileView('edit'); if (sidebarScroll.current) sidebarScroll.current.scrollTop = 0; }
  function addBlock() { const added = createStoreBlock(blockType, editorPage); changeDesign({ ...draft, blocks: [...(draft.blocks || []), added], sectionOrder: { ...draft.sectionOrder, [editorPage]: [...pageSectionOrder(draft, editorPage), added.id] } }); selectSection(added.id); }
  function setOrder(next) { if (device === 'desktop') update('sectionOrder', { ...draft.sectionOrder, [editorPage]: next }); else update('responsiveOrder', { ...draft.responsiveOrder, [editorPage]: { ...draft.responsiveOrder?.[editorPage], [device]: next } }); }
  function moveSection(id, direction) { setOrder(moveStoreSection(order, id, direction)); }
  function updatePageStyles(value) { update('pageStyles', { ...draft.pageStyles, [editorPage]: value }); }
  function inheritContent() {
    if (device === 'desktop') return;
    if (rawBlock) { const overrides = { ...rawBlock.deviceContent }; delete overrides[device]; changeDesign({ ...draft, blocks: draft.blocks.map((item) => item.id === section ? { ...item, deviceContent: overrides } : item) }); return; }
    if (!['header', 'footer', 'style'].includes(section)) {
      const keys = sectionContentFields[section]?.map(([key]) => key) || (section === 'products' ? ['productsTitle'] : ['heroTitle', 'heroText', 'heroButton', 'bannerImageUrl', 'bannerFit', 'bannerPosition', 'showHero']);
      if (section === 'benefits') keys.push('showBenefits');
      const content = { ...draft.pageContent?.[editorPage]?.[device] };
      for (const key of keys) delete content[key];
      changeDesign({ ...draft, pageContent: { ...draft.pageContent, [editorPage]: { ...draft.pageContent?.[editorPage], [device]: content } } });
      return;
    }
    const keys = { header: ['logoUrl', 'announcement'], hero: ['bannerImageUrl', 'bannerFit', 'bannerPosition', 'heroTitle', 'heroText', 'heroButton', 'showHero'], products: ['productsTitle'], benefits: ['showBenefits'], footer: ['footerText', 'showFooter'], style: ['primaryColor', 'fontFamily'] }[section] || [];
    const content = { ...draft.deviceContent?.[device] }; for (const key of keys) delete content[key];
    changeDesign({ ...draft, deviceContent: { ...draft.deviceContent, [device]: content } });
  }
  function close() { if (saving || uploading) return; if (dirty) setDiscard(true); else onClose(); }
  async function save() {
    setSaving(true); setError('');
    try {
      const result = await onSave(draft);
      const persisted = designForTemplate(result, name, preset);
      initial.current = persisted; setDraft(persisted); setSaved(true); setDiscard(false); setRecovery(null); setHistory({ past: [], future: [] }); try { localStorage.removeItem(recoveryKey); } catch { /* Optional recovery storage. */ }
    } catch (saveError) { setError(saveError.message || 'Unable to save design. Please try again.'); }
    finally { setSaving(false); }
  }
  const visibilityKey = { hero: 'showHero', benefits: 'showBenefits', footer: 'showFooter' }[section];

  useEffect(() => {
    function shortcut(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') { event.preventDefault(); if (dirty && !saving && !uploading && settings.featureEnabled) save(); }
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (key === 'y') { event.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  });

  const selectedLabel = sections.find(([key]) => key === section)?.[1] || 'Section';
  const descriptions = { header: 'Logo, announcement and navigation', hero: 'Main image, heading and shop button', products: 'Catalog heading and product grid', benefits: 'Shipping and shopping benefits', footer: 'Store information and contacts', details: 'Main product image and description', related: 'Products shown below an item', wishlist: 'Saved products and their layout', cart: 'Shopping bag and order form', about: 'Your store story and contacts', collections: 'Featured collections and promotions', productCard: 'Card colors, spacing and borders', productImage: 'Photo size and shape', productTitle: 'Product name typography', productPrice: 'Price typography and color', buttons: 'Button size, color and shape', navigation: 'Menu spacing and appearance', checkout: 'Order form appearance', style: 'Brand color and store typography' };
  const pageSectionKeys = ['header', ...order, ...(editorPage === 'cart' ? ['checkout'] : []), 'footer'];
  const listedSections = sections.filter(([key]) => (key !== 'checkout' || editorPage === 'cart') && (sectionTab === 'sections' ? pageSectionKeys.includes(key) : !pageSectionKeys.includes(key)));
  const DeviceIcon = device === 'mobile' ? Smartphone : device === 'tablet' ? Tablet : Monitor;
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label={`${preset.label} theme customizer`} className="store-editor" onKeyDown={event => { if(event.key === 'Escape') close(); }}>
    <header className="editor-topbar"><div className="editor-identity"><button ref={closeButton} type="button" onClick={close} disabled={saving || uploading} className="editor-back"><ArrowLeft size={16}/> Themes</button><div><h2>{preset.label} editor</h2><p>{settings.theme?.name === name ? 'Customize your live store' : 'Customize this template'}</p></div></div><div className="editor-save-actions"><div className="editor-history"><button type="button" className="editor-icon-button" aria-label="Undo change" title="Undo (Ctrl+Z)" disabled={!history.past.length || saving || uploading} onClick={undo}><Undo2 size={16}/></button><button type="button" className="editor-icon-button" aria-label="Redo change" title="Redo (Ctrl+Shift+Z)" disabled={!history.future.length || saving || uploading} onClick={redo}><Redo2 size={16}/></button></div><span className="editor-save-status" aria-live="polite">{dirty ? 'You have unsaved changes' : saved ? 'Your changes are saved' : 'Up to date'}</span><button type="button" className="app-save-button editor-save" onClick={save} disabled={saving || uploading || !dirty || !settings.featureEnabled}><Save size={16}/>{saving ? 'Saving...' : 'Save changes'}</button></div></header>
    <div className="editor-toolbar"><div className="editor-toolbar-group"><label className="editor-toolbar-label" htmlFor="editor-page">Page to customize</label><select id="editor-page" aria-label="Page to edit" className="editor-select" value={editorPage} disabled={saving || uploading} onChange={event=>switchPage(event.target.value)}>{builderPages.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" className="editor-mobile-view" onClick={()=>setMobileView(mobileView === 'edit' ? 'preview' : 'edit')}>{mobileView === 'edit' ? 'Show preview' : 'Back to editing'}</button></div><div className="editor-device-buttons" aria-label="Preview device">{[['desktop',Monitor,'Desktop'],['tablet',Tablet,'Tablet'],['mobile',Smartphone,'Mobile']].map(([key,Icon,label])=><button key={key} type="button" aria-label={`${key} preview`} aria-pressed={device===key} onClick={()=>setDevice(key)}><Icon size={16}/><span>{label}</span></button>)}</div><div className="editor-toolbar-group"><label className="editor-toolbar-label" htmlFor="editor-zoom">Preview size</label><select id="editor-zoom" className="editor-select" aria-label="Preview zoom" value={zoom} onChange={event=>setZoom(event.target.value)}><option value="fit">Fit to screen</option><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option></select></div></div>
    <nav className="editor-page-navigation" aria-label="Store pages to customize">{builderPages.map(([key,label])=><button type="button" key={key} aria-current={editorPage===key?'page':undefined} disabled={saving||uploading} onClick={()=>switchPage(key)}>{label}</button>)}</nav>
    {error && <div role="alert" className="editor-alert is-error">{error}</div>}
    {recovery && <div className="editor-alert"><span>You have an unfinished draft from your last visit.</span><div className="editor-alert-actions"><button type="button" onClick={()=>{changeDesign(recovery);setRecovery(null);}}>Restore draft</button><button type="button" onClick={()=>{setRecovery(null);try{localStorage.removeItem(recoveryKey);}catch{ /* Optional storage. */ }}}>Dismiss</button></div></div>}
    {discard && <div className="editor-alert is-warning"><span>Your latest changes have not been saved.</span><div className="editor-alert-actions"><button type="button" onClick={()=>setDiscard(false)}>Keep editing</button><button type="button" onClick={()=>{try{localStorage.removeItem(recoveryKey);}catch{ /* Optional storage. */ }onClose();}}>Discard changes and close</button></div></div>}
    <div className="editor-workspace" data-mobile-view={mobileView}><aside className="editor-sidebar" aria-label="Store editor settings"><div className="editor-sidebar-heading">
      {sidebarView === 'sections' ? <><span className="editor-step">Start here</span><h3>What would you like to edit?</h3><p>Editing {builderPages.find(([key])=>key===editorPage)?.[1]}. Choose a section below, or switch pages above.</p></> : <><button type="button" className="editor-back-to-sections" onClick={()=>setSidebarView('sections')}><ChevronLeft size={15}/> All sections</button><h3>{selectedLabel}</h3><p>{descriptions[section] || 'Customize your content and appearance.'}</p><div className="editor-device-note"><DeviceIcon size={13}/> Editing for <strong>{device}</strong>{device !== 'desktop' && <span>; larger screens stay as they are</span>}</div></>}
    </div><div ref={sidebarScroll} className="editor-sidebar-scroll">
    {sidebarView === 'sections' ? <><div className="editor-list-tabs"><button type="button" aria-pressed={sectionTab === 'sections'} onClick={()=>setSectionTab('sections')}>Page sections</button><button type="button" aria-pressed={sectionTab === 'design'} onClick={()=>setSectionTab('design')}>Design elements</button></div><nav className="editor-section-list" aria-label="Choose a section">{listedSections.map(([key,label])=><div key={key} className="editor-section-row" draggable={order.includes(key) && !saving && !uploading} onDragStart={event=>event.dataTransfer.setData('text/plain',key)} onDragOver={event=>{if(order.includes(key))event.preventDefault();}} onDrop={event=>{event.preventDefault();const source=event.dataTransfer.getData('text/plain');if(!order.includes(source)||!order.includes(key)||saving||uploading)return;const next=order.filter(id=>id!==source);next.splice(order.indexOf(key),0,source);setOrder(next);}}><button type="button" className="editor-section-open" aria-label={`Edit ${label}`} disabled={saving||uploading} onClick={()=>selectSection(key)}><span className="editor-section-icon">{sectionTab === 'design' ? <SlidersHorizontal size={17}/> : <LayoutGrid size={17}/>}</span><span className="editor-section-copy"><strong>{label}{visibility.sections[key] === false ? ' (removed)' : ''}</strong><small>{descriptions[key] || 'Your custom section'}</small></span><ChevronRight size={15}/></button>{pageSectionKeys.includes(key) && <button type="button" className={visibility.sections[key] === false ? 'editor-restore-section' : 'editor-remove-section'} aria-label={`${visibility.sections[key] === false ? 'Restore' : 'Remove'} ${label}`} title={visibility.sections[key] === false ? 'Restore section' : 'Remove section from this page'} disabled={saving||uploading||!settings.featureEnabled} onClick={()=>setVisibility('sections',key,visibility.sections[key] === false)}>{visibility.sections[key] === false ? 'Restore' : <Trash2 size={15}/>}</button>}{order.includes(key)&&<div className="editor-section-move"><button type="button" aria-label={`Move ${label} up`} title="Move section up" disabled={order.indexOf(key)===0||saving||uploading} onClick={()=>moveSection(key,-1)}><ArrowUp size={12}/></button><button type="button" aria-label={`Move ${label} down`} title="Move section down" disabled={order.indexOf(key)===order.length-1||saving||uploading} onClick={()=>moveSection(key,1)}><ArrowDown size={12}/></button></div>}</div>)}</nav>
    {sectionTab==='sections'&&<div className="editor-add-section"><h3>Add something new</h3><p>Add text, an image or a promotion to this page.</p><select aria-label="New block type" className="editor-select" value={blockType} onChange={event=>setBlockType(event.target.value)}>{blockTypes.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" className="editor-add-button" onClick={addBlock} disabled={saving||uploading||!settings.featureEnabled||(draft.blocks?.length||0)>=60}><Plus size={16}/> Add section</button></div>}<div className="editor-help"><CircleHelp size={15}/><p>{sectionTab==='sections'?'Use the arrows to move a section. Switch Desktop, Tablet or Mobile above to edit that screen size.':'These settings change items across this page, such as product cards, prices and buttons.'}</p></div></> : <>
      {section!=='style'&&<div className="editor-inspector-tabs"><button type="button" aria-pressed={activeInspector==='content'} disabled={!rawBlock&&!contentSectionKeys.includes(section)} onClick={()=>setInspectorTab('content')}>Content</button><button type="button" aria-pressed={activeInspector==='style'} onClick={()=>setInspectorTab('style')}>Appearance</button></div>}
      <fieldset disabled={saving||uploading||!settings.featureEnabled} className="editor-fieldset"><legend className="sr-only">{selectedLabel} settings</legend>{pageSectionKeys.includes(section) && <div className="editor-section-removal"><p>{visibility.sections[section] === false ? 'This section is removed from this page for this screen size.' : 'Remove this section from this page without deleting its content.'}</p><button type="button" onClick={()=>setVisibility('sections',section,visibility.sections[section] === false)}>{visibility.sections[section] === false ? 'Restore section' : 'Remove section'}</button></div>}
      {(section==='style'||activeInspector==='content')&&<div className="grid gap-5">
          {device !== 'desktop' && <button type="button" onClick={inheritContent} className="editor-content-reset">Use the same content as larger screens</button>}
          {visibilityKey ? <label className="flex items-center justify-between text-sm font-semibold">Show section on {device}<input type="checkbox" checked={contentValue(visibilityKey) !== false} onChange={(event) => update(visibilityKey, event.target.checked)} className="h-4 w-4 accent-blue-600" /></label> : null}
          {block && <><div className="flex items-center gap-3"><button type="button" className="flex items-center gap-1 text-xs font-semibold text-blue-600" onClick={() => { const copy = { ...rawBlock, id: createStoreBlock(block.type, editorPage).id }; changeDesign({ ...draft, blocks: [...draft.blocks, copy], sectionOrder: { ...draft.sectionOrder, [editorPage]: [...order.slice(0, order.indexOf(block.id) + 1), copy.id, ...order.slice(order.indexOf(block.id) + 1)] } }); selectSection(copy.id); }}><Copy size={14} /> Duplicate</button><button type="button" className="flex items-center gap-1 text-xs font-semibold text-red-600" onClick={() => { const pageStyles = { ...draft.pageStyles?.[editorPage] }; delete pageStyles[block.id]; changeDesign({ ...draft, blocks: draft.blocks.filter((item) => item.id !== block.id), pageStyles: { ...draft.pageStyles, [editorPage]: pageStyles }, sectionOrder: { ...draft.sectionOrder, [editorPage]: order.filter((id) => id !== block.id) } }); setSidebarView('sections'); }}><Trash2 size={14} /> Delete block</button></div>{!['spacer', 'divider'].includes(block.type) && <><Field label="Block heading" {...removalProps(`${block.id}:title`)} value={block.title} onChange={(value) => updateBlock('title', value)} maxLength={160} /><Field label="Block text" multiline {...removalProps(`${block.id}:text`)} value={block.text} onChange={(value) => updateBlock('text', value)} maxLength={3000} />{['image', 'banner'].includes(block.type) && <><ImagePicker label="Block image" {...removalProps(`${block.id}:imageUrl`)} value={block.imageUrl} disabled={saving || uploading} onChange={(value) => updateBlock('imageUrl', value)} onUploadState={setUploading} onError={setError} /><Field label="Image alternative text" value={block.alt} onChange={(value) => updateBlock('alt', value)} maxLength={200} /></>}<Field label="Button label" {...removalProps(`${block.id}:buttonLabel`)} value={block.buttonLabel} onChange={(value) => updateBlock('buttonLabel', value)} maxLength={80} /><Field label="Button link" value={block.buttonUrl} onChange={(value) => updateBlock('buttonUrl', value)} placeholder="/products or https://example.com" maxLength={500} /></>}</>}
          {(sectionContentFields[section] || []).map(([key, label, maxLength, multiline]) => <Field key={key} {...removalProps(key)} label={label} value={contentValue(key)} onChange={value => update(key, value)} maxLength={maxLength} multiline={multiline} />)}
          {section === 'checkout' && <div className="grid gap-2"><h4 className="m-0 text-sm">Optional checkout fields</h4>{[['checkoutEmail', 'Email address'], ['checkoutNotes', 'Order notes']].map(([key,label])=><button type="button" key={key} className={visibility.fields[key] === false ? 'editor-restore-field' : 'editor-remove-field'} aria-label={`${visibility.fields[key] === false ? 'Restore' : 'Remove'} ${label} field`} onClick={()=>setVisibility('fields',key,visibility.fields[key] === false)}>{visibility.fields[key] === false ? 'Restore' : 'Remove'} {label.toLowerCase()} field</button>)}</div>}
          {section === 'details' && <p className="m-0 text-xs leading-5 text-slate-500">Product names, prices, images and descriptions come from Online Store ? Products. These settings customize the product page for every item.</p>}
          {['header', 'footer', 'style'].includes(section) && <p className="m-0 text-xs text-slate-500">These settings are shared across your store pages.</p>}
          {section === 'header' ? <><ImagePicker label="Logo image" {...removalProps('logoUrl')} value={contentValue('logoUrl')} disabled={saving || uploading || !settings.featureEnabled} onChange={(value) => update('logoUrl', value)} onUploadState={setUploading} onError={setError} /><Field label="Announcement" {...removalProps('announcement')} value={contentValue('announcement')} onChange={(value) => update('announcement', value)} maxLength={180} placeholder="Free delivery on orders above Rs.999" /></> : null}
          {section === 'hero' ? <><ImagePicker label="Banner image" {...removalProps('bannerImageUrl')} value={contentValue('bannerImageUrl')} disabled={saving || uploading || !settings.featureEnabled} onChange={(value) => update('bannerImageUrl', value)} onUploadState={setUploading} onError={setError} /><label className="grid gap-2 text-sm font-semibold">Image fit<select value={contentValue('bannerFit') || 'cover'} onChange={(event) => update('bannerFit', event.target.value)} className={inputClass}><option value="cover">Fill banner (crop edges)</option><option value="contain">Show whole image</option></select></label><label className="grid gap-2 text-sm font-semibold">Image position<select value={contentValue('bannerPosition') || 'center'} onChange={(event) => update('bannerPosition', event.target.value)} className={inputClass}>{['center', 'top', 'bottom', 'left', 'right'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><Field label="Heading" {...removalProps('heroTitle')} value={contentValue('heroTitle')} onChange={(value) => update('heroTitle', value)} maxLength={120} /><Field label="Description" multiline {...removalProps('heroText')} value={contentValue('heroText')} onChange={(value) => update('heroText', value)} maxLength={300} /><Field label="Shop button label" {...removalProps('heroButton')} value={contentValue('heroButton')} onChange={(value) => update('heroButton', value)} maxLength={40} /><p className="m-0 text-xs text-slate-500">The button opens your product catalog.</p></> : null}
          {section === 'products' ? <><Field label="Section heading" {...removalProps('productsTitle')} value={contentValue('productsTitle')} onChange={(value) => update('productsTitle', value)} maxLength={80} /><p className="m-0 text-xs text-slate-500">Your published products appear in this preview. Manage products in Online Store → Products.</p></> : null}
          {section === 'benefits' ? <p className="m-0 text-sm leading-6 text-slate-500">Show shipping, returns, secure payments, and support on this page.</p> : null}
          {section === 'footer' ? <Field label="About your store" multiline {...removalProps('footerText')} value={contentValue('footerText')} onChange={(value) => update('footerText', value)} maxLength={300} placeholder={settings.tagline || 'Tell customers about your store'} /> : null}
          {section === 'style' ? <><Field label="Brand color" type="color" value={contentValue('primaryColor')} onChange={(value) => update('primaryColor', value)} /><label className="grid gap-2 text-sm font-semibold">Typography<select className={inputClass} value={contentValue('fontFamily')} onChange={(event) => update('fontFamily', event.target.value)}><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label><p className="m-0 text-xs leading-5 text-slate-500">Design settings are saved separately for each template. Store name and contact information come from Store setup.</p></> : null}

      </div>}
      {activeInspector==='style'&&<div className="grid gap-4">
{section !== 'style' ? <><SectionControls section={section} device={device} styles={draft.pageStyles?.[editorPage] || {}} onChange={updatePageStyles} /><details className="editor-control-group"><summary>Image & effects</summary><div className="editor-control-fields"><label className="grid gap-2 text-sm font-semibold">Image fit for {device}<select className={inputClass} value={draft.pageStyles?.[editorPage]?.[section]?.[device]?.imageFit || ''} onChange={(event) => updatePageStyles({ ...draft.pageStyles?.[editorPage], [section]: { ...draft.pageStyles?.[editorPage]?.[section], [device]: { ...draft.pageStyles?.[editorPage]?.[section]?.[device], imageFit: event.target.value } } })}><option value="">Use default</option><option value="cover">Fill and crop</option><option value="contain">Fit whole image</option><option value="fill">Stretch</option></select></label><label className="grid gap-2 text-sm font-semibold">Image position<select className={inputClass} value={draft.pageStyles?.[editorPage]?.[section]?.[device]?.imagePosition || ''} onChange={(event) => updatePageStyles({ ...draft.pageStyles?.[editorPage], [section]: { ...draft.pageStyles?.[editorPage]?.[section], [device]: { ...draft.pageStyles?.[editorPage]?.[section]?.[device], imagePosition: event.target.value } } })}><option value="">Use default</option>{['center', 'top', 'bottom', 'left', 'right'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">Shadow<select className={inputClass} value={draft.pageStyles?.[editorPage]?.[section]?.[device]?.shadow || ''} onChange={(event) => updatePageStyles({ ...draft.pageStyles?.[editorPage], [section]: { ...draft.pageStyles?.[editorPage]?.[section], [device]: { ...draft.pageStyles?.[editorPage]?.[section]?.[device], shadow: event.target.value } } })}><option value="">Use default</option><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></label>{device !== 'desktop' && <button type="button" className="mt-3 text-left text-xs font-semibold text-blue-600" onClick={() => updatePageStyles({ ...draft.pageStyles?.[editorPage], [section]: { ...draft.pageStyles?.[editorPage]?.[section], [device]: { ...draft.pageStyles?.[editorPage]?.[section]?.desktop } } })}>Copy desktop styles to {device}</button>}</div></details></> : null}
      </div>}
      </fieldset>
    </>}
    </div></aside><div className="editor-preview"><div className="editor-preview-heading"><strong>Your store preview</strong><span>{device==='mobile'?'390':device==='tablet'?'768':'1440'} px / {builderPages.find(([key])=>key===editorPage)?.[1]}</span></div><div className="editor-preview-canvas"><PreviewFrame selectedSection={sidebarView === 'inspector' ? section : undefined} width={device==='mobile'?390:device==='tablet'?768:1440} zoom={zoom}><PublicStorePage key={editorPage} preview={preview} onPreviewSelect={value=>{if(value&&!uploading&&!saving)selectSection(value);}}/></PreviewFrame></div><p className="editor-preview-caption">Click any section in the preview to open its settings. Your changes appear here as you edit.</p></div></div>
  </div>, document.body);
}
