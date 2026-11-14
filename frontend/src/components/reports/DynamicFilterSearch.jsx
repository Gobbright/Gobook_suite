import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, ChevronRight, Filter, LoaderCircle, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { ReportFilterInput } from './ReportFilterInput.jsx';
import { ReportFilterIcon } from './ReportFilterIcon.jsx';
import { describeCondition, operatorLabels, readReportStorage, validateCondition, writeReportStorage } from './reportFilters.js';
import { navigateFilterList } from './filterKeyboardNavigation.js';
import './dynamicReportFilters.css';

const hasSelection = condition => condition && (['isEmpty', 'isNotEmpty'].includes(condition.operator) || condition.values?.length > 0 || condition.value != null && condition.value !== '' || condition.min != null && condition.min !== '' || condition.max != null && condition.max !== '');

function FilterPicker({ fields, initial, existingConditions, loadOptions, onAdd, onClose, controlsRef }) {
  const [fieldKey, setFieldKey] = useState(initial?.field || fields[0]?.key);
  const [search, setSearch] = useState('');
  const field = fields.find(entry => entry.key === fieldKey);
  const createCondition = entry => existingConditions.find(condition => condition.field === entry.key) || ({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, field: entry.key, operator: ['date', 'number'].includes(entry.type) ? 'between' : 'equals', values: [] });
  const [drafts, setDrafts] = useState(() => ({ [field.key]: initial || createCondition(field) }));
  const [changedFields, setChangedFields] = useState(() => new Set(initial ? [initial.field] : []));
  const condition = drafts[fieldKey];
  const setCondition = next => {
    setDrafts(previous => ({ ...previous, [fieldKey]: next }));
    setChangedFields(previous => new Set([...previous, fieldKey]));
  };
  const pending = Object.values(drafts).filter(condition => changedFields.has(condition.field) && (hasSelection(condition) || existingConditions.some(existing => existing.id === condition.id)));
  const addSelections = (applyImmediately = false) => {
    const conditions = pending.length ? pending : applyImmediately === true ? [] : [condition];
    for (const entry of conditions) {
      const failure = validateCondition(entry, fields.find(field => field.key === entry.field));
      if (failure) { setFieldKey(entry.field); setError(failure); return; }
    }
    if (existingConditions.length + conditions.filter(entry => !existingConditions.some(existing => existing.id === entry.id)).length > 30) {
      setError('Use at most 30 filter conditions.'); return;
    }
    onAdd(conditions, applyImmediately === true);
  };
  useImperativeHandle(controlsRef, () => ({ apply: () => addSelections(true) }));
  const [error, setError] = useState('');
  const searchRef = useRef(null);
  const [focusValuesRequest, setFocusValuesRequest] = useState(0);
  const ref = useFocusTrap({ onClose, initialFocusRef: searchRef });
  useEffect(() => {
    if (!focusValuesRequest) return;
    const panel = ref.current?.querySelector('.drf-picker-values');
    const target = panel?.querySelector('.drf-options input:not(:disabled)')
      || panel?.querySelector('input:not(:disabled)')
      || panel?.querySelector('select:not(:disabled)');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }, [focusValuesRequest, ref]);
  return <section ref={ref} className="drf-picker" role="dialog" aria-modal="true" aria-label="Build report filter">
    <header><div><Filter size={17} /><strong>{initial ? 'Edit filter' : 'Add a filter'}</strong></div><button type="button" aria-label="Close filter picker" onClick={onClose}><X size={18} /></button></header>
    <div className="drf-picker-body"><aside onKeyDown={event => navigateFilterList(event, 'nav > button:not(:disabled)')}><div className="drf-field-search"><Search size={14} /><input ref={searchRef} aria-label="Search filter fields" value={search} placeholder="Find a filter…" onChange={event => setSearch(event.target.value)} /></div><nav aria-label="Filter fields">{fields.filter(entry => entry.label.toLowerCase().includes(search.toLowerCase())).map(entry => <button type="button" key={entry.key} className={fieldKey === entry.key ? 'active' : ''} aria-pressed={fieldKey === entry.key} onClick={event => { if (event.detail === 0) setFocusValuesRequest(previous => previous + 1); setFieldKey(entry.key); setDrafts(previous => previous[entry.key] ? previous : { ...previous, [entry.key]: createCondition(entry) }); setError(''); }}><ReportFilterIcon field={entry.key} /><span className="drf-field-name">{entry.label}</span>{hasSelection(drafts[entry.key]) && <Check size={13} className="drf-field-check" aria-label="Options selected" />}<ChevronRight size={15} className="drf-field-arrow" /></button>)}</nav></aside>
      <div className="drf-picker-values"><div className="drf-value-heading"><h3>{field?.label}</h3><label>Condition<select aria-label="Filter operator" value={condition.operator} onChange={event => { setCondition({ ...condition, operator: event.target.value }); setError(''); }}>{field?.operators.map(operator => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}</select></label></div>
        {field && <ReportFilterInput key={field.key} field={field} condition={condition} onChange={value => { setCondition(value); setError(''); }} loadOptions={loadOptions} />}
        {error && <p className="drf-error" role="alert">{error}</p>}
      </div></div>
    <footer><span>Selections are kept when switching fields</span><button type="button" className="drf-primary" onClick={addSelections}><Check size={15} />{initial ? 'Update filter' : pending.length > 1 ? 'Add filters' : 'Add'}</button></footer>
  </section>;
}

export function DynamicFilterSearch({ fields, value, onChange, onApply, loadOptions, loading = false, savedStorageKey, disabled = false, variant = 'default', controlsRef }) {
  const [picker, setPicker] = useState(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(() => {
    const stored = readReportStorage(savedStorageKey, []);
    return Array.isArray(stored) ? stored : [];
  });
  const root = useRef(null);
  const pickerControls = useRef(null);
  const filters = value.conditions || [];
  const previousFilterCount = useRef(filters.length);
  useEffect(() => {
    if (previousFilterCount.current > 0 && filters.length === 0) setPicker(null);
    previousFilterCount.current = filters.length;
  }, [filters.length]);
  const canAdd = !disabled && fields.length > 0 && filters.length < 30;
  const openPicker = () => { if (canAdd) { setPicker({}); setSavedOpen(false); } };
  const commitConditions = (conditions, applyImmediately = false) => {
    const next = [...filters];
    for (const condition of conditions) {
      const index = next.findIndex(entry => entry.id === condition.id);
      if (index >= 0) next[index] = condition;
      else next.push(condition);
    }
    const nextValue = { ...value, conditions: next };
    onChange(nextValue);
    setPicker(null);
    if (applyImmediately) onApply(nextValue);
  };
  const applyFilters = () => {
    if (picker !== null) pickerControls.current?.apply();
    else onApply(value);
  };
  useImperativeHandle(controlsRef, () => ({ openSave: () => { setPicker(null); setSaving(true); setSavedOpen(false); }, openSaved: () => { setPicker(null); setSavedOpen(previous => !previous); setSaving(false); } }), []);
  useEffect(() => {
    const close = event => { if (event.target.closest?.('[data-report-filter-action]')) return; if (!root.current?.contains(event.target)) { setPicker(null); setSavedOpen(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const updateSaved = next => {
    if (!writeReportStorage(savedStorageKey, next)) { setError('Could not save filters in this browser. Check browser storage permissions.'); return false; }
    setSaved(next); setError(''); return true;
  };
  return <div className={`drf-host${variant === 'reference' ? ' drf-reference' : ''}`} ref={root}>
    {variant !== 'reference' && <div className="drf-toolbar"><div><Filter size={16} /><strong>Report filters</strong><small>Build your own search</small></div><div><label className="drf-logic">Match<select aria-label="Combine filter conditions" value={value.logic} onChange={event => onChange({ ...value, logic: event.target.value })}><option value="and">All conditions (AND)</option><option value="or">Any condition (OR)</option></select></label><button type="button" onClick={() => { setSaving(previous => !previous); setSavedOpen(false); }}><Save size={14} />Save Filter</button><button type="button" aria-expanded={savedOpen} onClick={() => { setSavedOpen(previous => !previous); setSaving(false); }}><Bookmark size={14} />Saved Filters<ChevronDown size={12} /></button></div></div>}
    <div className="drf-search-container" aria-label="Report filter search"><div className="drf-main-input" role="group" tabIndex={canAdd ? 0 : -1} aria-label="Add report filter" aria-haspopup="dialog" aria-expanded={picker !== null} onClick={event => { if (!event.target.closest('button')) openPicker(); }} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openPicker(); } }}><Search size={22} className="drf-search-icon" /><div className="drf-chips">
      {filters.map(condition => <div className="drf-chip" key={condition.id}><button type="button" title="Edit filter" onClick={() => setPicker({ initial: condition })}>{variant === 'reference' && <ReportFilterIcon field={condition.field} size={18} />}<span>{describeCondition(condition, fields)}</span></button><button type="button" aria-label={`Remove ${fields.find(field => field.key === condition.field)?.label || condition.field} filter`} onClick={() => onChange({ ...value, conditions: filters.filter(entry => entry.id !== condition.id) })}><X size={14} /></button></div>)}
      <button type="button" className="drf-add" disabled={!canAdd} aria-haspopup="dialog" aria-expanded={picker !== null} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); openPicker(); } }} onClick={openPicker}><Plus size={15} />Add Filter…</button>
    </div></div><div className="drf-search-actions"><span className="drf-count">{variant === 'reference' && <Filter size={16} />}{filters.length} {filters.length === 1 ? 'Filter' : 'Filters'}</span><button type="button" className="drf-clear" disabled={!filters.length} onClick={() => { onChange({ logic: 'and', conditions: [] }); setPicker(null); }}>Clear All</button><button type="button" className="drf-primary" disabled={disabled || loading} onClick={applyFilters}>{loading && <LoaderCircle size={15} className="drf-spin" />}Apply</button></div></div>
    {picker !== null && fields.length > 0 && <FilterPicker controlsRef={pickerControls} key={picker.initial?.id || 'new'} fields={fields} initial={picker.initial} existingConditions={filters} loadOptions={loadOptions} onClose={() => setPicker(null)} onAdd={commitConditions} />}
    {saving && <form className="drf-save-form" onSubmit={event => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed) { setError('Enter a name for this filter.'); return; } if (saved.length >= 25 && !saved.some(entry => entry.name === trimmed)) { setError('You can save up to 25 filters. Remove one first.'); return; } if (updateSaved([...saved.filter(entry => entry.name !== trimmed), { name: trimmed, filters: value }])) { setSaving(false); setName(''); } }}><label>Filter name<input autoFocus aria-label="Saved filter name" maxLength={60} value={name} placeholder="e.g. Monthly cash sales" onChange={event => setName(event.target.value)} /></label><button type="submit" className="drf-primary">Save</button><button type="button" onClick={() => setSaving(false)}>Cancel</button></form>}
    {savedOpen && <section className="drf-saved" aria-label="Saved filters">{saved.length ? saved.map(entry => <div key={entry.name}><button type="button" onClick={() => { onChange(entry.filters); onApply(entry.filters); setSavedOpen(false); }}><Bookmark size={14} /><span>{entry.name}<small>{entry.filters.conditions.length} conditions</small></span></button><button type="button" aria-label={`Delete saved filter ${entry.name}`} onClick={() => updateSaved(saved.filter(item => item.name !== entry.name))}><Trash2 size={15} /></button></div>) : <p className="drf-hint">No saved filters yet. Save a filter to use it again.</p>}</section>}
    {error && <p className="drf-error" role="alert">{error}</p>}
  </div>;
}
