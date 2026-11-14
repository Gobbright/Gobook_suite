import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Coins, Download, Eye, FileText, Filter, Grid2X2, Info, ListChecks, Percent, Printer, RefreshCw, Search, ShieldCheck, ShoppingBag, SquarePen, TriangleAlert, Upload, Users, X } from 'lucide-react';
import { gstService } from '../../../services/gstService.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useFocusTrap } from '../../../hooks/useFocusTrap.js';
import { filterGstr1Documents, gstr1Documents, gstr1RateSummary, gstr1Sections, gstinStatus } from './automobileGstr1.js';
import './automobileGstr1.css';

const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const sum = (rows, key = 'taxable') => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const tax = rows => ['igst', 'cgst', 'sgst', 'cess'].reduce((total, key) => total + sum(rows, key), 0);
const total = rows => sum(rows) + tax(rows);
const periodText = date => date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const shortPeriod = period => new Date(`1 ${period}`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const fyStart = date => date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
const fyText = year => `${year}-${String(year + 1).slice(-2)}`;
const validPeriod = value => /^(January|February|March|April|May|June|July|August|September|October|November|December) 20\d{2}$/.test(value || '');
const displayDate = date => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function Badge({ children, tone = 'green' }) { return <span className={`ag1-badge ${tone}`}>{children}</span>; }
function Dropdown({ label, value, onChange, options, disabled, className = '' }) { return <label className={`ag1-filter ${className}`}><span>{label}</span><SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} disabled={disabled} buttonClassName="ag1-select-trigger" menuClassName="ag1-dropdown-menu" portal closeOnScroll /></label>; }
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function exportCsv(rows, filename) {
  const fields = ['invoiceNo', 'date', 'documentType', 'name', 'gstin', 'state', 'taxable', 'igst', 'cgst', 'sgst'];
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  download(filename, '\uFEFF' + [fields, ...rows.map(row => fields.map(key => row[key]))].map(row => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8;');
}

export function AutomobileGstr1Page() {
  const location = useLocation();
  const [period, setPeriod] = useState(() => { const requested = new URLSearchParams(location.search).get('period'); return validPeriod(requested) ? requested : periodText(new Date()); });
  const [data, setData] = useState(null);
  const operation = useRef(0);
  const [busy, setBusy] = useState(''), [recording, setRecording] = useState(false), [allowEmpty, setAllowEmpty] = useState(false);
  const [receipt, setReceipt] = useState({ arn: '', filedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), confirmed: false });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [activeTab, setActiveTab] = useState('b2b');
  const [workflow, setWorkflow] = useState('preparation'), [detailView, setDetailView] = useState(true);
  const [filters, setFilters] = useState({ branch: '', type: '', gstin: '', search: '' }), [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1), [size, setSize] = useState('10'), [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null), [exporting, setExporting] = useState(false), [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState(''), [updatedAt, setUpdatedAt] = useState(null);
  const closeDialog = () => { setDetail(null); setExporting(false); setPreview(false); setRecording(false); };
  const dialogRef = useFocusTrap({ active: Boolean(detail || exporting || preview || recording), onClose: closeDialog });
  useEffect(() => {
    const token = ++operation.current, abort = new AbortController();
    setLoading(true); setError(''); setData(null); setSelected([]); setDetail(null); setExporting(false); setPreview(false); setRecording(false); setBusy(''); setNotice(''); setAllowEmpty(false); setReceipt({ arn: '', filedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), confirmed: false });
    gstService.getGstr1(period, 'monthly', { signal: abort.signal }).then(response => {
      if (operation.current === token) { setData(response); setAllowEmpty(response.workflow?.allowEmpty === true); setUpdatedAt(response.generatedAt ? new Date(response.generatedAt) : new Date()); }
    }).catch(failure => { if (operation.current === token && !abort.signal.aborted) setError(failure.message || 'Unable to load GSTR-1.'); }).finally(() => { if (operation.current === token) setLoading(false); });
    return () => { abort.abort(); operation.current = token + 1; };
  }, [period, reload]);
  const ready = Boolean(data) && !loading;
  const business = data?.business || {};
  const businessGstin = data?.gstin || '';
  const preparation = data?.workflow || {};
  const requestBody = () => ({ period, expectedSourceHash: preparation.sourceHash });
  const documents = gstr1Documents(data || {}), rows = filterGstr1Documents(documents, filters);
  const sections = gstr1Sections(rows), all = gstr1Sections(documents);
  const rates = gstr1RateSummary(rows);
  const hsn = (data?.hsn || []).filter(row => !filters.search || [row.hsn, row.desc].join(' ').toLowerCase().includes(filters.search.toLowerCase()));
  const allIssues = ready ? preparation.validation?.issues || [] : [];
  const rowKeys = new Set(rows.map(row => row.key));
  const issues = allIssues.filter(issue => !issue.rowKey || rowKeys.has(issue.rowKey));
  const blocking = allIssues.filter(issue => issue.blocking), warnings = allIssues.filter(issue => !issue.blocking);
  const blockingKeys = new Set(blocking.map(issue => issue.rowKey));
  const validCount = blocking.some(issue => !issue.rowKey) ? 0 : documents.filter(row => !blockingKeys.has(row.key)).length;
  const branches = [...new Set(documents.map(row => row.branch).filter(Boolean))];
  const financialYear = fyStart(new Date(`1 ${period}`)), currentYear = fyStart(new Date());
  const years = [...new Set([financialYear, ...Array.from({ length: 6 }, (_, index) => currentYear + 1 - index)])].sort((a, b) => b - a);
  const periods = Array.from({ length: 12 }, (_, index) => periodText(new Date(financialYear, index + 3, 1)));
  const tabs = [
    ['b2b', 'B2B Invoices', 'Registered customers', all.b2b.length, sum(all.b2b), Users, 'blue'],
    ['b2cl', 'B2C Large', 'Interstate unregistered', all.b2cl.length, sum(all.b2cl), ShoppingBag, 'purple'],
    ['b2cs', 'B2C Others', 'Other unregistered supplies', all.b2cs.length, sum(all.b2cs), ShoppingBag, 'orange'],
    ['exports', 'Exports', 'Export invoices', all.exports.length, sum(all.exports), Upload, 'blue'],
    ['notes', 'Credit / Debit Notes', 'Net note adjustments', all.notes.length, sum(all.notes), FileText, 'red'],
    ['advances', 'Advances', 'Taxable advance records', null, null, Coins, 'purple'],
    ['hsn', 'HSN Summary', 'HSN / SAC details', data?.hsn?.length || 0, sum(data?.hsn || []), Grid2X2, 'blue'],
    ['documents', 'Documents Issued', 'Stored source records', documents.length, sum(documents), ClipboardList, 'blue'],
  ];
  const tableRows = { ...sections, rates, hsn, documents: rows, issues }[activeTab] || [];
  const pages = Math.max(1, Math.ceil(tableRows.length / Number(size))), currentPage = Math.min(page, pages);
  const visible = tableRows.slice((currentPage - 1) * Number(size), currentPage * Number(size));
  const isDocumentsTab = !['rates', 'hsn', 'issues'].includes(activeTab);
  const activeSection = [...tabs, ['rates', 'Tax Rate Summary'], ['issues', 'Validation']].find(([key]) => key === activeTab);
  const invoiceCount = documents.filter(row => ['invoice', 'bill-of-supply', 'e-invoice'].includes(row.documentType)).length;
  const value = amount => ready ? money(amount) : '—';
  const filed = preparation.filed === true;
  const canExport = ready && !busy && (preparation.exportReady || filed);
  const progress = [ready, preparation.validated, preparation.summaryGenerated, preparation.exportReady, filed];
  function filter(key, next) { setFilters(previous => ({ ...previous, [key]: next })); setPage(1); setSelected([]); }
  function changeTab(tab) { setActiveTab(tab); setDetailView(true); setPage(1); setSelected([]); }
  function selectSection(tab) { changeTab(tab); setWorkflow('preparation'); }
  function toggleRow(key) { setSelected(previous => previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key]); }
  function changePeriod(next) { setPeriod(next); setPage(1); }
  async function perform(name, task, accept) {
    if (busy) return;
    const token = operation.current;
    setBusy(name); setError('');
    try { const response = await task(); if (operation.current === token) accept(response); }
    catch (failure) {
      if (operation.current === token) {
        setError(failure.message || 'The action failed. Please try again.');
        if (/changed|validate.*again|another request/i.test(failure.message || '')) {
          try { const response = await gstService.getGstr1(period); if (operation.current === token) setData(response); } catch { /* Keep the actionable failure visible. */ }
        }
      }
    } finally { if (operation.current === token) setBusy(''); }
  }
  function importSource(documentType = '') {
    return perform('import', () => gstService.getGstr1(period), response => {
      setData(response); setUpdatedAt(new Date(response.generatedAt)); setFilters({ branch: '', type: documentType, gstin: '', search: '' }); setWorkflow('preparation'); changeTab('documents');
      const count = (response.sourceDocuments || []).filter(row => !documentType || row.documentType === documentType).length;
      setNotice(documentType ? `Loaded ${count} stored ${documentType} record(s). Records are read from billing without creating duplicates.` : 'Billing records refreshed. Categories and totals use the stored source documents.');
    });
  }
  function validateData() {
    return perform('validation', () => gstService.validateGstr1({ ...requestBody(), allowEmpty }), response => {
      setData(response); setWorkflow('validation'); setFilters({ branch: '', type: '', gstin: '', search: '' }); changeTab('issues');
      setNotice(`Validation saved: ${response.workflow.validation.errors} error(s) and ${response.workflow.validation.warnings} warning(s).`);
    });
  }
  function generateSummary() {
    return perform('summary', () => gstService.generateGstr1Summary(requestBody()), response => {
      setData(response); setDetailView(false); setNotice(`Summary saved for ${shortPeriod(period)}. The return is ready for export.`);
    });
  }
  function downloadReturn(format) {
    return perform(`export-${format}`, () => gstService.exportGstr1({ ...requestBody(), format }), response => {
      const content = response.encoding === 'base64' ? Uint8Array.from(atob(response.content), character => character.charCodeAt(0)) : response.content;
      download(response.filename, content, response.mimeType);
      setData(previous => ({ ...previous, workflow: response.workflow }));
      setNotice(`${format.toUpperCase()} export downloaded and recorded.`);
    });
  }
  function recordFiling(event) {
    event.preventDefault();
    return perform('filing', () => gstService.fileGstr1({ ...requestBody(), ...receipt }), response => {
      setData(response); setRecording(false); setWorkflow('history'); setNotice('Portal acknowledgement recorded. It has not been verified through a GST provider.');
    });
  }
  function exportSection() {
    if (activeTab === 'rates' || activeTab === 'issues' || activeTab === 'hsn') download(`GSTR-1-${activeTab}-${period}.json`, JSON.stringify({ period, [activeTab]: tableRows }, null, 2), 'application/json');
    else exportCsv(selected.length ? tableRows.filter(row => selected.includes(row.key)) : tableRows, `GSTR-1-${activeTab}-${period}.csv`);
  }
  const summaryRows = [['B2B Supplies', all.b2b, Users], ['B2C Large', all.b2cl, ShoppingBag], ['B2C Others', all.b2cs, ShoppingBag], ['Exports', all.exports, Upload], ['Credit / Debit Notes', all.notes, FileText]];
  const columns = activeTab === 'rates' ? ['GST Rate', 'Taxable Value', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Total GST'] : activeTab === 'issues' ? ['Document', 'Validation Issue', 'Severity'] : activeTab === 'hsn' ? ['HSN / SAC', 'Description', 'Quantity', 'Taxable Value', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)'] : ['Invoice No.', 'Invoice Date', 'Customer Name', 'Customer GSTIN', 'Taxable Value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'Total (₹)', 'Status', ''];
  return <main className="ag1-host ag1-page" aria-busy={loading}>
    <header className="ag1-header"><div className="ag1-header-title"><BarChart3 size={32} /><div><h1>GSTR-1 – Outward Supplies</h1><p>Details of outward supplies of goods and services to be reported in GSTR-1.</p></div></div><div className="ag1-header-controls"><div className="ag1-business"><Building2 size={25} /><div><strong>{business.name || 'Business name not configured'}</strong><small>GSTIN: {businessGstin || 'Not configured'}</small></div></div><SelectDropdown aria-label="Financial year" disabled={Boolean(busy)} value={String(financialYear)} onChange={year => { const date = new Date(`1 ${period}`); changePeriod(periodText(new Date(Number(year) + (date.getMonth() < 3 ? 1 : 0), date.getMonth(), 1))); }} options={years.map(year => ({ value: String(year), label: `FY ${fyText(year)}` }))} className="ag1-year-select" buttonClassName="ag1-select-trigger" menuClassName="ag1-dropdown-menu" portal /><SelectDropdown aria-label="Tax Period" disabled={Boolean(busy)} value={period} onChange={changePeriod} options={periods.map(entry => ({ value: entry, label: `Period: ${shortPeriod(entry)}` }))} className="ag1-period-select" buttonClassName="ag1-select-trigger" menuClassName="ag1-dropdown-menu" portal /><span className="ag1-updated"><CheckCircle2 size={17} />{loading ? 'Updating records…' : error ? 'Refresh required' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : 'Not updated'}</span><button type="button" className="ag1-refresh" aria-label="Refresh GSTR-1" disabled={loading || Boolean(busy)} onClick={() => setReload(value => value + 1)}><RefreshCw size={22} /></button></div></header>
    <div className="ag1-content">
      {error && <div className="ag1-error" role="alert"><TriangleAlert size={18} /><span>{error}</span><button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
      {notice && <div className="ag1-notice" role="status"><Info size={16} /><span>{notice}</span><button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {ready && preparation.stale && <div className="ag1-notice" role="status"><Info size={16} /><span>Billing data changed. Validate again before generating a new summary or exporting.</span></div>}
      {ready && !documents.length && !filed && <label className="ag1-empty-confirm"><input type="checkbox" checked={allowEmpty} disabled={Boolean(busy)} onChange={event => setAllowEmpty(event.target.checked)} />Confirm that this selected period has no outward supplies before preparing an empty-period return.</label>}
      <section className="ag1-stats" aria-label="GSTR-1 summary">{[
        ['Total Outward Supplies', value(total(documents)), Coins, 'blue'],
        ['Taxable Value', value(sum(documents)), FileText, 'cyan'],
        ['Total GST', value(tax(documents)), Percent, 'green'],
        ['Total Invoices', ready ? invoiceCount.toLocaleString('en-IN') : '—', ClipboardList, 'blue'],
        ['Credit / Debit Notes', ready ? all.credit.length + all.debit.length : '—', SquarePen, 'red'],
      ].map(([label, amount, Icon, tone]) => <article className={`ag1-stat ${tone}`} key={label}><span className="ag1-stat-icon"><Icon size={31} /></span><div><h2>{label}</h2><strong>{amount}</strong></div></article>)}</section>
      <div className="ag1-workspace"><div className="ag1-main-column">
        <nav className="ag1-workflow-tabs" aria-label="GSTR-1 workflow">{[['preparation', 'Return Preparation'], ['validation', 'Validation'], ['history', 'Filing History'], ['reports', 'Reports']].map(([key, label]) => <button type="button" key={key} className={workflow === key ? 'active' : ''} aria-pressed={workflow === key} onClick={() => { setWorkflow(key); if (key === 'validation') changeTab('issues'); else if (key === 'reports') changeTab('rates'); }}>{label}</button>)}</nav>
        {workflow === 'history' ? <section className="ag1-card ag1-history"><h2>Preparation & Filing History <span>({shortPeriod(period)})</span></h2>{filed && <><Badge>Portal acknowledgement recorded</Badge><dl><div><dt>ARN / reference</dt><dd>{data.arn}</dd></div><div><dt>Filed on</dt><dd>{displayDate(data.filedAt)}</dd></div><div><dt>Source</dt><dd>{data.filing?.source === 'manual' ? 'Recorded by user; not verified online' : 'Provider confirmation'}</dd></div></dl></>}<ul className="ag1-history-events">{(preparation.history || []).slice().reverse().map((entry, index) => <li key={`${entry.date}-${index}`}><strong>{entry.stage.replaceAll('-', ' ')}</strong><time dateTime={entry.date}>{new Date(entry.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</time></li>)}</ul>{!preparation.history?.length && <p className="ag1-empty">{loading ? 'Loading saved history...' : 'No preparation actions saved for this period.'}</p>}</section> : <>
          <section className="ag1-card ag1-sections-card"><div className="ag1-section-heading"><h2>Table-wise Return Details <Info size={16} /></h2><div className="ag1-view-toggle"><button type="button" className={!detailView ? 'active' : ''} aria-pressed={!detailView} onClick={() => setDetailView(false)}>Summary</button><button type="button" className={detailView ? 'active' : ''} aria-pressed={detailView} onClick={() => setDetailView(true)}>Detail View</button></div></div><nav className="ag1-section-cards" aria-label="GSTR-1 sections">{tabs.map(([key, label, description, count, amount, Icon, tone]) => <button type="button" key={key} aria-controls="ag1-main-records" disabled={!ready} aria-pressed={activeTab === key} className={`ag1-section-tile ${tone}${activeTab === key ? ' active' : ''}`} onClick={() => selectSection(key)}><Icon size={25} /><strong>{label}</strong><small>{description}</small><b>{ready ? count == null ? 'Not tracked' : count : '—'}</b><span>{key === 'advances' ? 'Separate records required' : value(amount)}{activeTab === key && <ArrowRight size={15} />}</span></button>)}</nav></section>
          <section className="ag1-card ag1-list" id="ag1-main-records" aria-labelledby="ag1-records-heading"><div className="ag1-list-heading"><h2 id="ag1-records-heading" aria-live="polite">{activeSection?.[1]} {activeTab === 'b2b' && <span>– Registered Business Customers</span>}</h2><div><label className="ag1-search"><Search size={16} /><input aria-label="Search GSTR-1 records" placeholder="Search by invoice no., customer, GSTIN…" value={filters.search} onChange={event => filter('search', event.target.value)} /></label><button type="button" className={filtersOpen ? 'ag1-filter-active' : ''} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={16} />Filters</button><button type="button" className="ag1-section-export" aria-label="Export current section" title="Export current section" disabled={!ready || !tableRows.length} onClick={exportSection}><Download size={16} /></button></div></div>
            {filtersOpen && <div className="ag1-filters"><Dropdown label="Branch" value={filters.branch} onChange={next => filter('branch', next)} options={[{ value: '', label: 'All branches' }, ...branches.map(branch => ({ value: branch, label: branch }))]} disabled={!branches.length} /><Dropdown label="Document Type" value={filters.type} onChange={next => filter('type', next)} options={[{ value: '', label: 'All document types' }, ...['invoice', 'bill-of-supply', 'e-invoice', 'e-way-bill', 'credit-note', 'debit-note', 'sales-return'].map(type => ({ value: type, label: type.replaceAll('-', ' ') }))]} /><Dropdown label="GSTIN Status" value={filters.gstin} onChange={next => filter('gstin', next)} options={[{ value: '', label: 'All statuses' }, ...['Format valid', 'Invalid format', 'Unregistered'].map(status => ({ value: status, label: status }))]} /><button type="button" onClick={() => { setFilters({ branch: '', type: '', gstin: '', search: '' }); setPage(1); }}>Clear Filters</button></div>}
            {activeTab === 'advances' && <p className="ag1-section-note"><Info size={16} />Separate taxable-advance records are not stored by this billing service. Invoice-linked payments are not treated as Table 11 advances.</p>}
            {!detailView ? <div className="ag1-summary-view"><h3>{activeSection?.[1]} Summary</h3><dl><div><dt>Records</dt><dd>{ready ? tableRows.length : '—'}</dd></div><div><dt>Taxable value</dt><dd>{isDocumentsTab || activeTab === 'hsn' || activeTab === 'rates' ? value(sum(tableRows)) : '—'}</dd></div><div><dt>Total GST</dt><dd>{isDocumentsTab || activeTab === 'hsn' || activeTab === 'rates' ? value(tax(tableRows)) : '—'}</dd></div></dl><button type="button" onClick={() => setDetailView(true)}>Open Detail View <ArrowRight size={15} /></button></div> : <>
              <div className="ag1-table-scroll"><table aria-label={`${activeSection?.[1] || 'GSTR-1'} records`}><thead><tr>{isDocumentsTab && <th><input type="checkbox" aria-label="Select visible records" checked={Boolean(visible.length) && visible.every(row => selected.includes(row.key))} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, ...visible.map(row => row.key)])] : previous.filter(key => !visible.some(row => row.key === key)))} /></th>}{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={row.key || `${row.rate || row.hsn}-${index}`}>
                {isDocumentsTab ? <><td><input type="checkbox" aria-label={`Select ${row.invoiceNo || row.name}`} checked={selected.includes(row.key)} onChange={() => toggleRow(row.key)} /></td><td><button type="button" className="ag1-invoice-link" onClick={() => setDetail(row)}>{row.invoiceNo || 'Summary'}</button></td><td>{displayDate(row.date)}</td><td>{row.name || 'Unregistered customer'}</td><td>{row.gstin || '—'}</td>{['taxable', 'igst', 'cgst', 'sgst'].map(key => <td className="ag1-number" key={key}>{money(row[key])}</td>)}<td className="ag1-number">{money(total([row]))}</td><td><Badge tone={blocking.some(issue => !issue.rowKey) || blockingKeys.has(row.key) ? 'amber' : 'green'}>{blocking.some(issue => !issue.rowKey) || blockingKeys.has(row.key) ? 'Review' : 'Checked'}</Badge></td><td><div className="ag1-row-actions"><button type="button" aria-label={`View ${row.invoiceNo || 'summary'}`} title={`GSTIN: ${gstinStatus(row)}`} onClick={() => setDetail(row)}><Eye size={15} /></button>{row.sourceId && !filed && <Link aria-label={`Edit ${row.invoiceNo}`} to={`/billing/${row.documentType}/${encodeURIComponent(row.sourceId)}/edit`}><SquarePen size={15} /></Link>}</div></td></>
                  : activeTab === 'issues' ? <><td>{row.invoiceNo}</td><td>{row.message}</td><td><Badge tone={row.blocking ? 'red' : 'amber'}>{row.blocking ? 'Error' : 'Warning'}</Badge></td></> : activeTab === 'hsn' ? <><td>{row.hsn || '—'}</td><td>{row.desc || '—'}</td><td>{Number(row.qty || 0).toLocaleString('en-IN')}</td>{['taxable', 'igst', 'cgst', 'sgst'].map(key => <td key={key} className="ag1-number">{money(row[key])}</td>)}</> : <><td>{row.rate}%</td>{['taxable', 'igst', 'cgst', 'sgst'].map(key => <td key={key} className="ag1-number">{money(row[key])}</td>)}<td className="ag1-number">{money(tax([row]))}</td></>}
              </tr>)}{!visible.length && <tr><td colSpan={columns.length + (isDocumentsTab ? 1 : 0)} className="ag1-empty">{loading ? 'Loading GSTR-1 records…' : error ? 'Records unavailable. Refresh to try again.' : activeTab === 'advances' ? 'No separate taxable-advance records are available.' : activeTab === 'issues' ? 'No local validation issues found.' : 'No records match this section and filters.'}</td></tr>}</tbody>{isDocumentsTab && tableRows.length > 0 && <tfoot><tr><th colSpan={5}>Total ({tableRows.length} records)</th>{['taxable', 'igst', 'cgst', 'sgst'].map(key => <td key={key} className="ag1-number">{money(sum(tableRows, key))}</td>)}<td className="ag1-number">{money(total(tableRows))}</td><td colSpan={2} /></tr></tfoot>}</table></div>
              <footer className="ag1-pagination"><span>{tableRows.length ? (currentPage - 1) * Number(size) + 1 : 0}–{Math.min(currentPage * Number(size), tableRows.length)} of {tableRows.length} entries {selected.length > 0 && `· ${selected.length} selected`}</span><div><span>Rows</span><SelectDropdown aria-label="Rows per page" value={size} onChange={next => { setSize(next); setPage(1); }} options={['10', '20', '50']} className="ag1-page-size" buttonClassName="ag1-select-trigger" menuClassName="ag1-dropdown-menu" portal closeOnScroll /><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button><b>{currentPage}</b><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={15} /></button></div></footer>
            </>}
          </section>
        </>}
      </div><aside className="ag1-side-column" aria-label="Return summary and validation">
        <section className="ag1-card ag1-filing-progress"><h2>GSTR-1 Filing Progress <span>({shortPeriod(period)})</span></h2><ol>{['Draft', 'Validated', 'Summary Generated', 'Export Ready', 'Filed Record'].map((label, index) => <li key={label} className={progress[index] ? 'complete' : ''}><span>{progress[index] ? <Check size={13} strokeWidth={3} /> : <i />}</span><small>{label}</small></li>)}</ol><p className="ag1-progress-note">Saved preparation progress and recorded filing acknowledgement</p></section>
        <section className="ag1-card ag1-return-summary"><h2>Return Summary <span>({shortPeriod(period)})</span></h2><dl>{summaryRows.map(([label, entries, Icon]) => <div key={label}><dt><Icon size={18} />{label}</dt><dd><strong>{value(sum(entries))}</strong><small>GST {value(tax(entries))}</small></dd></div>)}</dl><div className="ag1-total-row"><strong>Total Taxable Value</strong><b>{value(sum(documents))}</b></div><div className="ag1-total-row"><strong>Total GST</strong><b>{value(tax(documents))}</b></div></section>
        <section className="ag1-card ag1-validation"><h2><CheckCircle2 size={22} />Validation Results</h2><dl><div><dt><CheckCircle2 size={19} />Locally Checked Records</dt><dd>{ready ? validCount : '—'}</dd></div><div><dt><TriangleAlert size={19} />Warnings</dt><dd>{ready ? warnings.length : '—'}<button type="button" disabled={!ready} onClick={() => { setWorkflow('validation'); changeTab('issues'); }}>View</button></dd></div><div><dt><X size={18} />Errors (Must Fix)</dt><dd>{ready ? blocking.length : '—'}</dd></div></dl><p className="ag1-progress-note">Local format and completeness checks</p></section>
      </aside></div>
      <footer className="ag1-actionbar"><button type="button" disabled={loading || Boolean(busy)} onClick={() => setReload(value => value + 1)}><RefreshCw size={18} />Refresh Billing Data</button><button type="button" disabled={!ready || Boolean(busy) || filed} onClick={() => importSource()}><Upload size={18} />Import from Billing</button><button type="button" disabled={!ready || Boolean(busy) || filed} onClick={() => importSource('e-invoice')}><FileText size={18} />Import E-Invoice</button><button type="button" disabled={!ready || Boolean(busy) || filed} onClick={() => importSource('e-way-bill')}><ClipboardList size={18} />Import E-Way Bill</button><button type="button" disabled={!ready || Boolean(busy) || filed || (!documents.length && !allowEmpty)} onClick={validateData}><ShieldCheck size={18} />{busy === 'validation' ? 'Validating...' : 'Validate Data'}</button><button type="button" disabled={!ready || !preparation.validated || Boolean(busy) || filed} onClick={generateSummary}><ClipboardCheck size={18} />{busy === 'summary' ? 'Saving Summary...' : 'Generate Summary'}</button><button type="button" disabled={!ready || Boolean(busy)} onClick={() => setPreview(true)}><Eye size={18} />Preview Return</button><button type="button" className="ag1-primary" disabled={!canExport} onClick={() => setExporting(true)}><Upload size={18} />Prepare GSTR-1 Export</button><button type="button" disabled={!canExport} onClick={() => setExporting(true)}><Download size={18} />Export (CSV / JSON / PDF)</button><button type="button" className="ag1-primary" disabled={!canExport || filed} onClick={() => window.open('https://www.gst.gov.in/', '_blank', 'noopener,noreferrer')}><Upload size={18} />File on GST Portal</button><button type="button" disabled={!canExport || filed} onClick={() => setRecording(true)}><CheckCircle2 size={18} />Record Portal Filing</button></footer>
      {(detail || exporting || preview || recording) && <div className="ag1-overlay" onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}><section ref={dialogRef} className="ag1-dialog" role="dialog" aria-modal="true" aria-labelledby="ag1-dialog-title"><header><h2 id="ag1-dialog-title">{recording ? 'Record Portal Filing Acknowledgement' : exporting ? 'Prepare GSTR-1 Export' : preview ? `GSTR-1 Preview · ${shortPeriod(period)}` : detail.invoiceNo || 'Supply Summary'}</h2><button type="button" aria-label="Close dialog" onClick={closeDialog}><X size={19} /></button></header>{error && <div className="ag1-error" role="alert">{error}</div>}{recording ? <form className="ag1-filing-form" onSubmit={recordFiling}><p>Enter the acknowledgement received after filing this return on the GST portal. This records your filing; it does not submit or verify it online.</p><label>ARN / acknowledgement reference<input required minLength={3} maxLength={64} value={receipt.arn} onChange={event => setReceipt(previous => ({ ...previous, arn: event.target.value }))} /></label><label>Filing date<input type="date" required max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} value={receipt.filedAt} onChange={event => setReceipt(previous => ({ ...previous, filedAt: event.target.value }))} /></label><label className="ag1-filing-confirm"><input type="checkbox" required checked={receipt.confirmed} onChange={event => setReceipt(previous => ({ ...previous, confirmed: event.target.checked }))} />I have already filed this period's return on the GST portal.</label><button type="submit" className="ag1-primary" disabled={Boolean(busy)}>{busy === 'filing' ? 'Recording...' : 'Save Acknowledgement'}</button></form> : exporting ? <><p>{period} · {documents.length} source records · {blocking.length} local error(s).</p><p className="ag1-note">Review files use GoBook’s data structure. Official GST portal preparation and submission remain separate.</p><div className="ag1-export-actions"><button type="button" disabled={!canExport} onClick={() => downloadReturn('csv')}><Download size={16} />{busy === 'export-csv' ? 'Downloading...' : 'Download CSV'}</button><button type="button" disabled={!canExport} onClick={() => downloadReturn('json')}><Download size={16} />{busy === 'export-json' ? 'Downloading...' : 'Download Review JSON'}</button><button type="button" disabled={!canExport} onClick={() => downloadReturn('pdf')}><Download size={16} />{busy === 'export-pdf' ? 'Downloading...' : 'Download PDF'}</button></div></> : preview ? <><p>GSTIN: {businessGstin || 'Not configured'} · {documents.length} source records</p><dl>{summaryRows.map(([label, entries]) => <div key={label}><dt>{label}</dt><dd>{money(sum(entries))}</dd></div>)}<div><dt>Total Taxable Value</dt><dd>{money(sum(documents))}</dd></div><div><dt>Total GST</dt><dd>{money(tax(documents))}</dd></div></dl><button type="button" onClick={() => window.print()}><Printer size={16} />Print Summary</button></> : <dl>{[['Document Type', detail.documentType], ['Date', detail.date], ['Customer', detail.name], ['GSTIN', detail.gstin], ['Place of Supply', detail.state], ['Branch', detail.branch], ['Taxable Value', money(detail.taxable)], ['IGST', money(detail.igst)], ['CGST', money(detail.cgst)], ['SGST', money(detail.sgst)]].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount || 'Not recorded'}</dd></div>)}</dl>}</section></div>}
    </div>
  </main>;
}
