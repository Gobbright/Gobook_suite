import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Coins, Download, Equal, FolderClosed, Home, Layers, List, MessageSquare, PieChart, Plus, Printer, Scale, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../../../../../services/api.js';
import { getAccountingVouchers, getLedgerAccounts } from '../../../../../services/accountingService.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { financialPeriod, trialMoney } from '../../../automobile/automobileTrialBalance.js';
import { balanceComparisonDate, calculateBalanceSheet } from '../../../automobile/automobileBalanceSheet.js';
import { balanceAllKeys, balanceReportDetails, balanceReportGroups, balanceRootKeys } from './balanceSheetReport.js';
import './balanceSheetReport.css';

const money = (value) => `${value < 0 ? '₹ (' : '₹ '}${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${value < 0 ? ')' : ''}`;
function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function initialFilters(start = '01 April') { const asOn = today(); return { year: financialPeriod(asOn, start).year, asOn, branch: '', comparison: 'fy' }; }

export function BalanceSheetReport() {
  const [accounts, setAccounts] = useState([]), [vouchers, setVouchers] = useState([]);
  const [fyStart, setFyStart] = useState('01 April');
  const [filters, setFilters] = useState(initialFilters), [applied, setApplied] = useState(initialFilters);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [formError, setFormError] = useState('');
  const [reload, setReload] = useState(0), [compare, setCompare] = useState(false), [detail, setDetail] = useState(false), [printing, setPrinting] = useState(false);
  const [expanded, setExpanded] = useState(balanceRootKeys);
  const touched = useRef(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    async function allVouchers() {
      const rows = [];
      for (let page = 1; active; page++) {
        const data = await getAccountingVouchers({ page, limit: 500, status: 'Posted' });
        const batch = data.vouchers || []; rows.push(...batch);
        if (batch.length < 500 || rows.length >= Number(data.total)) break;
      }
      return rows;
    }
    Promise.all([getLedgerAccounts(), allVouchers(), api.getSettings()]).then(([ledgers, rows, settings]) => {
      if (!active) return;
      const start = settings.fyStart || settings.settings?.fyStart || '01 April';
      setAccounts(ledgers.accounts || []); setVouchers(rows); setFyStart(start);
      if (!touched.current) { const next = initialFilters(start); setFilters(next); setApplied(next); }
    }).catch((failure) => { if (active) setError(failure.message || 'Unable to load balance sheet.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const report = useMemo(() => calculateBalanceSheet(accounts, vouchers, applied.asOn, applied.branch), [accounts, vouchers, applied]);
  const previousDate = balanceComparisonDate(applied.asOn, applied.comparison, fyStart);
  const previous = useMemo(() => compare ? calculateBalanceSheet(accounts, vouchers, previousDate, applied.branch) : null, [compare, accounts, vouchers, previousDate, applied.branch]);
  const sections = useMemo(() => balanceReportGroups(report, accounts, vouchers), [report, accounts, vouchers]);
  const priorSections = useMemo(() => previous ? balanceReportGroups(previous, accounts, vouchers) : [], [previous, accounts, vouchers]);
  const rows = useMemo(() => balanceReportDetails(sections, priorSections), [sections, priorSections]);
  const ready = !loading && !error;
  const totals = report.totals;
  const hasData = accounts.length > 0 || vouchers.length > 0;
  const needsReview = totals.difference !== 0 || report.unclassified.length > 0 || report.issues.length > 0;
  const currentYear = financialPeriod(today(), fyStart).year;
  const years = [...new Set([Number(filters.year), currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3, ...vouchers.map((row) => financialPeriod(row.date, fyStart).year)])].filter(Number.isFinite).sort((a, b) => b - a);
  const branches = [...new Set([...accounts.map((row) => row.branch), ...vouchers.map((row) => row.branch)].filter(Boolean))].sort();
  function change(key, value) { touched.current = true; setFormError(''); setFilters((current) => ({ ...current, [key]: value, ...(key === 'asOn' && value ? { year: financialPeriod(value, fyStart).year } : {}) })); }
  function changeYear(value) {
    const period = financialPeriod(`${value}-${financialPeriod(today(), fyStart).from.slice(5)}`, fyStart);
    touched.current = true; setFormError('');
    setFilters((current) => ({ ...current, year: period.year, asOn: period.year === currentYear ? today() : period.to }));
  }
  function apply() {
    if (!filters.asOn || !/^\d{4}-\d{2}-\d{2}$/.test(filters.asOn) || !Number.isFinite(Date.parse(filters.asOn))) { setFormError('Select a valid as-on date.'); return false; }
    touched.current = true; setFormError(''); setApplied({ ...filters }); setReload((value) => value + 1); return true;
  }
  function toggle(key) { setExpanded((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]); }
  function toggleDetail() { setDetail(!detail); setExpanded(detail ? balanceRootKeys : balanceAllKeys); }
  function ledgerLink(name) { return `/ledger/new?${new URLSearchParams({ ledger: name, from: '', to: applied.asOn, ...(applied.branch ? { branch: applied.branch } : {}) })}`; }
  function amount(value) { return ready ? money(value) : '—'; }
  function exportReport() {
    const data = rows.map((row) => ({ Particulars: row.name, Section: row.section, Group: row.group, Amount: row.current, ...(compare ? { Comparison: row.previous, Variance: row.variance } : {}) }));
    for (const [label, key] of [['Total Assets', 'assets'], ['Total Liabilities', 'liabilities'], ['Total Equity', 'equity'], ['Total Liabilities & Equity', 'liabilitiesEquity'], ['Difference', 'difference']]) data.push({ Particulars: label, Section: 'Summary', Group: '', Amount: totals[key], ...(compare ? { Comparison: previous.totals[key], Variance: trialMoney(totals[key] - previous.totals[key]) } : {}) });
    exportRows(`Balance Sheet ${applied.asOn} ${applied.branch || 'All Locations'}`, data, ['Particulars', 'Section', 'Group', 'Amount', ...(compare ? ['Comparison', 'Variance'] : [])]);
  }
  function printReport() { flushSync(() => setPrinting(true)); try { window.print(); } finally { setPrinting(false); } }
  function cells(current, before = 0) { return <><td className={current < 0 ? 'bs-negative' : ''}>{amount(current)}</td>{compare && <><td>{amount(before)}</td><td>{amount(current - before)}</td></>}</>; }
  function panel(side) {
    const left = side === 'left', title = left ? 'Liabilities & Equity' : 'Assets', total = left ? totals.liabilitiesEquity : totals.assets, Icon = left ? Scale : PieChart;
    return <section className="bs-card bs-panel" aria-label={title}><header><Icon size={28} /><h2>{title}</h2><strong aria-label={`${title} panel total`}>{amount(total)}</strong></header><div className="bs-table-scroll"><table className={compare ? 'bs-comparing' : ''}><thead><tr><th>Particulars</th><th>{compare ? 'Current (₹)' : 'Amount (₹)'}</th>{compare && <><th>Comparison (₹)</th><th>Variance (₹)</th></>}</tr></thead><tbody>{sections.filter((section) => section.side === side).map((section) => {
      const open = printing || expanded.includes(section.key), prior = priorSections.find((row) => row.key === section.key);
      return <Fragment key={section.key}><tr className="bs-root"><td><button type="button" disabled={!ready} aria-expanded={open} onClick={() => toggle(section.key)}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<FolderClosed size={20} /><strong>{section.label}</strong></button></td>{cells(section.amount, prior?.amount || 0)}</tr>{open && section.buckets.map((bucket) => {
        const opened = printing || expanded.includes(bucket.key), before = prior?.buckets.find((row) => row.key === bucket.key);
        const details = rows.filter((row) => row.section === section.label && row.group === bucket.label);
        return <Fragment key={bucket.key}><tr className="bs-bucket"><td><button type="button" disabled={!ready} aria-expanded={opened} onClick={() => toggle(bucket.key)}>{opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{bucket.label}</button></td>{cells(bucket.amount, before?.amount || 0)}</tr>{opened && (ready && details.length ? details.map((row) => <tr className="bs-account-row" key={row.name}><td>{row.derived ? <span title="Income and expense balances not yet transferred to retained earnings.">{row.name}</span> : <Link to={ledgerLink(row.name)}>{row.name}</Link>}</td>{cells(row.current, row.previous)}</tr>) : <tr><td className="bs-empty" colSpan={compare ? 4 : 2}>{loading ? 'Loading accounts…' : error ? 'Report unavailable. Please retry.' : 'No accounts in this section.'}</td></tr>)}</Fragment>;
      })}</Fragment>;
    })}</tbody></table></div><footer><strong>Total {title}</strong><strong>{amount(total)}</strong></footer></section>;
  }
  const StatusIcon = needsReview ? TriangleAlert : CheckCircle2;
  return <form className="bs-page" onSubmit={(event) => { event.preventDefault(); apply(); }}>
    <nav className="bs-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={16} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/accounting-reports">Reports</Link><ChevronRight size={14} /><strong>Balance Sheet</strong></nav>
    <section className="bs-card bs-top"><header className="bs-heading"><div className="bs-title"><span><Layers size={30} /></span><div><h1>Balance Sheet</h1><p>A statement of your business's financial position showing assets, liabilities, and equity as of a specific date.</p></div></div><div className="bs-actions"><button type="button" disabled={!ready} aria-pressed={compare} className={compare ? 'bs-selected' : ''} onClick={() => { if (compare) setCompare(false); else if (apply()) setCompare(true); }}><MessageSquare size={17} />Compare</button><button type="button" disabled={!ready || !hasData} onClick={exportReport}><Download size={17} />Export</button><button type="button" disabled={!ready || !hasData} onClick={printReport}><Printer size={17} />Print</button><button type="button" className="bs-primary" aria-pressed={detail} disabled={!ready} onClick={toggleDetail}><List size={18} />{detail ? 'View Summary' : 'View in Detail'}</button></div></header>
    <fieldset className="bs-filters" disabled={loading}><label>Financial Year<select aria-label="Financial Year" value={filters.year} onChange={(event) => changeYear(event.target.value)}>{years.map((value) => <option key={value} value={value}>FY {value}–{String(value + 1).slice(-2)}</option>)}</select></label><label>As on Date<input aria-label="As on Date" required type="date" value={filters.asOn} onChange={(event) => change('asOn', event.target.value)} /></label><label>Compare With<select aria-label="Compare With" value={filters.comparison} onChange={(event) => change('comparison', event.target.value)}><option value="fy">Previous Period</option><option value="year">Previous Year</option></select></label><label>Branch / Location<select aria-label="Branch / Location" value={filters.branch} onChange={(event) => change('branch', event.target.value)}><option value="">All Locations</option>{branches.map((value) => <option key={value}>{value}</option>)}</select></label><button className="bs-primary" type="submit"><Search size={17} />{loading ? 'Loading…' : 'Generate Report'}</button></fieldset></section>
    {(error || formError) && <div className="bs-error" role="alert"><span>{error || formError}</span>{error && <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button>}</div>}
    {ready && report.unclassified.length > 0 && <p className="bs-notice">Unclassified accounts are excluded: {report.unclassified.slice(0, 3).map((row) => row.name).join(', ')}{report.unclassified.length > 3 ? ` and ${report.unclassified.length - 3} others` : ''}. Review their ledger groups.</p>}
    <section className="bs-card bs-equation">{[['Total Assets', 'assets', Coins, 'blue'], ['Total Liabilities', 'liabilities', Layers, 'red'], ['Total Equity', 'equity', Layers, 'green'], ['Difference', 'difference', ShieldCheck, needsReview ? 'amber' : 'blue']].map(([label, key, Icon, tone], index) => <Fragment key={key}>{index === 1 ? <Equal className="bs-equation-sign" size={22} /> : index === 2 ? <Plus className="bs-equation-sign" size={22} /> : null}<article className={`bs-stat bs-${tone}`}><span><Icon size={28} /></span><div><p>{label}</p><strong aria-label={label}>{amount(key === 'difference' ? Math.abs(totals[key]) : totals[key])}</strong>{compare && ready && <small>As on {previousDate}: {money(key === 'difference' ? Math.abs(previous.totals[key]) : previous.totals[key])}</small>}</div></article></Fragment>)}</section>
    {compare && <p className="bs-comparison-label">As on {applied.asOn} compared with {previousDate} · {applied.branch || 'All Locations'}</p>}
    <div className="bs-panels">{panel('left')}{panel('right')}</div>
    <footer className={`bs-status ${ready && hasData ? needsReview ? 'bs-warning' : 'bs-balanced' : 'bs-waiting'}`} role="status"><StatusIcon size={30} /><div><strong>{!ready ? loading ? 'Loading balance sheet…' : 'Balance sheet unavailable' : !hasData ? 'No balances available' : needsReview ? 'Balance Sheet Needs Review' : 'Balance Sheet is Balanced'}</strong><p>{ready ? `Total Assets (${money(totals.assets)}) ${totals.difference === 0 ? '=' : '≠'} Total Liabilities & Equity (${money(totals.liabilitiesEquity)})${report.unclassified.length || report.issues.length ? ' · Review unclassified accounts and unbalanced vouchers.' : ''}` : 'Generate the report to review the financial position.'}</p></div></footer>
  </form>;
}
