import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, FileText, Filter, IndianRupee, MoreVertical, Package, Plus, RefreshCw, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { downloadExcel } from '../../../utils/exportData.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useListKeyboardNav } from '../../../hooks/useListKeyboardNav.js';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { SalesWorkflowDialog } from '../retail/modules/sales/shared/SalesWorkflowDialog.jsx';
import { ShareModal } from '../retail/modules/sales/shared/ShareModal.jsx';
import { DocumentPdfDownload, calcDocumentTotals } from '../retail/modules/sales/shared/DocumentPdfDownload.jsx';
import { DocumentPreviewModal } from '../retail/modules/sales/shared/DocumentPreviewModal.jsx';
import { documentConfigs } from '../retail/modules/sales/documentConfigs.js';
import { filterSalesReturns, returnAmounts, returnDate, returnId, returnState, returnStatus, returnStockStatus, salesReturnStats } from "./automobileSalesReturns.js";
import './automobileSalesReturns.css';

const EMPTY_FILTERS = { search: '', customer: '', status: '', from: '', to: '', view: '' };
const dateText = (date) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const STATUS_OPTIONS = [{ value: '', label: 'All Status' }, { value: 'requested', label: 'Under Review' }, { value: 'received', label: 'Ready to Settle' }, { value: 'completed', label: 'Completed' }];
const stockTone = (value) => ['Restocked', 'No Stock Movement'].includes(value) ? 'green' : value === 'Partly Restocked' ? 'purple' : value === 'Not Restocked' ? 'red' : ['To Receive', 'To Inspect'].includes(value) ? 'amber' : 'neutral';
const statusTone = (note) => ({ requested: 'amber', received: 'purple', completed: 'green' }[returnState(note)] || 'neutral');

function Badge({ label, tone = 'neutral' }) { return <span className={`asr-badge ${tone}`}>{label}</span>; }

