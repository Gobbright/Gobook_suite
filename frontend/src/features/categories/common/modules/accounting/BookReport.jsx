import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpen, Landmark, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Home, List, Printer, Search, Wallet, X } from 'lucide-react';
import { api } from '../../../../../services/api.js';
import { getAccountingVouchers, getCashBook, getBankBook, getLedgerAccounts } from '../../../../../services/accountingService.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { financialPeriod } from '../../../automobile/automobileTrialBalance.js';
import { calculateCashReport, cashPageNumbers, isCashAccount } from './cashBookReport.js';
import { bankAccountLabel, bankReportSources, calculateBankReport } from './bankBookReport.js';
import './cashBookReport.css';

const number = (value) => Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (value) => `₹ ${value < 0 ? '(' : ''}${number(value)}${value < 0 ? ')' : ''}`;
const balance = (value) => `${money(Math.abs(value))} ${value < 0 ? 'Cr' : 'Dr'}`;
const dateLabel = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function today() { const day = new Date(); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; }
function defaults(start = '01 April') { const to = today(), period = financialPeriod(to, start); return { year: period.year, from: period.from, to, account: '', branch: '' }; }

export function BookReport({ bankBook = false }) {
  const bookName = bankBook ? 'Bank Book' : 'Cash Book';
  const accountLabel = bankBook ? 'Bank Account' : 'Cash Account';
  const TitleIcon = bankBook ? Landmark : BookOpen;
  const [accounts, setAccounts] = useState([]), [vouchers, setVouchers] = useState([]), [legacy, setLegacy] = useState([]);
  const [filters, setFilters] = useState(defaults), [applied, setApplied] = useState(defaults), [fyStart, setFyStart] = useState('01 April');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [formError, setFormError] = useState(''), [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(false), [printing, setPrinting] = useState(false), [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(8);
  const touched = useRef(false), tableArea = useRef(null), dialog = useRef(null);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    async function allVouchers() {
      const rows = [];
      for (let page = 1; active; page++) {
        const result = await getAccountingVouchers({ status: 'Posted', page, limit: 500 });
        const batch = result.vouchers || []; rows.push(...batch);
        if (batch.length < 500 || rows.length >= Number(result.total)) break;
      }
      return rows;
    }
    async function allBankEntries() {
      const first = await getBankBook();
      const otherBanks = (first.banks || []).filter((name) => name !== first.bank);
      const other = await Promise.all(otherBanks.map((name) => getBankBook(name)));
      return { entries: [first, ...other].flatMap((result) => result.entries || []).filter((row, index, entries) => entries.findIndex((candidate) => candidate._id === row._id) === index) };
    }
    Promise.all([getLedgerAccounts(), allVouchers(), (bankBook ? allBankEntries() : getCashBook()), api.getSettings()]).then(([ledgers, rows, cash, settings]) => {
      if (!active) return;
      const start = settings.fyStart || settings.settings?.fyStart || '01 April';
      setAccounts(ledgers.accounts || []); setVouchers(rows); setLegacy(cash.entries || []); setFyStart(start);
      if (!touched.current) { const initial = { ...defaults(start), ...(bankBook ? { account: bankReportSources(ledgers.accounts || [], rows, cash.entries || []).banks[0] || '' } : {}) }; setFilters(initial); setApplied(initial); }
    }).catch((failure) => { if (active) setError(failure.message || `Unable to load ${bookName.toLowerCase()}.`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, bankBook]);
  useEffect(() => {
    const element = tableArea.current;
    const observer = new ResizeObserver(([entry]) => setPageSize(Math.max(1, Math.min(8, Math.floor((entry.contentRect.height - 76) / 35)))));
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (selected && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [selected]);
  const bankSources = useMemo(() => bankReportSources(accounts, vouchers, legacy), [accounts, vouchers, legacy]);
  const report = useMemo(() => bankBook ? calculateBankReport(accounts, bankSources.events, applied) : calculateCashReport(accounts, vouchers, legacy, applied), [bankBook, accounts, vouchers, legacy, applied, bankSources]);
  const ready = !loading && !error;
  const pages = Math.max(1, Math.ceil(report.rows.length / pageSize)), currentPage = Math.min(page, pages);
  const rows = printing ? report.rows : report.rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const cashNames = bankBook ? bankSources.banks : [...new Set(accounts.filter(isCashAccount).map((row) => row.name))].sort();
  const branches = [...new Set([...accounts, ...vouchers, ...legacy].map((row) => row.branch).filter(Boolean))].sort();
  const currentYear = financialPeriod(today(), fyStart).year;
  const years = [...new Set([Number(filters.year), currentYear + 1, currentYear, currentYear - 1, currentYear - 2, ...vouchers, ...legacy].map((value) => typeof value === 'number' ? value : financialPeriod(value.date, fyStart).year))].filter(Number.isFinite).sort((a, b) => b - a);
  function change(key, value) { touched.current = true; setFormError(''); setFilters((current) => ({ ...current, [key]: value, ...(key === 'from' && value ? { year: financialPeriod(value, fyStart).year } : {}) })); }
  function changeYear(value) { const period = financialPeriod(`${value}-${financialPeriod(today(), fyStart).from.slice(5)}`, fyStart); touched.current = true; setFormError(''); setFilters((current) => ({ ...current, year: period.year, from: period.from, to: period.year === currentYear ? today() : period.to })); }
  function apply() {
    if (!filters.from || !filters.to || !Number.isFinite(Date.parse(filters.from)) || !Number.isFinite(Date.parse(filters.to)) || filters.from > filters.to) { setFormError('Select a valid date range. From Date must be on or before To Date.'); return; }
    touched.current = true; setFormError(''); setApplied({ ...filters }); setPage(1); setReload((value) => value + 1);
  }
  function amount(value) { return ready ? money(value) : '—'; }
  function exportReport() {
    const data = [{ Date: applied.from, Particulars: 'Opening Balance', Balance: report.opening }, ...report.rows.map((row) => ({ Date: row.date, Voucher: row.vchNo, Type: row.vchType, Particulars: row.narration || row.particulars, Receipts: row.receipt, Payments: row.payment, Adjustment: row.adjustment || 0, Balance: row.balance, Branch: row.branch || '', Reference: row.referenceNo || '', Account: row.bank || applied.account || 'All Cash Accounts' })), { Particulars: 'Total / Closing Balance', Receipts: report.receipts, Payments: report.payments, Adjustment: report.adjustments, Balance: report.closing }];
    exportRows(`${bookName} ${applied.from} to ${applied.to}`, data, ['Date', 'Voucher', 'Type', 'Particulars', 'Receipts', 'Payments', 'Adjustment', 'Balance', 'Branch', 'Reference', 'Account']);
  }
  function printReport() { flushSync(() => setPrinting(true)); try { window.print(); } finally { setPrinting(false); } }
  function closeDialog() { dialog.current?.close(); setSelected(null); }
  const columns = bankBook ? detail ? 11 : 8 : detail ? 10 : 7;
  return <form className={`cb-page${bankBook ? ' cb-bank-page' : ''}`} onSubmit={(event) => { event.preventDefault(); apply(); }}>
    <nav className="cb-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={16} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/accounting-reports">Reports</Link><ChevronRight size={14} /><strong>{bookName}</strong></nav>
    <section className="cb-card cb-top"><header className="cb-heading"><div className="cb-title"><span><TitleIcon size={32} /></span><div><h1>{bookName}</h1><p>A detailed record of all {bankBook ? 'bank' : 'cash'} receipts and payments for the selected period.</p></div></div><div className="cb-actions"><button type="button" disabled={!ready} onClick={exportReport}><Download size={18} />Export</button><button type="button" disabled={!ready} onClick={printReport}><Printer size={18} />Print</button><button type="button" className="cb-primary" disabled={!ready} aria-pressed={detail} onClick={() => setDetail(!detail)}><List size={18} />{detail ? 'View Summary' : 'View in Detail'}</button></div></header>
      <fieldset className="cb-filters" disabled={loading}><label>Financial Year<select aria-label="Financial Year" value={filters.year} onChange={(event) => changeYear(event.target.value)}>{years.map((year) => <option key={year} value={year}>FY {year}–{String(year + 1).slice(-2)}</option>)}</select></label><label>From Date<input aria-label="From Date" required type="date" value={filters.from} onChange={(event) => change('from', event.target.value)} /></label><label>To Date<input aria-label="To Date" required type="date" value={filters.to} onChange={(event) => change('to', event.target.value)} /></label><label>{accountLabel}<select aria-label={accountLabel} value={filters.account} onChange={(event) => change('account', event.target.value)}><option value="">{bankBook ? 'Select Bank Account' : 'All Cash Accounts'}</option>{cashNames.map((name) => <option key={name} value={name}>{bankBook ? bankAccountLabel(name, legacy, filters.branch) : name}</option>)}{!bankBook && legacy.length > 0 && <option value="__legacy">Unassigned Legacy Cash</option>}</select></label><label>Branch / Location<select aria-label="Branch / Location" value={filters.branch} onChange={(event) => change('branch', event.target.value)}><option value="">All Locations</option>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label><button type="submit" className="cb-primary"><Search size={17} />{loading ? 'Loading…' : 'Generate Report'}</button></fieldset>
    </section>
    {(error || formError) && <div className="cb-error" role="alert"><span>{error || formError}</span>{error && <button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button>}</div>}
    {!bankBook && ready && legacy.length > 0 && <p className="cb-note">Older cash records have no cash-account assignment. They appear under All Cash Accounts or Unassigned Legacy Cash.</p>}
    <section className="cb-card cb-stats">{[['Opening Balance', report.opening, Wallet, 'blue'], ['Total Receipts', report.receipts, ArrowDown, 'green'], ['Total Payments', report.payments, ArrowUp, 'red'], ['Closing Balance', report.closing, bankBook ? Landmark : Wallet, 'blue']].map(([label, value, Icon, tone]) => <article className={`cb-stat cb-${tone}`} key={label}><span><Icon size={30} /></span><div><p>{label}</p><strong aria-label={label}>{amount(value)}</strong></div></article>)}</section>
    <section className="cb-card cb-transactions"><p className="cb-print-period">{dateLabel(applied.from)} – {dateLabel(applied.to)} · {applied.account === '__legacy' ? 'Unassigned Legacy Cash' : applied.account || (bankBook ? 'No bank selected' : 'All Cash Accounts')} · {applied.branch || 'All Locations'}</p><div className="cb-table-scroll" ref={tableArea}><table className={detail ? 'cb-detail-table' : ''}><thead><tr>{['Date', 'Voucher No.', 'Voucher Type', 'Particulars / Narration', ...(bankBook ? ['Cheque / Ref. No.'] : []), ...(detail ? bankBook ? ['Bank Account', 'Bank Date', 'Branch'] : ['Cash Account', 'Reference', 'Branch'] : []), 'Receipts (₹)', 'Payments (₹)', 'Balance (₹)'].map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{ready && rows.map((row) => <tr key={row.key}><td>{dateLabel(row.date)}</td><td><button className="cb-voucher-link" type="button" onClick={() => setSelected(row)}>{row.vchNo || 'View Entry'}</button></td><td><span className={`cb-badge ${row.opening ? 'cb-blue' : row.receipt ? 'cb-green' : 'cb-red'}`}>{row.vchType || (row.receipt ? 'Receipt' : 'Payment')}</span></td><td title={row.narration || row.particulars}>{row.narration || row.particulars || (bankBook ? 'Bank movement' : 'Cash movement')}{row.opening && <small>Opening adjustment: {money(row.adjustment)}</small>}</td>{bankBook && <td title={row.referenceNo}>{row.referenceNo || '—'}</td>}{detail && <><td>{bankBook ? row.bank : row.legacy ? 'Unassigned Legacy Cash' : [...new Set((row.lines || []).filter((line) => cashNames.includes(line.ledgerName) || /cash/i.test(line.ledgerGroup || '')).map((line) => line.ledgerName))].join(', ')}</td><td>{bankBook ? dateLabel(row.bankDate) : row.referenceNo || '—'}</td><td>{row.branch || '—'}</td></>}<td>{row.receipt ? number(row.receipt) : '—'}</td><td>{row.payment ? number(row.payment) : '—'}</td><td>{number(row.balance)} {row.balance < 0 ? 'Cr' : 'Dr'}</td></tr>)}{(!ready || !rows.length) && <tr><td colSpan={columns} className="cb-empty">{loading ? `Loading ${bankBook ? 'bank' : 'cash'} movements…` : error ? `${bookName} unavailable. Please retry.` : bankBook && !applied.account ? 'Select a bank account to view its movements.' : `No ${bankBook ? 'bank' : 'cash'} movements for the selected filters.`}</td></tr>}</tbody><tfoot><tr><th colSpan={columns - 3}>Total</th><td>{amount(report.receipts)}</td><td>{amount(report.payments)}</td><td /></tr></tfoot></table></div></section>
    {ready && report.adjustments !== 0 && <p className="cb-note">Opening-balance adjustments in this period: {money(report.adjustments)}. Closing = opening + receipts − payments + adjustments.</p>}
    <section className="cb-card cb-summary" aria-label={`${bookName} totals`}>{[['Opening Balance', report.opening, ''], ['Total Receipts', report.receipts, 'cb-green-text'], ['Total Payments', report.payments, 'cb-red-text'], ['Closing Balance', report.closing, 'cb-closing']].map(([label, value, tone]) => <div className={tone} key={label}><strong>{label}</strong><strong>{ready ? label === 'Closing Balance' ? balance(value) : money(value) : '—'}</strong></div>)}</section>
    <footer className="cb-card cb-pagination"><span>{ready ? `Showing ${report.rows.length ? (currentPage - 1) * pageSize + 1 : 0} to ${Math.min(currentPage * pageSize, report.rows.length)} of ${report.rows.length} entries` : 'Report unavailable'}</span><nav aria-label={`${bookName} pagination`}><button type="button" aria-label="First page" disabled={!ready || currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft size={18} /></button><button type="button" aria-label="Previous page" disabled={!ready || currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button>{cashPageNumbers(currentPage, pages).map((value, index) => typeof value === 'number' ? <button type="button" key={value} disabled={!ready} aria-label={`Page ${value}`} aria-current={currentPage === value ? 'page' : undefined} className={currentPage === value ? 'cb-primary' : ''} onClick={() => setPage(value)}>{value}</button> : <span key={`gap-${index}`}>…</span>)}<button type="button" aria-label="Next page" disabled={!ready || currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button><button type="button" aria-label="Last page" disabled={!ready || currentPage === pages} onClick={() => setPage(pages)}><ChevronsRight size={18} /></button></nav></footer>
    <dialog ref={dialog} className="cb-dialog" aria-labelledby="cb-entry-title" onCancel={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>{selected && <><header><div><h2 id="cb-entry-title">{selected.vchNo || (bankBook ? 'Bank Entry' : 'Cash Entry')}</h2><p>{dateLabel(selected.date)} · {selected.vchType} · {selected.branch || 'No branch assigned'}</p></div><button type="button" aria-label="Close entry details" onClick={closeDialog}><X size={20} /></button></header><p>{selected.narration || selected.particulars}</p><dl><div><dt>Receipts</dt><dd>{money(selected.receipt)}</dd></div><div><dt>Payments</dt><dd>{money(selected.payment)}</dd></div><div><dt>Running Balance</dt><dd>{balance(selected.balance)}</dd></div><div><dt>Reference</dt><dd>{selected.referenceNo || '—'}</dd></div></dl>{selected.legacy ? <p>{bankBook ? `Historical bank record for ${selected.bank}.` : 'This historical cash record has no assigned cash ledger.'}{selected.opening && ` Opening adjustment: ${money(selected.adjustment)}.`}</p> : <><table><thead><tr><th>Account / Ledger</th><th>Narration</th><th>Debit (₹)</th><th>Credit (₹)</th></tr></thead><tbody>{(selected.lines || []).map((line, index) => <tr key={index}><td><Link to={`/ledger/new?${new URLSearchParams({ ledger: line.ledgerName, from: applied.from, to: applied.to, ...(applied.branch ? { branch: applied.branch } : {}) })}`}>{line.ledgerName}</Link></td><td>{line.narration || '—'}</td><td>{line.side === 'debit' ? number(line.amount) : '—'}</td><td>{line.side === 'credit' ? number(line.amount) : '—'}</td></tr>)}</tbody></table><Link className="cb-open-voucher" to={`/vouchers?search=${encodeURIComponent(selected.vchNo)}`}>Open in Vouchers</Link></>}<footer><button type="button" onClick={closeDialog}>Close</button></footer></>}</dialog>
  </form>;
}
