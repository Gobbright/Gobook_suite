import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Copy, Download, Eye, FileText, IndianRupee, MoreVertical, Pencil, Plus, Printer, RefreshCw, Search, Send } from "lucide-react";
import { api } from '../../../services/api.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { downloadExcel } from '../../../utils/exportData.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useListKeyboardNav } from '../../../hooks/useListKeyboardNav.js';
import { ShareModal } from '../retail/modules/sales/shared/ShareModal.jsx';
import { DocumentPdfDownload, calcDocumentTotals } from '../retail/modules/sales/shared/DocumentPdfDownload.jsx';
import { DocumentPreviewModal } from '../retail/modules/sales/shared/DocumentPreviewModal.jsx';
import { documentConfigs } from '../retail/modules/sales/documentConfigs.js';
import { filterQuotations, quotationAmounts, quotationStats, quotationStatus, QUOTATION_STATUSES } from './automobileQuotations.js';
import './automobileQuotations.css';

const EMPTY_FILTERS = { search: '', customer: '', status: '', from: '', to: '' };
const dateText = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const quoteId = (quote) => String(quote._id || quote.id);
const statusClass = (status) => `aq-status ${status.toLowerCase()}`;

function Menu({ label, ariaLabel, children }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({});
  function placeMenu(event) {
    if (!event.currentTarget.open) return;
    const rect = event.currentTarget.querySelector('summary').getBoundingClientRect();
    const above = window.innerHeight - rect.bottom < 190;
    setPosition({ position: 'fixed', right: Math.max(8, window.innerWidth - rect.right), top: above ? 'auto' : rect.bottom + 4, bottom: above ? window.innerHeight - rect.top + 4 : 'auto' });
  }
  function keyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const menu = ref.current;
    const summary = menu.querySelector('summary');
    if (event.key === 'Escape') { menu.open = false; summary.focus(); return; }
    menu.open = true;
    const options = [...menu.querySelectorAll('button:not(:disabled),a[href]')];
    const current = options.indexOf(document.activeElement);
    const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }
  return <details className="aq-menu" ref={ref} onToggle={placeMenu} onKeyDown={keyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}><summary aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}>{label}</summary><div style={position} onClick={() => { ref.current.open = false; }}>{children}</div></details>;
}



