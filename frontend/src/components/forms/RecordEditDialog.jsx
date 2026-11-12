import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

export function RecordEditDialog({ title, initial, fields, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const heading = useId();
  const ref = useFocusTrap({ onClose: () => { if (!lock.current) onClose(); } });
  async function submit(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (failure) { setError(failure.message || 'Unable to save changes.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4">
    <form ref={ref} role="dialog" aria-modal="true" aria-labelledby={heading} onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <h2 id={heading} className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
      <fieldset disabled={saving} className="grid gap-3">
        {fields.map(({ key, label, type = 'text', required = false, options }) => <label key={key} className="grid gap-1 text-sm font-medium text-slate-700">
          {label}
          {options ? <select required={required} value={form[key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="h-10 rounded-md border border-slate-300 bg-white px-3">{options.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            : <input type={type} required={required} value={type === 'checkbox' ? undefined : form[key] ?? ''} checked={type === 'checkbox' ? Boolean(form[key]) : undefined} onChange={(event) => setForm((current) => ({ ...current, [key]: type === 'checkbox' ? event.target.checked : type === 'number' ? Number(event.target.value) : event.target.value }))} className={type === 'checkbox' ? 'h-4 w-4' : 'h-10 rounded-md border border-slate-300 px-3'} />}
        </label>)}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-md border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={saving} className="app-save-button rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button></div>
    </form>
  </div>, document.body);
}
