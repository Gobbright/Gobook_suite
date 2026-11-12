import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, MoreHorizontal, Plus, RefreshCw, Search, Truck, X } from "lucide-react";
import { api } from '../../../services/api.js';
import { downloadExcel } from '../../../utils/exportData.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useListKeyboardNav } from '../../../hooks/useListKeyboardNav.js';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { ShareModal } from '../retail/modules/sales/shared/ShareModal.jsx';
import { DocumentPdfDownload, calcDocumentTotals } from '../retail/modules/sales/shared/DocumentPdfDownload.jsx';
import { DocumentPreviewModal } from '../retail/modules/sales/shared/DocumentPreviewModal.jsx';
import { documentConfigs } from '../retail/modules/sales/documentConfigs.js';
import { challanActions, challanDate, challanId, challanLinked, challanQuantity, challanState, challanStats, DELIVERY_LABELS, DELIVERY_STATES, filterChallans } from "./automobileChallans.js";
import './automobileChallans.css';

const EMPTY_FILTERS = { from: '', to: '', customer: '', status: '', search: '' };
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const totals = (doc) => calcDocumentTotals(doc.items, doc.charges, doc.additionalDiscount, doc.tds, doc.tcs, 0, false);
function Badge({ doc, billing = false }) { const state = challanState(doc); return <span className={`adc-badge ${billing ? challanLinked(doc) ? 'green' : 'red' : state}`}>{billing ? challanLinked(doc) ? 'Linked Bill' : 'Not Billed' : DELIVERY_LABELS[state]}</span>; }

