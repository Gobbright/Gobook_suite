import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, FileText, IndianRupee, MoreHorizontal, Pencil, Plus, Printer, RefreshCw, Search, Trash2, Wallet } from 'lucide-react';
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { ExportButtons } from '../../../components/forms/ExportButtons.jsx';
import { SalesFilterBar } from '../../../components/forms/SalesFilterBar.jsx';
import { EMPTY_SALES_FILTERS } from '../../../components/forms/salesFilterDefaults.js';
import { readSalesListState, replaceSalesListQuery, salesListQuery } from '../../../components/forms/salesFilterUrlState.js';
import { useListKeyboardNav } from '../../../hooks/useListKeyboardNav.js';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { ShareModal } from '../retail/modules/sales/shared/ShareModal.jsx';
import { DocumentPdfDownload } from '../retail/modules/sales/shared/DocumentPdfDownload.jsx';
import { DocumentPreviewModal } from '../retail/modules/sales/shared/DocumentPreviewModal.jsx';
import { documentConfigs } from '../retail/modules/sales/documentConfigs.js';
import { filterSupplierReturns, SUPPLIER_RETURN_STATUSES, supplierReturnAmounts, supplierReturnPrintDocument, supplierReturnRow, supplierReturnStatus, supplierReturnStats } from './automobileSupplierReturns.js';
import './automobilePurchaseOrders.css';
import './automobileSupplierReturns.css';

