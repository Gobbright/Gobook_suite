import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, Eye, FilePlus, IndianRupee, MoreHorizontal, Plus, Printer, RefreshCw, Search, X } from 'lucide-react';
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
import { debitAmounts, debitDate, debitId, debitPrintDocument, debitStats, debitStatus, filterDebitNotes, debitRevisedTotal, invoiceLookupKey, resolveDebitInvoice } from './automobileDebitNotes.js';

import './automobileDebitNotes.css';

const STATUSES = ['Issued', 'Not Posted', 'Posting Not Recorded', 'Draft', 'Cancelled'];
const EMPTY_FILTERS = { from: '', to: '', customer: '', status: '', search: '' };
function useLinkedInvoices(rows) {
  const requests = useRef(new Map()); const [linked, setLinked] = useState({}); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    // Only resolve visible rows, and share requests for notes referencing the
    // same invoice. No financial write is performed during lookup.
    async function resolveRows() {
      for (let index = 0; index < rows.length && active; index += 3) {
        await Promise.all(rows.slice(index, index + 3).map(async (note) => {
          const key = invoiceLookupKey(note);
          if (!requests.current.has(key)) requests.current.set(key, resolveDebitInvoice(note, api).then((invoice) => ({ invoice })).catch((failure) => ({ error: failure.message || 'Unable to load linked invoice.' })));
          const result = await requests.current.get(key);
          if (active) setLinked((previous) => previous[key] === result ? previous : { ...previous, [key]: result });
        }));
      }
    }
    resolveRows(); return () => { active = false; };
  }, [rows, revision]);
  const retry = (note) => { const key = invoiceLookupKey(note); requests.current.delete(key); setLinked((previous) => ({ ...previous, [key]: undefined })); setRevision((value) => value + 1); };
  return { linked, retry };
}
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const tone = (note) => ({ Issued: 'green', 'Not Posted': 'amber', 'Posting Not Recorded': 'neutral', Cancelled: 'red', Draft: 'neutral' }[debitStatus(note)]);
function Status({ note }) { return <span className={`adn-badge ${tone(note)}`}>{debitStatus(note)}</span>; }
function OriginalInvoice({ note, invoice }) {
  const number = note.extra?.originalInvoiceNo || note.extra?.originalRef || invoice?.number;
  const id = note.extra?.originalSalesId || invoice?._id || invoice?.id;
  return number ? <Link to={id ? `/billing/invoice/${id}/view` : `/billing/invoice?search=${encodeURIComponent(number)}`}>{number}</Link> : '—';
}
function NoteMenu({ note, query, onPrint, onPdf, onShare, onDelete }) {
  const navigate = useNavigate();
  return <SelectDropdown aria-label={`Actions for ${note.number}`} value="" placeholder={<MoreHorizontal size={19} />} options={[{ value: 'view', label: 'View full details' }, { value: 'edit', label: 'Edit' }, { value: 'print', label: 'Print (A4)' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share debit note' }, { value: 'delete', label: 'Delete' }]} hideChevron portal buttonClassName="adn-menu" menuClassName="adn-action-menu" onChange={(action) => {
    if (action === 'view' || action === 'edit') navigate(`/billing/debit-note/${debitId(note)}/${action}${query}`);
    else ({ print: onPrint, pdf: onPdf, share: onShare, delete: onDelete })[action]?.(note);
  }} />;
}
function DeleteDialog({ note, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="adn-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="adn-delete-title"><h2 id="adn-delete-title">Delete debit note?</h2><p>{note.number} will be permanently deleted. Its accounting posting will be reversed, removing this debit from the customer balance.</p>{error && <p className="adn-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="adn-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}
export function AutomobileDebitNotePage() {
  const location = useLocation(); const initial = useMemo(() => readSalesListState(), []);
  const [filters, setFilters] = useState(() => ({ from: initial.dateFrom, to: initial.dateTo, customer: initial.filters.customer, search: initial.search, status: new URLSearchParams(location.search).get('postingStatus') || '' }));
  const [draftFilters, setDraftFilters] = useState(filters);
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
        const result = await api.listDebitNotes({ ...extraFilters, page: current, limit: 500 }); const rows = Array.isArray(result.data) ? result.data : []; data.push(...rows);
        if (!rows.length || data.length >= (Number(result.total) || rows.length)) break;
        current++;
      }
      if (active()) setNotes(data);
    } catch (failure) { if (active()) setError(failure.message || 'Unable to load debit notes.'); }
    finally { if (active()) setLoading(false); }
  }, [extraFilters]);
  useEffect(() => { let active = true; load(() => active); return () => { active = false; }; }, [load]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterDebitNotes(notes, filters), [notes, filters]); const stats = useMemo(() => debitStats(notes), [notes]);
  const customers = useMemo(() => [...new Set(notes.map((note) => note.customer?.name).filter(Boolean))].sort(), [notes]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages);
  const rows = useMemo(() => filtered.slice((currentPage - 1) * size, currentPage * size), [filtered, currentPage, size]);
  const { linked, retry: retryLink } = useLinkedInvoices(rows);
  const selected = rows.find((row) => checked.includes(debitId(row))) || rows[0] || null; const selectedKey = selected ? debitId(selected) : '';
  useEffect(() => {
    if (!selectedKey) return undefined;
    let active = true; setDetail({ id: selectedKey, loading: true });
    api.getDebitNote(selectedKey).then((note) => { if (active) setDetail({ id: selectedKey, note }); }).catch((failure) => { if (active) setDetail({ id: selectedKey, error: failure.message || 'Unable to refresh details.' }); });
    return () => { active = false; };
  }, [selectedKey, detailRefresh]);
  const allChecked = rows.length > 0 && rows.every((note) => checked.includes(debitId(note)));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((note) => checked.includes(debitId(note))); }, [rows, checked, allChecked]);
  const select = (note) => window.location.assign(`/billing/debit-note/${debitId(note)}/view${query}`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const change = (key, value) => { setDraftFilters((previous) => ({ ...previous, [key]: value })); };
  const print = (note, format = 'normal') => setPrintDoc({ ...debitPrintDocument(note), extra: { ...note.extra, invoicePrintFormat: format } });
  const share = (note) => setShareDoc({ ...note, id: debitId(note), total: debitAmounts(note).finalTotal });
  const requestDelete = (note) => { setDeleteError(''); setDeleteDoc(note); };
  async function remove() {
    if (!deleteDoc || busy) return;
    setBusy(true); setDeleteError('');
    try { await api.deleteDebitNote(debitId(deleteDoc)); setNotes((previous) => previous.filter((note) => debitId(note) !== debitId(deleteDoc))); setChecked((previous) => previous.filter((id) => id !== debitId(deleteDoc))); setDeleteDoc(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this debit note.'); }
    finally { setBusy(false); }
  }
  function exportNotes() {
    downloadExcel({ title: 'Debit Notes', filename: 'automobile-debit-notes', rows: checked.length ? notes.filter((note) => checked.includes(debitId(note))) : filtered, columns: [{ label: 'Debit Note No.', value: (note) => note.number }, { label: 'Date', value: debitDate }, { label: 'Original Invoice', value: (note) => note.extra?.originalInvoiceNo || note.extra?.originalRef || '' }, { label: 'Customer', value: (note) => note.customer?.name || '' }, { label: 'Adjustment Reason', value: (note) => note.extra?.reason || '' }, { label: 'Amount', value: (note) => debitAmounts(note).taxable }, { label: 'Tax Adjustment', value: (note) => { const value = debitAmounts(note); return value.totalGst + value.chargesGst; } }, { label: 'Total Debit', value: (note) => debitAmounts(note).finalTotal }, { label: 'Status', value: debitStatus }] });
  }
  const cards = [['Total Debit Notes', stats.total, FilePlus, 'blue', 'All debit notes'], ['Debit Value', money(stats.value), IndianRupee, 'green', 'Excludes unposted drafts and cancellations'], ['Posting Not Confirmed', stats.pending, Clock3, 'amber', 'Review accounting status'], ['Issued', stats.issued, CheckCircle2, 'green', 'Accounting posting recorded'], ['Additional Value This Month', money(stats.monthly), CalendarDays, 'purple', 'Issued debit notes dated this month']];
  const menus = { query, onPrint: print, onPdf: setPdfDoc, onShare: share, onDelete: requestDelete };
  return <div className="automobile-debit-notes"><header className="adn-header"><div><h1>Debit Note</h1><p>Create and manage debit notes for additional charges, price revisions or post-sale adjustments.</p></div><div><button type="button" onClick={exportNotes} disabled={loading || !(checked.length || filtered.length)}><Download size={17} />Export{checked.length ? ` (${checked.length})` : ''}</button><SelectDropdown aria-label="Print debit note" value="" placeholder={<><Printer size={17} />Print</>} disabled={!selected} options={[{ value: 'normal', label: 'Selected note (A4)' }, { value: 'thermal80', label: 'Selected note (Thermal)' }]} portal onChange={(format) => selected && print(detail.id === selectedKey && detail.note || selected, format)} /><Link className="adn-primary" to="/billing/debit-note/new"><Plus size={18} />New Debit Note</Link></div></header>
    {error && <div className="adn-error" role="alert">{error}<button type="button" onClick={() => load()}><RefreshCw size={15} />Retry</button></div>}
    <div className="adn-stats">{cards.map(([label, value, Icon, color, hint]) => <article className="adn-card" key={label}><span className={`adn-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>{hint}</p></div></article>)}</div>
    <div className="adn-workspace"><div className="adn-main">
      <form className="adn-card adn-filters" onSubmit={(event) => { event.preventDefault(); setFilters(draftFilters); setPage(1); }}><fieldset><legend>Date Range</legend><input type="date" aria-label="Debit from date" value={draftFilters.from} onChange={(event) => change('from', event.target.value)} /><span>–</span><input type="date" aria-label="Debit to date" min={draftFilters.from || undefined} value={draftFilters.to} onChange={(event) => change('to', event.target.value)} /></fieldset><label>Customer<SelectDropdown aria-label="Filter customer" value={draftFilters.customer} onChange={(value) => change('customer', value)} options={[{ value: '', label: 'All Customers' }, ...customers.map((value) => ({ value, label: value }))]} searchable portal /></label><label>Status<SelectDropdown aria-label="Filter debit status" value={draftFilters.status} onChange={(value) => change('status', value)} options={[{ value: '', label: 'All Status' }, ...STATUSES.map((value) => ({ value, label: value }))]} portal /></label><div className="adn-search"><Search size={16} /><input ref={searchRef} aria-label="Search debit notes" placeholder="Search by debit note no. or original invoice…" value={draftFilters.search} onChange={(event) => change('search', event.target.value)} /></div><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setDraftFilters(EMPTY_FILTERS); setExtraFilters(EMPTY_SALES_FILTERS); setPage(1); }}><X size={15} />Clear</button><button type="submit" className="adn-primary">Apply</button></form>
      {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="adn-error">End date must be on or after the start date.</p>}
      <section className="adn-card adn-register" aria-label="Debit note list"><header className="adn-register-title"><h2><FilePlus size={20} />Debit Notes ({filtered.length})</h2></header><div className="adn-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteDebitNote(debitId(record))} onDeleted={ids => load()} canDelete={record => record.lifecycleStatus !== 'cancelled'} className="adn-table"><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all debit notes on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((note) => debitId(note) === id)) : [...new Set([...previous, ...rows.map(debitId)])])} /></th><th>#</th><th>Debit Note No.</th><th>Date</th><th>Linked Document</th><th>Party Name</th><th>Reason</th><th>Additional Value (₹)</th><th>Revised Total (₹)</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={11} className="adn-empty">Loading debit notes…</td></tr> : !rows.length ? <tr><td colSpan={11} className="adn-empty">{notes.length ? 'No debit notes match these filters.' : 'No debit notes yet. Create your first debit note.'}</td></tr> : rows.map((note, index) => { const amounts = debitAmounts(note); const invoiceLink = linked[invoiceLookupKey(note)]; const revised = debitRevisedTotal(note, invoiceLink?.invoice); return <BulkDeleteRow record={note} key={debitId(note)} className={checked.includes(debitId(note)) || highlightedIndex === index ? 'adn-selected' : ''}><td><input type="checkbox" aria-label={`Select ${note.number}`} checked={checked.includes(debitId(note))} onChange={() => setChecked((previous) => previous.includes(debitId(note)) ? previous.filter((id) => id !== debitId(note)) : [...previous, debitId(note)])} /></td><td>{(currentPage - 1) * size + index + 1}</td><td><button type="button" className="adn-number" onClick={() => select(note)}>{note.number}</button></td><td>{dateText(debitDate(note))}</td><td><OriginalInvoice note={note} invoice={invoiceLink?.invoice} /></td><td>{note.customer?.name || '—'}{note.customer?.city && <small>{note.customer.city}</small>}</td><td>{note.extra?.reason || '—'}</td><td>{money(amounts.finalTotal)}</td><td title={invoiceLink?.error || (!invoiceLink ? 'Loading linked invoice' : 'Original invoice plus this debit note')}>{revised === null ? '—' : money(revised)}</td><td><Status note={note} /></td><td><div className="adn-row-actions"><button type="button" aria-label={`View ${note.number}`} onClick={() => select(note)}><Eye size={17} /></button><NoteMenu note={note} {...menus} /></div></td></BulkDeleteRow>; })}</tbody></BulkDeleteTable></div>
        <footer className="adn-pagination"><SelectDropdown aria-label="Debit notes per page" value={String(size)} onChange={(value) => { setSize(Number(value)); setPage(1); }} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} entries` }))} portal /><span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0} – {Math.min(currentPage * size, filtered.length)} of {filtered.length} debit notes</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-current={value === currentPage ? 'page' : undefined} className={value === currentPage ? 'adn-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></footer>
      </section></div></div>
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={debitPrintDocument(pdfDoc)} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['debit-note']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={debitAmounts(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} shipping={printDoc.shipping} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteDoc && <DeleteDialog note={deleteDoc} busy={busy} error={deleteError} onClose={() => setDeleteDoc(null)} onDelete={remove} />}
  </div>;
}
