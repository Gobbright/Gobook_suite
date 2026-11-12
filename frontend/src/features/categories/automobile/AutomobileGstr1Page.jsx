import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, Eye, FileText, Info, Printer, RefreshCw, Search, ShieldCheck, ShoppingCart, SquarePen, TriangleAlert, Users, X } from 'lucide-react';
import { gstService } from '../../../services/gstService.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { filterGstr1Documents, gstr1Documents, gstr1RateSummary, gstinStatus, isCredit, isDebit, validateGstr1 } from './automobileGstr1.js';
import './automobileProducts.css';
import './automobileGstr1.css';

const months = () => Array.from({ length: 24 }, (_, i) => new Date(new Date().getFullYear(), new Date().getMonth() - i, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
const sum = (rows, key = 'taxable') => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const tones = ['#0874ff', '#11c9a4', '#bc55ff', '#ffb42b', '#5b69a3'];
function Badge({ children, tone = 'green' }) { return <span className={`ag1-badge ${tone}`}>{children}</span>; }
function Dropdown({ label, value, onChange, options, disabled }) { return <label className="ag1-filter"><span>{label}</span><SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} disabled={disabled} className="autop-dropdown" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll /></label>; }
function Heading({ children, icon: Icon = FileText }) { return <h2 className="ag1-heading"><Icon size={19} />{children}</h2>; }
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function exportCsv(rows, filename) {
  const fields = ['invoiceNo', 'date', 'documentType', 'name', 'gstin', 'state', 'taxable', 'cgst', 'sgst', 'igst'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  download(filename, '\uFEFF' + [fields, ...rows.map((row) => fields.map((key) => row[key]))].map((row) => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8;');
}

export function AutomobileGstr1Page() {
  const [period, setPeriod] = useState(() => months()[0]);
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0); const [activeTab, setActiveTab] = useState('b2b');
  const [filters, setFilters] = useState({ branch: '', type: '', gstin: '', search: '' });
  const [page, setPage] = useState(1); const [size, setSize] = useState('10'); const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null); const [exporting, setExporting] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null); setSelected([]); setDetail(null); setExporting(false); setNotice('');
    gstService.getGstr1(period).then((response) => { if (active) setData(response); }).catch((err) => { if (active) setError(err.message || 'Unable to load GSTR-1.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reload]);
  useEffect(() => {
    if (!detail && !exporting) return undefined;
    const close = (event) => { if (event.key === 'Escape') { setDetail(null); setExporting(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [detail, exporting]);
  const documents = gstr1Documents(data || {});
  const rows = filterGstr1Documents(documents, filters);
  const b2b = rows.filter((row) => row.gstin && !isCredit(row) && !isDebit(row));
  const b2c = rows.filter((row) => !row.gstin && !isCredit(row) && !isDebit(row));
  const credits = rows.filter(isCredit); const debits = rows.filter(isDebit);
  const rates = gstr1RateSummary(rows);
  const issues = data ? validateGstr1(rows, period, data.gstin) : [];
  const allIssues = data ? validateGstr1(documents, period, data.gstin) : [];
  const blocking = allIssues.filter((row) => row.blocking);
  const branches = [...new Set(documents.map((row) => row.branch).filter(Boolean))];
  const ready = Boolean(data) && !loading;
  const tabs = [['b2b', 'B2B Invoices', b2b.length, FileText], ['b2c', 'B2C Supplies', b2c.length, Users], ['credit', 'Credit Notes', credits.length, FileText], ['debit', 'Debit Notes', debits.length, FileText], ['rates', 'Tax Rate Summary', rates.length, ClipboardList], ['issues', 'Validation Issues', issues.length, TriangleAlert]];
  const tableRows = { b2b, b2c, credit: credits, debit: debits, rates, issues }[activeTab];
  const pages = Math.max(1, Math.ceil(tableRows.length / Number(size))); const currentPage = Math.min(page, pages);
  const visible = tableRows.slice((currentPage - 1) * Number(size), currentPage * Number(size));
  const isDocumentsTab = !['rates', 'issues'].includes(activeTab);
  const warningKeys = new Set(issues.filter((issue) => issue.blocking).map((issue) => issue.rowKey));
  const readiness = !ready || !documents.length ? 0 : blocking.length ? Math.max(0, Math.round((documents.length - new Set(blocking.map((issue) => issue.rowKey)).size) / documents.length * 100)) : 100;
  const value = (amount) => ready ? money(amount) : '—';
  function filter(key, next) { setFilters((prev) => ({ ...prev, [key]: next })); setPage(1); setSelected([]); }
  function changeTab(tab) { setActiveTab(tab); setPage(1); setSelected([]); }
  function toggleRow(key) { setSelected((prev) => prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]); }
  function exportSection() {
    if (activeTab === 'rates') {
      download(`GSTR-1-Rates-${period}.json`, JSON.stringify({ period, rates }, null, 2), 'application/json');
    } else if (activeTab === 'issues') {
      download(`GSTR-1-Validation-${period}.json`, JSON.stringify({ period, issues }, null, 2), 'application/json');
    } else exportCsv(selected.length ? tableRows.filter((row) => selected.includes(row.key)) : tableRows, `GSTR-1-${activeTab}-${period}.csv`);
  }
  const baseColumns = ['Invoice No.', 'Invoice Date', 'Customer Name', 'GSTIN', 'Taxable Amount', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Place of Supply', 'GSTIN Status', 'Status', 'Actions'];
  const columns = activeTab === 'rates' ? ['GST Rate', 'Taxable Amount', 'CGST (₹)', 'SGST (₹)', 'IGST (₹)', 'Total Tax'] : activeTab === 'issues' ? ['Document', 'Validation Issue', 'Severity'] : baseColumns;
  const positiveRates = rates.filter((row) => row.taxable > 0); const positiveTaxable = sum(positiveRates);
  let donutOffset = 0;
  const segments = positiveRates.map((row, i) => { const share = row.taxable / (positiveTaxable || 1) * 100; const segment = { ...row, share, offset: donutOffset, color: tones[i % tones.length] }; donutOffset += share; return segment; });
  return <div className="ag1-host"><main className="autop-page ag1-page" aria-busy={loading}>
    <header className="autop-header"><div><div className="ag1-title"><h1>GSTR-1</h1><Badge tone="blue">{data?.status === 'filed' ? 'Saved Filed Record' : 'Outward Supplies'}</Badge></div><p>Prepare and manage your GSTR-1 outward supplies. Review data and prepare exports.</p></div><div className="autop-actions"><button className="ag1-primary" disabled={!ready} onClick={() => setExporting(true)}><Download size={17} />Prepare Export</button><button className="ag1-validate" disabled={!ready} onClick={() => { setFilters({ branch: '', type: '', gstin: '', search: '' }); changeTab('issues'); setNotice(`${allIssues.length} local validation issue(s), including ${blocking.length} blocking issue(s).`); }}><CheckCircle2 size={18} />Validate</button><button disabled={!ready} onClick={() => window.print()}><Printer size={17} />Print Summary</button><button disabled={loading} onClick={() => setReload((v) => v + 1)}><RefreshCw size={17} />Refresh</button></div></header>
    {error && <div className="autop-error" role="alert">{error}<button onClick={() => setReload((v) => v + 1)}>Retry</button></div>}
    {notice && <div className="ag1-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={15} /></button></div>}
    <section className="ag1-filters"><Dropdown label="Tax Period" value={period} onChange={(next) => { setPeriod(next); setPage(1); }} options={months()} /><Dropdown label="Branch" value={filters.branch} onChange={(next) => filter('branch', next)} options={[{ value: '', label: 'Branch' }, ...branches.map((branch) => ({ value: branch, label: branch }))]} disabled={!branches.length} /><Dropdown label="Document Type" value={filters.type} onChange={(next) => filter('type', next)} options={[{ value: '', label: 'Document Type' }, ...['invoice', 'bill-of-supply', 'e-invoice', 'e-way-bill', 'credit-note', 'debit-note', 'sales-return'].map((type) => ({ value: type, label: type.replaceAll('-', ' ') }))]} /><Dropdown label="GSTIN Status" value={filters.gstin} onChange={(next) => filter('gstin', next)} options={[{ value: '', label: 'GSTIN Status' }, ...['Format valid', 'Invalid format', 'Unregistered'].map((status) => ({ value: status, label: status }))]} /><label className="ag1-filter ag1-search"><span>Search</span><div><Search size={17} /><input aria-label="Search GSTR-1 records" placeholder="Search by invoice no, customer, GSTIN…" value={filters.search} onChange={(e) => filter('search', e.target.value)} /></div></label></section>
    <section className="ag1-stats">{[
      ['Outward Supplies', value(sum(rows)), 'Net taxable supplies', ShoppingCart, 'blue'],
      ['B2B Invoices', value(sum(b2b)), `${b2b.length} records`, Users, 'green'],
      ['B2C Supplies', value(sum(b2c)), `${b2c.length} records`, Users, 'orange'],
      ['Credit / Debit Notes', value(Math.abs(sum(credits)) + Math.abs(sum(debits))), `${credits.length} CN | ${debits.length} DN`, FileText, 'red'],
      ['Validation Warnings', ready ? issues.length : '—', `${issues.filter((row) => row.blocking).length} blocking | ${issues.filter((row) => !row.blocking).length} review`, TriangleAlert, 'red'],
      ['Export Readiness', ready ? (!documents.length ? 'No Data' : blocking.length ? 'Needs Review' : 'Review Ready') : '—', 'Local data checks', ShieldCheck, 'purple'],
    ].map(([label, amount, note, Icon, tone]) => <article className="ag1-stat" key={label}><span className={`ag1-icon ${tone}`}><Icon size={26} /></span><div><h2>{label}</h2><strong>{amount}</strong><small>{note}</small></div></article>)}</section>
    <section className="ag1-card ag1-list"><nav className="ag1-tabs" aria-label="GSTR-1 sections">{tabs.map(([id, label, count, Icon]) => <button aria-pressed={activeTab === id} className={activeTab === id ? 'active' : ''} key={id} onClick={() => changeTab(id)}><Icon size={21} /><span>{label}{id !== 'rates' && ` (${count})`}</span></button>)}</nav><div className="ag1-list-heading"><h2>{activeTab === 'b2b' ? 'B2B Invoices - Outward Supplies to Registered Persons' : tabs.find(([id]) => id === activeTab)?.[1]}</h2><button disabled={!ready || !tableRows.length} onClick={exportSection}><Download size={15} />Export {selected.length ? `(${selected.length})` : `(${activeTab.toUpperCase()})`}</button></div>
      <div className="ag1-table-scroll"><table><thead><tr>{isDocumentsTab && <><th><input type="checkbox" aria-label="Select visible records" checked={Boolean(visible.length) && visible.every((row) => selected.includes(row.key))} onChange={(e) => setSelected((prev) => e.target.checked ? [...new Set([...prev, ...visible.map((row) => row.key)])] : prev.filter((key) => !visible.some((row) => row.key === key)))} /></th><th>#</th></>}{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={row.key || row.rate}>
        {isDocumentsTab ? <><td><input type="checkbox" aria-label={`Select ${row.invoiceNo || row.name}`} checked={selected.includes(row.key)} onChange={() => toggleRow(row.key)} /></td><td>{(currentPage - 1) * Number(size) + index + 1}</td><td>{row.invoiceNo || 'Summary'}</td><td>{row.date || '—'}</td><td>{row.name || 'Unregistered customer'}</td><td>{row.gstin || '—'}</td>{['taxable', 'cgst', 'sgst', 'igst'].map((key) => <td className="ag1-number" key={key}>{money(Math.abs(Number(row[key]) || 0))}</td>)}<td>{row.state || 'Not recorded'}</td><td><span className={`ag1-gstin ${gstinStatus(row) === 'Invalid format' ? 'invalid' : ''}`}>{gstinStatus(row) === 'Format valid' ? <CheckCircle2 size={14} /> : <Info size={14} />}{gstinStatus(row)}</span></td><td><Badge tone={warningKeys.has(row.key) ? 'amber' : 'green'}>{warningKeys.has(row.key) ? 'Review' : 'Checked'}</Badge></td><td><div className="ag1-row-actions"><button aria-label={`View ${row.invoiceNo || 'summary'}`} onClick={() => setDetail(row)}><Eye size={15} /></button>{row.sourceId && data?.status !== 'filed' && <Link aria-label={`Edit ${row.invoiceNo}`} to={`/billing/${row.documentType}/${encodeURIComponent(row.sourceId)}/edit`}><SquarePen size={15} /></Link>}</div></td></>
          : activeTab === 'rates' ? <><td>{row.rate}%</td>{['taxable', 'cgst', 'sgst', 'igst'].map((key) => <td key={key} className="ag1-number">{money(row[key])}</td>)}<td className="ag1-number">{money(row.cgst + row.sgst + row.igst)}</td></> : <><td>{row.invoiceNo}</td><td>{row.message}</td><td><Badge tone={row.blocking ? 'red' : 'amber'}>{row.blocking ? 'Blocking' : 'Review'}</Badge></td></>}
      </tr>)}{!visible.length && <tr><td colSpan={columns.length + (isDocumentsTab ? 2 : 0)} className="ag1-empty">{loading ? 'Loading GSTR-1 records…' : error ? 'Records unavailable. Refresh to try again.' : activeTab === 'issues' ? 'No local validation issues found.' : 'No records match this section and filters.'}</td></tr>}</tbody></table></div>
      <footer className="ag1-pagination"><span>{tableRows.length ? (currentPage - 1) * Number(size) + 1 : 0}–{Math.min(currentPage * Number(size), tableRows.length)} of {tableRows.length} entries</span><div><span>Rows per page</span><SelectDropdown aria-label="Rows per page" value={size} onChange={(next) => { setSize(next); setPage(1); }} options={['10', '20', '50']} className="ag1-page-size" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll /><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button><b>{currentPage}</b><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={15} /></button></div></footer>
    </section>
    <section className="ag1-bottom"><article className="ag1-card"><Heading icon={ClipboardList}>Tax Rate Summary (Net Supplies)</Heading><div className="ag1-tax-breakup"><svg viewBox="0 0 160 160" aria-label="Taxable supplies by GST rate" role="img"><title>Positive net taxable amounts by GST rate</title><circle cx="80" cy="80" r="61" fill="none" stroke="#edf3fd" strokeWidth="22" />{segments.map((row) => <circle key={row.rate} cx="80" cy="80" r="61" fill="none" stroke={row.color} strokeWidth="22" pathLength="100" strokeDasharray={`${row.share} ${100 - row.share}`} strokeDashoffset={-row.offset} transform="rotate(-90 80 80)" />)}<text x="80" y="78" textAnchor="middle">{ready ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(sum(rows)) : '—'}</text><text className="ag1-donut-label" x="80" y="96" textAnchor="middle">Net Taxable</text></svg><div>{segments.map((row) => <p key={row.rate}><span style={{ background: row.color }} /><b>{row.rate}%</b><small>{row.share.toFixed(1)}%</small><strong>{money(row.taxable)}</strong></p>)}{!segments.length && <p>No positive taxable supplies.</p>}</div></div></article>
      <article className="ag1-card"><div className="ag1-warnings-heading"><Heading icon={TriangleAlert}>Validation Warnings ({issues.length})</Heading><button onClick={() => changeTab('issues')}>View All →</button></div><div className="ag1-warnings">{issues.slice(0, 5).map((issue) => <button key={issue.key} onClick={() => { changeTab('issues'); }}><TriangleAlert size={15} /><span>{issue.message}</span><Badge tone={issue.blocking ? 'red' : 'amber'}>{issue.blocking ? '!' : 'Review'}</Badge></button>)}{!issues.length && <p>{ready ? 'No local data issues found.' : 'Validation results unavailable.'}</p>}</div><p className="ag1-note">GSTIN format is checked locally. Registration and eligibility require separate verification.</p></article>
      <article className="ag1-card"><Heading>Filing & Export Readiness</Heading><div className="ag1-readiness"><div className="ag1-progress" style={{ '--progress': `${readiness}%` }}><div><strong>{readiness}%</strong><small>Local Checks</small></div></div><ul><li><CheckCircle2 size={16} />{ready ? 'Data loaded for review' : 'Waiting for data'}</li><li><CheckCircle2 size={16} />{blocking.length ? `${blocking.length} blocking issue(s)` : 'No local blocking issues'}</li><li><Info size={16} />Exports include the full selected period</li><li><Info size={16} />No GST portal submission from this page</li></ul></div><div className="ag1-disclaimer"><Info size={20} /><span>Exports are for review and reconciliation. Complete official return preparation and filing through the GST portal or your authorized integration.</span></div></article></section>
    {(detail || exporting) && <div className="ag1-overlay" onClick={(event) => { if (event.target === event.currentTarget) { setDetail(null); setExporting(false); } }}><section className="ag1-dialog" role="dialog" aria-modal="true" aria-labelledby="ag1-dialog-title"><header><h2 id="ag1-dialog-title">{exporting ? 'Prepare GSTR-1 Export' : detail.invoiceNo || 'Supply Summary'}</h2><button autoFocus aria-label="Close dialog" onClick={() => { setDetail(null); setExporting(false); }}><X size={19} /></button></header>{exporting ? <><p>{period} · {documents.length} source records · {blocking.length} local blocking issue(s).</p><p className="ag1-note">This review export uses GoBook's data structure and is not an official GST portal upload file. Filters do not restrict this full-period export.</p><div className="ag1-export-actions"><button disabled={!documents.length} onClick={() => exportCsv(documents, `GSTR-1-Review-${period}.csv`)}><Download size={16} />Download CSV</button><button disabled={!documents.length} onClick={() => download(`GSTR-1-Review-${period}.json`, JSON.stringify({ period, gstin: data.gstin, status: data.status, documents, validation: allIssues }, null, 2), 'application/json')}><Download size={16} />Download Review JSON</button></div></> : <dl>{[['Document Type', detail.documentType], ['Date', detail.date], ['Customer', detail.name], ['GSTIN', detail.gstin], ['Place of Supply', detail.state], ['Branch', detail.branch], ['Taxable Amount', money(detail.taxable)], ['CGST', money(detail.cgst)], ['SGST', money(detail.sgst)], ['IGST', money(detail.igst)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>}</section></div>}
  </main></div>;
}
