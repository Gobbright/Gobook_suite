import { RotateCcw } from 'lucide-react';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const controls = {
  width: ['Width', 20, 100, '%'], height: ['Section height', 0, 1600, 'px'],
  columns: ['Products per row', 1, 6, ''], gap: ['Space between items', 0, 100, 'px'], imageHeight: ['Image height', 60, 900, 'px'],
  paddingX: ['Left & right padding', 0, 160, 'px'], paddingY: ['Top & bottom padding', 0, 160, 'px'],
  marginTop: ['Space above', 0, 160, 'px'], marginBottom: ['Space below', 0, 160, 'px'],
  fontSize: ['Text size', 10, 48, 'px'], headingSize: ['Heading size', 12, 120, 'px'], buttonSize: ['Button text size', 10, 40, 'px'],
  radius: ['Corner radius', 0, 100, 'px'], minHeight: ['Minimum height', 0, 1200, 'px'], borderWidth: ['Border width', 0, 12, 'px'],
  lineHeight: ['Line spacing (10 = normal)', 10, 30, ''], letterSpacing: ['Letter spacing', -2, 12, 'px'], fontWeight: ['Font weight', 100, 900, ''], opacity: ['Opacity', 0, 100, '%'],
};

export function EditorSectionControls({ section, device, styles, onChange }) {
  const layout = styles?.[section]?.[device] || {};
  function update(key, value) {
    const next = { ...layout };
    if (value === '') delete next[key]; else next[key] = value;
    onChange({ ...styles, [section]: { ...styles?.[section], [device]: next } });
  }
  const hasGrid = ['products', 'wishlist', 'related', 'benefits', 'collections'].includes(section);
  const hasImages = ['products', 'wishlist', 'related', 'productImage', 'hero', 'details'].includes(section);
  const groups = [
    ['Layout', ['width', 'height', ...(hasGrid ? ['columns', 'gap'] : []), ...(hasImages ? ['imageHeight'] : [])]],
    ['Spacing', ['paddingX', 'paddingY', 'marginTop', 'marginBottom']],
    ['Text & typography', ['fontSize', 'headingSize', 'buttonSize']],
  ];
  function numberControl(key) {
    const [label, min, max, unit] = controls[key];
    const id = `section-${section}-${device}-${key}`;
    return <div className="editor-number-control" key={key}>
      <label htmlFor={id}>{label}</label>
      <div className="editor-number-input"><input id={id} aria-label={key === 'columns' ? 'Grid columns' : label} className={inputClass} type="number" min={min} max={max} value={layout[key] ?? ''} placeholder="Auto" onChange={(event) => update(key, event.target.value === '' ? '' : Math.min(max, Math.max(min, Number(event.target.value))))} /><span>{unit}</span></div>
      <button type="button" className="editor-reset-control" aria-label={`Reset ${label.toLowerCase()}`} title="Use default" onClick={() => update(key, '')}><RotateCcw size={13} /></button>
    </div>;
  }
  return <div className="grid gap-3">
    <p className="editor-style-info">Changes here apply to {device}. Leave a value on Auto to use the existing design.</p>
    <label className="grid gap-2 text-sm font-semibold">Show this section<select value={layout.hidden === true ? 'hidden' : layout.hidden === false ? 'visible' : ''} onChange={(event) => update('hidden', event.target.value === '' ? '' : event.target.value === 'hidden')} className={inputClass}><option value="">Use default</option><option value="visible">Visible on {device}</option><option value="hidden">Hidden on {device}</option></select></label>
    {groups.map(([label, keys], index) => <details key={label} className="editor-control-group" open={index === 0}>
      <summary>{label}</summary><div className="editor-control-fields">{keys.map(numberControl)}
        {label === 'Text & typography' && <label className="grid gap-2 text-sm font-semibold">Text alignment<select value={layout.align || ''} onChange={(event) => update('align', event.target.value)} className={inputClass}><option value="">Use default</option>{['left', 'center', 'right'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      </div>
    </details>)}
    <details className="editor-control-group"><summary>Colors & corners</summary><div className="editor-control-fields">
      {[['backgroundColor', 'Background'], ['textColor', 'Text'], ['borderColor', 'Border']].map(([key, label]) => <div className="editor-color-row" key={key}><label htmlFor={`color-${section}-${key}`}>{label}</label><input id={`color-${section}-${key}`} aria-label={`${label} color`} type="color" value={layout[key] || (key === 'textColor' ? '#17253b' : '#ffffff')} onChange={event => update(key, event.target.value)} /><button className="editor-reset-control" type="button" aria-label={`Reset ${label.toLowerCase()} color`} onClick={() => update(key, '')}><RotateCcw size={13} /></button></div>)}
      {numberControl('radius')}
    </div></details>
    <details className="editor-control-group"><summary>Advanced details</summary><div className="editor-control-fields">{['minHeight', 'borderWidth', 'lineHeight', 'letterSpacing', 'fontWeight', 'opacity'].map(numberControl)}</div></details>
    <button type="button" className="editor-style-reset" onClick={() => onChange({ ...styles, [section]: { ...styles?.[section], [device]: {} } })}>Reset appearance for {device}</button>
  </div>;
}
