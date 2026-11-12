import { Fragment, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { Calculator, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Download, FolderClosed, Home, Printer, RotateCcw, Scale, Search, TriangleAlert } from 'lucide-react';
import { getTrialBalance } from '../../../../../services/accountingService.js';
import { ExportButtons } from '../../../../../components/forms/ExportButtons.jsx';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { financialPeriod } from '../../../automobile/automobileTrialBalance.js';
import { trialBalanceFields, trialReportGroups } from './trialBalanceReport.js';
import './trialBalanceReport.css';

const currency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
const signed = (value) => `${currency(Math.abs(value))} ${value < 0 ? 'Cr' : 'Dr'}`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const categories = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Other Accounts'];
const headings = ['Opening Debit (Dr)', 'Opening Credit (Cr)', 'Period Debit', 'Period Credit', 'Closing Debit (Dr)', 'Closing Credit (Cr)'];
const rowKey = (row) => String(row._id || `${row.userId || ''}:${row.name}`);
function initialFilters(start = '01 April') {
  return { ...financialPeriod(today(), start), to: today(), group: '', view: 'grouped', branch: '', costCenter: '', showZero: true, comparison: 'none' };
}
function validDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function TrialBalanceReport() {
  const user = useCurrentUser();
  const context = [user?.businessId, user?.id || user?._id, user?.branch].join('|');
  const [loaded, setLoaded] = useState(null), [fyStart, setFyStart] = useState('01 April');
  const data = loaded?.context === context ? loaded.report : null;
  const [filters, setFilters] = useState(initialFilters), [applied, setApplied] = useState(null);
  const effectiveApplied = applied?.context === context ? applied : null;
  const [expanded, setExpanded] = useState(['Assets']), [collapsed, setCollapsed] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [formError, setFormError] = useState('');
  const [reload, setReload] = useState(0), [printing, setPrinting] = useState(false);
  const [search, setSearch] = useState(''), [sort, setSort] = useState('name'), [direction, setDirection] = useState('asc'), [page, setPage] = useState(1), [size, setSize] = useState(25);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const params = effectiveApplied ? { from: effectiveApplied.from, to: effectiveApplied.to, financialYear: `${effectiveApplied.year}-${String(Number(effectiveApplied.year) + 1).slice(-2)}`, branch: effectiveApplied.branch, costCenter: effectiveApplied.costCenter, comparison: effectiveApplied.comparison } : { initialize: true };
    getTrialBalance(params).then((report) => {
      if (!active) return;
      if (!Array.isArray(report.rows) || !report.period || !report.fyStart) throw new Error('Trial Balance API returned an invalid report. Restart the backend and retry.');
      setLoaded({ context, report }); setFyStart(report.fyStart);
      if (!effectiveApplied) setFilters({ ...initialFilters(report.fyStart), from: report.period.from, to: report.period.to, year: Number(report.period.financialYear?.slice(0, 4)) || financialPeriod(report.period.from, report.fyStart).year });
    }).catch((failure) => { if (active) setError(failure.message || 'Unable to load Trial Balance.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [effectiveApplied, reload, context]);
  const selected = effectiveApplied || filters;
  const visible = useMemo(() => trialReportGroups(data?.rows || [], selected.group, data?.groups || [], { search, showZero: selected.showZero, sort, direction }), [data, selected.group, selected.showZero, search, sort, direction]);
  const ready = !loading && !error && Boolean(data);
  const pages = Math.max(1, Math.ceil(visible.accounts.length / size)), currentPage = Math.min(page, pages);
  const pageRows = printing ? visible.accounts : visible.accounts.slice((currentPage - 1) * size, currentPage * size);
  const pageKeys = new Set(pageRows.map(rowKey));
  const currentYear = financialPeriod(today(), fyStart).year;
  const years = [...new Set([Number(filters.year), currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3, ...(data?.options?.financialYears || []).map((year) => Number(year.slice(0, 4)))])].filter(Number.isFinite).sort((first, second) => second - first);
  const accountGroups = [...new Set([...(data?.rows || []).map((row) => row.group), ...(data?.groups || []).flatMap((group) => [group.name, group.parent])].filter(Boolean))].sort();
  const closingOnly = selected.view === 'closing', comparing = Boolean(data?.period.previous);
  const fields = closingOnly ? trialBalanceFields.slice(-2) : trialBalanceFields;
  const columnCount = 2 + fields.length + (comparing ? 2 : 0);
  const exportColumns = [{ label: 'Ledger Account', value: (row) => row.name }, { label: 'Group', value: (row) => row.group }, ...trialBalanceFields.map((field, index) => ({ label: headings[index], value: (row) => row[field] })), ...(comparing ? [{ label: 'Previous Closing', value: (row) => row.previous?.closing || 0 }, { label: 'Change', value: (row) => (row.closing || 0) - (row.previous?.closing || 0) }] : [])];
  useEffect(() => { setPage(1); }, [search, sort, direction, applied, size]);
  function change(field, value) { setFormError(''); setFilters((current) => ({ ...current, [field]: value })); }
  function changeYear(value) {
    const period = financialPeriod(`${value}-${financialPeriod(today(), fyStart).from.slice(5)}`, fyStart);
    setFormError(''); setFilters((current) => ({ ...current, ...period, to: period.year === currentYear ? today() : period.to }));
  }
  function viewReport(event) {
    event.preventDefault();
    if (!validDate(filters.from) || !validDate(filters.to) || filters.from > filters.to) { setFormError('From Date must be a valid date on or before To Date.'); return; }
    const period = financialPeriod(filters.from, fyStart);
    if (filters.to > period.to) { setFormError('Select dates within one financial year.'); return; }
    setFormError(''); setFilters((current) => ({ ...current, year: period.year })); setApplied({ ...filters, year: period.year, context }); setPage(1);
  }
  function reset() {
    setFormError(''); setExpanded(['Assets']); setCollapsed([]); setSearch(''); setSort('name'); setDirection('asc'); setPage(1);
    setFilters(initialFilters(fyStart)); setApplied(null); setReload((value) => value + 1);
  }
  function toggle(group, depth) {
    if (!depth) setExpanded((current) => current.includes(group.name) ? current.filter((name) => name !== group.name) : [...current, group.name]);
    else setCollapsed((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key]);
  }
  function exportReport() {
    const rows = visible.accounts.map((row) => Object.fromEntries(exportColumns.map((column) => [column.label, column.value(row)])));
    rows.push(Object.fromEntries(exportColumns.map((column) => [column.label, column.label === 'Ledger Account' ? 'Grand Total' : headings.includes(column.label) ? visible[trialBalanceFields[headings.indexOf(column.label)]] : ''])));
    exportRows(`Trial Balance ${data.period.from} to ${data.period.to}`, rows, exportColumns.map((column) => column.label));
  }
  function printReport() { flushSync(() => setPrinting(true)); try { window.print(); } finally { setPrinting(false); } }
  function amounts(row) {
    return <>{fields.map((field) => <td key={field}>{currency(row[field] || 0)}</td>)}{comparing && <><td>{signed(row.previous?.closing ?? (row.previousDebit || 0) - (row.previousCredit || 0))}</td><td>{signed(Math.round(((row.closing ?? row.debit - row.credit) - (row.previous?.closing ?? (row.previousDebit || 0) - (row.previousCredit || 0))) * 100) / 100)}</td></>}</>;
  }
  function accountRow(row, index, child = false) {
    const params = new URLSearchParams({ ledger: row.name, from: data.period.from, to: data.period.to });
    if (row._id) params.set('ledgerId', row._id);
    if (data.branch) params.set('branch', data.branch);
    if (data.costCenter) params.set('costCenter', data.costCenter);
    return <tr key={rowKey(row)} className={child ? 'tb-child' : ''}><td>{index + 1}</td><td><Link to={`/ledger/new?${params}`}>{row.name}</Link></td>{amounts(row)}</tr>;
  }
  function groupRow(group, depth = 0) {
    if (!printing && !group.accounts.some((row) => pageKeys.has(rowKey(row)))) return null;
    const open = printing || (depth ? !collapsed.includes(group.key) : expanded.includes(group.name));
    const summary = selected.view === 'summary';
    return <Fragment key={group.key}><tr className={depth ? 'tb-subgroup-row' : 'tb-group-row'}><td>{depth ? '' : visible.groups.indexOf(group) + 1}</td><td style={{ paddingLeft: 12 + depth * 20 }}><button type="button" aria-label={`${group.name} (${group.accounts.length})`} aria-expanded={open && !summary} disabled={summary} onClick={() => toggle(group, depth)}>{open && !summary ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<FolderClosed size={20} /><strong>{group.name} <span>({group.accounts.length})</span></strong></button></td>{amounts(group)}</tr>{open && !summary && <>{group.children.map((child) => groupRow(child, depth + 1))}{group.directAccounts.filter((row) => printing || pageKeys.has(rowKey(row))).map((row) => accountRow(row, visible.accounts.indexOf(row), true))}</>}</Fragment>;
  }
  const DifferenceIcon = visible.difference === 0 ? CheckCircle2 : TriangleAlert;
  return <form className={`tb-page${closingOnly ? ' tb-closing-view' : ' tb-detailed-view'}`} onSubmit={viewReport}>
    <nav className="tb-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={16} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/accounting-reports">Reports</Link><ChevronRight size={14} /><strong>Trial Balance</strong></nav>
    <header className="tb-heading"><div className="tb-title"><span><Scale size={30} /></span><div><h1>Trial Balance</h1><p>List of all ledger accounts with their closing debit and credit balances.</p></div></div><div className="tb-heading-actions"><label className="tb-asof"><span><CalendarDays size={17} />As on Date</span><input aria-label="As on Date" type="date" required disabled={loading} value={filters.to} onChange={(event) => change('to', event.target.value)} /></label><button type="submit" className="tb-primary" disabled={loading}><Search size={17} />{loading ? 'Loading…' : 'View Report'}</button></div></header>
    <fieldset className="tb-filters tb-card" disabled={loading}><label>Financial Year<select aria-label="Financial Year" value={filters.year} onChange={(event) => changeYear(event.target.value)}>{years.map((year) => <option key={year} value={year}>FY {year}–{String(year + 1).slice(-2)}</option>)}</select></label><label>From Date<input aria-label="From Date" required type="date" value={filters.from} onChange={(event) => change('from', event.target.value)} /></label><label>To Date<input aria-label="To Date" required type="date" value={filters.to} onChange={(event) => change('to', event.target.value)} /></label><label>Ledger Group<select aria-label="Ledger Group" value={filters.group} onChange={(event) => change('group', event.target.value)}><option value="">All Groups</option><optgroup label="Categories">{categories.map((value) => <option key={value}>{value}</option>)}</optgroup><optgroup label="Account Groups">{accountGroups.filter((value) => !categories.includes(value)).map((value) => <option key={value}>{value}</option>)}</optgroup></select></label><label>View Option<select aria-label="View Option" value={filters.view} onChange={(event) => change('view', event.target.value)}><option value="grouped">Grouped View</option><option value="flat">Detailed View</option><option value="closing">Closing Balance View</option><option value="summary">Group Summary</option></select></label><button type="button" onClick={reset}><RotateCcw size={16} />Reset</button>
      <details className="tb-advanced"><summary>Branch, cost centre, zero balances &amp; comparison</summary><div><label>Branch<select aria-label="Branch" value={filters.branch} onChange={(event) => change('branch', event.target.value)}><option value="">All permitted branches</option>{(data?.options?.branches || []).map((branch) => <option key={branch}>{branch}</option>)}</select></label><label>Cost Centre<select aria-label="Cost Centre" value={filters.costCenter} onChange={(event) => change('costCenter', event.target.value)}><option value="">All cost centres</option>{(data?.options?.costCenters || []).map((centre) => <option key={centre}>{centre}</option>)}</select></label><label>Comparison<select aria-label="Comparison period" value={filters.comparison} onChange={(event) => change('comparison', event.target.value)}><option value="none">None</option><option value="previous">Previous period (same duration)</option></select></label><label className="tb-checkbox"><input type="checkbox" aria-label="Show zero balances" checked={filters.showZero} onChange={(event) => change('showZero', event.target.checked)} />Show zero balances</label></div></details>
    </fieldset>
    {(error || formError) && <div className="tb-error" role="alert"><span>{error || formError}</span>{error && <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button>}</div>}
    <section className="tb-card tb-stats">{[['Total Debit', visible.debit, Calculator, 'blue'], ['Total Credit', visible.credit, Calculator, 'blue'], ['Difference', Math.abs(visible.difference), DifferenceIcon, visible.difference === 0 ? 'green' : 'amber']].map(([label, value, Icon, tone]) => <article key={label} className={`tb-stat tb-${tone}`}><span><Icon size={28} /></span><div><p>{label}</p><strong aria-label={label}>{ready ? currency(value) : '—'}</strong>{label === 'Difference' && <small>{ready ? visible.difference ? 'Unbalanced' : 'Balanced' : 'Awaiting report'}</small>}</div></article>)}</section>
    <section className="tb-card tb-report"><div className="tb-report-toolbar"><span className="tb-print-subtitle">Trial Balance · {data?.period.from} to {data?.period.to}{selected.group ? ` · ${selected.group}` : ''}{data?.period.previous ? ` · Comparison ${data.period.previous.from} to ${data.period.previous.to}` : ''}</span><label className="tb-search"><Search size={16} /><input aria-label="Search trial balance" placeholder="Search ledger, code or group…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label>Sort<select aria-label="Sort trial balance" value={sort} onChange={(event) => setSort(event.target.value)}>{[['name', 'Ledger Name'], ['group', 'Ledger Group'], ['opening', 'Opening Balance'], ['periodDebit', 'Period Debit'], ['periodCredit', 'Period Credit'], ['closing', 'Closing Balance']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" aria-label="Reverse sort order" onClick={() => setDirection((current) => current === 'asc' ? 'desc' : 'asc')}>{direction === 'asc' ? '↑' : '↓'}</button><div><button type="button" disabled={!ready || !visible.accounts.length} onClick={exportReport}><Download size={17} />Export</button><ExportButtons title="Trial Balance" filename="trial-balance" rows={ready ? visible.accounts : []} columns={exportColumns} /><button type="button" disabled={!ready || !visible.accounts.length} onClick={printReport}><Printer size={17} />Print</button></div></div>
      {comparing && ready && <p className="tb-comparison" role="status">Comparing {data.period.previous.from} to {data.period.previous.to}. Positive change is Dr; negative change is Cr.</p>}
      {data?.costCenter && ready && <p className="tb-comparison">Only postings allocated to {data.costCenter} are included. Unallocated master openings are excluded; this segment may not balance independently.</p>}
      <div className="tb-table-scroll"><table><thead><tr><th>S.No</th><th>Ledger / Group</th>{fields.map((field) => <th key={field}>{headings[trialBalanceFields.indexOf(field)]}</th>)}{comparing && <><th>Previous Closing</th><th>Change</th></>}</tr></thead><tbody>{!ready || !visible.accounts.length ? <tr><td colSpan={columnCount} className="tb-empty">{loading ? 'Loading trial balance…' : error ? 'Trial balance could not be loaded. Please retry.' : 'No ledger accounts match the selected filters.'}</td></tr> : ['grouped', 'summary'].includes(selected.view) ? visible.groups.map((group) => groupRow(group)) : pageRows.map((row) => accountRow(row, visible.accounts.indexOf(row)))}</tbody>{ready && visible.accounts.length > 0 && <tfoot><tr><th colSpan={2}>All matching ledgers</th>{fields.map((field) => <th key={field}>{currency(visible[field])}</th>)}{comparing && <><th>{signed(visible.previousDebit - visible.previousCredit)}</th><th>{signed(visible.debit - visible.credit - visible.previousDebit + visible.previousCredit)}</th></>}</tr></tfoot>}</table></div>
      <div className="tb-pagination"><span>{visible.accounts.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, visible.accounts.length)} of {visible.accounts.length} ledgers · Group totals include all matching ledgers</span><label>Rows<select aria-label="Rows per page" value={size} onChange={(event) => setSize(Number(event.target.value))}>{[10, 25, 50, 100].map((count) => <option key={count}>{count}</option>)}</select></label><button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button><span>{currentPage} / {pages}</span><button type="button" aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>›</button></div>
      <footer className="tb-grand-total"><strong>Grand Total</strong><strong aria-label="Grand total debit">{ready ? currency(visible.debit) : '—'}</strong><strong aria-label="Grand total credit">{ready ? currency(visible.credit) : '—'}</strong></footer>
    </section>
  </form>;
}
