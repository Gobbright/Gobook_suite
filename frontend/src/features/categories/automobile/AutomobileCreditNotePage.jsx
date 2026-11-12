import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Eye, FileMinus, IndianRupee, MoreHorizontal, Plus, Printer, RefreshCw, Search, X } from "lucide-react";
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { downloadExcel } from '../../../utils/exportData.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { EMPTY_SALES_FILTERS } from '../../../components/forms/salesFilterDefaults.js';
import { readSalesListState, replaceSalesListQuery, salesListQuery } from '../../../components/forms/salesFilterUrlState.js';
import { useListKeyboardNav } from '../../../hooks/useListKeyboardNav.js';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { ShareModal } from '../retail/modules/sales/shared/ShareModal.jsx';
import { DocumentPdfDownload } from '../retail/modules/sales/shared/DocumentPdfDownload.jsx';
import { DocumentPreviewModal } from '../retail/modules/sales/shared/DocumentPreviewModal.jsx';
import { documentConfigs } from '../retail/modules/sales/documentConfigs.js';
import { creditAmounts, creditDate, creditId, creditPrintDocument, creditStats, creditStatus, filterCreditNotes } from "./automobileCreditNotes.js";
import './automobileCreditNotes.css';

const STATUSES = ['Posted', 'Not Posted', 'Posting Not Recorded', 'Draft', 'Cancelled'];
const EMPTY_FILTERS = { from: '', to: '', customer: '', status: '', search: '' };
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const tone = (note) => ({ Posted: 'green', 'Not Posted': 'amber', 'Posting Not Recorded': 'neutral', Cancelled: 'red', Draft: 'neutral' }[creditStatus(note)]);
function Status({ note }) { return <span className={`acn-badge ${tone(note)}`}>{creditStatus(note)}</span>; }
function OriginalInvoice({ note }) {
  const number = note.extra?.originalInvoiceNo || note.extra?.originalRef;
  return number ? <Link to={note.extra?.originalSalesId ? `/billing/invoice/${note.extra.originalSalesId}/view` : `/billing/invoice?search=${encodeURIComponent(number)}`}>{number}</Link> : '—';
}
function NoteMenu({ note, query, onPrint, onPdf, onShare, onDelete }) {
  const navigate = useNavigate();
  return <SelectDropdown aria-label={`Actions for ${note.number}`} value="" placeholder={<MoreHorizontal size={19} />} options={[{ value: 'view', label: 'View full details' }, { value: 'edit', label: 'Edit' }, { value: 'print', label: 'Print (A4)' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share credit note' }, { value: 'delete', label: 'Delete' }]} hideChevron portal buttonClassName="acn-menu" menuClassName="acn-action-menu" onChange={(action) => {
    if (action === 'view' || action === 'edit') navigate(`/billing/credit-note/${creditId(note)}/${action}${query}`);
    else ({ print: onPrint, pdf: onPdf, share: onShare, delete: onDelete })[action]?.(note);
  }} />;
}
function DeleteDialog({ note, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="acn-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="acn-delete-title"><h2 id="acn-delete-title">Delete credit note?</h2><p>{note.number} will be permanently deleted. Its accounting posting will be reversed, removing this credit from the customer balance.</p>{error && <p className="acn-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="acn-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}


export function AutomobileCreditNotePage() {
  const location = useLocation(); const initial = useMemo(() => readSalesListState(), []);
  const [filters, setFilters] = useState(() => ({ from: initial.dateFrom, to: initial.dateTo, customer: initial.filters.customer, search: initial.search, status: new URLSearchParams(location.search).get('postingStatus') || '' }));
  const [extraFilters, setExtraFilters] = useState(() => ({ ...initial.filters, customer: '' }));
  const [notes, setNotes] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [page, setPage] = useState(1); const [size, setSize] = useState(10); const [checked, setChecked] = useState([]); const [detail, setDetail] = useState({}); const [detailRefresh, setDetailRefresh] = useState(0);
  const [settings, setSettings] = useState({}); const [printDoc, setPrintDoc] = useState(null); const [pdfDoc, setPdfDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null); const [busy, setBusy] = useState(false); const [deleteError, setDeleteError] = useState('');
  const searchRef = useRef(null); const allRef = useRef(null);
  const query = useMemo(() => { const base = salesListQuery({ filters: { ...extraFilters, customer: filters.customer }, dateFrom: filters.from, dateTo: filters.to, search: filters.search }); return `${base}${filters.status ? `${base ? '&' : '?'}postingStatus=${encodeURIComponent(filters.status)}` : ''}`; }, [filters, extraFilters]);
  useEffect(() => { replaceSalesListQuery(location.pathname, query); }, [location.pathname, query]);
  const load = useCallback(async (active = () => true) => {
    setLoading(true); setError('');
    try {
      const data = []; let current = 1;
      while (active()) {
        const result = await api.listCreditNotes({ ...extraFilters, page: current, limit: 500 }); const rows = Array.isArray(result.data) ? result.data : []; data.push(...rows);
        if (!rows.length || data.length >= (Number(result.total) || rows.length)) break;
        current++;
      }
      if (active()) setNotes(data);
    } catch (failure) { if (active()) setError(failure.message || 'Unable to load credit notes.'); }
    finally { if (active()) setLoading(false); }
  }, [extraFilters]);
  useEffect(() => { let active = true; load(() => active); return () => { active = false; }; }, [load]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterCreditNotes(notes, filters), [notes, filters]); const stats = useMemo(() => creditStats(notes), [notes]);
  const customers = useMemo(() => [...new Set(notes.map((note) => note.customer?.name).filter(Boolean))].sort(), [notes]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const selected = rows.find((row) => checked.includes(creditId(row))) || rows[0] || null; const selectedKey = selected ? creditId(selected) : '';
  useEffect(() => {
    if (!selectedKey) return undefined;
    let active = true; setDetail({ id: selectedKey, loading: true });
    api.getCreditNote(selectedKey).then((note) => { if (active) setDetail({ id: selectedKey, note }); }).catch((failure) => { if (active) setDetail({ id: selectedKey, error: failure.message || 'Unable to refresh details.' }); });
    return () => { active = false; };
  }, [selectedKey, detailRefresh]);
  const allChecked = rows.length > 0 && rows.every((note) => checked.includes(creditId(note)));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((note) => checked.includes(creditId(note))); }, [rows, checked, allChecked]);
  const select = (note) => window.location.assign(`/billing/credit-note/${creditId(note)}/view${query}`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const change = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); };
  const print = (note, format = 'normal') => setPrintDoc({ ...creditPrintDocument(note), extra: { ...note.extra, invoicePrintFormat: format } });
  const share = (note) => setShareDoc({ ...note, id: creditId(note), total: creditAmounts(note).finalTotal });
  const requestDelete = (note) => { setDeleteError(''); setDeleteDoc(note); };
  async function remove() {
    if (!deleteDoc || busy) return;
    setBusy(true); setDeleteError('');
    try { await api.deleteCreditNote(creditId(deleteDoc)); setNotes((previous) => previous.filter((note) => creditId(note) !== creditId(deleteDoc))); setChecked((previous) => previous.filter((id) => id !== creditId(deleteDoc))); setDeleteDoc(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this credit note.'); }
    finally { setBusy(false); }
  }
  function exportNotes() {
    downloadExcel({ title: 'Credit Notes', filename: 'automobile-credit-notes', rows: checked.length ? notes.filter((note) => checked.includes(creditId(note))) : filtered, columns: [{ label: 'Credit Note No.', value: (note) => note.number }, { label: 'Date', value: creditDate }, { label: 'Original Invoice', value: (note) => note.extra?.originalInvoiceNo || note.extra?.originalRef || '' }, { label: 'Customer', value: (note) => note.customer?.name || '' }, { label: 'Adjustment Reason', value: (note) => note.extra?.reason || '' }, { label: 'Amount', value: (note) => creditAmounts(note).taxable }, { label: 'Tax Adjustment', value: (note) => { const value = creditAmounts(note); return value.totalGst + value.chargesGst; } }, { label: 'Total Credit', value: (note) => creditAmounts(note).finalTotal }, { label: 'Status', value: creditStatus }] });
  }
  const cards = [['Total Credit Notes', stats.total, FileMinus, 'purple', 'All credit notes'], ['Credit Value', money(stats.value), IndianRupee, 'green', 'Excludes drafts and cancellations'], ['Posting Not Confirmed', stats.pending, Clock3, 'amber', 'Review accounting status'], ['Posted', stats.posted, CheckCircle2, 'green', 'Accounting posting recorded'], ['Issued This Month', stats.issued, CalendarDays, 'blue', 'Posted notes dated this month']];
  const menus = { query, onPrint: print, onPdf: setPdfDoc, onShare: share, onDelete: requestDelete };
  return <div className="automobile-credit-notes"><header className="acn-header"><div><h1>Credit Note</h1><p>Create and manage credit notes for sales adjustments and customer credits.</p></div><div><button type="button" onClick={exportNotes} disabled={loading || !(checked.length || filtered.length)}><Download size={17} />Export{checked.length ? ` (${checked.length})` : ''}</button><SelectDropdown aria-label="Print credit note" value="" placeholder={<><Printer size={17} />Print</>} disabled={!selected} options={[{ value: 'normal', label: 'Selected note (A4)' }, { value: 'thermal80', label: 'Selected note (Thermal)' }]} portal onChange={(format) => selected && print(detail.id === selectedKey && detail.note || selected, format)} /><Link className="acn-primary" to="/billing/credit-note/new"><Plus size={18} />New Credit Note</Link></div></header>
    {error && <div className="acn-error" role="alert">{error}<button type="button" onClick={() => load()}><RefreshCw size={15} />Retry</button></div>}
    <div className="acn-workspace"><div className="acn-main"><div className="acn-stats">{cards.map(([label, value, Icon, color, hint]) => <article className="acn-card" key={label}><span className={`acn-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>{hint}</p></div></article>)}</div>
      <form className="acn-card acn-filters" onSubmit={(event) => event.preventDefault()}><fieldset><legend>Date Range</legend><input type="date" aria-label="Credit from date" value={filters.from} onChange={(event) => change('from', event.target.value)} /><span>–</span><input type="date" aria-label="Credit to date" min={filters.from || undefined} value={filters.to} onChange={(event) => change('to', event.target.value)} /></fieldset><label>Customer<SelectDropdown aria-label="Filter customer" value={filters.customer} onChange={(value) => change('customer', value)} options={[{ value: '', label: 'All Customers' }, ...customers.map((value) => ({ value, label: value }))]} searchable portal /></label><label>Status<SelectDropdown aria-label="Filter credit status" value={filters.status} onChange={(value) => change('status', value)} options={[{ value: '', label: 'All Status' }, ...STATUSES.map((value) => ({ value, label: value }))]} portal /></label><div className="acn-search"><Search size={16} /><input ref={searchRef} aria-label="Search credit notes" placeholder="Search by credit note no. or original invoice…" value={filters.search} onChange={(event) => change('search', event.target.value)} /></div><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setExtraFilters(EMPTY_SALES_FILTERS); setPage(1); }}><X size={15} />Clear</button></form>
      {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="acn-error">End date must be on or after the start date.</p>}
      <section className="acn-card acn-register" aria-label="Credit note list"><div className="acn-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteCreditNote(creditId(record))} onDeleted={ids => load()} canDelete={record => record.lifecycleStatus !== 'cancelled'} className="acn-table"><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all credit notes on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((note) => creditId(note) === id)) : [...new Set([...previous, ...rows.map(creditId)])])} /></th><th>#</th><th>Credit Note No.</th><th>Original Invoice</th><th>Customer</th><th>Adjustment Reason</th><th>Amount (₹)</th><th>Tax Adj. (₹)</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={10} className="acn-empty">Loading credit notes…</td></tr> : !rows.length ? <tr><td colSpan={10} className="acn-empty">{notes.length ? 'No credit notes match these filters.' : 'No credit notes yet. Create your first credit note.'}</td></tr> : rows.map((note, index) => { const amounts = creditAmounts(note); return <BulkDeleteRow record={note} key={creditId(note)} className={checked.includes(creditId(note)) || highlightedIndex === index ? 'acn-selected' : ''}><td><input type="checkbox" aria-label={`Select ${note.number}`} checked={checked.includes(creditId(note))} onChange={() => setChecked((previous) => previous.includes(creditId(note)) ? previous.filter((id) => id !== creditId(note)) : [...previous, creditId(note)])} /></td><td>{(currentPage - 1) * size + index + 1}</td><td><button type="button" className="acn-number" onClick={() => select(note)}>{note.number}</button><small>{dateText(creditDate(note))}</small></td><td><OriginalInvoice note={note} /></td><td>{note.customer?.name || '—'}{note.customer?.city && <small>{note.customer.city}</small>}</td><td>{note.extra?.reason || '—'}</td><td>{money(amounts.taxable)}</td><td>{money(amounts.totalGst + amounts.chargesGst)}</td><td><Status note={note} /></td><td><div className="acn-row-actions"><button type="button" aria-label={`View ${note.number}`} onClick={() => select(note)}><Eye size={17} /></button><NoteMenu note={note} {...menus} /></div></td></BulkDeleteRow>; })}</tbody></BulkDeleteTable></div>
        <footer className="acn-pagination"><SelectDropdown aria-label="Credit notes per page" value={String(size)} onChange={(value) => { setSize(Number(value)); setPage(1); }} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} entries` }))} portal /><span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0} – {Math.min(currentPage * size, filtered.length)} of {filtered.length} credit notes</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-current={value === currentPage ? 'page' : undefined} className={value === currentPage ? 'acn-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></footer>
      </section></div></div>
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={creditPrintDocument(pdfDoc)} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['credit-note']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={creditAmounts(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} shipping={printDoc.shipping} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteDoc && <DeleteDialog note={deleteDoc} busy={busy} error={deleteError} onClose={() => setDeleteDoc(null)} onDelete={remove} />}
  </div>;
}
