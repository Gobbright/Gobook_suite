import { useEffect, useState } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { datePresets, presetDateRange } from './reportFilters.js';
import { navigateFilterList } from './filterKeyboardNavigation.js';

export function ReportFilterInput({ field, condition, onChange, loadOptions }) {
  const [search, setSearch] = useState('');
  const [remote, setRemote] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const noValue = ['isEmpty', 'isNotEmpty'].includes(condition.operator);
  useEffect(() => {
    if (!field.options || noValue) return undefined;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const result = await loadOptions(field.key, search, page, abort.signal);
        if (!abort.signal.aborted) { setRemote(previous => page === 1 ? result.options : [...previous, ...result.options]); setTotal(result.total); }
      } catch (failure) { if (!abort.signal.aborted) setError(failure.message); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [field.key, field.options, noValue, loadOptions, search, page]);
  if (noValue) return <p className="drf-hint">This condition does not require a value.</p>;
  const setValue = value => onChange({ ...condition, value, values: undefined, labels: undefined });
  if (field.type === 'date') return <div className="drf-date-input">
    <div className="drf-presets">{datePresets.map(([key, label]) => <button key={key} type="button" onClick={() => key !== 'custom' && onChange({ ...condition, operator: 'between', ...presetDateRange(key) })}>{label}</button>)}</div>
    {condition.operator === 'between' ? <div className="drf-range"><label>From date<input aria-label="Filter from date" type="date" value={condition.min || ''} max={condition.max || undefined} onChange={event => onChange({ ...condition, min: event.target.value })} /></label><label>To date<input aria-label="Filter to date" type="date" value={condition.max || ''} min={condition.min || undefined} onChange={event => onChange({ ...condition, max: event.target.value })} /></label></div>
      : <label>Date<input aria-label="Filter date" type="date" value={condition.value || ''} onChange={event => setValue(event.target.value)} /></label>}
  </div>;
  if (field.type === 'number') return condition.operator === 'between' ? <div className="drf-range"><label>Minimum<input aria-label="Minimum amount" type="number" step="any" value={condition.min ?? ''} onChange={event => onChange({ ...condition, min: event.target.value })} /></label><label>Maximum<input aria-label="Maximum amount" type="number" step="any" value={condition.max ?? ''} onChange={event => onChange({ ...condition, max: event.target.value })} /></label></div>
    : <label>Value<input aria-label={`${field.label} value`} type="number" step="any" value={condition.value ?? ''} onChange={event => setValue(event.target.value)} /></label>;
  if (field.type === 'boolean') return <label>Value<select aria-label={`${field.label} value`} value={condition.value == null ? '' : String(condition.value)} onChange={event => setValue(event.target.value === 'true')}><option value="" disabled>Select a value</option><option value="true">Yes</option><option value="false">No</option></select></label>;
  if (field.type === 'text' || condition.operator === 'contains') return <label>Search text<input aria-label={`${field.label} value`} maxLength={200} value={condition.value || ''} placeholder={`Enter ${field.label.toLowerCase()}…`} onChange={event => setValue(event.target.value)} /></label>;
  const values = condition.values || [];
  const options = field.values || remote;
  const visible = field.values ? options.filter(option => `${option.label} ${option.code || ''}`.toLowerCase().includes(search.toLowerCase())) : options;
  const setOptions = selectedOptions => {
    const next = selectedOptions.slice(0, 100);
    onChange({ ...condition, values: next.map(option => option.value), labels: next.map(option => option.label), value: undefined });
  };
  const toggle = option => {
    const selected = values.includes(option.value);
    const next = field.type === 'single' ? [option.value] : selected ? values.filter(value => value !== option.value) : [...values, option.value].slice(0, 100);
    const labels = next.map(value => value === option.value ? option.label : condition.labels?.[values.indexOf(value)] || options.find(item => item.value === value)?.label || String(value));
    onChange({ ...condition, values: next, labels, value: undefined });
  };
  return <div className="drf-option-input" onKeyDown={event => {
    if (event.target.closest('.drf-option-search, .drf-options')) {
      navigateFilterList(event, '.drf-options input:not(:disabled)');
      if (event.key === 'Enter' && event.target.matches('.drf-options input')) {
        event.preventDefault(); event.stopPropagation(); event.target.click();
      }
    }
  }}><div className="drf-option-search"><Search size={15} /><input aria-label={`Search ${field.label.toLowerCase()}`} placeholder={`Search ${field.label.toLowerCase()}…`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
    <div className="drf-option-selection"><span className="drf-option-count" aria-live="polite">{values.length} selected</span>{field.type !== 'single' && <div><button type="button" disabled={!visible.length || values.length >= 100} onClick={() => {
      const selected = values.map((value, index) => ({ value, label: condition.labels?.[index] || options.find(option => option.value === value)?.label || String(value) }));
      setOptions([...selected, ...visible.filter(option => !values.includes(option.value))]);
    }}>Select All{search || remote.length < total ? ' Shown' : ''}</button><button type="button" disabled={!values.length} onClick={() => setOptions([])}>Clear Selection</button></div>}</div>
    {field.type !== 'single' && <p className="drf-selection-hint">Choose multiple options. {condition.operator === 'notEquals' ? 'Exclude all selected values.' : 'Match any selected value.'}{values.length >= 100 ? ' Maximum 100 selected.' : ''}</p>}
    <div className="drf-options">{visible.map(option => <label key={String(option.value)}><input type={field.type === 'single' ? 'radio' : 'checkbox'} name={`filter-${field.key}`} checked={values.includes(option.value)} disabled={field.type !== 'single' && values.length >= 100 && !values.includes(option.value)} onChange={() => toggle(option)} /><span>{option.label}{option.code && <small>{option.code}</small>}</span></label>)}
      {loading && <p className="drf-hint" role="status"><LoaderCircle className="drf-spin" size={15} />Loading values…</p>}
      {!loading && !visible.length && !error && <p className="drf-hint">No matching values found.</p>}
      {error && <p className="drf-error" role="alert">{error}</p>}
      {field.options && remote.length < total && !loading && <button type="button" className="drf-load-more" onClick={() => setPage(previous => previous + 1)}>Load more values</button>}
    </div></div>;
}
