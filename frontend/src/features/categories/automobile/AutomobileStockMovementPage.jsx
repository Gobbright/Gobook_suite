import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock3, Database, Download, Eye, ListFilter, Package, Plus, Printer, RefreshCw, Search } from 'lucide-react';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { stockMovementRows, stockMovementTotals } from './automobileStockMovements.js';
import { stockSourceLink } from './automobileStockLedger.js';
import './automobileProducts.css';
import './automobileStockMovements.css';

const EMPTY = { search: '', from: '', to: '', warehouse: '', type: '', status: '' };
const count = (number) => number.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const dateText = (date) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
function sourceLink(row) {
  return stockSourceLink(row) || `/stock-ledger?search=${encodeURIComponent(row.code || row.productName || '')}`;
}
function Dropdown({ label, value, onChange, options, className = '' }) {
  return <SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} className={`autop-dropdown ${className}`} buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal />;
}
export function AutomobileStockMovementPage({ direction }) {
  const inward = direction === 'in'; const title = inward ? 'Stock In' : 'Stock Out';
  const listEntries = inward ? api.invListStockIn : api.invListStockOut;
  const [products, setProducts] = useState([]); const [entries, setEntries] = useState([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState(''); const [reload, setReload] = useState(0); const [updatedAt, setUpdatedAt] = useState('');
  const [filters, setFilters] = useState(EMPTY); const [sort, setSort] = useState('newest'); const [size, setSize] = useState(10); const [page, setPage] = useState(1); const [checked, setChecked] = useState([]);
  const allRef = useRef(null);
  useEffect(() => {
    let active = true; let inFlight = false;
    async function all(method, params = {}) {
      const result = []; let current = 1;
      while (active) { const response = await method({ page: current, limit: 500, itemType: 'Product', ...params }); const batch = response.data || []; result.push(...batch); if (!batch.length || result.length >= Number(response.total)) break; current++; }
      return result;
    }
    async function load() {
      if (!active || inFlight) return;
      inFlight = true; setRefreshing(true);
      try {
        const [catalogue, movements] = await Promise.all([all(api.invListProducts), all(listEntries)]);
        if (active) { setProducts(catalogue); setEntries(movements); setChecked((previous) => previous.filter((id) => movements.some((row) => row._id === id))); setError(''); setUpdatedAt(new Date().toISOString()); }
      } catch (failure) { if (active) setError(failure.message || 'Unable to load stock movements.'); }
      finally { inFlight = false; if (active) { setLoading(false); setRefreshing(false); } }
    }
    const refreshVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    window.addEventListener('focus', refreshVisible); document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [listEntries, reload]);
  const movementRows = useMemo(() => stockMovementRows(entries, products, direction), [entries, products, direction]);
  const filtered = useMemo(() => movementRows.filter((row) => [row.productName, row.variantName, row.code, row.partNumber, row.barcode, row.number, row.sourceNo, row.referenceNo].join(' ').toLowerCase().includes(filters.search.toLowerCase()) && (!filters.from || row.day >= filters.from) && (!filters.to || row.day <= filters.to) && (!filters.warehouse || row.warehouse === filters.warehouse) && (!filters.type || row.type === filters.type) && (!filters.status || row.status === filters.status)).sort((a, b) => sort === 'oldest' ? Date.parse(a.date) - Date.parse(b.date) : sort === 'name' ? (a.productName || '').localeCompare(b.productName || '') : sort === 'quantity' ? b.quantity - a.quantity : Date.parse(b.date) - Date.parse(a.date) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)), [movementRows, filters, sort]);
  const totals = useMemo(() => stockMovementTotals(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const allChecked = rows.length > 0 && rows.every((row) => checked.includes(row._id));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((row) => checked.includes(row._id)); }, [allChecked, rows, checked]);
  const selectedRows = filtered.filter((row) => checked.includes(row._id));
  const invalidDate = Boolean(filters.from && filters.to && filters.from > filters.to);
  const change = (key, next) => { setFilters((previous) => ({ ...previous, [key]: next })); setPage(1); };
  const cards = [
    [`${title} Movements`, count(totals.movements), inward ? ArrowDownRight : ArrowUpRight, inward ? 'green' : 'red', 'Posted movements'],
    [`Total Quantity ${inward ? 'In' : 'Out'}`, count(totals.quantity), Package, 'blue', 'Calculated from posted entries'],
    ['Recorded Movement Value', money(totals.value), Database, 'purple', 'From posted source documents'],
    [inward ? 'Products Received' : 'Products Issued', count(totals.products), ClipboardList, 'orange', 'Distinct products'],
    ['Pending Movements', count(totals.pending), Clock3, 'blue', 'Excluded from quantity and value'],
  ];
  function exportRows() {
    const cell = (data) => `"${String(data ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const exported = selectedRows.length ? selectedRows : filtered;
    const csv = [['Entry No.', 'Date', 'Product', 'Variant', 'SKU', 'Warehouse', 'Source', 'Reference', 'Quantity', 'Rate', 'Value', 'Status'], ...exported.map((row) => [row.number, dateText(row.date), row.productName, row.variantName, row.code, row.warehouse, row.type, row.sourceNo || row.referenceNo, row.quantity, row.rate, row.value, row.status])].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })); const link = document.createElement('a'); link.href = url; link.download = `automobile-stock-${direction}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="inventory-list-page asm-container"><div className="autop-page asm-page"><header className="autop-header"><div><h1>{title}</h1><p>{inward ? 'Stock received automatically from purchase entries, returns and other posted inward movements.' : 'Stock issued automatically from sales, supplier returns and other posted outward movements.'}</p></div><div className="autop-actions"><Link className="asm-link" to={inward ? '/stock-in/new' : '/stock-out/new'}><Plus size={16} />New Adjustment</Link><Link className="asm-link" to="/stock-ledger"><BookOpen size={16} />View Ledger</Link><button disabled={loading || !!error || invalidDate || !filtered.length} onClick={exportRows}><Download size={16} />Export</button><button disabled={loading || !!error || invalidDate || !filtered.length} onClick={() => window.print()}><Printer size={16} />Print</button><button aria-label={`Refresh ${title.toLowerCase()}`} disabled={refreshing} onClick={() => setReload((previous) => previous + 1)}><RefreshCw size={16} />{refreshing ? 'Updating…' : 'Refresh'}</button></div></header>

    <div className="autop-stats asm-stats">{cards.map(([label, total, Icon, color, hint]) => <article key={label} className={`autop-stat autop-${color}`}><div className="autop-stat-icon"><Icon size={24} /></div><div><span>{label}</span><strong>{loading || error || invalidDate ? '—' : total}</strong><small>{hint}</small></div><svg className="autop-spark" viewBox="0 0 64 32" aria-hidden="true"><path d="M1 29 11 20 19 24 28 12 36 18 44 7 52 12 63 2" /></svg></article>)}</div>
    <div className="autop-filters asm-filters"><label className="autop-search"><Search size={17} /><input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search product, SKU, part number or reference..." value={filters.search} onChange={(event) => change('search', event.target.value)} /></label><div className="asm-dates"><CalendarDays size={16} /><input aria-label="Movement start date" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => change('from', event.target.value)} /><span>–</span><input aria-label="Movement end date" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => change('to', event.target.value)} /></div>{[['warehouse', 'Warehouse', [...new Set(movementRows.map((row) => row.warehouse).filter(Boolean))].sort()], ['type', 'Source Type', [...new Set(movementRows.map((row) => row.type))].sort()], ['status', 'Status', ['Completed', 'Pending']]].map(([key, label, options]) => <Dropdown key={key} className="autop-filter" label={label} value={filters[key]} onChange={(next) => change(key, next)} options={[{ value: '', label }, ...options.map((next) => ({ value: next, label: next === 'Completed' ? 'Posted' : next }))]} />)}<button onClick={() => { setFilters(EMPTY); setPage(1); }}><ListFilter size={16} />Clear Filters</button></div>
    {error && <div className="autop-error" role="alert">{error}<button onClick={() => setReload((previous) => previous + 1)}>Retry</button></div>}{invalidDate && <div className="autop-error" role="alert">End date must be on or after the start date.</div>}
    <section className="autop-list"><header className="autop-list-header"><span>Showing {rows.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, filtered.length)} of {filtered.length.toLocaleString('en-IN')} movements{selectedRows.length ? ` · ${selectedRows.length} selected` : ''}</span><div><div className="autop-sort"><span>Sort by</span><Dropdown label="Sort stock movements" value={sort} onChange={(next) => { setSort(next); setPage(1); }} options={[{ value: 'newest', label: 'Date (Newest First)' }, { value: 'oldest', label: 'Date (Oldest First)' }, { value: 'name', label: 'Product Name (A - Z)' }, { value: 'quantity', label: 'Quantity (High - Low)' }]} /></div></div></header>
    <div className="autop-table-scroll"><BulkDeleteTable onDeleteRecord={record => (inward ? api.invDeleteStockIn : api.invDeleteStockOut)(record._id)} onDeleted={ids => setReload(value => value + 1)} canDelete={record => !record.sourceType && !record.sourceId}><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all movements on this page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((row) => row._id === id)) : [...new Set([...previous, ...rows.map((row) => row._id)])])} /></th>{['Date', 'Entry No.', 'Product', 'SKU / Part No.', 'Warehouse', 'Source', 'Reference', inward ? 'Qty In' : 'Qty Out', 'Rate (₹)', 'Value (₹)', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{loading || error || !rows.length ? <tr><td colSpan={13} className="autop-empty">{loading ? 'Loading automatic stock movements…' : error ? 'Stock movements could not be loaded. Please retry.' : `No ${title.toLowerCase()} movements yet. Posted ${inward ? 'purchases and returns' : 'sales and supplier returns'} appear here automatically.`}</td></tr> : rows.map((row) => <BulkDeleteRow record={row} key={row._id} className={checked.includes(row._id) ? 'autop-selected' : ''}><td><input type="checkbox" aria-label={`Select ${row.number}`} checked={checked.includes(row._id)} onChange={() => setChecked((previous) => previous.includes(row._id) ? previous.filter((id) => id !== row._id) : [...previous, row._id])} /></td><td className="asm-date">{dateText(row.date)}</td><td>{row.number || '—'}</td><td><Link className="asm-product" to={`/products?search=${encodeURIComponent(row.code || row.productName || '')}`}>{row.productName || '—'}</Link><small>{row.variantName || '—'}</small></td><td>{row.code || row.partNumber || '—'}</td><td>{row.warehouse || '—'}</td><td><span className={`asm-source ${row.type === 'Adjustment' ? 'asm-adjustment' : inward ? 'asm-in' : 'asm-out'}`}>{row.type === 'Adjustment' ? 'Earlier Adjustment' : row.type}</span></td><td>{row.sourceNo || row.referenceNo ? <Link className="asm-document" to={sourceLink(row)}>{row.sourceNo || row.referenceNo}</Link> : '—'}</td><td className={inward ? 'autop-stock' : 'autop-low'}>{count(row.quantity)}</td><td className="autop-price">{row.rate == null ? '—' : money(row.rate)}</td><td className="autop-price">{money(row.value)}</td><td><span className={`asm-status ${row.status === 'Completed' ? 'asm-posted' : 'asm-pending'}`}>{row.status === 'Completed' ? 'Posted' : row.status || 'Pending'}</span></td><td><Link className="asm-view" aria-label={`View source or movement history for ${row.number}`} title="View source or movement history" to={sourceLink(row)}><Eye size={15} /></Link></td></BulkDeleteRow>)}</tbody></BulkDeleteTable></div>
    <footer className="autop-pagination"><div className="autop-page-size"><span>Rows per page</span><Dropdown label="Movements per page" value={size} options={[10, 25, 50, 100]} onChange={(next) => { setSize(Number(next)); setPage(1); }} /></div><span>{rows.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, filtered.length)} of {filtered.length.toLocaleString('en-IN')} movements</span><nav aria-label={`${title} pages`}><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>{Array.from({ length: Math.min(5, pages) }, (_, index) => Math.max(1, Math.min(currentPage - 2, pages - 4)) + index).map((next) => <button key={next} className={currentPage === next ? 'autop-primary' : ''} aria-current={currentPage === next ? 'page' : undefined} onClick={() => setPage(next)}>{next}</button>)}<button aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button></nav></footer></section><p className="asm-updated">Automatically refreshes every 30 seconds and when you return to this tab.{updatedAt ? ` Last updated ${new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.` : ''}</p>
  </div></div>;
}
