import { useState } from 'react';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser.js';

export function JournalNarrationTemplates({ value, onChange, disabled }) {
  const user = useCurrentUser();
  const storageKey = `gobook.journal.narrations.${user?.businessId || ''}.${user?.id || user?._id || ''}`;
  const [templates, setTemplates] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string').slice(0, 30) : []; }
    catch { return []; }
  });
  const [error, setError] = useState('');
  return <details className="jv-options"><summary>Narration templates</summary><select aria-label="Narration template" disabled={disabled} value="" onChange={(event) => onChange(event.target.value)}><option value="">Choose a saved narration</option>{templates.map((template) => <option key={template}>{template}</option>)}</select><button type="button" disabled={disabled || !value.trim() || templates.includes(value.trim()) || templates.length >= 30} onClick={() => {
    const next = [...templates, value.trim().slice(0, 500)];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setTemplates(next); setError(''); }
    catch { setError('Unable to save templates on this device.'); }
  }}>Save current narration as template</button><small>Saved on this device for your company and user.</small>{error && <p role="alert">{error}</p>}</details>;
}
