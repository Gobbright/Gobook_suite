import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ClipboardList, Clock3, Eye, History, Info, Plus, Printer, ScanLine, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useCurrentUser } from '../../../hooks/useCurrentUser.js';
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import './automobileProducts.css';
import './automobileStockOut.css';

const OUT_REASONS = ['Workshop Consumption', 'Damage / Scrap', 'Internal Use', 'Stock Count Shortage', 'Stock Correction', 'Other'];
const IN_REASONS = ['Opening Stock', 'Stock Count Surplus', 'Recovered Parts', 'Workshop Return', 'Stock Correction', 'Other'];
const localDate = () => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const get = (key) => parts.find((part) => part.type === key)?.value; return `${get('year')}-${get('month')}-${get('day')}`; };
const dateText = (date) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const variantLabel = (row) => row.size || row.modelName || row.modelCode || row.barcode || '';
const keyOf = (product, variant) => `${product._id}:${variant?._id || ''}`;
function Dropdown({ label, value, onChange, options, placeholder = label, searchable = false, disabled = false }) {
  return <SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} placeholder={placeholder} searchable={searchable} disabled={disabled} className="autop-dropdown" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal />;
}

export function AutomobileStockAdjustmentPage({ direction = 'out' }) {
  const inward = direction === 'in';
  const title = inward ? 'Stock In' : 'Stock Out';
  const lowerTitle = title.toLowerCase();
  const quantityLabel = inward ? 'Qty In' : 'Qty Out';
  const reasons = inward ? IN_REASONS : OUT_REASONS;
  const entryField = inward ? 'stockInNo' : 'stockOutNo';
  const listEntries = inward ? api.invListStockIn : api.invListStockOut;
  const nextNumber = inward ? api.invStockInNextNumber : api.invStockOutNextNumber;
  const saveBatch = inward ? api.invCreateStockInBatch : api.invCreateStockOutBatch;
  const user = useCurrentUser();
  const [products, setProducts] = useState([]); const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [reload, setReload] = useState(0);
  const [entryNo, setEntryNo] = useState(''); const [date, setDate] = useState(localDate); const [warehouse, setWarehouse] = useState('');
  const [reason, setReason] = useState(reasons[0]); const [reference, setReference] = useState(''); const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); const [checked, setChecked] = useState([]); const [size, setSize] = useState(10); const [page, setPage] = useState(1);
  const [query, setQuery] = useState(''); const [suggestionsOpen, setSuggestionsOpen] = useState(false); const [historyAll, setHistoryAll] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(null); const [draft, setDraft] = useState(false);
  const lock = useRef(false); const searchRef = useRef(null); const searchWrap = useRef(null); const allRef = useRef(null);
  const readOnly = Boolean(saved && (saved.status === 'Completed' || saved.sourceType || !saved.adjustmentGroupNo));
  useEffect(() => {
    let active = true;
    async function all(method) { const rows = []; let current = 1; while (active) { const response = await method({ page: current, limit: 500, itemType: 'Product' }); const batch = response.data || []; rows.push(...batch); if (!batch.length || rows.length >= Number(response.total)) break; current++; } return rows; }
    async function load() {
      setLoading(true); setLoadError('');
      try { const [catalogue, history] = await Promise.all([all(api.invListProducts), all(listEntries)]); if (active) { setProducts(catalogue); setRecords(history); } }
      catch (failure) { if (active) setLoadError(failure.message || `Unable to load ${lowerTitle} data.`); }
      finally { if (active) setLoading(false); }
    }
    load(); return () => { active = false; };
  }, [reload, listEntries, lowerTitle]);
  useEffect(() => { let active = true; nextNumber().then((response) => { if (active) setEntryNo(response.number || ''); }).catch(() => {}); return () => { active = false; }; }, [nextNumber]);
  useEffect(() => {
    const outside = (event) => { if (!searchWrap.current?.contains(event.target)) setSuggestionsOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setSuggestionsOpen(false); };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, []);
  const warehouses = [...new Set(products.map((product) => product.warehouse || 'Main Warehouse'))].sort();
  const choices = useMemo(() => products.filter((product) => product.status !== 'Inactive' && product.trackInventory !== false && (!warehouse || (product.warehouse || 'Main Warehouse') === warehouse)).flatMap((product) => product.variants?.length ? product.variants.map((variant) => ({ key: keyOf(product, variant), product, variant, label: `${product.description} · ${variantLabel(variant)} (${product.code})` })) : [{ key: keyOf(product), product, variant: null, label: `${product.description} (${product.code})` }]), [products, warehouse]);
  const matches = choices.filter((choice) => [choice.label, choice.product.partNumber, choice.product.barcode, choice.variant?.barcode].join(' ').toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const totalValue = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * item.unitCost, 0);
  const productFor = (item) => products.find((product) => String(product._id) === String(item.productId));
  const available = (item) => { const product = productFor(item); const variant = item.variantId ? product?.variants?.find((row) => String(row._id) === String(item.variantId)) : null; return Number(variant?.stock ?? product?.stock ?? 0); };
  const invalidItems = items.filter((item) => !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0 || (!inward && Number(item.qty) > available(item)));
  const lowItems = items.filter((item) => { const product = productFor(item); return available(item) - Number(item.qty || 0) <= Number(product?.minStockLevel || 0); });
  const history = useMemo(() => {
    const groups = new Map(); records.filter((record) => !record.sourceType && !record.sourceId).forEach((record) => { const key = record.adjustmentGroupNo || record[entryField]; if (!groups.has(key)) groups.set(key, { ...record, number: key, entries: [], quantity: 0, value: 0 }); const group = groups.get(key); group.entries.push(record); group.quantity += Number(record.totalQty || 0); group.value += Number(record.totalValue || 0); }); return [...groups.values()];
  }, [records, entryField]);
  const pages = Math.max(1, Math.ceil(items.length / size)); const currentPage = Math.min(page, pages); const visibleItems = items.slice((currentPage - 1) * size, currentPage * size);
  const allChecked = visibleItems.length > 0 && visibleItems.every((item) => checked.includes(item.key));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && visibleItems.some((item) => checked.includes(item.key)); }, [allChecked, visibleItems, checked]);
  function addItem(choice) {
    if (readOnly || busy || !choice) return;
    if (items.length >= 100 && !items.some((item) => item.key === choice.key)) { setError(`A ${lowerTitle} entry can contain up to 100 items.`); return; }
    const { product, variant } = choice;
    setWarehouse(product.warehouse || 'Main Warehouse');
    setItems((previous) => previous.some((item) => item.key === choice.key) ? previous.map((item) => item.key === choice.key ? { ...item, qty: Number(item.qty || 0) + 1 } : item) : [...previous, { key: choice.key, productId: product._id, productName: product.description, variantId: variant?._id || '', variantName: variant ? variantLabel(variant) : '', code: product.code, partNumber: product.partNumber, category: product.category, qty: 1, unitCost: Number(variant?.purchasePrice ?? product.purchasePrice) || Number(variant?.rate ?? product.rate) || 0, batchSerialNo: '', remarks: '' }]);
    setQuery(''); setSuggestionsOpen(false); setError(''); setPage(Math.ceil((items.some((item) => item.key === choice.key) ? items.length : items.length + 1) / size)); searchRef.current?.focus();
  }
  function updateItem(key, field, next) { setItems((previous) => previous.map((item) => item.key === key ? { ...item, [field]: next } : item)); }
  async function newEntry() {
    if (busy) return;
    if (!readOnly && items.length && !window.confirm(`Start a new ${lowerTitle} entry? Save a draft first to keep your changes.`)) return;
    setItems([]); setChecked([]); setSaved(null); setDraft(false); setDate(localDate()); setWarehouse(''); setReason(reasons[0]); setReference(''); setNotes(''); setError(''); setNotice(''); setPage(1);
    try { const response = await nextNumber(); setEntryNo(response.number || ''); } catch { setEntryNo(''); }
  }
  async function save(status) {
    if (lock.current || readOnly || loading || loadError) return;
    if (!date || !warehouse || !reason || !items.length) { setError('Date, warehouse, adjustment reason and at least one item are required.'); return; }
    if (items.some((item) => !Number.isFinite(Number(item.qty)) || Number(item.qty) <= 0)) { setError('Enter a positive quantity for every item.'); return; }
    if (status === 'Completed' && invalidItems.length) { setError(inward ? 'Enter a positive quantity for every item.' : 'Quantity out cannot exceed the available stock.'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await saveBatch({ [entryField]: entryNo, date, warehouse, adjustmentReason: reason, referenceNo: reference, notes, status, editDraft: draft, items: items.map((item) => ({ productId: item.productId, variantId: item.variantId || undefined, qty: Number(item.qty), batchSerialNo: item.batchSerialNo, remarks: item.remarks })) });
      setItems((previous) => previous.map((item) => {
        const stored = response.data?.find((entry) => String(entry.productId) === String(item.productId) && String(entry.variantId || '') === String(item.variantId || ''));
        return stored ? { ...item, unitCost: stored.totalQty ? stored.totalValue / stored.totalQty : 0 } : item;
      }));
      setEntryNo(response.number); setDraft(status === 'Pending'); setSaved(response.data?.[0] || { status }); setNotice(status === 'Pending' ? 'Draft saved. Stock quantities are unchanged.' : `${title} confirmed. Inventory quantities have been updated.`); setReload((previous) => previous + 1);
    } catch (failure) { setError(failure.message || `Unable to save ${lowerTitle}.`); }
    finally { lock.current = false; setBusy(false); }
  }
  function openHistory(group) {
    if (busy) return;
    if (!readOnly && items.length && !window.confirm(`Open this ${lowerTitle} entry? Unsaved changes will be replaced.`)) return;
    setEntryNo(group.number); setDate(String(group.date || '').slice(0, 10)); setWarehouse(group.warehouse || products.find((product) => String(product._id) === String(group.productId))?.warehouse || 'Main Warehouse'); setReason(group.adjustmentReason || (inward ? group.supplier : group.to) || 'Other'); setReference(group.referenceNo || ''); setNotes(group.notes || ''); setSaved(group); setDraft(Boolean(group.adjustmentGroupNo) && group.status === 'Pending'); setChecked([]); setPage(1); setError(''); setNotice(group.status === 'Completed' || group.sourceType || !group.adjustmentGroupNo ? `Viewing a saved ${lowerTitle} entry.` : 'Draft opened. Update the items, then save or confirm.');
    setItems(group.entries.map((record) => { const product = products.find((row) => String(row._id) === String(record.productId)); return { key: `${record.productId}:${record.variantId || ''}`, productId: record.productId, productName: record.productName, variantId: record.variantId || '', variantName: record.variantName || '', code: product?.code || '', partNumber: product?.partNumber || '', category: product?.category || '', qty: record.totalQty, unitCost: record.totalQty ? record.totalValue / record.totalQty : 0, batchSerialNo: record.batchSerialNo || '', remarks: record.remarks || '' }; }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return <div className="inventory-list-page aso-container"><div className="autop-page aso-page">
    <header className="autop-header"><div><h1>{title}</h1><p>Record manual stock {inward ? 'increases' : 'reductions'} by product and warehouse, with automatically calculated totals.</p></div><div className="autop-actions"><Link to={inward ? '/stock-in' : '/stock-out'}>View {title} Register</Link>{saved && <button onClick={newEntry} disabled={busy}><Plus size={16} />New Entry</button>}<button className="app-save-button" disabled={busy || loading || !!loadError || !!readOnly} onClick={() => save('Pending')}>{busy ? 'Saving…' : 'Save'}</button><button disabled={!items.length} onClick={() => window.print()}><Printer size={16} />Print</button><button className="autop-primary" disabled={busy || loading || !!loadError || !!readOnly || !items.length} onClick={() => save('Completed')}><Check size={17} />Confirm {title}</button></div></header>

    {(error || loadError) && <div className="autop-error" role="alert">{error || loadError}{loadError && <button onClick={() => setReload((previous) => previous + 1)}>Retry</button>}</div>}{notice && <div className="aso-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
    <div className="aso-workspace"><div className="aso-main"><section className="aso-card aso-fields"><label>Entry No.<input value={entryNo} readOnly placeholder="Assigned on save" /></label><label>Date <em>*</em><input type="date" value={date} disabled={busy || !!readOnly} onChange={(event) => setDate(event.target.value)} /></label><label>Warehouse <em>*</em><Dropdown label="Warehouse" value={warehouse} disabled={busy || !!readOnly || items.length > 0} onChange={setWarehouse} options={warehouses} placeholder="Select Warehouse" /></label><label>Reference No.<input value={reference} disabled={busy || !!readOnly} placeholder="e.g. COUNT-001, JOB-001" onChange={(event) => setReference(event.target.value)} /></label><label>Adjustment Reason <em>*</em><Dropdown label="Adjustment Reason" value={reason} disabled={busy || !!readOnly} options={reasons.includes(reason) ? reasons : [...reasons, reason]} onChange={setReason} /></label><label className="aso-notes">Notes<textarea maxLength={500} value={notes} disabled={busy || !!readOnly} placeholder="Add additional notes, purpose or remarks..." onChange={(event) => setNotes(event.target.value)} /><small>{notes.length}/500</small></label></section>
    <section className="aso-card aso-items"><h2>Add Items</h2><div className="aso-add-row"><div className="aso-item-search" ref={searchWrap}><Search size={17} /><input ref={searchRef} value={query} disabled={busy || !!readOnly || loading || !!loadError} aria-label="Find products or scan barcode" aria-expanded={suggestionsOpen && !!query.trim()} placeholder="Search by product name, SKU, part number or barcode..." onFocus={() => setSuggestionsOpen(true)} onChange={(event) => { setQuery(event.target.value); setSuggestionsOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const exact = choices.find((choice) => [choice.product.barcode, choice.variant?.barcode, choice.product.code, choice.product.partNumber].filter(Boolean).some((code) => String(code).toLowerCase() === query.trim().toLowerCase())); if (exact || matches.length === 1) addItem(exact || matches[0]); } }} /><ScanLine size={17} />{suggestionsOpen && query.trim() && <div className="aso-suggestions">{matches.length ? matches.map((choice) => <button key={choice.key} onClick={() => addItem(choice)}><span>{choice.label}</span><small>{Number(choice.variant?.stock ?? choice.product.stock ?? 0)} available</small></button>) : <p>No matching products in this warehouse.</p>}</div>}</div><Dropdown label="Add from Products" value="" searchable disabled={busy || !!readOnly || loading || !!loadError} options={choices.map((choice) => ({ value: choice.key, label: choice.label }))} onChange={(key) => addItem(choices.find((choice) => choice.key === key))} /></div>
    <div className="autop-table-scroll"><table className="aso-items-table"><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all visible items" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((key) => !visibleItems.some((item) => item.key === key)) : [...new Set([...previous, ...visibleItems.map((item) => item.key)])])} /></th>{['#', 'Product', 'SKU / Part No.', 'Available Stock', quantityLabel, 'Value (₹)', 'Actions'].map((label) => <th key={label}>{label}{label === quantityLabel && <em> *</em>}</th>)}</tr></thead><tbody>{!items.length ? <tr><td colSpan={8} className="aso-empty">{loading ? 'Loading products…' : `Add products to begin a ${lowerTitle} adjustment.`}</td></tr> : visibleItems.map((item, index) => <tr key={item.key}><td><input type="checkbox" aria-label={`Select ${item.productName}`} checked={checked.includes(item.key)} onChange={() => setChecked((previous) => previous.includes(item.key) ? previous.filter((key) => key !== item.key) : [...previous, item.key])} /></td><td>{(currentPage - 1) * size + index + 1}</td><td><strong>{item.productName}</strong><small>{item.variantName || item.category || '—'}</small></td><td>{item.code || item.partNumber || '—'}</td><td className={available(item) <= Number(productFor(item)?.minStockLevel || 0) ? 'autop-low' : 'autop-stock'}>{available(item)}</td><td><input type="number" min="0.001" step="any" value={item.qty} disabled={busy || !!readOnly} aria-label={`Quantity ${direction} for ${item.productName}`} aria-invalid={!readOnly && (Number(item.qty) <= 0 || (!inward && Number(item.qty) > available(item)))} onChange={(event) => updateItem(item.key, 'qty', event.target.value)} /></td><td className="aso-value">{money((Number(item.qty) || 0) * item.unitCost)}</td><td><button className="aso-delete" disabled={busy || !!readOnly} aria-label={`Remove ${item.productName}`} onClick={() => { setItems((previous) => previous.filter((row) => row.key !== item.key)); setChecked((previous) => previous.filter((key) => key !== item.key)); }}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
    <footer className="aso-items-footer"><div><button disabled={busy || !!readOnly} onClick={() => searchRef.current?.focus()}><Plus size={16} />Add Item</button><button disabled={busy || !!readOnly} onClick={() => { searchRef.current?.focus(); setNotice('Scan a barcode using your connected scanner, then press Enter.'); }}><ScanLine size={16} />Scan Barcode</button>{checked.length > 0 && <button disabled={busy || !!readOnly} onClick={() => { setItems((previous) => previous.filter((item) => !checked.includes(item.key))); setChecked([]); }}><Trash2 size={14} />Remove Selected</button>}</div><div className="aso-pagination"><span>Rows per page</span><Dropdown label="Items per page" value={size} options={[10, 25, 50, 100]} onChange={(next) => { setSize(Number(next)); setPage(1); }} /><button disabled={currentPage === 1} aria-label="Previous items" onClick={() => setPage(currentPage - 1)}>‹</button><span>{items.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, items.length)} of {items.length} items</span><button disabled={currentPage === pages} aria-label="Next items" onClick={() => setPage(currentPage + 1)}>›</button></div></footer></section></div>
    <aside className="aso-card aso-summary"><h2><ClipboardList size={21} />{title} Summary</h2><dl className="aso-totals"><div><dt>Total Items</dt><dd>{items.length}</dd></div><div><dt>Total Quantity {inward ? 'In' : 'Out'}</dt><dd>{totalQty.toLocaleString('en-IN')}</dd></div><div><dt>Calculated Value (₹)</dt><dd>{money(totalValue)}</dd></div></dl><div className="aso-status-row"><Clock3 size={17} /><span>Entry Status</span><b className={saved?.status === 'Completed' ? 'aso-success' : 'aso-pending'}>{saved?.status === 'Completed' ? 'Completed' : draft ? 'Draft' : 'Not Saved'}</b></div><div className="aso-status-row"><ShieldCheck size={17} /><span>Stock Availability</span><b className={invalidItems.length && !readOnly ? 'aso-warning' : 'aso-success'}>{invalidItems.length && !readOnly ? 'Check Quantities' : 'No Restrictions'}</b></div>{!inward && !readOnly && lowItems.length > 0 && <div className="aso-warning-box"><AlertTriangle size={20} /><div><strong>{lowItems.length} item{lowItems.length === 1 ? '' : 's'} at or below minimum after issue</strong><p>{lowItems.slice(0, 3).map((item) => `${item.productName} (${available(item) - Number(item.qty || 0)} left)`).join(', ')}</p></div></div>}<div className="aso-info-box"><Info size={19} /><div><strong>{inward ? (saved?.status === 'Completed' ? 'Stock added to' : 'Stock will be added to') : (saved?.status === 'Completed' ? 'Stock reduced from' : 'Stock will be reduced from')}</strong><p>{warehouse || 'Select a warehouse'}</p></div></div><section className="aso-audit"><h2><History size={20} />Audit Trail</h2><dl>{[['Created By', saved?.createdBy || (saved ? '—' : user?.name || user?.fullName || user?.email || 'Current user')], ['Created On', saved?.createdAt ? dateText(saved.createdAt) : 'Not saved'], ['Last Modified On', saved?.updatedAt ? dateText(saved.updatedAt) : '—'], ['Reference', reference || '—'], ['Reason', reason]].map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl></section></aside></div>
    <section className="aso-card aso-history"><header><h2><History size={20} />Recent Manual {title} History</h2><button onClick={() => setHistoryAll((previous) => !previous)}>{historyAll ? 'Show Recent' : 'View All'}</button></header><div className="autop-table-scroll"><table><thead><tr>{['Entry No.', 'Date', 'Warehouse', 'Reference No.', 'Reason', 'Items', 'Total Qty', 'Total Value (₹)', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{loading || !history.length ? <tr><td colSpan={10} className="aso-empty">{loading ? 'Loading history…' : `No manual ${lowerTitle} history yet.`}</td></tr> : (historyAll ? history : history.slice(0, 5)).map((group) => <tr key={group.number}><td><button className="aso-entry-link" onClick={() => openHistory(group)}>{group.number}</button></td><td>{dateText(group.date)}</td><td>{group.warehouse || '—'}</td><td>{group.referenceNo || group.sourceNo || '—'}</td><td>{group.adjustmentReason || (inward ? group.supplier : group.to) || '—'}</td><td>{group.entries.length}</td><td>{group.quantity}</td><td>{money(group.value)}</td><td><span className={group.status === 'Completed' ? 'aso-success' : 'aso-pending'}>{group.status === 'Completed' ? 'Completed' : 'Draft'}</span></td><td><button aria-label={`View ${lowerTitle} entry ${group.number}`} onClick={() => openHistory(group)}><Eye size={13} /></button></td></tr>)}</tbody></table></div></section>
  </div></div>;
}
