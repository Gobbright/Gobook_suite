import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Monitor, Smartphone, Tablet } from 'lucide-react';
import { PublicStorePage } from '../../../../store/PublicStorePage.jsx';
import { sectionLayoutControls } from '../../../../store/sectionStyles.js';
import { api, SERVER_ORIGIN } from '../../../../../services/api.js';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const sections = [['header', 'Header & announcement'], ['hero', 'Image banner'], ['products', 'Product catalog'], ['benefits', 'Store benefits'], ['footer', 'Footer'], ['style', 'Theme settings']];
const defaults = { announcement: '', heroTitle: '', heroText: '', heroButton: '', productsTitle: 'Products', footerText: '', fontFamily: 'sans', productColumns: 0, showHero: true, showBenefits: true, showFooter: true };

export function designForTemplate(settings, name, preset) {
  return { ...defaults, primaryColor: preset.color, logoUrl: '', bannerImageUrl: '', ...(settings.theme?.name === name ? settings.theme : settings.templateDesigns?.[name]), name };
}

function PreviewFrame({ children, width }) {
  const [frameBody, setFrameBody] = useState(null);
  return <iframe title="Live storefront preview" className="h-full shrink-0 border-0 bg-white shadow-lg" style={{ width, maxWidth: '100%' }} srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body style='margin:0'><div id='preview-root'></div></body></html>" onLoad={(event) => {
    const frame = event.currentTarget.contentDocument;
    frame.head.querySelectorAll('[data-preview-style]').forEach((node) => node.remove());
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const copy = node.cloneNode(true);
      if (copy.tagName === 'LINK') copy.href = node.href;
      copy.setAttribute('data-preview-style', '');
      frame.head.appendChild(copy);
    });
    setFrameBody(frame.getElementById('preview-root'));
  }}>{frameBody ? createPortal(children, frameBody) : null}</iframe>;
}

function Field({ label, value, onChange, multiline = false, ...props }) {
  const Control = multiline ? 'textarea' : 'input';
  return <label className="grid gap-2 text-sm font-semibold text-slate-700">{label}<Control className={inputClass} value={value || ''} onChange={(event) => onChange(event.target.value)} rows={multiline ? 4 : undefined} {...props} /></label>;
}