const dateText = (date) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
function DeleteDialog({ orders, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="apo-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="apo-delete-title"><h2 id="apo-delete-title">Delete {orders.length === 1 ? orders[0].number : `${orders.length} supplier returns`}?</h2><p>The selected supplier returns will be permanently deleted. Deletion reverses stock and accounting through the existing supplier return workflow.</p>{error && <p role="alert" className="apo-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="apo-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}
export function AutomobileSupplierReturnPage() {
  const location = useLocation(); const initial = useMemo(() => readSalesListState(), []);
  const [filters, setFilters] = useState(initial.filters); const [search, setSearch] = useState(initial.search); const [from, setFrom] = useState(initial.dateFrom); const [to, setTo] = useState(initial.dateTo); const [status, setStatus] = useState(() => new URLSearchParams(location.search).get('returnStatus') || '');
  const [orders, setOrders] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [settings, setSettings] = useState({});
  const [page, setPage] = useState(1); const [size, setSize] = useState(10); const [checked, setChecked] = useState([]); const [advanced, setAdvanced] = useState(false);
  const [printDoc, setPrintDoc] = useState(null); const [pdfDoc, setPdfDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null);
  const [deleteOrders, setDeleteOrders] = useState(null); const [deleteError, setDeleteError] = useState(''); const [busy, setBusy] = useState(false);
  const searchRef = useRef(null); const allRef = useRef(null); const loadVersion = useRef(0); const deleteLock = useRef(false);
  const query = useMemo(() => { const params = new URLSearchParams(salesListQuery({ filters, search, dateFrom: from, dateTo: to })); if (status) params.set('returnStatus', status); return params.size ? `?${params}` : ''; }, [filters, search, from, to, status]);
  useEffect(() => { replaceSalesListQuery(location.pathname, query); }, [location.pathname, query]);
  const load = useCallback(async () => {
    const version = ++loadVersion.current; setLoading(true); setError('');
    async function all() { const data = []; let current = 1;
      while (version === loadVersion.current) { const response = await api.listSupplierReturns({ page: current, limit: 100 }); const rows = Array.isArray(response.data) ? response.data : []; data.push(...rows); if (!rows.length || data.length >= (Number(response.total) || rows.length)) break; current++; } return data;
    }
    try { const documents = await all(); if (version === loadVersion.current) setOrders(documents.map((doc) => supplierReturnRow(doc))); }
    catch (failure) { if (version === loadVersion.current) setError(failure.message || 'Unable to load supplier returns.'); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, []);
  const cancelLoad = useCallback(() => { loadVersion.current++; }, []);
  useEffect(() => { load(); return cancelLoad; }, [load, cancelLoad]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterSupplierReturns(orders, { ...filters, search, from, to, status }), [orders, filters, search, from, to, status]);
  useEffect(() => { setPage(1); }, [filters, search, from, to, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const selected = rows.find((order) => checked.includes(order.id)) || rows[0] || null;
  const allChecked = filtered.length > 0 && filtered.every((order) => checked.includes(order.id));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && filtered.some((order) => checked.includes(order.id)); }, [allChecked, filtered, checked]);
  useEffect(() => { const available = new Set(orders.map((order) => order.id)); setChecked((previous) => previous.filter((id) => available.has(id))); }, [orders]);
  const selectedOrders = filtered.filter((order) => checked.includes(order.id));
  const select = (order) => window.location.assign(`/billing/supplier-return/${order.id}/view${query}`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const change = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }));
  const clear = () => { setFilters(EMPTY_SALES_FILTERS); setSearch(''); setFrom(''); setTo(''); setStatus(''); };
  const refresh = () => load();
  const print = (order) => setPrintDoc(supplierReturnPrintDocument(order)); const share = (order) => setShareDoc({ ...order, id: order.id, total: order.total });
  const requestDelete = (items) => { setDeleteError(''); setDeleteOrders(Array.isArray(items) ? items : [items]); };
  async function remove() {
    if (!deleteOrders?.length || deleteLock.current) return; deleteLock.current = true; setBusy(true); setDeleteError('');
    const results = await Promise.allSettled(deleteOrders.map((order) => api.deleteSupplierReturn(order.id)));
    const removed = new Set(deleteOrders.filter((_, index) => results[index].status === 'fulfilled').map((order) => order.id));
    setOrders((previous) => previous.filter((order) => !removed.has(order.id))); setChecked((previous) => previous.filter((id) => !removed.has(id)));
    const failed = deleteOrders.filter((_, index) => results[index].status === 'rejected');
    if (failed.length) { setDeleteOrders(failed); setDeleteError(results.find((result) => result.status === 'rejected').reason?.message || 'Unable to delete some supplier returns.'); } else setDeleteOrders(null);
    deleteLock.current = false; setBusy(false);
  }
  const stats = supplierReturnStats(orders);
  const cards = [['Total Returns', stats.count, FileText, 'blue'], ['Return Value', money(stats.value), IndianRupee, 'green'], ['Not Posted', stats.unposted, Clock3, 'amber'], ['Ledger Credit Posted', money(stats.credit), Wallet, 'purple'], ['Returned Goods Qty', stats.quantity, RefreshCw, 'green'], ['Posted Returns', stats.posted, CheckCircle2, 'green']];
  const columns = [{ label: 'Return No.', value: (note) => note.number }, { label: 'Original Purchase', value: (note) => note.originalRef }, { label: 'Supplier', value: (note) => note.customer?.name }, { label: 'Return Date', value: (note) => note.date }, { label: 'Reason', value: (note) => note.reason }, { label: 'Taxable Amount', value: (note) => note.taxable }, { label: 'GST', value: (note) => note.gst }, { label: 'Return Value', value: (note) => note.total }, { label: 'Returned Goods Qty', value: (note) => note.goodsQty }, { label: 'Settlement', value: (note) => note.settlement }, { label: 'Status', value: supplierReturnStatus }];
  return <div className="automobile-purchase-orders automobile-supplier-returns"><header className="apo-header"><div><h1>Supplier Returns</h1><p>Manage returned purchase items and track supplier ledger postings.</p></div><div><ExportButtons title="Supplier Returns" filename="automobile-supplier-returns" rows={selectedOrders.length ? selectedOrders : filtered} columns={columns} /><button type="button" disabled={!selected || loading} onClick={() => print(selected)}><Printer size={16} />Print</button><Link className="apo-primary" to={`/billing/supplier-return/new${query}`}><Plus size={17} />New Supplier Return</Link></div></header>
    {error && <div className="apo-error" role="alert">{error}<button type="button" onClick={refresh}>Retry</button></div>}
    <section className="apo-stats" aria-label="Supplier return summary">{cards.map(([label, value, Icon, color]) => <article className="apo-card" key={label}><span className={`apo-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>Based on saved records</p></div></article>)}</section>
    <div className="apo-workspace"><div className="apo-main">
    <section className="apo-card apo-filters"><fieldset><legend>Return Date Range</legend><input type="date" aria-label="Return from date" value={from} onChange={(event) => setFrom(event.target.value)} /><span>–</span><input type="date" aria-label="Return to date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></fieldset><label>Supplier<SelectDropdown aria-label="Filter return supplier" value={filters.customer || ''} options={[{ value: '', label: 'All Suppliers' }, ...[...new Set(orders.map((order) => order.customer?.name).filter(Boolean))].sort().map((value) => ({ value, label: value }))]} onChange={(value) => change('customer', value)} searchable portal /></label><label>Return Status<SelectDropdown aria-label="Filter return status" value={status} options={[{ value: '', label: 'All Status' }, ...SUPPLIER_RETURN_STATUSES.map((value) => ({ value, label: value }))]} onChange={setStatus} portal /></label><div className="apo-search"><Search size={16} /><input ref={searchRef} aria-label="Search supplier returns" placeholder="Return number, original purchase or supplier…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>More Filters</button><button type="button" onClick={clear}>Clear Filters</button>{advanced && <div className="apo-advanced"><SalesFilterBar filters={filters} onChange={change} fields={['gstType', 'city', 'state', 'supplyType', 'amountRange', 'itemType', 'hsn', 'productName', 'barcode']} /></div>}</section>
    {from && to && from > to && <p className="apo-error" role="alert">End date must be on or after the start date.</p>}
    <section className="apo-card apo-register"><header><h2><FileText size={19} />Supplier Return History ({filtered.length})</h2><div>{selectedOrders.length > 0 && <button type="button" className="apo-danger" disabled={busy} onClick={() => requestDelete(selectedOrders)}><Trash2 size={14} />Delete ({selectedOrders.length})</button>}<button type="button" aria-label="Refresh supplier returns" disabled={loading} onClick={refresh}><RefreshCw size={16} /></button></div></header><div className="apo-scroll"><table className="apo-table"><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all filtered supplier returns" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !filtered.some((order) => order.id === id)) : [...new Set([...previous, ...filtered.map((order) => order.id)])])} /></th>{['#', 'Return No.', 'Original Purchase', 'Supplier', 'Return Date', 'Return Value (₹)', 'Stock Impact', 'Settlement', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={11} className="apo-empty">Loading supplier returns…</td></tr> : !rows.length ? <tr><td colSpan={11} className="apo-empty">No supplier returns found. Create one or adjust the filters.</td></tr> : rows.map((order, index) => <tr key={order.id} className={checked.includes(order.id) || highlightedIndex === index ? 'apo-selected' : ''}><td><input type="checkbox" aria-label={`Select ${order.number}`} checked={checked.includes(order.id)} onChange={() => setChecked((previous) => previous.includes(order.id) ? previous.filter((id) => id !== order.id) : [...previous, order.id])} /></td><td>{(currentPage - 1) * size + index + 1}</td><td><button type="button" className="apo-number" onClick={() => select(order)}>{order.number}</button></td><td>{order.originalPurchaseId ? <Link to={`/billing/purchase-entry/${encodeURIComponent(order.originalPurchaseId)}/view`}>{order.originalRef || 'View Purchase'}</Link> : order.originalRef || '—'}</td><td>{order.customer?.name || '—'}</td><td>{dateText(order.date)}</td><td>{money(order.total)}</td><td className="asr-stock">{order.goodsQty > 0 ? `−${order.goodsQty}` : '0'}</td><td>{order.settlement}</td><td className="apo-status-cell"><span className={`apo-badge ${supplierReturnStatus(order) === 'Posted' ? 'paid' : supplierReturnStatus(order) === 'Cancelled' ? 'cancelled' : 'unpaid'}`}>{supplierReturnStatus(order)}</span></td><td><RowActionsMenu aria-label={`Actions for ${order.number}`} options={[{ value: 'view', label: 'View Supplier Return' }, { value: 'edit', label: 'Edit' }, { value: 'print', label: 'Print Return Note' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share' }, { value: 'delete', label: 'Delete' }]} onChange={(action) => { if (action === 'view' || action === 'edit') window.location.assign(`/billing/supplier-return/${order.id}/${action}${query}`); else ({ print, pdf: setPdfDoc, share, delete: requestDelete })[action]?.(order); }} disabled={busy} /></td></tr>)}</tbody></table></div>
    <footer className="apo-pagination"><span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0} to {Math.min(currentPage * size, filtered.length)} of {filtered.length} supplier returns</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-current={value === currentPage ? 'page' : undefined} className={value === currentPage ? 'apo-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div><SelectDropdown aria-label="Purchase entries per page" value={String(size)} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} / page` }))} onChange={(value) => { setSize(Number(value)); setPage(1); }} portal /></footer></section></div>
    </div>
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={supplierReturnPrintDocument(pdfDoc)} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['supplier-return']} customer={printDoc.customer || {}} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={supplierReturnAmounts(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} shipping={printDoc.shipping} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteOrders && <DeleteDialog orders={deleteOrders} busy={busy} error={deleteError} onClose={() => setDeleteOrders(null)} onDelete={remove} />}
  </div>;
}
