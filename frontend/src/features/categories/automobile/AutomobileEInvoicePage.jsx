import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, HelpCircle, MoreHorizontal, Plus, Printer, RefreshCw, Search, X } from 'lucide-react';
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
import { eInvoiceAmounts, eInvoiceDate, eInvoiceId, eInvoicePrintDocument, eInvoiceReady, eInvoiceRecord, eInvoiceStats, eInvoiceStatus, filterEInvoices, recordedIrn, recordedAck, recordedAckDate } from './automobileEInvoices.js';

import { SalesWorkflowDialog } from '../retail/modules/sales/shared/SalesWorkflowDialog.jsx';
import './automobileEInvoices.css';

const STATUSES = ['IRN Recorded', 'Pending IRN', 'ACK Incomplete', 'Needs Review', 'Draft', 'Invoice Cancelled'];
const EMPTY_FILTERS = { from: '', to: '', customer: '', status: '', search: '', gst: '', irn: '' };
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const tone = (note) => ({ 'IRN Recorded': 'green', 'Pending IRN': 'amber', 'ACK Incomplete': 'amber', 'Needs Review': 'red', 'Invoice Cancelled': 'neutral', Draft: 'neutral' }[eInvoiceStatus(note)]);
function Status({ note }) { return <span className={`aei-badge ${tone(note)}`}>{eInvoiceStatus(note)}</span>; }
function NoteMenu({ note, query, onPrint, onPdf, onShare, onDelete, onWorkflow, onJson }) {
  const navigate = useNavigate();
  return <RowActionsMenu aria-label={`Actions for ${note.number}`} value="" placeholder={<MoreHorizontal size={19} />} options={[{ value: 'view', label: 'View full details' }, { value: 'workflow', label: 'Invoice workflow' }, { value: 'edit', label: 'Edit', disabled: note.lifecycleStatus !== 'draft', title: 'Only draft e-invoices can be edited.' }, { value: 'print', label: 'Print (A4)' }, { value: 'pdf', label: 'Download PDF' }, { value: 'json', label: 'Download saved JSON' }, { value: 'share', label: 'Share e-invoice' }, { value: 'delete', label: 'Delete', disabled: note.lifecycleStatus !== 'draft', title: 'Only draft e-invoices can be deleted.' }]} hideChevron portal buttonClassName="aei-menu" menuClassName="aei-action-menu" onChange={(action) => {
    if (action === 'view' || action === 'edit') navigate(`/billing/e-invoice/${eInvoiceId(note)}/${action}${query}`);
    else ({ print: onPrint, pdf: onPdf, share: onShare, delete: onDelete, workflow: onWorkflow, json: onJson })[action]?.(note);
  }} />;
}
function DeleteDialog({ note, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="aei-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="aei-delete-title"><h2 id="aei-delete-title">Delete draft?</h2><p>{note.number} will be permanently deleted from this application. This does not cancel a provider registration.</p>{error && <p className="aei-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="aei-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}
function HelpDialog({ onClose }) {
  const ref = useFocusTrap({ onClose });
  return <div className="aei-overlay"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="aei-help-title"><h2 id="aei-help-title">E-Invoice Help</h2><p>This page lists saved e-invoice documents. IRN and ACK values come from the existing invoice form.</p><p>Basic field checks review saved data only. They do not verify tax eligibility, registration, or provider acceptance.</p><p>No provider connection or submission API is configured in this project. Refresh retrieves saved records; it does not submit them.</p><p>Signed QR downloads encode the saved signed payload. A QR is not created from an IRN alone. JSON exports are saved records, not a provider submission schema.</p><p>Invoice workflow manages posting, stock, dispatch and cancellation separately from registration.</p><footer><button type="button" onClick={onClose}>Close Help</button></footer></section></div>;
}
function downloadJson(doc) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(eInvoiceRecord(doc), null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${String(doc.number || 'e-invoice').replace(/[^a-z0-9-]/gi, '-')}-saved-record.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AutomobileEInvoicePage() {
  const location = useLocation(); const initial = useMemo(() => readSalesListState(), []);
  const [filters, setFilters] = useState(() => ({ from: initial.dateFrom, to: initial.dateTo, customer: initial.filters.customer, search: initial.search, status: new URLSearchParams(location.search).get('recordStatus') || '', gst: new URLSearchParams(location.search).get('gstRecord') || '', irn: initial.filters.irnStatus || '' }));
  const [draftFilters, setDraftFilters] = useState(filters);
  const [extraFilters, setExtraFilters] = useState(() => ({ ...initial.filters, customer: '', irnStatus: '' }));
  const [help, setHelp] = useState(false); const [workflowDoc, setWorkflowDoc] = useState(null); const [refreshedAt, setRefreshedAt] = useState('');
  const [notes, setNotes] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [page, setPage] = useState(1); const [size, setSize] = useState(10); const [checked, setChecked] = useState([]); const [detail, setDetail] = useState({}); const [detailRefresh, setDetailRefresh] = useState(0);
  const [settings, setSettings] = useState({}); const [printDoc, setPrintDoc] = useState(null); const [pdfDoc, setPdfDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null); const [busy, setBusy] = useState(false); const [deleteError, setDeleteError] = useState('');
  const searchRef = useRef(null); const allRef = useRef(null);
  const query = useMemo(() => { const base = salesListQuery({ filters: { ...extraFilters, customer: filters.customer, irnStatus: filters.irn }, dateFrom: filters.from, dateTo: filters.to, search: filters.search }); const params = new URLSearchParams(base); if (filters.status) params.set('recordStatus', filters.status); if (filters.gst) params.set('gstRecord', filters.gst); return params.size ? `?${params}` : ''; }, [filters, extraFilters]);
  useEffect(() => { replaceSalesListQuery(location.pathname, query); }, [location.pathname, query]);
  const load = useCallback(async (active = () => true) => {
    setLoading(true); setError('');
    try {
      const data = []; let current = 1;
      while (active()) {
        const result = await api.listEInvoices({ ...extraFilters, page: current, limit: 500 }); const rows = Array.isArray(result.data) ? result.data : []; data.push(...rows);
        if (!rows.length || data.length >= (Number(result.total) || rows.length)) break;
        current++;
      }
      if (active()) { setNotes(data); setRefreshedAt(new Date().toISOString()); }
    } catch (failure) { if (active()) setError(failure.message || 'Unable to load e-invoices.'); }
    finally { if (active()) setLoading(false); }
  }, [extraFilters]);
  useEffect(() => { let active = true; load(() => active); return () => { active = false; }; }, [load]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterEInvoices(notes, filters), [notes, filters]); const stats = useMemo(() => eInvoiceStats(notes), [notes]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const selected = rows.find((row) => checked.includes(eInvoiceId(row))) || rows[0] || null; const selectedKey = selected ? eInvoiceId(selected) : '';
  useEffect(() => {
    if (!selectedKey) return undefined;
    let active = true; setDetail({ id: selectedKey, loading: true });
    api.getEInvoice(selectedKey).then((note) => { if (active) setDetail({ id: selectedKey, note }); }).catch((failure) => { if (active) setDetail({ id: selectedKey, error: failure.message || 'Unable to refresh details.' }); });
    return () => { active = false; };
  }, [selectedKey, detailRefresh]);
  const allChecked = rows.length > 0 && rows.every((note) => checked.includes(eInvoiceId(note)));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((note) => checked.includes(eInvoiceId(note))); }, [rows, checked, allChecked]);
  const select = (note) => window.location.assign(`/billing/e-invoice/${eInvoiceId(note)}/view${query}`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const change = (key, value) => { setDraftFilters((previous) => ({ ...previous, [key]: value })); };
  const refresh = async () => { await load(); setDetailRefresh((value) => value + 1); };
  const print = (note, format = 'normal') => setPrintDoc({ ...eInvoicePrintDocument(note), extra: { ...note.extra, invoicePrintFormat: format } });
  const share = (note) => setShareDoc({ ...note, id: eInvoiceId(note), total: eInvoiceAmounts(note).finalTotal });
  const requestDelete = (note) => { setDeleteError(''); setDeleteDoc(note); };
  async function remove() {
    if (!deleteDoc || busy || deleteDoc.lifecycleStatus !== 'draft') return;
    setBusy(true); setDeleteError('');
    try { await api.deleteEInvoice(eInvoiceId(deleteDoc)); setNotes((previous) => previous.filter((note) => eInvoiceId(note) !== eInvoiceId(deleteDoc))); setChecked((previous) => previous.filter((id) => id !== eInvoiceId(deleteDoc))); setDeleteDoc(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this e-invoice.'); }
    finally { setBusy(false); }
  }
  function exportNotes() {
    downloadExcel({ title: 'E-Invoices', filename: 'automobile-e-invoices', rows: checked.length ? notes.filter((doc) => checked.includes(eInvoiceId(doc))) : filtered, columns: [
      { label: 'Invoice No.', value: (doc) => doc.number }, { label: 'Invoice Date', value: eInvoiceDate }, { label: 'Customer', value: (doc) => doc.customer?.name || '' }, { label: 'GSTIN', value: (doc) => doc.customer?.gstin || '' },
      { label: 'Taxable Amount', value: (doc) => { const value = eInvoiceAmounts(doc); return value.taxable + value.chargesSubtotal; } }, { label: 'Total GST', value: (doc) => { const value = eInvoiceAmounts(doc); return value.totalGst + value.chargesGst; } }, { label: 'Invoice Total', value: (doc) => eInvoiceAmounts(doc).finalTotal },
      { label: 'Basic Field Checks', value: (doc) => eInvoiceReady(doc) ? 'Ready for Review' : 'Needs Review' }, { label: 'Registration Record', value: eInvoiceStatus }, { label: 'IRN', value: recordedIrn }, { label: 'ACK Number', value: recordedAck }, { label: 'ACK Date', value: recordedAckDate },
    ] });
  }
  const cards = [['Ready for Review', stats.ready, FileText, 'green', 'Saved records passing basic checks'], ['IRN Recorded', stats.recorded, CheckCircle2, 'blue', 'IRN and ACK details recorded'], ['Pending IRN / ACK', stats.pending, Clock3, 'amber', 'Registration details incomplete'], ['Needs Review', stats.review, AlertTriangle, 'red', 'Saved fields need attention'], ['Recorded This Month', money(stats.monthValue), CalendarDays, 'purple', 'By recorded acknowledgement date']];
  const menus = { query, onPrint: print, onPdf: setPdfDoc, onShare: share, onDelete: requestDelete, onWorkflow: setWorkflowDoc, onJson: downloadJson };
  return <div className="automobile-e-invoices"><header className="aei-header"><div><h1>E-Invoice</h1><p>Manage saved e-invoices, registration details and acknowledgements.</p></div><div>
    <button type="button" onClick={exportNotes} disabled={loading || !(checked.length || filtered.length)}><Download size={17} />Export{checked.length ? ` (${checked.length})` : ''}</button>
    <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={17} />Refresh Records</button><button type="button" disabled title="No provider sync API is configured"><RefreshCw size={17} />Sync Provider</button>
    <SelectDropdown aria-label="Print e-invoice" value="" placeholder={<><Printer size={17} />Print</>} disabled={!selected} options={[{ value: 'normal', label: 'Selected invoice (A4)' }, { value: 'thermal80', label: 'Selected invoice (Thermal)' }]} portal onChange={(format) => selected && print(detail.id === selectedKey && detail.note || selected, format)} />
    <button type="button" onClick={() => setHelp(true)}><HelpCircle size={17} />E-Invoice Help</button><Link className="aei-primary" to="/billing/e-invoice/new"><Plus size={18} />New E-Invoice</Link>
  </div></header>
    {error && <div className="aei-error" role="alert">{error}<button type="button" onClick={refresh}><RefreshCw size={15} />Retry</button></div>}
    <div className="aei-workspace"><div className="aei-main"><div className="aei-stats">{cards.map(([label, value, Icon, color, hint]) => <article className="aei-card" key={label}><span className={`aei-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>{hint}</p></div></article>)}</div>
      <form className="aei-card aei-filters" onSubmit={(event) => { event.preventDefault(); setFilters(draftFilters); setPage(1); }}><fieldset><legend>Invoice Date</legend><input type="date" aria-label="Invoice from date" value={draftFilters.from} onChange={(event) => change('from', event.target.value)} /><span>–</span><input type="date" aria-label="Invoice to date" min={draftFilters.from || undefined} value={draftFilters.to} onChange={(event) => change('to', event.target.value)} /></fieldset>
        <label>Record Status<SelectDropdown aria-label="Filter registration status" value={draftFilters.status} onChange={(value) => change('status', value)} options={[{ value: '', label: 'All Status' }, ...STATUSES.map((value) => ({ value, label: value }))]} portal /></label>
        <label>Customer GSTIN<SelectDropdown aria-label="Filter GSTIN record" value={draftFilters.gst} onChange={(value) => change('gst', value)} options={[{ value: '', label: 'All Types' }, { value: 'present', label: 'GSTIN Present' }, { value: 'absent', label: 'No GSTIN' }, { value: 'review', label: 'Format Needs Review' }]} portal /></label>
        <div className="aei-search"><Search size={16} /><input ref={searchRef} aria-label="Search e-invoices" placeholder="Invoice number, IRN, customer or GSTIN..." value={draftFilters.search} onChange={(event) => change('search', event.target.value)} /></div><button type="submit"><Search size={15} />Search</button><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setDraftFilters(EMPTY_FILTERS); setExtraFilters(EMPTY_SALES_FILTERS); setPage(1); }}><X size={15} />Clear</button>
      </form>
      {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="aei-error">End date must be on or after the start date.</p>}
      <section className="aei-card aei-register" aria-label="E-invoice list"><div className="aei-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteEInvoice(eInvoiceId(record))} onDeleted={ids => load()} canDelete={record => record.lifecycleStatus === 'draft'} className="aei-table"><thead><tr><th>#</th><th><input ref={allRef} type="checkbox" aria-label="Select all e-invoices on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((doc) => eInvoiceId(doc) === id)) : [...new Set([...previous, ...rows.map(eInvoiceId)])])} /></th><th>Invoice No.</th><th>Invoice Date</th><th>Customer</th><th>Taxable Amount</th><th>GSTIN</th><th>Field Checks</th><th>Registration Record</th><th>IRN / ACK No.</th><th>ACK Date</th><th>Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={12} className="aei-empty">Loading e-invoices...</td></tr> : !rows.length ? <tr><td colSpan={12} className="aei-empty">{notes.length ? 'No e-invoices match these filters.' : 'No e-invoices yet. Saved records will appear here.'}</td></tr> : rows.map((doc, index) => { const amounts = eInvoiceAmounts(doc); return <BulkDeleteRow record={doc} key={eInvoiceId(doc)} className={checked.includes(eInvoiceId(doc)) || highlightedIndex === index ? 'aei-selected' : ''}>
          <td>{(currentPage - 1) * size + index + 1}</td><td><input type="checkbox" aria-label={`Select ${doc.number}`} checked={checked.includes(eInvoiceId(doc))} onChange={() => setChecked((previous) => previous.includes(eInvoiceId(doc)) ? previous.filter((id) => id !== eInvoiceId(doc)) : [...previous, eInvoiceId(doc)])} /></td><td><button type="button" className="aei-number" onClick={() => select(doc)}>{doc.number}</button></td><td>{dateText(eInvoiceDate(doc))}</td><td>{doc.customer?.name || '—'}<small>{[doc.customer?.city, doc.customer?.state].filter(Boolean).join(', ')}</small></td><td>{money(amounts.taxable + amounts.chargesSubtotal)}</td><td>{doc.customer?.gstin || '—'}</td><td><span className={`aei-badge ${eInvoiceReady(doc) ? 'green' : 'amber'}`}>{eInvoiceReady(doc) ? 'Checks Passed' : 'Needs Review'}</span></td><td><Status note={doc} /></td><td className="aei-irn-cell" title={recordedIrn(doc)}><code>{recordedIrn(doc) ? `${recordedIrn(doc).slice(0, 14)}...` : '—'}</code>{recordedAck(doc) && <small>{recordedAck(doc)}</small>}</td><td>{dateText(recordedAckDate(doc))}</td><td><NoteMenu note={doc} {...menus} /></td>
        </BulkDeleteRow>; })}
      </tbody></BulkDeleteTable></div>
        <footer className="aei-pagination"><span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0} – {Math.min(currentPage * size, filtered.length)} of {filtered.length} records</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-current={value === currentPage ? 'page' : undefined} className={value === currentPage ? 'aei-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div><SelectDropdown aria-label="E-invoices per page" value={String(size)} onChange={(value) => { setSize(Number(value)); setPage(1); }} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} / page` }))} portal /></footer>
      </section></div></div>
    {help && <HelpDialog onClose={() => setHelp(false)} />}{workflowDoc && <SalesWorkflowDialog document={{ ...workflowDoc, id: eInvoiceId(workflowDoc) }} onClose={() => setWorkflowDoc(null)} onComplete={refresh} />}
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={eInvoicePrintDocument(pdfDoc)} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['e-invoice']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={eInvoiceAmounts(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} shipping={printDoc.shipping} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteDoc && <DeleteDialog note={deleteDoc} busy={busy} error={deleteError} onClose={() => setDeleteDoc(null)} onDelete={remove} />}
  </div>;
}