function ChallanMenu({ doc, onStatus, onConvert, onPrint, onPdf, onShare, onDelete, busy }) {
  const navigate = useNavigate();
  const editable = !challanLinked(doc) && ['draft', 'ready'].includes(challanState(doc));
  const options = [{ value: 'view', label: 'View full details' }, { value: 'edit', label: 'Edit', disabled: !editable, title: 'Dispatched or linked challans cannot be edited.' }, ...challanActions(doc), ...(!challanLinked(doc) && challanState(doc) === 'delivered' ? [{ value: 'convert', label: 'Convert to Bill' }] : []), { value: 'print', label: 'Print challan' }, { value: 'pdf', label: 'Download PDF' }, { value: 'share', label: 'Share challan' }, { value: 'delete', label: 'Delete', disabled: challanLinked(doc) || challanState(doc) !== 'draft', title: 'Only unlinked draft challans can be deleted.' }];
  return <RowActionsMenu value="" aria-label={`Actions for ${doc.number}`} placeholder={<MoreHorizontal size={19} />} hideChevron portal disabled={busy} options={options} buttonClassName="adc-menu" menuClassName="adc-action-menu" onChange={(action) => {
    if (['view', 'edit'].includes(action)) navigate(`/billing/delivery-challan/${challanId(doc)}/${action}`);
    else if (DELIVERY_STATES.includes(action)) onStatus(doc, action);
    else ({ convert: onConvert, print: onPrint, pdf: onPdf, share: onShare, delete: onDelete })[action]?.(doc);
  }} />;
}
function DeleteDialog({ doc, busy, error, onClose, onDelete }) {
  const ref = useFocusTrap({ onClose: busy ? undefined : onClose });
  return <div className="adc-overlay"><section ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="adc-delete-title"><h2 id="adc-delete-title">Delete draft challan?</h2><p>{doc.number} will be permanently deleted.</p>{error && <p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="adc-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete'}</button></footer></section></div>;
}


export function AutomobileDeliveryChallanPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState([]);
  const [settings, setSettings] = useState({}); const [pdfDoc, setPdfDoc] = useState(null); const [printDoc, setPrintDoc] = useState(null); const [shareDoc, setShareDoc] = useState(null); const [deleteDoc, setDeleteDoc] = useState(null); const [deleteError, setDeleteError] = useState('');
  const searchRef = useRef(null); const allRef = useRef(null);
  const load = useCallback(async (active = () => true) => {
    setLoading(true); setError('');
    try {
      const data = []; let current = 1;
      while (active()) {
        const response = await api.listChallans({ page: current, limit: 500 });
        const rows = Array.isArray(response.data) ? response.data : []; data.push(...rows);
        if (!rows.length || data.length >= (Number(response.total) || rows.length)) break;
        current++;
      }
      if (active()) setDocs(data);
    } catch (failure) { if (active()) setError(failure.message || 'Unable to load delivery challans.'); }
    finally { if (active()) setLoading(false); }
  }, []);
  useEffect(() => { let active = true; load(() => active); return () => { active = false; }; }, [load]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);
  const filtered = useMemo(() => filterChallans(docs, filters), [docs, filters]);
  const stats = useMemo(() => challanStats(docs), [docs]);
  const customers = useMemo(() => [...new Set(docs.map((doc) => doc.customer?.name).filter(Boolean))].sort(), [docs]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = rows.find((row) => checked.includes(challanId(row))) || rows[0] || null;
  const allChecked = rows.length > 0 && rows.every((doc) => checked.includes(challanId(doc)));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((doc) => checked.includes(challanId(doc))); }, [rows, checked, allChecked]);
  const select = (doc) => window.location.assign(`/billing/delivery-challan/${challanId(doc)}/view`);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => select(rows[index]) });
  const updateFilter = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); };
  const replace = (doc) => setDocs((previous) => previous.map((entry) => challanId(entry) === challanId(doc) ? doc : entry));
  async function status(doc, value) {
    if (busy) return;
    setBusy(true); setError('');
    try { const response = await api.transitionChallan(challanId(doc), value); replace(response.challan); }
    catch (failure) { setError(failure.message || 'Unable to update delivery status.'); }
    finally { setBusy(false); }
  }
  async function convert(doc) {
    if (busy) return;
    setBusy(true); setError('');
    try { const response = await api.convertChallan(challanId(doc)); replace(response.challan); navigate(`/billing/invoice/${response.invoice._id}/${response.invoice.lifecycleStatus === 'draft' ? 'edit' : 'view'}`); }
    catch (failure) { setError(failure.message || 'Unable to convert this challan.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteDoc || busy) return;
    setBusy(true); setDeleteError('');
    try { await api.deleteChallan(challanId(deleteDoc)); setDocs((previous) => previous.filter((doc) => challanId(doc) !== challanId(deleteDoc))); setChecked((previous) => previous.filter((id) => id !== challanId(deleteDoc))); setDeleteDoc(null); }
    catch (failure) { setDeleteError(failure.message || 'Unable to delete this challan.'); }
    finally { setBusy(false); }
  }
  function exportDocs() {
    downloadExcel({ title: 'Delivery Challans', filename: 'automobile-delivery-challans', rows: checked.length ? docs.filter((doc) => checked.includes(challanId(doc))) : filtered, columns: [{ label: 'Challan No.', value: (doc) => doc.number }, { label: 'Date', value: (doc) => challanDate(doc) }, { label: 'Customer', value: (doc) => doc.customer?.name || '' }, { label: 'Linked To', value: (doc) => doc.meta?.poRef || '' }, { label: 'Qty', value: challanQuantity }, { label: 'Delivery Status', value: (doc) => DELIVERY_LABELS[challanState(doc)] }, { label: 'Billing Status', value: (doc) => challanLinked(doc) ? doc.extra.convertedInvoiceNumber || 'Linked Bill' : 'Not Billed' }] });
  }
  const cards = [['Total Challans', stats.total, Truck, 'blue', 'All delivery challans'], ['Ready to Dispatch', stats.ready, FileText, 'amber', 'Awaiting dispatch'], ['In Transit', stats.transit, Truck, 'blue', 'Dispatched or in transit'], ['Delivered', stats.delivered, CheckCircle2, 'green', 'Delivery completed'], ['To Be Billed', stats.unbilled, FileText, 'purple', 'Without a linked bill']];
  const menuProps = { onStatus: status, onConvert: convert, onPrint: setPrintDoc, onPdf: setPdfDoc, onShare: (doc) => setShareDoc({ ...doc, id: challanId(doc), total: totals(doc).finalTotal }), onDelete: (doc) => { setDeleteError(''); setDeleteDoc(doc); }, busy };
  return <div className="automobile-challans"><header className="adc-header"><div><h1>Delivery Challan</h1><p>Manage outgoing vehicle parts and services delivery with dispatch tracking and billing control.</p></div><div><button type="button" disabled={loading || !(checked.length || filtered.length)} onClick={exportDocs}><Download size={18} />Export{checked.length ? ` (${checked.length})` : ''}</button><Link className="adc-primary" to="/billing/delivery-challan/new"><Plus size={19} />New Delivery Challan</Link></div></header>
    {error && <div className="adc-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => load()}><RefreshCw size={15} />Retry</button></div>}
    <div className="adc-workspace"><div className="adc-main"><div className="adc-stats">{cards.map(([label, count, Icon, tone, hint]) => <article className="adc-card" key={label}><span className={`adc-icon ${tone}`}><Icon size={27} /></span><div><h2>{label}</h2><strong>{loading ? '—' : count.toLocaleString('en-IN')}</strong><p>{hint}</p></div></article>)}</div>
      <form className="adc-card adc-filters" onSubmit={(event) => event.preventDefault()}><fieldset><legend>Date Range</legend><input type="date" aria-label="Challan from date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /><span>–</span><input type="date" aria-label="Challan to date" min={filters.from || undefined} value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></fieldset><label>Customer<SelectDropdown aria-label="Filter customer" value={filters.customer} onChange={(value) => updateFilter('customer', value)} options={[{ value: '', label: 'All Customers' }, ...customers.map((value) => ({ value, label: value }))]} searchable portal /></label><label>Delivery Status<SelectDropdown aria-label="Filter delivery status" value={filters.status} onChange={(value) => updateFilter('status', value)} options={[{ value: '', label: 'All Status' }, ...DELIVERY_STATES.map((value) => ({ value, label: DELIVERY_LABELS[value] }))]} portal /></label><div className="adc-search"><Search size={17} /><input ref={searchRef} aria-label="Search challans" placeholder="Search challan no, customer, vehicle, or item…" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}><X size={15} />Clear</button></form>
      {filters.from && filters.to && filters.from > filters.to && <p className="adc-error" role="alert">End date must be on or after the start date.</p>}
      <section className="adc-card adc-register" aria-label="Delivery challan list"><div className="adc-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteChallan(challanId(record))} onDeleted={ids => load()} canDelete={record => record.lifecycleStatus !== 'cancelled'} className="adc-table"><thead><tr><th><input type="checkbox" ref={allRef} aria-label="Select all challans on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((doc) => challanId(doc) === id)) : [...new Set([...previous, ...rows.map(challanId)])])} /></th><th>#</th><th>Challan No.</th><th>Date</th><th>Customer</th><th>Linked To</th><th>Qty</th><th>Delivery Status</th><th>Billing Status</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={10} className="adc-empty">Loading delivery challans…</td></tr> : !rows.length ? <tr><td colSpan={10} className="adc-empty">{docs.length ? 'No challans match these filters.' : 'No delivery challans yet. Create your first challan.'}</td></tr> : rows.map((doc, index) => <BulkDeleteRow record={doc} key={challanId(doc)} className={checked.includes(challanId(doc)) || highlightedIndex === index ? 'adc-selected' : ''}><td><input type="checkbox" aria-label={`Select ${doc.number}`} checked={checked.includes(challanId(doc))} onChange={() => setChecked((previous) => previous.includes(challanId(doc)) ? previous.filter((id) => id !== challanId(doc)) : [...previous, challanId(doc)])} /></td><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button type="button" className="adc-number" onClick={() => select(doc)}>{doc.number}</button></td><td>{dateText(challanDate(doc))}</td><td>{doc.customer?.name || '—'}</td><td>{doc.meta?.poRef || '—'}</td><td>{challanQuantity(doc)}</td><td><Badge doc={doc} /></td><td><Badge doc={doc} billing /></td><td><div className="adc-row-actions"><button type="button" aria-label={`View ${doc.number}`} onClick={() => select(doc)}><Eye size={17} /></button><ChallanMenu doc={doc} {...menuProps} /></div></td></BulkDeleteRow>)}</tbody></BulkDeleteTable></div>
        <footer className="adc-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0} – {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} challans</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(5, pages) }, (_, index) => Math.min(Math.max(1, currentPage - 2), Math.max(1, pages - 4)) + index).map((value) => <button type="button" key={value} aria-label={`Page ${value}`} aria-current={currentPage === value ? 'page' : undefined} className={currentPage === value ? 'adc-primary' : ''} onClick={() => setPage(value)}>{value}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div><SelectDropdown aria-label="Challans per page" value={String(pageSize)} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} options={[10, 25, 50].map((value) => ({ value: String(value), label: `${value} / page` }))} portal /></footer>
      </section></div></div>
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}{pdfDoc && <DocumentPdfDownload doc={pdfDoc} bizSettings={settings} onDone={() => setPdfDoc(null)} />}{printDoc && <DocumentPreviewModal config={documentConfigs['delivery-challan']} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={totals(printDoc)} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} bizSettings={Object.keys(printDoc.businessSettingsSnapshot || {}).length ? printDoc.businessSettingsSnapshot : settings} onClose={() => setPrintDoc(null)} />}{deleteDoc && <DeleteDialog doc={deleteDoc} busy={busy} error={deleteError} onClose={() => setDeleteDoc(null)} onDelete={remove} />}
  </div>;
}
