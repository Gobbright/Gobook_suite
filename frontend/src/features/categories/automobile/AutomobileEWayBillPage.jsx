import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, MoreHorizontal, Plus, Printer, RefreshCw, Search, Truck } from "lucide-react";
import { api } from '../../../services/api.js';
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
import { eWayAmounts, eWayDate, eWayId, eWayPrintDocument, eWayReady, eWaySource, eWaySourceType, eWayStatus, eWayTransport, filterEWayBills, recordedEwb } from './automobileEWayBills.js';

import './automobileEWayBills.css';

const STATUSES = ['Ready for Review', 'EWB Recorded', 'In Transit', 'Expired', 'Needs Review', 'Draft', 'Cancelled (Recorded)'];
const EMPTY = { from: '', to: '', customer: '', status: '', search: '', type: '', transporter: '', ewb: '' };
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
const tone = (status) => ({ 'Ready for Review': 'blue', 'EWB Recorded': 'green', 'In Transit': 'amber', Expired: 'red', 'Needs Review': 'red' }[status] || 'neutral');
function Status({ doc }) { const status = eWayStatus(doc); return <span className={`aew-badge ${tone(status)}`}>{status}</span>; }
function RecordMenu({ doc, query, onPrint, onPdf, onShare, onDelete }) {
  const navigate = useNavigate();
  return <SelectDropdown aria-label={`Actions for ${doc.number}`} value="" placeholder={<MoreHorizontal size={19} />} options={[{ value: 'view', label: 'View full details' }, { value: 'edit', label: 'Edit' }, { value: 'print', label: 'Print (A4)' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share' }, { value: 'delete', label: 'Delete' }]} hideChevron portal buttonClassName="aew-menu" menuClassName="aew-action-menu" onChange={(action) => {
    if (action === 'view' || action === 'edit') navigate(`/billing/e-way-bill/${eWayId(doc)}/${action}${query}`);
    else ({ print: onPrint, pdf: onPdf, share: onShare, delete: onDelete })[action]?.(doc);
  }} />;
}
function DeleteDialog({ doc, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="aew-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="aew-delete-title"><h2 id="aew-delete-title">Delete local record?</h2><p>{doc.number} will be permanently deleted and its accounting posting reversed. This does not cancel a registered E-Way Bill.</p>{error && <p className="aew-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="aew-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}
function ValidationDialog({ docs, onClose }) {
  const ref = useFocusTrap({ onClose });
  return <div className="aew-overlay"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="aew-validation-title"><h2 id="aew-validation-title">Saved Field Review</h2><p>These local checks do not verify provider acceptance or official registration.</p><ul>{docs.map((doc) => <li key={eWayId(doc)}>{doc.number}: {eWayReady(doc) ? 'Basic checks passed' : 'Needs review — open details for missing fields'}</li>)}</ul><footer><button type="button" onClick={onClose}>Close</button></footer></section></div>;
}
export function AutomobileEWayBillPage() {
  const location = useLocation(); const initial = useMemo(() => readSalesListState(), []);
  const [filters, setFilters] = useState(() => ({ ...EMPTY, from: initial.dateFrom, to: initial.dateTo, customer: initial.filters.customer, search: initial.search, ewb: initial.filters.ewbStatus || '', status: new URLSearchParams(location.search).get('recordStatus') || '', type: new URLSearchParams(location.search).get('sourceType') || '', transporter: new URLSearchParams(location.search).get('transporter') || '' }));
  const [draft, setDraft] = useState(filters); const [extraFilters, setExtraFilters] = useState(() => ({ ...initial.filters, customer: '', ewbStatus: '' }));
  const [docs, setDocs] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [page, setPage] = useState(1); const [size, setSize] = useState(10); const [checked, setChecked] = useState([]); const [detail, setDetail] = useState({}); const [detailRefresh, setDetailRefresh] = useState(0); const [settings, setSettings] = useState({});
  const [printDoc, setPrintDoc] = useState(null); const [pdfDoc, setPdfDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null); const [validation, setValidation] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null); const [busy, setBusy] = useState(false); const [deleteError, setDeleteError] = useState('');
  const searchRef = useRef(null); const allRef = useRef(null);
  const query = useMemo(() => { const base = salesListQuery({ filters: { ...extraFilters, customer: filters.customer, ewbStatus: filters.ewb }, dateFrom: filters.from, dateTo: filters.to, search: filters.search }); const params = new URLSearchParams(base); if (filters.status) params.set('recordStatus', filters.status); if (filters.type) params.set('sourceType', filters.type); if (filters.transporter) params.set('transporter', filters.transporter); return params.size ? `?${params}` : ''; }, [filters, extraFilters]);
  useEffect(() => { replaceSalesListQuery(location.pathname, query); }, [location.pathname, query]);
  const load = useCallback(async (active = () => true) => {
    setLoading(true); setError('');
    try { const data = []; let current = 1;
      while (active()) { const result = await api.listEWayBills({ ...extraFilters, page: current, limit: 500 }); const rows = Array.isArray(result.data) ? result.data : []; data.push(...rows); if (!rows.length || data.length >= (Number(result.total) || rows.length)) break; current++; }
      if (active()) setDocs(data);
    } catch (failure) { if (active()) setError(failure.message || 'Unable to load E-Way Bills.'); }
    finally { if (active()) setLoading(false); }
  }, [extraFilters]);
  useEffect(() => { let active = true; load(() => active); return () => { active = false; }; }, [load]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterEWayBills(docs, filters), [docs, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const selected = rows.find((row) => checked.includes(eWayId(row))) || rows[0] || null; const selectedKey = selected ? eWayId(selected) : '';
  useEffect(() => {
    if (!selectedKey) return undefined; let active = true; setDetail({ id: selectedKey, loading: true });
    api.getEWayBill(selectedKey).then((doc) => { if (active) setDetail({ id: selectedKey, doc }); }).catch((failure) => { if (active) setDetail({ id: selectedKey, error: failure.message || 'Unable to refresh details.' }); });
    return () => { active = false; };
  }, [selectedKey, detailRefresh]);
  const allChecked = rows.length > 0 && rows.every((doc) => checked.includes(eWayId(doc)));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((doc) => checked.includes(eWayId(doc))); }, [rows, checked, allChecked]);
  const select = (doc) => window.location.assign(`/billing/e-way-bill/${eWayId(doc)}/view${query}`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const refresh = async () => { await load(); setDetailRefresh((value) => value + 1); };
  const print = (doc, format = 'normal') => setPrintDoc({ ...eWayPrintDocument(doc), extra: { ...doc.extra, invoicePrintFormat: format } });
  const share = (doc) => setShareDoc({ ...doc, id: eWayId(doc), total: eWayAmounts(doc).finalTotal });
  const requestDelete = (doc) => { setDeleteError(''); setDeleteDoc(doc); };
  async function remove() {
    if (!deleteDoc || busy) return; setBusy(true); setDeleteError('');
    try { await api.deleteEWayBill(eWayId(deleteDoc)); setDocs((previous) => previous.filter((doc) => eWayId(doc) !== eWayId(deleteDoc))); setChecked((previous) => previous.filter((id) => id !== eWayId(deleteDoc))); setDeleteDoc(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this record.'); } finally { setBusy(false); }
  }
  const selectedDocs = docs.filter((doc) => checked.includes(eWayId(doc)));
  function exportDocs() { downloadExcel({ title: 'E-Way Bills', filename: 'automobile-e-way-bills', rows: checked.length ? selectedDocs : filtered, columns: [
    { label: 'Record No.', value: (doc) => doc.number }, { label: 'E-Way Bill No. (Recorded)', value: recordedEwb }, { label: 'Date', value: eWayDate }, { label: 'Source Reference', value: eWaySource }, { label: 'Recipient', value: (doc) => doc.customer?.name || '' }, { label: 'Transporter', value: (doc) => eWayTransport(doc).transporter }, { label: 'Vehicle No.', value: (doc) => eWayTransport(doc).vehicleNumber }, { label: 'Distance (KM)', value: (doc) => eWayTransport(doc).distanceKm }, { label: 'Status', value: eWayStatus }, { label: 'Value', value: (doc) => eWayAmounts(doc).finalTotal },
  ] }); }
  const cards = [['Ready for Review', FileText, 'blue'], ['EWB Recorded', CheckCircle2, 'green'], ['In Transit', Truck, 'amber'], ['Expired', Clock3, 'red'], ['Needs Review', AlertTriangle, 'red']];
  const menus = { query, onPrint: print, onPdf: setPdfDoc, onShare: share, onDelete: requestDelete };
  const activeDoc = detail.id === selectedKey && detail.doc || selected;
  return <div className="automobile-e-way-bills">
    <header className="aew-header"><div><h1>E-Way Bill</h1><p>Prepare and manage E-Way Bill records for your outward supply documents.</p></div><div><button type="button" disabled={!filtered.length && !checked.length || loading} onClick={exportDocs}><Download size={17} />Export</button><Link className="aew-primary" to={`/billing/e-way-bill/new${query}`}><Plus size={18} />Prepare E-Way Bill</Link></div></header>
    {error && <div className="aew-error" role="alert">{error}<button type="button" onClick={refresh}>Retry</button></div>}
    <div className="aew-workspace"><div className="aew-main">
      <section className="aew-stats" aria-label="E-Way Bill summary">{cards.map(([label, Icon, color]) => <article className="aew-card" key={label}><span className={`aew-icon ${color}`}><Icon size={27} /></span><div><h2>{label}</h2><strong>{loading ? '—' : docs.filter((doc) => eWayStatus(doc) === label).length}</strong><p>{label === 'Expired' ? 'By recorded validity date' : 'Based on saved records'}</p></div></article>)}</section>
      <form className="aew-card aew-filters" onSubmit={(event) => { event.preventDefault(); setFilters(draft); setPage(1); }}><fieldset><legend>Date Range</legend><input type="date" aria-label="From date" value={draft.from} onChange={(event) => change('from', event.target.value)} /><span>–</span><input type="date" aria-label="To date" min={draft.from || undefined} value={draft.to} onChange={(event) => change('to', event.target.value)} /></fieldset>
        <label>Document Type<SelectDropdown aria-label="Filter document type" value={draft.type} onChange={(value) => change('type', value)} options={[{ value: '', label: 'All Documents' }, ...[...new Set(docs.map(eWaySourceType))].sort().map((value) => ({ value, label: value }))]} portal /></label>
        <label>Transporter<SelectDropdown aria-label="Filter transporter" value={draft.transporter} onChange={(value) => change('transporter', value)} options={[{ value: '', label: 'All Transporters' }, ...[...new Set(docs.map((doc) => eWayTransport(doc).transporter).filter(Boolean))].sort().map((value) => ({ value, label: value }))]} portal /></label>
        <label>Status<SelectDropdown aria-label="Filter status" value={draft.status} onChange={(value) => change('status', value)} options={[{ value: '', label: 'All Status' }, ...STATUSES.map((value) => ({ value, label: value }))]} portal /></label>
        <div className="aew-search"><Search size={16} /><input ref={searchRef} aria-label="Search E-Way Bills" placeholder="Invoice, challan or E-Way Bill number…" value={draft.search} onChange={(event) => change('search', event.target.value)} /></div><button type="submit">Search</button><button type="button" onClick={() => { setFilters(EMPTY); setDraft(EMPTY); setExtraFilters(EMPTY_SALES_FILTERS); setPage(1); }}>Clear</button>
      </form>
      {filters.from && filters.to && filters.from > filters.to && <p role="alert" className="aew-error">End date must be on or after the start date.</p>}
      <section className="aew-card aew-register" aria-label="E-Way Bill list"><div className="aew-toolbar"><Link className="aew-primary" to={`/billing/e-way-bill/new${query}`}><Plus size={16} />Prepare E-Way Bill</Link><button type="button" disabled={loading || !(selectedDocs.length || selected)} onClick={() => setValidation(selectedDocs.length ? selectedDocs : [activeDoc])}><CheckCircle2 size={16} />Validate Fields</button><button type="button" disabled title="E-Way Bill provider API is not configured">Generate</button><SelectDropdown aria-label="Print selected record" value="" placeholder={<><Printer size={16} />Print</>} options={[{ value: 'normal', label: 'Selected record (A4)' }, { value: 'thermal80', label: 'Selected record (Thermal)' }]} disabled={!selected || loading} onChange={(value) => print(activeDoc, value)} portal /><button type="button" onClick={refresh} disabled={loading} aria-label="Refresh saved records"><RefreshCw size={16} /></button><button type="button" disabled={!checked.length} onClick={() => setChecked([])}>Clear Selection{checked.length ? ` (${checked.length})` : ''}</button></div>
        <div className="aew-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteEWayBill(eWayId(record))} onDeleted={ids => load()} canDelete={record => record.lifecycleStatus !== 'cancelled'} className="aew-table"><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all records on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((doc) => eWayId(doc) === id)) : [...new Set([...previous, ...rows.map(eWayId)])])} /></th><th>#</th><th>E-Way Bill No.</th><th>Source Document</th><th>Supplier</th><th>Recipient</th><th>Transporter</th><th>Vehicle No.</th><th>Distance (KM)</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={11} className="aew-empty">Loading E-Way Bills…</td></tr> : !rows.length ? <tr><td colSpan={11} className="aew-empty">{docs.length ? 'No records match these filters.' : 'No E-Way Bills yet. Prepare your first record to get started.'}</td></tr> : rows.map((doc, index) => { const transport = eWayTransport(doc); return <BulkDeleteRow record={doc} key={eWayId(doc)} className={checked.includes(eWayId(doc)) || highlightedIndex === index ? 'aew-selected' : ''}>
            <td><input type="checkbox" aria-label={`Select ${doc.number}`} checked={checked.includes(eWayId(doc))} onChange={() => setChecked((previous) => previous.includes(eWayId(doc)) ? previous.filter((id) => id !== eWayId(doc)) : [...previous, eWayId(doc)])} /></td><td>{(currentPage - 1) * size + index + 1}</td><td><button type="button" className="aew-number" onClick={() => select(doc)}>{recordedEwb(doc) || 'Not recorded'}</button><small>{doc.number}</small></td><td>{eWaySource(doc) || '—'}<small>{dateText(eWayDate(doc))}</small></td><td>{doc.businessSettingsSnapshot?.businessName || settings.businessName || '—'}</td><td>{doc.customer?.name || '—'}<small>{[doc.customer?.city, doc.customer?.state].filter(Boolean).join(', ')}</small></td><td>{transport.transporter || '—'}</td><td>{transport.vehicleNumber || '—'}</td><td>{transport.distanceKm || '—'}</td><td><Status doc={doc} /></td><td><RecordMenu doc={doc} {...menus} /></td>
          </BulkDeleteRow>; })}
        </tbody></BulkDeleteTable></div><footer className="aew-pagination"><span>Showing {filtered.length ? (currentPage - 1) * size + 1 : 0} – {Math.min(currentPage * size, filtered.length)} of {filtered.length} records</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-current={value === currentPage ? 'page' : undefined} className={value === currentPage ? 'aew-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div><SelectDropdown aria-label="Records per page" value={String(size)} onChange={(value) => { setSize(Number(value)); setPage(1); }} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} / page` }))} portal /></footer>
      </section></div></div>
    {validation && <ValidationDialog docs={validation} onClose={() => setValidation(null)} />}{shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={eWayPrintDocument(pdfDoc)} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['e-way-bill']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={eWayAmounts(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} shipping={printDoc.shipping} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteDoc && <DeleteDialog doc={deleteDoc} busy={busy} error={deleteError} onClose={() => setDeleteDoc(null)} onDelete={remove} />}
  </div>;
}