function ImagePicker({ label, value, disabled, onChange, onUploadState, onError }) {
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
  return <div className="grid gap-3"><span className="text-sm font-semibold">{label}</span>{image ? <img src={image} alt={`${label} preview`} className="h-28 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" /> : null}<label className={`cursor-pointer rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-3 text-center text-sm font-semibold text-blue-700 ${disabled || uploading ? 'opacity-50' : ''}`}>{uploading ? 'Uploading image...' : 'Upload your image'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={`Upload ${label.toLowerCase()}`} disabled={disabled || uploading} onChange={upload} className="sr-only" /></label><p className="m-0 text-xs text-slate-500">JPG, PNG, WebP or GIF, up to 8 MB. Save the design to use this image.</p><Field label="Or use image URL" value={value} onChange={onChange} disabled={disabled || uploading} maxLength={500} placeholder="https://..." />{value ? <button type="button" disabled={disabled || uploading} onClick={() => onChange('')} className="text-left text-xs font-semibold text-red-600">Remove image</button> : null}</div>;
}

function SectionControls({ section, device, styles, onChange }) {
  const layout = styles?.[section]?.[device] || {};
  function update(key, value) {
    const next = { ...layout };
    if (value === '') delete next[key]; else next[key] = value;
    onChange({ ...styles, [section]: { ...styles?.[section], [device]: next } });
  }
  return <div className="grid gap-4 border-t border-slate-200 pt-5"><div><h3 className="m-0 text-sm font-bold">Size, spacing & typography</h3><p className="m-0 mt-1 text-xs leading-5 text-slate-500">Editing {device}. Blank values inherit {device === 'desktop' ? 'the template' : device === 'mobile' ? 'tablet and desktop' : 'desktop'}. Fixed heights scroll when content needs more room.</p></div>{sectionLayoutControls.map(([key, label, min, max, unit]) => {
    const inputId = `section-${section}-${device}-${key}`;
    return (
      <div key={key} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_3rem] items-center gap-2">
          <label htmlFor={inputId} className="min-w-0 text-xs font-semibold leading-5 text-slate-600">
            {label}<span className="block text-[10px] font-normal text-slate-400">{unit}</span>
          </label>
          <input
            id={inputId}
            type="number"
            aria-label={label}
            min={min}
            max={max}
            value={layout[key] ?? ''}
            placeholder="Auto"
            onChange={(event) => update(key, event.target.value === '' ? '' : Math.min(max, Math.max(min, Number(event.target.value))))}
            className={`${inputClass} min-w-0 !px-2 !py-2 text-center`}
          />
          <button type="button" aria-label={`Reset ${label.toLowerCase()}`} onClick={() => update(key, '')} className="min-h-9 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500">Reset</button>
        </div>
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min}
          max={max}
          value={layout[key] ?? ({ width: 100, height: 0, fontSize: 16, headingSize: 36, buttonSize: 14 }[key] ?? 0)}
          onChange={(event) => update(key, Number(event.target.value))}
          className="mt-3 block h-5 w-full min-w-0 cursor-pointer accent-blue-600"
        />
      </div>
    );
  })}<label className="grid gap-2 text-sm font-semibold">Text alignment<select value={layout.align || ''} onChange={(event) => update('align', event.target.value)} className={inputClass}><option value="">Inherit</option>{['left', 'center', 'right'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{[['backgroundColor', 'Background color'], ['textColor', 'Text color']].map(([key, label]) => <div key={key} className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-semibold">{label}<input aria-label={label} type="color" value={layout[key] || (key === 'textColor' ? '#0f172a' : '#ffffff')} onChange={(event) => update(key, event.target.value)} /></label><button type="button" onClick={() => update(key, '')} className="text-xs text-blue-600">Reset</button></div>)}<button type="button" onClick={() => onChange({ ...styles, [section]: { ...styles?.[section], [device]: {} } })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">Reset {device} section styles</button></div>;
}

export function ThemeCustomizer({ settings, name, preset, products, onSave, onClose }) {
  const initial = useRef(designForTemplate(settings, name, preset));
  const [draft, setDraft] = useState(initial.current);
  const [section, setSection] = useState('hero');
  const [device, setDevice] = useState('desktop');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  const preview = { store: { ...settings, theme: draft }, products: products.filter((product) => product.showOnline).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).slice(0, 200) };

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

  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); setSaved(false); }
  function close() { if (saving || uploading) return; if (dirty) setDiscard(true); else onClose(); }
  async function save() {
    setSaving(true); setError('');
    try {
      const result = await onSave(draft);
      const persisted = designForTemplate(result, name, preset);
      initial.current = persisted; setDraft(persisted); setSaved(true); setDiscard(false);
    } catch (saveError) { setError(saveError.message || 'Unable to save design. Please try again.'); }
    finally { setSaving(false); }
  }
  const visibilityKey = { hero: 'showHero', benefits: 'showBenefits', footer: 'showFooter' }[section];

  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label={`${preset.label} theme customizer`} className="fixed inset-0 z-[100] flex flex-col bg-slate-100 text-slate-900" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3"><button ref={closeButton} type="button" onClick={close} disabled={saving || uploading} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"><ArrowLeft size={16} /> Themes</button><div><h2 className="m-0 text-base font-bold">{preset.label}</h2><p className="m-0 text-xs text-slate-500">{settings.theme?.name === name ? 'Current theme · saves update your store' : 'Theme library · save before applying'}</p></div></div>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Preview device">{[['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]].map(([value, Icon]) => <button key={value} type="button" title={value} aria-label={`${value} preview`} aria-pressed={device === value} onClick={() => setDevice(value)} className={`rounded-md p-2 ${device === value ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><Icon size={18} /></button>)}</div>
      <div className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-500" aria-live="polite">{dirty ? 'Unsaved changes' : saved ? 'Design saved' : 'All changes saved'}</span><button type="button" onClick={save} disabled={saving || uploading || !dirty || !settings.featureEnabled} className="app-save-button flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button></div>
    </header>
    {error ? <div role="alert" className="bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    {discard ? <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>You have unsaved changes to this template.</span><div className="flex gap-3"><button type="button" onClick={() => setDiscard(false)} className="font-semibold">Keep editing</button><button type="button" onClick={onClose} className="rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white">Discard and close</button></div></div> : null}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="max-h-[45vh] min-w-0 w-full shrink-0 overflow-x-hidden overflow-y-auto border-r border-slate-200 bg-white md:max-h-none md:w-80">
        <div className="border-b border-slate-200 p-4"><p className="m-0 mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Homepage sections</p><nav className="grid gap-1">{sections.map(([key, label]) => <button key={key} type="button" disabled={uploading} onClick={() => setSection(key)} aria-pressed={section === key} className={`rounded-lg px-3 py-2 text-left text-sm font-semibold ${section === key ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</nav></div>
        <fieldset disabled={saving || uploading || !settings.featureEnabled} className="m-0 grid min-w-0 gap-5 border-0 p-5">
          <legend className="sr-only">{sections.find(([key]) => key === section)?.[1]} settings</legend>
          {visibilityKey ? <label className="flex items-center justify-between text-sm font-semibold">Show on homepage<input type="checkbox" checked={draft[visibilityKey]} onChange={(event) => update(visibilityKey, event.target.checked)} className="h-4 w-4 accent-blue-600" /></label> : null}
          {section === 'header' ? <><ImagePicker label="Logo image" value={draft.logoUrl} disabled={saving || uploading || !settings.featureEnabled} onChange={(value) => update('logoUrl', value)} onUploadState={setUploading} onError={setError} /><Field label="Announcement" value={draft.announcement} onChange={(value) => update('announcement', value)} maxLength={180} placeholder="Free delivery on orders above Rs.999" /></> : null}
          {section === 'hero' ? <><ImagePicker label="Banner image" value={draft.bannerImageUrl} disabled={saving || uploading || !settings.featureEnabled} onChange={(value) => update('bannerImageUrl', value)} onUploadState={setUploading} onError={setError} /><label className="grid gap-2 text-sm font-semibold">Image fit<select value={draft.bannerFit || 'cover'} onChange={(event) => update('bannerFit', event.target.value)} className={inputClass}><option value="cover">Fill banner (crop edges)</option><option value="contain">Show whole image</option></select></label><label className="grid gap-2 text-sm font-semibold">Image position<select value={draft.bannerPosition || 'center'} onChange={(event) => update('bannerPosition', event.target.value)} className={inputClass}>{['center', 'top', 'bottom', 'left', 'right'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><Field label="Heading" value={draft.heroTitle} onChange={(value) => update('heroTitle', value)} maxLength={120} /><Field label="Description" multiline value={draft.heroText} onChange={(value) => update('heroText', value)} maxLength={300} /><Field label="Shop button label" value={draft.heroButton} onChange={(value) => update('heroButton', value)} maxLength={40} /><p className="m-0 text-xs text-slate-500">The button opens your product catalog.</p></> : null}
          {section === 'products' ? <><Field label="Section heading" value={draft.productsTitle} onChange={(value) => update('productsTitle', value)} maxLength={80} /><label className="grid gap-2 text-sm font-semibold">Desktop columns<select className={inputClass} value={draft.productColumns} onChange={(event) => update('productColumns', Number(event.target.value))}><option value={0}>Template default</option>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} columns</option>)}</select></label><p className="m-0 text-xs text-slate-500">Your published products appear in this preview. Manage products in Online Store → Products.</p></> : null}
          {section === 'benefits' ? <p className="m-0 text-sm leading-6 text-slate-500">Show the shipping, returns, secure payments, and support section on your homepage.</p> : null}
          {section === 'footer' ? <Field label="About your store" multiline value={draft.footerText} onChange={(value) => update('footerText', value)} maxLength={300} placeholder={settings.tagline || 'Tell customers about your store'} /> : null}
          {section === 'style' ? <><Field label="Brand color" type="color" value={draft.primaryColor} onChange={(value) => update('primaryColor', value)} /><label className="grid gap-2 text-sm font-semibold">Typography<select className={inputClass} value={draft.fontFamily} onChange={(event) => update('fontFamily', event.target.value)}><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label><p className="m-0 text-xs leading-5 text-slate-500">Design settings are saved separately for each template. Store name and contact information come from Store setup.</p></> : null}
          {section !== 'style' ? <SectionControls section={section} device={device} styles={draft.sectionStyles || {}} onChange={(value) => update('sectionStyles', value)} /> : null}
        </fieldset>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-5"><p className="m-0 mb-3 text-center text-xs text-slate-500">Live preview · click a section to edit</p><div className="flex min-h-0 flex-1 justify-center overflow-auto"><PreviewFrame width={device === 'mobile' ? 390 : device === 'tablet' ? 768 : '100%'}><PublicStorePage preview={preview} onPreviewSelect={(value) => { if (value && !uploading) setSection(value); }} /></PreviewFrame></div></div>
    </div>
  </div>, document.body);
}