function Sparkline({ values, tone }) {
  const id = useId(); const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => `${3 + index * 11},${38 - value / maximum * 31}`).join(' ');
  return <svg className={`asr-sparkline ${tone}`} viewBox="0 0 72 44" role="img" aria-label="Return activity over the last seven days"><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><polygon points={`3,43 ${points} 69,43`} fill={`url(#${id})`} /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function ReturnMenu({ note, onWorkflow, onPdf, onPrint, onShare, onDelete }) {
  const navigate = useNavigate();
  const options = [
    { value: 'view', label: 'View full details' },
    { value: 'workflow', label: returnState(note) === 'requested' ? 'Receive return' : returnState(note) === 'received' ? 'Inspect return' : 'Workflow history' },
    { value: 'edit', label: 'Edit', disabled: returnState(note) !== 'requested', title: 'Only return requests can be edited. Use Workflow for received returns.' },
    { value: 'print', label: 'Print return' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share return' },
    { value: 'delete', label: 'Delete', disabled: returnState(note) !== 'requested', title: 'Only return requests can be deleted.' },
  ];
  return <RowActionsMenu aria-label={`Actions for ${note.number}`} value="" placeholder={<MoreVertical size={17} />} options={options} hideChevron portal buttonClassName="asr-menu-trigger" onChange={(action) => {
    if (action === 'view' || action === 'edit') navigate(`/billing/sales-return/${returnId(note)}/${action}`);
    else ({ workflow: onWorkflow, pdf: onPdf, print: onPrint, share: onShare, delete: onDelete })[action]?.(note);
  }} />;
}

function DeleteRequestDialog({ note, busy, error, onClose, onConfirm }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="asr-delete-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="asr-delete-title"><h2 id="asr-delete-title">Delete return request?</h2><p>{note.number} will be deleted. Received and completed returns cannot be deleted.</p>{error && <p role="alert" className="asr-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="asr-danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}



export function AutomobileSalesReturnPage() {
  const [notes, setNotes] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [search, setSearch] = useState('');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState([]);
  const [workflowDoc, setWorkflowDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null); const [pdfDoc, setPdfDoc] = useState(null); const [printDoc, setPrintDoc] = useState(null);
  const [settings, setSettings] = useState({}); const [deleteTarget, setDeleteTarget] = useState(null); const [deleting, setDeleting] = useState(false); const [deleteError, setDeleteError] = useState('');
  const searchRef = useRef(null); const selectAllRef = useRef(null);
  const loadReturns = useCallback(async (isActive = () => true) => {
    setLoading(true); setError('');
    try {
      const data = []; let current = 1;
      while (isActive()) {
        const response = await api.listSalesReturns({ page: current, limit: 500 });
        const rows = Array.isArray(response.data) ? response.data : []; data.push(...rows);
        if (!rows.length || data.length >= (Number(response.total) || rows.length)) break;
        current++;
      }
      if (isActive()) setNotes(data);
    } catch (failure) { if (isActive()) { setError(failure.message || 'Unable to load sales returns.'); throw failure; } }
    finally { if (isActive()) setLoading(false); }
  }, []);
  useEffect(() => { let active = true; loadReturns(() => active).catch(() => {}); return () => { active = false; }; }, [loadReturns]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);

  const stats = useMemo(() => salesReturnStats(notes), [notes]);
  const filtered = useMemo(() => filterSalesReturns(notes, filters), [notes, filters]);
  const customers = useMemo(() => [...new Set(notes.map((note) => note.customer?.name).filter(Boolean))].sort(), [notes]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, totalPages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = rows.find((row) => checked.includes(returnId(row))) || rows[0] || null;
  const allChecked = rows.length > 0 && rows.every((note) => checked.includes(returnId(note)));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = !allChecked && rows.some((note) => checked.includes(returnId(note))); }, [rows, checked, allChecked]);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => selectNote(rows[index]) });
  const updateFilter = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); };
  const selectNote = (note) => window.location.assign(`/billing/sales-return/${returnId(note)}/view`);
  const share = (note) => setShareDoc({ ...note, id: returnId(note), total: returnAmounts(note).total });
  const requestDelete = (note) => { setDeleteError(''); setDeleteTarget(note); };
  async function deleteRequest() {
    if (!deleteTarget || returnState(deleteTarget) !== 'requested') return;
    setDeleting(true); setDeleteError('');
    try { await api.deleteSalesReturn(returnId(deleteTarget)); setNotes((previous) => previous.filter((note) => returnId(note) !== returnId(deleteTarget))); setChecked((previous) => previous.filter((id) => id !== returnId(deleteTarget))); setDeleteTarget(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this request.'); }
    finally { setDeleting(false); }
  }
  function exportReturns() {
    downloadExcel({ title: 'Sales Returns', filename: 'automobile-sales-returns', rows: checked.length ? notes.filter((note) => checked.includes(returnId(note))) : filtered, columns: [
      { label: 'Return No.', value: (note) => note.number }, { label: 'Original Invoice', value: (note) => note.extra?.originalInvoiceNo || note.extra?.originalRef || '' },
      { label: 'Customer', value: (note) => note.customer?.name || '' }, { label: 'Return Date', value: (note) => dateText(returnDate(note)) },
      { label: 'Return Value', value: (note) => returnAmounts(note).total }, { label: 'Stock Status', value: returnStockStatus }, { label: 'Settlement Status', value: returnStatus },
    ] });
  }
  const cards = [['Total Returns', stats.total, RotateCcw, 'red', 'total', 'All return requests'], ['Return Value', money(stats.value), IndianRupee, 'blue', 'value', 'Total return value'], ['Needs Review', stats.review, ShieldAlert, 'amber', 'review', 'Awaiting goods receipt'], ['Ready to Settle', stats.ready, Package, 'purple', 'ready', 'Received, pending inspection'], ['Completed', stats.completed, CheckCircle2, 'green', 'completed', 'Inspection finalized']];
  return <div className="automobile-sales-returns">
    <header className="asr-header"><div><h1>Sales Return</h1><p>Manage customer returns, inspect returned items, and track restock and credit status.</p></div><div><button type="button" onClick={exportReturns} disabled={loading || !(checked.length || filtered.length)}><Download size={17} />Export{checked.length ? ` (${checked.length})` : ''}</button><Link className="asr-primary" to="/billing/sales-return/new"><Plus size={18} />New Sales Return</Link></div></header>
    <div className="asr-stats">{cards.map(([label, value, Icon, tone, key, hint]) => <article className="asr-card" key={key}><span className={`asr-stat-icon ${tone}`}><Icon size={26} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>{hint}</p></div><Sparkline values={stats.trends[key]} tone={tone} /></article>)}</div>
    {error && <div className="asr-error" role="alert">{error}<button type="button" onClick={() => loadReturns().catch(() => {})}><RefreshCw size={14} />Retry</button></div>}
    <div className="asr-workspace"><div className="asr-main">
      <form className="asr-card asr-filters" onSubmit={(event) => { event.preventDefault(); updateFilter('search', search); }}><fieldset><legend>Date Range</legend><input type="date" aria-label="Return from date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /><span>–</span><input type="date" aria-label="Return to date" min={filters.from || undefined} value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></fieldset><label>Customer<SelectDropdown aria-label="Filter customer" value={filters.customer} onChange={(value) => updateFilter('customer', value)} options={[{ value: '', label: 'All Customers' }, ...customers.map((value) => ({ value, label: value }))]} searchable portal /></label><label>Status<SelectDropdown aria-label="Filter status" value={filters.status} onChange={(value) => updateFilter('status', value)} options={STATUS_OPTIONS} portal /></label><div className="asr-search"><Search size={16} /><input ref={searchRef} aria-label="Search returns" placeholder="Search by return no. or original invoice…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button type="submit"><Filter size={16} />Filter</button><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); setPage(1); }}>Clear</button></form>
      {filters.from && filters.to && filters.from > filters.to && <p className="asr-error" role="alert">End date must be on or after the start date.</p>}
      <section className="asr-card asr-register"><header><h2><FileText size={22} />Sales Return List ({filtered.length})</h2><label>View:<SelectDropdown aria-label="Return view" value={filters.view} onChange={(value) => updateFilter('view', value)} options={[{ value: '', label: 'All Returns' }, { value: 'pending', label: 'Pending Inspection' }, { value: 'Restocked', label: 'Restocked' }, { value: 'Partly Restocked', label: 'Partly Restocked' }, { value: 'Not Restocked', label: 'Not Restocked' }]} portal /></label></header>
        <div className="asr-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteSalesReturn(returnId(record))} onDeleted={ids => loadReturns()} canDelete={record => record.lifecycleStatus !== 'cancelled'} className="asr-table"><thead><tr><th><input type="checkbox" ref={selectAllRef} aria-label="Select all returns on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((note) => returnId(note) === id)) : [...new Set([...previous, ...rows.map(returnId)])])} /></th><th>#</th><th>Return No.</th><th>Original Invoice</th><th>Customer</th><th>Return Date</th><th>Return Value (₹)</th><th>Stock Status</th><th>Settlement Status</th><th>Actions</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={10} className="asr-empty">Loading sales returns…</td></tr> : rows.length ? rows.map((note, index) => <BulkDeleteRow record={note} key={returnId(note)} className={checked.includes(returnId(note)) || highlightedIndex === index ? 'asr-selected' : ''}><td><input type="checkbox" aria-label={`Select ${note.number}`} checked={checked.includes(returnId(note))} onChange={() => setChecked((previous) => previous.includes(returnId(note)) ? previous.filter((id) => id !== returnId(note)) : [...previous, returnId(note)])} /></td><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button type="button" className="asr-number" onClick={() => selectNote(note)}>{note.number}</button></td><td>{note.extra?.originalSalesId ? <Link to={`/billing/invoice/${note.extra.originalSalesId}/view`}>{note.extra.originalInvoiceNo || note.extra.originalRef || 'Original invoice'}</Link> : note.extra?.originalInvoiceNo || note.extra?.originalRef || '—'}</td><td>{note.customer?.name || '—'}</td><td>{dateText(returnDate(note))}</td><td className="asr-amount">{money(returnAmounts(note).total)}</td><td><Badge label={returnStockStatus(note)} tone={stockTone(returnStockStatus(note))} /></td><td><Badge label={returnStatus(note)} tone={statusTone(note)} /></td><td><ReturnMenu note={note} onWorkflow={setWorkflowDoc} onPrint={setPrintDoc} onPdf={setPdfDoc} onShare={share} onDelete={requestDelete} /></td></BulkDeleteRow>) : <tr><td colSpan={10} className="asr-empty">{notes.length ? 'No returns match your filters.' : 'No sales returns yet. New return requests will appear here.'}</td></tr>}
        </tbody></BulkDeleteTable></div>
        <footer className="asr-pagination"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} returns</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + index).map((number) => <button type="button" key={number} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'asr-primary' : ''} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button></div><SelectDropdown aria-label="Returns per page" value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} options={[10, 25, 50].map((value) => ({ value, label: `${value} per page` }))} portal /></footer>
      </section>
    </div></div>
    {workflowDoc && <SalesWorkflowDialog document={{ ...workflowDoc, id: returnId(workflowDoc) }} isReturn onClose={() => setWorkflowDoc(null)} onComplete={() => loadReturns()} />}
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}
    {pdfDoc && <DocumentPdfDownload doc={pdfDoc} bizSettings={settings} onDone={() => setPdfDoc(null)} />}
    {printDoc && <DocumentPreviewModal config={documentConfigs['sales-return']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={{ ...calcDocumentTotals(printDoc.items, printDoc.charges, printDoc.additionalDiscount, printDoc.tds, printDoc.tcs, 0), ...printDoc.totals, finalTotal: returnAmounts(printDoc).total }} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} bizSettings={printDoc.businessSettingsSnapshot || settings} onClose={() => setPrintDoc(null)} />}
    {deleteTarget && <DeleteRequestDialog note={deleteTarget} busy={deleting} error={deleteError} onClose={() => setDeleteTarget(null)} onConfirm={deleteRequest} />}
  </div>;
}