export function AutomobileQuotationPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [checked, setChecked] = useState([]);
  const [shareDoc, setShareDoc] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [printDoc, setPrintDoc] = useState(null);
  const [settings, setSettings] = useState({});
  const [busy, setBusy] = useState(false);
  async function deleteQuotation(quote) {
    if (busy || !window.confirm(`Delete quotation ${quote.number}?`)) return;
    setBusy(true); setError('');
    try { await api.deleteInvoice(quoteId(quote)); setQuotes((current) => current.filter((item) => quoteId(item) !== quoteId(quote))); setChecked((current) => current.filter((id) => id !== quoteId(quote))); }
    catch (failure) { setError(failure.message || 'Unable to delete quotation.'); }
    finally { setBusy(false); }
  }
  const searchRef = useRef(null);
  const selectAllRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const all = []; let current = 1;
        while (true) {
          const response = await api.listInvoices({ documentType: 'quotation', page: current, limit: 500 });
          if (!active) return;
          const rows = Array.isArray(response.data) ? response.data : [];
          all.push(...rows);
          if (!rows.length || all.length >= (Number(response.total) || rows.length)) break;
          current += 1;
        }
        setQuotes(all);
      } catch (failure) { if (active) setError(failure.message || 'Unable to load quotations.'); }
      finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [refresh]);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => {}); }, []);

  const stats = useMemo(() => quotationStats(quotes), [quotes]);
  const filtered = useMemo(() => filterQuotations(quotes, filters), [quotes, filters]);
  const customers = useMemo(() => [...new Set(quotes.map((quote) => quote.customer?.name).filter(Boolean))].sort(), [quotes]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = rows.find((quote) => checked.includes(quoteId(quote))) || rows[0] || null;
  const allChecked = rows.length > 0 && rows.every((quote) => checked.includes(quoteId(quote)));
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = !allChecked && rows.some((quote) => checked.includes(quoteId(quote))); }, [rows, checked, allChecked]);
  const { highlightedIndex } = useListKeyboardNav({ rowCount: rows.length, searchRef, onOpen: (index) => selectQuote(rows[index]) });

  function updateFilter(key, value) { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); }
  function selectQuote(quote) { navigate(`/billing/quotation/${quoteId(quote)}/view`); }
  function share(quote) { setShareDoc({ ...quote, id: quoteId(quote), total: quotationAmounts(quote).total }); }
  function duplicate(quote) { navigate(`/billing/quotation/new?copyQuotation=${encodeURIComponent(quoteId(quote))}`); }
  function convert(quote) { navigate(`/billing/invoice/new?fromQuotation=${encodeURIComponent(quoteId(quote))}`); }
  async function updateStatus(quote, status) {
    setBusy(true); setError('');
    try {
      const saved = await api.updateInvoice(quoteId(quote), { extra: { ...quote.extra, quotationStatus: status } });
      setQuotes((previous) => previous.map((entry) => quoteId(entry) === quoteId(quote) ? { ...entry, ...saved } : entry));
    } catch (failure) { setError(failure.message || 'Unable to update quotation status.'); }
    finally { setBusy(false); }
  }
  function exportQuotes() {
    const rowsToExport = checked.length ? quotes.filter((quote) => checked.includes(quoteId(quote))) : filtered;
    downloadExcel({ title: 'Quotations', filename: 'automobile-quotations', rows: rowsToExport, columns: [
      { label: 'Quotation No.', value: (quote) => quote.number }, { label: 'Customer', value: (quote) => quote.customer?.name || '' },
      { label: 'Created Date', value: (quote) => dateText(quote.meta?.date || quote.createdAt) }, { label: 'Valid Till', value: (quote) => dateText(quote.extra?.validTill) },
      { label: 'Amount', value: (quote) => quotationAmounts(quote).total }, { label: 'Status', value: quotationStatus },
    ] });
  }
  const cards = [
    ['Total Quotations', stats.total, FileText, 'blue', 'All quotations'], ['Quote Value', money(stats.value), IndianRupee, 'green', 'Total quotation value'],
    ['Awaiting Response', stats.awaiting, Clock3, 'red', 'Sent to customers'], ['Accepted', stats.accepted, CheckCircle2, 'green', 'Accepted quotations'],
    ['Expiring Soon', stats.expiring, CalendarClock, 'red', 'Within 7 days'],
  ];
  return <div className="automobile-quotations">
    <header className="aq-header"><div><h1>Quotation</h1><p>Create and manage quotations for your customers. Convert approved quotations to bills.</p></div><div className="aq-header-actions"><button type="button" disabled={loading || !filtered.length} onClick={exportQuotes}><Download size={17} />Export{checked.length ? ` (${checked.length})` : ''}</button><button type="button" disabled={!selected} onClick={() => setPrintDoc(selected)}><Printer size={17} />Print</button><Link className="aq-primary" to="/billing/quotation/new"><Plus size={18} />New Quotation</Link></div></header>
    <div className="aq-stats">{cards.map(([label, value, Icon, color, hint]) => <article className="aq-card" key={label}><span className={`aq-stat-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{loading ? '—' : value}</strong><p>{hint}</p></div></article>)}</div>
    {error && <div className="aq-error" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} />Retry</button></div>}
    <div className="aq-workspace"><section className="aq-card aq-register">
      <form className="aq-filters" onSubmit={(event) => { event.preventDefault(); updateFilter('search', search); }}>
        <fieldset className="aq-date-range"><legend>Date Range</legend><input type="date" aria-label="Quotation from date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /><span>–</span><input type="date" aria-label="Quotation to date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilter('to', event.target.value)} /></fieldset>
        <label>Customer<SelectDropdown aria-label="Filter customer" value={filters.customer} onChange={(value) => updateFilter('customer', value)} options={[{ value: '', label: 'All Customers' }, ...customers.map((value) => ({ value, label: value }))]} searchable portal /></label>
        <label>Status<SelectDropdown aria-label="Filter status" value={filters.status} onChange={(value) => updateFilter('status', value)} options={[{ value: '', label: 'All Status' }, ...QUOTATION_STATUSES.map((value) => ({ value, label: value }))]} portal /></label>
        <div className="aq-search"><Search size={17} /><input ref={searchRef} aria-label="Search quotations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotation no, customer name…" /><button type="submit" className="aq-primary">Search</button></div><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setSearch(''); setPage(1); setChecked([]); }}>Clear</button>
      </form>
      {filters.from && filters.to && filters.from > filters.to && <p className="aq-error" role="alert">The end date must be on or after the start date.</p>}
      <div className="aq-scroll"><BulkDeleteTable onDeleteRecord={record => api.deleteInvoice(quoteId(record))} onDeleted={ids => setRefresh(value => value + 1)} canDelete={record => quotationStatus(record) !== 'Converted'} className="aq-table"><thead><tr><th><input ref={selectAllRef} type="checkbox" aria-label="Select all quotations on page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((quote) => quoteId(quote) === id)) : [...new Set([...previous, ...rows.map(quoteId)])])} /></th><th>#</th><th>Quotation No.</th><th>Customer</th><th>Created Date</th><th>Valid Till</th><th>Amount (₹)</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={9} className="aq-empty">Loading quotations…</td></tr> : rows.length ? rows.map((quote, index) => <BulkDeleteRow record={quote} key={quoteId(quote)} className={checked.includes(quoteId(quote)) || highlightedIndex === index ? 'aq-active-row' : ''}>
          <td><input type="checkbox" aria-label={`Select ${quote.number}`} checked={checked.includes(quoteId(quote))} onChange={() => setChecked((previous) => previous.includes(quoteId(quote)) ? previous.filter((id) => id !== quoteId(quote)) : [...previous, quoteId(quote)])} /></td><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button type="button" className="aq-number" onClick={() => selectQuote(quote)}>{quote.number}</button></td><td><strong>{quote.customer?.name || '—'}</strong><small>{[quote.customer?.city, quote.customer?.state].filter(Boolean).join(', ')}</small></td><td>{dateText(quote.meta?.date || quote.createdAt)}</td><td>{dateText(quote.extra?.validTill)}</td><td className="aq-amount">{money(quotationAmounts(quote).total)}</td><td><span className={statusClass(quotationStatus(quote))}>{quotationStatus(quote)}</span></td><td><div className="aq-row-actions"><button type="button" aria-label={`View ${quote.number}`} onClick={() => selectQuote(quote)}><Eye size={17} /></button><Menu ariaLabel={`Actions for ${quote.number}`} label={<MoreVertical size={17} />}><Link to={`/billing/quotation/${quoteId(quote)}/edit`}><Pencil size={14} />Edit</Link><button type="button" onClick={() => setPdfDoc(quote)}><Download size={14} />Download PDF</button><button type="button" onClick={() => share(quote)}><Send size={14} />Share</button><button type="button" onClick={() => duplicate(quote)}><Copy size={14} />Duplicate</button><button type="button" disabled={busy || quotationStatus(quote) === 'Converted'} onClick={() => convert(quote)}>Convert to Bill</button><button type="button" disabled={busy || quotationStatus(quote) === 'Converted'} onClick={() => deleteQuotation(quote)}>Delete</button>{['Draft', 'Sent', 'Accepted', 'Rejected'].map((status) => <button type="button" key={status} disabled={busy || quotationStatus(quote) === 'Converted'} onClick={() => updateStatus(quote, status)}>Mark {status}</button>)}</Menu></div></td>
        </BulkDeleteRow>) : <tr><td colSpan={9} className="aq-empty">{quotes.length ? 'No quotations match your filters.' : 'No quotations yet. Create your first quotation to get started.'}</td></tr>}
      </tbody></BulkDeleteTable></div>
      <footer className="aq-pagination"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} quotations</span><div><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>{Array.from({ length: Math.min(5, pages) }, (_, index) => Math.max(1, Math.min(currentPage - 2, pages - 4)) + index).map((number) => <button type="button" key={number} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'aq-primary' : ''} onClick={() => setPage(number)}>{number}</button>)}<button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button><SelectDropdown aria-label="Quotations per page" value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} options={[10, 25, 50].map((value) => ({ value, label: `${value} / page` }))} portal /></div></footer>
    </section></div>
    {shareDoc && <ShareModal doc={shareDoc} onClose={() => setShareDoc(null)} />}
    {pdfDoc && <DocumentPdfDownload doc={pdfDoc} bizSettings={settings} onDone={() => setPdfDoc(null)} />}
    {printDoc && <DocumentPreviewModal config={documentConfigs.quotation} customer={printDoc.customer} docMeta={{ ...printDoc.meta, number: printDoc.number }} docExtra={printDoc.extra} items={printDoc.items} charges={printDoc.charges} totals={{ ...calcDocumentTotals(printDoc.items, printDoc.charges, printDoc.additionalDiscount, printDoc.tds, printDoc.tcs, 0), ...printDoc.totals }} terms={printDoc.terms} notes={printDoc.notes} supplyType={printDoc.supplyType} bizSettings={printDoc.businessSettingsSnapshot || settings} onClose={() => setPrintDoc(null)} />}
  </div>;
}
