import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpFromLine, BarChart3, ChevronDown, ChevronRight, Coins, Download, FileText, FolderClosed, Home, Layers, List, Printer, Search, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../../../../../services/api.js';
import { getAccountingVouchers, getLedgerAccounts } from '../../../../../services/accountingService.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { financialPeriod, trialMoney } from '../../../automobile/automobileTrialBalance.js';
import { calculatePnl, pnlComparison } from '../../../automobile/automobilePnl.js';
import { pnlDetailRows, pnlReportTotals, pnlSections } from './pnlReport.js';
import './pnlReport.css';

const money = (value) => `${value < 0 ? '₹ (' : '₹ '}${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${value < 0 ? ')' : ''}`;
const percent = (value) => value === null ? '—' : `${value.toFixed(2)}%`;
function today() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function initialFilters(start = '01 April') { const day = today(); return { ...financialPeriod(day, start), to: day, branch: '', comparison: 'period' }; }

export function PnlReport() {
  const [accounts, setAccounts] = useState([]), [vouchers, setVouchers] = useState([]);
  const [fyStart, setFyStart] = useState('01 April');
  const [filters, setFilters] = useState(initialFilters), [applied, setApplied] = useState(initialFilters);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [formError, setFormError] = useState('');
  const [reload, setReload] = useState(0), [detail, setDetail] = useState(false), [printing, setPrinting] = useState(false);
  const [expanded, setExpanded] = useState(pnlSections.map((section) => section.key));
  const touched = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    async function allVouchers() {
      const rows = [];
      for (let page = 1; active; page++) {
        const response = await getAccountingVouchers({ status: 'Posted', page, limit: 500 });
        const batch = response.vouchers || []; rows.push(...batch);
        if (batch.length < 500 || rows.length >= Number(response.total)) break;
      }
      return rows;
    }
    Promise.all([getLedgerAccounts(), allVouchers(), api.getSettings()]).then(([ledgers, rows, settings]) => {
      if (!active) return;
      const start = settings.fyStart || settings.settings?.fyStart || '01 April';
      setAccounts(ledgers.accounts || []); setVouchers(rows); setFyStart(start);
      if (!touched.current) { const next = initialFilters(start); setFilters(next); setApplied(next); }
    }).catch((failure) => { if (active) setError(failure.message || 'Unable to load the profit and loss statement.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const report = useMemo(() => calculatePnl(accounts, vouchers, applied), [accounts, vouchers, applied]);
  const priorDates = useMemo(() => applied.comparison === 'none' ? null : pnlComparison(applied.from, applied.to, applied.comparison), [applied]);
  const previous = useMemo(() => priorDates ? calculatePnl(accounts, vouchers, { ...applied, ...priorDates }) : null, [accounts, vouchers, applied, priorDates]);
  const totals = pnlReportTotals(report.totals), prior = previous ? pnlReportTotals(previous.totals) : null;
  const details = useMemo(() => pnlDetailRows(report, previous), [report, previous]);
  const ready = !loading && !error;
  const loss = totals.netProfit < 0;
  const year = financialPeriod(today(), fyStart).year;
  const years = [...new Set([Number(filters.year), year + 1, year, year - 1, year - 2, year - 3, ...vouchers.map((row) => financialPeriod(row.date, fyStart).year)])].filter(Number.isFinite).sort((a, b) => b - a);
  const branches = [...new Set([...accounts.map((row) => row.branch), ...vouchers.map((row) => row.branch)].filter(Boolean))].sort();
  function change(key, value) { touched.current = true; setFormError(''); setFilters((current) => ({ ...current, [key]: value })); }
  function changeYear(value) {
    const period = financialPeriod(`${value}-${financialPeriod(today(), fyStart).from.slice(5)}`, fyStart);
    touched.current = true; setFormError('');
    setFilters((current) => ({ ...current, ...period, to: period.year === year ? today() : period.to }));
  }
  function generate(event) {
    event.preventDefault();
    if (!filters.from || !filters.to || filters.from > filters.to) { setFormError('From Date must be on or before To Date.'); return; }
    const period = financialPeriod(filters.from, fyStart);
    if (filters.to > period.to) { setFormError('Select dates within one financial year.'); return; }
    touched.current = true; setFormError('');
    const next = { ...filters, year: period.year };
    setFilters(next); setApplied(next); setReload((value) => value + 1);
  }
  function ledgerLink(name) { return `/ledger/new?${new URLSearchParams({ ledger: name, from: applied.from, to: applied.to, ...(applied.branch ? { branch: applied.branch } : {}) })}`; }
  function toggle(key) { setExpanded((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]); }
  function exportReport() {
    const rows = details.map((row) => ({ Particulars: row.name, Group: row.group, Amount: row.current, ...(prior ? { Comparison: row.previous, Variance: row.variance } : {}) }));
    for (const [label, key] of [['Total Income', 'income'], ['Total Expenses', 'expenses'], ['Gross Profit', 'grossProfit'], ['Operating Profit', 'operatingProfit'], ['Net Profit', 'netProfit']]) rows.push({ Particulars: label, Group: 'Summary', Amount: totals[key], ...(prior ? { Comparison: prior[key], Variance: trialMoney(totals[key] - prior[key]) } : {}) });
    exportRows(`Profit and Loss ${applied.from} to ${applied.to} ${applied.branch || 'All Locations'}`, rows, ['Particulars', 'Group', 'Amount', ...(prior ? ['Comparison', 'Variance'] : [])]);
  }
  function printReport() { flushSync(() => setPrinting(true)); try { window.print(); } finally { setPrinting(false); } }
  function amount(value) { return ready ? money(value) : '—'; }
  function sectionPanel(side) {
    const income = side === 'income';
    const Icon = income ? Layers : Wallet;
    const label = income ? 'Income' : 'Expenses';
    const total = income ? totals.income : totals.expenses;
    return <section className="pl-card pl-section" aria-label={label}><header><Icon size={25} /><h2>{label}</h2><strong aria-label={`${label} panel total`}>{amount(total)}</strong></header><div className="pl-section-scroll"><table><thead><tr><th>Particulars</th><th>Amount (₹)</th></tr></thead><tbody>{pnlSections.filter((section) => section.side === side).map((section) => {
      const open = printing || expanded.includes(section.key);
      return <Fragment key={section.key}><tr className="pl-group"><td><button type="button" aria-expanded={open} disabled={!ready} onClick={() => toggle(section.key)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<FolderClosed size={18} /><strong>{section.label}</strong></button></td><td>{amount(report.totals[section.key])}</td></tr>{open && (ready ? report.accounts[section.key].length ? report.accounts[section.key].map((row) => <tr key={row.name} className="pl-account-row"><td><Link to={ledgerLink(row.name)}>{row.name}</Link></td><td className={row.amount < 0 ? 'pl-negative' : ''}>{money(row.amount)}</td></tr>) : <tr className="pl-empty"><td colSpan={2}>No posted accounts in this group.</td></tr> : <tr className="pl-empty"><td colSpan={2}>{loading ? 'Loading accounts…' : 'Report unavailable. Please retry.'}</td></tr>)}</Fragment>;
    })}</tbody></table></div><footer><strong>Total {label}</strong><strong>{amount(total)}</strong></footer></section>;
  }
  return <form className="pl-page" onSubmit={generate}>
    <nav className="pl-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={16} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/accounting-reports">Reports</Link><ChevronRight size={14} /><strong>Profit &amp; Loss Statement</strong></nav>
    <section className="pl-card pl-top"><header className="pl-heading"><div className="pl-title"><span><BarChart3 size={30} /></span><div><h1>Profit &amp; Loss Statement</h1><p>A summary of your income, expenses, and the net profit or loss for the selected period.</p></div></div><div className="pl-actions"><button type="button" disabled={!ready || !report.posted} onClick={exportReport}><Download size={17} />Export</button><button type="button" disabled={!ready || !report.posted} onClick={printReport}><Printer size={17} />Print</button><button type="button" className="pl-primary" aria-pressed={detail} disabled={!ready} onClick={() => setDetail((value) => !value)}><List size={18} />{detail ? 'View Summary' : 'View in Detail'}</button></div></header>
    <fieldset className="pl-filters" disabled={loading}><label>Financial Year<select aria-label="Financial Year" value={filters.year} onChange={(event) => changeYear(event.target.value)}>{years.map((value) => <option key={value} value={value}>FY {value}–{String(value + 1).slice(-2)}</option>)}</select></label><label>From Date<input aria-label="From Date" required type="date" value={filters.from} onChange={(event) => change('from', event.target.value)} /></label><label>To Date<input aria-label="To Date" required type="date" value={filters.to} onChange={(event) => change('to', event.target.value)} /></label><label>Compare With<select aria-label="Compare With" value={filters.comparison} onChange={(event) => change('comparison', event.target.value)}><option value="period">Previous Period</option><option value="year">Previous Year</option><option value="none">No Comparison</option></select></label><label>Branch / Location<select aria-label="Branch / Location" value={filters.branch} onChange={(event) => change('branch', event.target.value)}><option value="">All Locations</option>{branches.map((value) => <option key={value}>{value}</option>)}</select></label><button type="submit" className="pl-primary"><Search size={17} />{loading ? 'Loading…' : 'Generate Report'}</button></fieldset></section>
    {(error || formError) && <div role="alert" className="pl-error"><span>{error || formError}</span>{error && <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button>}</div>}
    {ready && report.unclassified.length > 0 && <p className="pl-notice">Accounts with unrecognized ledger groups are excluded: {report.unclassified.slice(0, 3).join(', ')}{report.unclassified.length > 3 ? ` and ${report.unclassified.length - 3} others` : ''}. Review their account groups in Ledger.</p>}
    <section className="pl-card pl-stats">{[['Total Income', 'income', ArrowUpFromLine, 'blue'], ['Total Expenses', 'expenses', ArrowDown, 'red'], [loss ? 'Net Loss' : 'Net Profit', 'netProfit', Coins, loss ? 'red' : 'green'], ['Net Profit Margin', 'netMargin', BarChart3, totals.netMargin < 0 ? 'red' : 'blue']].map(([label, key, Icon, tone]) => <article key={key} className={`pl-stat pl-${tone}`}><span><Icon size={28} /></span><div><p>{label}</p><strong aria-label={label}>{!ready ? '—' : key === 'netMargin' ? percent(totals.netMargin) : money(key === 'netProfit' ? Math.abs(totals[key]) : totals[key])}</strong>{ready && prior && <small className="pl-card-comparison" title={`Comparison period: ${priorDates.from} to ${priorDates.to}`}>Previous: {key === 'netMargin' ? percent(prior[key]) : money(prior[key])}</small>}</div></article>)}</section>
    <div className={`pl-workspace ${detail ? 'pl-detailed' : ''}`}>{detail ? <section className="pl-card pl-detail"><header><h2><List size={20} />Account Details</h2><span>{applied.from} to {applied.to} · {applied.branch || 'All Locations'}{priorDates && ` | Comparison: ${priorDates.from} to ${priorDates.to}`}</span></header><div className="pl-detail-scroll"><table><thead><tr><th>Ledger Account</th><th>Group</th><th>Current (₹)</th>{prior && <><th>Comparison (₹)</th><th>Variance (₹)</th></>}</tr></thead><tbody>{ready && details.length ? details.map((row) => <tr key={`${row.group}-${row.name}`}><td><Link to={ledgerLink(row.name)}>{row.name}</Link></td><td>{row.group}</td><td className={row.current < 0 ? 'pl-negative' : ''}>{money(row.current)}</td>{prior && <><td>{money(row.previous)}</td><td>{money(row.variance)}</td></>}</tr>) : <tr><td colSpan={prior ? 5 : 3} className="pl-empty">{loading ? 'Loading account details…' : error ? 'Report unavailable. Please retry.' : 'No posted income or expense accounts in this period.'}</td></tr>}</tbody></table></div><footer><strong>Net {loss ? 'Loss' : 'Profit'}</strong><strong>{amount(totals.netProfit)}</strong></footer></section> : <>{sectionPanel('income')}{sectionPanel('expenses')}</>}
    <aside className="pl-card pl-summary"><h2><FileText size={22} />Profit &amp; Loss Summary</h2><dl className="pl-summary-totals"><div><dt>Total Income</dt><dd>{amount(totals.income)}</dd></div><div><dt>Total Expenses</dt><dd>{amount(totals.expenses)}</dd></div></dl><div className={`pl-summary-profit ${totals.grossProfit < 0 ? 'pl-red' : 'pl-green'}`}><div><strong>Gross {totals.grossProfit < 0 ? 'Loss' : 'Profit'}</strong><strong aria-label="Gross Profit">{amount(totals.grossProfit)}</strong></div><small>Operating Income − Direct Expenses</small></div><div className="pl-operating"><div><strong>Operating {totals.operatingProfit < 0 ? 'Loss' : 'Profit'}</strong><strong aria-label="Operating Profit">{amount(totals.operatingProfit)}</strong></div><small>Gross Profit − Indirect Expenses</small></div>
    <div className={`pl-net ${loss ? 'pl-red' : 'pl-green'}`}><TrendingUp size={29} /><div><strong>Net {loss ? 'Loss' : 'Profit'}</strong><b>{ready ? money(Math.abs(totals.netProfit)) : '—'}</b></div><div><strong>Net Profit Margin</strong><b>{ready ? percent(totals.netMargin) : '—'}</b></div></div><p className="pl-equation">Net Profit = Total Income − Total Expenses</p></aside></div>
  </form>;
}
