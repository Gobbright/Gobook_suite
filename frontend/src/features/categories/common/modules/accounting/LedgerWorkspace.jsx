import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowUp, BookOpen, BriefcaseBusiness, Calculator, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FolderClosed, Home, Landmark, LockKeyhole, MoreVertical, Pencil, Plus, Printer, RefreshCw, RotateCcw, Search, UserRound, X } from 'lucide-react';
import { getLedgerAccounts, getLedgerDetails, getLedgerGroups, getLedgerStatement, updateLedgerAccount } from '../../../../../services/accountingService.js';
import { RowActionsMenu } from '../../../../../components/forms/RowActionsMenu.jsx';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { ledgerClosing, ledgerType, statementPeriod } from '../../../automobile/automobileLedger.js';
import './ledgerWorkspace.css';
import { LedgerAccountEditor } from './LedgerAccountEditor.jsx';
import { LedgerGroupEditor, LedgerSupplement, LedgerVoucherDialog } from './LedgerWorkspacePanels.jsx';
import { filterLedgerRows, ledgerGroupName, ledgerYearOptions, ledgerYearDateRange, sortLedgerRows } from './ledgerWorkspace.js';
import { downloadExcel, downloadPdf } from '../../../../../utils/exportData.js';

const groups = ['Assets', 'Liabilities', 'Income', 'Expenses', 'Customer', 'Supplier'];
const accountGroups = ['Bank Accounts', 'Cash-In-Hand', 'Fixed Assets', 'Current Assets', 'Current Liabilities', 'Capital Account', 'Sundry Debtors', 'Sundry Creditors', 'Direct Incomes', 'Indirect Incomes', 'Direct Expenses', 'Indirect Expenses'];
const amount = (value) => Number(Math.abs(value || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balance = (value) => `${amount(value)} ${value < 0 ? 'Cr' : 'Dr'}`;
const dateText = (value) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function category(account) {
  return { Customers: 'Customer', Suppliers: 'Supplier', Income: 'Income', Expense: 'Expenses', Liabilities: 'Liabilities' }[ledgerType(account)] || 'Assets';
}
function defaultFilters() {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { from: `${to.slice(0, 7)}-01`, to, type: '', reference: '', financialYear: '', branch: '', costCenter: '', transactionStatus: '', minAmount: '', maxAmount: '', search: '' };
}

export function LedgerWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const branch = new URLSearchParams(location.search).get('branch') || '';
  const initialFilters = () => {
    const params = new URLSearchParams(location.search);
    return { ...defaultFilters(), branch, ...Object.fromEntries(['from', 'to', 'financialYear', 'costCenter'].filter((key) => params.has(key)).map((key) => [key, params.get(key)])) };
  };
  const [tab, setTab] = useState('transactions');
  const [groupDefinitions, setGroupDefinitions] = useState([]);
  const [groupError, setGroupError] = useState('');
  const [groupEditor, setGroupEditor] = useState(false);
  const [detail, setDetail] = useState({ key: '', data: null, loading: false, error: '' });
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState([]);
  const [expandedRows, setExpandedRows] = useState([]);
  const [voucherId, setVoucherId] = useState('');
  const [billReference, setBillReference] = useState('');
  const [sortField, setSortField] = useState('date');
  const [knownBranches, setKnownBranches] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(location.search).get('ledgerId') || new URLSearchParams(location.search).get('ledger') || '');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(['Assets']);
  const [showInactive, setShowInactive] = useState(() => Boolean(new URLSearchParams(location.search).get('ledger')));
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState('');
  const [statement, setStatement] = useState({ key: '', data: null, loading: false, error: '' });
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(8);
  const [newest, setNewest] = useState(false);
  const [printing, setPrinting] = useState(false);
  const tableRef = useRef(null);
  const actionLock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setAccountError('');
    getLedgerAccounts({ balances: 'posted', from: applied.from, to: applied.to, financialYear: applied.financialYear, branch: applied.branch }).then((data) => { if (active) { setAccounts(data.accounts || []); setKnownBranches((previous) => [...new Set([...previous, ...(data.accounts || []).map((account) => account.branch).filter(Boolean)])]); } }).catch((failure) => { if (active) setAccountError(failure.message || 'Unable to load accounts.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, applied.from, applied.to, applied.financialYear, applied.branch]);
  useEffect(() => {
    let active = true;
    getLedgerGroups().then((data) => { if (active) { setGroupDefinitions(data.groups || []); setGroupError(''); } }).catch((failure) => { if (active) setGroupError(failure.message); });
    return () => { active = false; };
  }, [reload]);
  const available = accounts.filter((account) => onlyInactive ? account.active === false : showInactive || account.active !== false);
  const selected = available.find((account) => account._id === selectedId || account.name === selectedId) || available.find((account) => ledgerType(account) === 'Bank') || available[0];
  const selectedKey = selected?.name || '';
  const statementKey = selected ? [selected._id, applied.from, applied.to, applied.financialYear, applied.branch].join('|') : '';
  useEffect(() => {
    if (!selected) return;
    setExpanded((current) => [...new Set([...current, category(selected)])]);
    setCollapsedGroups((current) => current.filter((group) => group !== ledgerGroupName(selected.group)));
  }, [selected]);
  useEffect(() => {
    if (!selectedKey || loading || accountError) return;
    let active = true;
    setStatement({ key: statementKey, data: null, loading: true, error: '' });
    getLedgerStatement({ ledgerName: selectedKey, ledgerId: selected._id, status: 'Posted', from: applied.from, to: applied.to, financialYear: applied.financialYear, branch: applied.branch }).then((data) => { if (active) setStatement({ key: statementKey, data, loading: false, error: '' }); }).catch((failure) => { if (active) setStatement({ key: statementKey, data: null, loading: false, error: failure.message || 'Unable to load statement.' }); });
    return () => { active = false; };
  }, [selectedKey, statementKey, selected?._id, loading, accountError, reload, applied.from, applied.to, applied.financialYear, applied.branch]);
  useEffect(() => {
    if (!selected?._id || loading || accountError) return;
    let active = true;
    setDetail({ key: statementKey, data: null, loading: true, error: '' });
    getLedgerDetails(selected._id, { from: applied.from, to: applied.to, financialYear: applied.financialYear, branch: applied.branch }).then((data) => { if (active) setDetail({ key: statementKey, data, loading: false, error: '' }); }).catch((failure) => { if (active) setDetail({ key: statementKey, data: null, loading: false, error: failure.message || 'Unable to load ledger details.' }); });
    return () => { active = false; };
  }, [statementKey, selected?._id, loading, accountError, reload, applied.from, applied.to, applied.financialYear, applied.branch]);
  const ready = Boolean(selected && !loading && !accountError && statement.key === statementKey && statement.data && !statement.loading && !statement.error);
  const period = useMemo(() => statementPeriod(ready ? statement.data : {}, applied), [ready, statement.data, applied]);
  const rows = filterLedgerRows(period.rows, applied);
  const sorted = sortLedgerRows(rows, sortField, newest);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(page, pages);
  const displayed = sorted.slice((current - 1) * size, current * size);
  useEffect(() => {
    if (!tableRef.current) return;
    const observer = new ResizeObserver(([entry]) => setSize(Math.max(1, Math.min(12, Math.floor((entry.contentRect.height - 32) / 32)))));
    observer.observe(tableRef.current);
    return () => observer.disconnect();
  }, [tab]);
  const references = [...new Set((ready ? statement.data.entries : []).flatMap((entry) => [entry.referenceNo, entry.billRef, entry.sourceNumber, ...(entry.allocations || []).map((allocation) => allocation.reference)]).filter(Boolean))];
  const types = [...new Set((ready ? statement.data.entries : []).map((entry) => entry.voucherType).filter(Boolean))];
  function apply(event) {
    event.preventDefault();
    if (filters.from && filters.to && filters.from > filters.to) { setNotice('From Date must be on or before To Date.'); return; }
    if ([filters.minAmount, filters.maxAmount].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) || filters.minAmount !== '' && filters.maxAmount !== '' && Number(filters.minAmount) > Number(filters.maxAmount)) { setNotice('Enter a valid minimum and maximum amount range.'); return; }
    setApplied({ ...filters }); setPage(1); setNotice('');
  }
  function reset() { const next = { ...defaultFilters(), from: '', to: '' }; setFilters(next); setApplied(next); setPage(1); setNotice(''); }
  function selectAccount(account) { setSelectedId(account._id); setTab('transactions'); setExpandedRows([]); setBillReference(''); setPage(1); setNotice(''); setFilters((value) => ({ ...value, type: '', reference: '' })); setApplied((value) => ({ ...value, type: '', reference: '' })); }
  async function toggleActive() {
    if (!selected || actionLock.current) return;
    actionLock.current = true; setBusy(true); setNotice('');
    try {
      const active = selected.active === false;
      await updateLedgerAccount(selected._id, { active });
      setAccounts((previous) => previous.map((account) => account._id === selected._id ? { ...account, active } : account));
      if (!active) setShowInactive(true);
      setNotice(`Ledger ${active ? 'activated' : 'deactivated'}. Posted transactions are preserved.`);
    } catch (failure) { setNotice(failure.message || 'Unable to change account status.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  function exportStatement() {
    exportRows(`${selected.name} Ledger Statement`, sorted.map((row) => ({ Date: row.date, 'Voucher No.': row.voucherNo, 'Voucher Type': row.voucherType || 'Opening', Particulars: row.particulars || row.narration || row.partyName || '', Reference: row.referenceNo || row.billRef || '', Debit: row.debit, Credit: row.credit, Balance: balance(row.balance) })), ['Date', 'Voucher No.', 'Voucher Type', 'Particulars', 'Reference', 'Debit', 'Credit', 'Balance']);
  }
  function printStatement() {
    flushSync(() => setPrinting(true));
    try { window.print(); } finally { setPrinting(false); }
  }
  const profile = { ...selected, ...(detail.key === statementKey ? detail.data?.account : {}), active: selected?.active, opening: selected?.opening };
  const years = ledgerYearOptions(detail.data?.fyStart, [...(detail.data?.financialYears || []), ...(ready ? statement.data.entries.map((entry) => entry.financialYear).filter(Boolean) : [])]);
  const costCenters = [...new Set((ready ? statement.data.entries : []).map((entry) => entry.costCenter).filter(Boolean))];
  const branches = [...new Set([...knownBranches, branch, ...(ready ? statement.data.entries.map((entry) => entry.branch) : [])].filter(Boolean))];
  function editLedger(showDetails = false) { setEditor({ kind: 'edit', account: profile, nameLocked: Boolean(selected?.hasHistory || detail.data?.hasHistory || statement.data?.entries?.length), openingLocked: Boolean(selected?.hasHistory || detail.data?.hasHistory || statement.data?.entries?.length), showDetails }); }
  function showBill(reference) { setBillReference(reference); setTab('bills'); }
  function sortColumn(field) { setNewest((value) => field === sortField ? !value : false); setSortField(field); setPage(1); }
  const exportColumns = [
    { label: 'Date', value: (row) => row.date }, { label: 'Voucher No.', value: (row) => row.voucherNo }, { label: 'Voucher Type', value: (row) => row.voucherType || 'Opening' },
    { label: 'Reference No.', value: (row) => row.referenceNo || row.billRef || '' }, { label: 'Particulars', value: (row) => row.particulars || '' }, { label: 'Narration', value: (row) => row.narration || '' },
    { label: 'Debit', value: (row) => row.debit }, { label: 'Credit', value: (row) => row.credit }, { label: 'Running Balance', value: (row) => balance(row.balance) },
  ];
  function exportFormat(format) { const payload = { title: `${selected.name} Ledger Statement`, filename: `${selected.name}-ledger`, rows: sorted, columns: exportColumns }; if (format === 'pdf') downloadPdf(payload); else downloadExcel(payload); }
  const debitTotal = rows.filter((row) => !row.openingRow).reduce((sum, row) => sum + row.debit, 0);
  const creditTotal = rows.filter((row) => !row.openingRow).reduce((sum, row) => sum + row.credit, 0);
  return <div className="lw-page"><nav className="lw-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={16} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/ledger">Ledger</Link></nav>
  <div className="lw-layout"><aside className="lw-accounts"><h1 aria-label="Ledger Accounts"><BookOpen size={25} />Ledger Accounts</h1><button className="lw-primary lw-new" disabled={loading || busy} onClick={() => setEditor({ kind: 'new' })}><Plus size={17} />New Ledger</button><label className="lw-search"><Search size={16} /><input aria-label="Search ledger" placeholder="Search ledger..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
  <small className="lw-ledger-count">{available.length} of {accounts.length} ledgers</small><select aria-label="Ledger active status" value={onlyInactive ? 'inactive' : showInactive ? 'all' : 'active'} onChange={(event) => { setOnlyInactive(event.target.value === 'inactive'); setShowInactive(event.target.value !== 'active'); }}><option value="active">Active ledgers</option><option value="inactive">Inactive ledgers</option><option value="all">All ledgers</option></select>
  <div className="lw-tree">{groups.map((group) => {
    const all = available.filter((account) => category(account) === group);
    const matches = all.filter((account) => [account.name, account.code, account.gstin].join(' ').toLowerCase().includes(search.toLowerCase()));
    const open = expanded.includes(group) || Boolean(search);
    return <section key={group}><button className={`lw-group ${open ? 'lw-group-open' : ''}`} aria-expanded={open} onClick={() => setExpanded((previous) => previous.includes(group) ? previous.filter((value) => value !== group) : [...previous, group])}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{group === 'Customer' ? <UserRound size={17} /> : group === 'Supplier' ? <Landmark size={17} /> : <FolderClosed size={17} />}<strong>{group} <small>({all.length})</small></strong><span className="lw-group-balance">{balance(all.reduce((sum, account) => sum + ledgerClosing(account), 0))}</span></button>{open && [...new Set(matches.map((account) => ledgerGroupName(account.group)))].map((accountGroup) => {
      const subgroup = matches.filter((account) => ledgerGroupName(account.group) === accountGroup);
      const groupOpen = !collapsedGroups.includes(accountGroup) || Boolean(search);
      return <div key={accountGroup} className="lw-subgroup"><button className="lw-subgroup-title" aria-expanded={groupOpen} onClick={() => setCollapsedGroups((current) => current.includes(accountGroup) ? current.filter((value) => value !== accountGroup) : [...current, accountGroup])}>{groupOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span>{accountGroup} ({subgroup.length})</span><small>{balance(subgroup.reduce((sum, account) => sum + ledgerClosing(account), 0))}</small></button>{groupOpen && subgroup.map((account) => <button key={account._id} aria-label={account.name} className={`lw-account ${selected?._id === account._id ? 'lw-selected' : ''}`} aria-pressed={selected?._id === account._id} onClick={() => selectAccount(account)}><span>{account.name}{account.active === false && <small> · Inactive</small>}</span><span className="lw-account-balance">{balance(ledgerClosing(account))}</span></button>)}</div>;
    })}</section>;
  })}</div><button className="lw-inactive-toggle" aria-pressed={showInactive} onClick={() => { setOnlyInactive(false); setShowInactive((value) => !value); }}>{showInactive ? 'Hide inactive accounts' : 'Show inactive accounts'}</button><Link className="lw-back" to="/ledger">Chart of Accounts</Link><button className="lw-inactive-toggle" disabled={loading || busy} onClick={() => setGroupEditor(true)}>Create Group</button><Link className="lw-back" to="/ledger"><ChevronLeft size={14} />Back to ledger list</Link></aside>
  <main className="lw-detail"><header className="lw-account-header"><div className="lw-account-title"><span className="lw-title-icon"><BriefcaseBusiness size={25} /></span><div><div><h2>{selected?.name || 'Select a Ledger'}</h2>{selected && <span className="lw-badge">{ledgerGroupName(selected.group)}{selected.active === false ? ' · Inactive' : ''}</span>}</div><p>{selected ? <>Under: {category(selected)} <span>|</span> Code: {profile.code || 'Not assigned'} <span>|</span> Current Balance: ₹ {ready ? balance((detail.key === statementKey ? detail.data?.totals?.closing : undefined) ?? period.closing) : '—'}</> : loading ? 'Loading accounts…' : 'Create or select a ledger to view its statement.'}</p>{(profile.gstin || profile.phone || profile.email || profile.creditLimit > 0 || profile.creditDays != null) && <p className="lw-contact-summary">{[profile.gstin && `GSTIN: ${profile.gstin}`, profile.phone, profile.email, profile.creditLimit > 0 && `Credit: ₹ ${amount(profile.creditLimit)}`, profile.creditDays != null && `${profile.creditDays} days`].filter(Boolean).join(' · ')}</p>}</div></div><div className="lw-actions"><button disabled={!ready || busy} onClick={() => editLedger()}><Pencil size={15} />Edit</button><button disabled={!ready || busy} onClick={() => setEditor({ kind: 'duplicate', account: profile })}><Copy size={15} />Duplicate</button><button disabled={!ready || busy} onClick={toggleActive}><LockKeyhole size={15} />{selected?.active === false ? 'Activate' : 'Deactivate'}</button><RowActionsMenu aria-label="Ledger actions" disabled={loading || busy} options={[{ value: 'details', label: 'Ledger Details', disabled: !selected }, { value: 'audit', label: 'Audit History', disabled: !selected }, { value: 'opening', label: 'Opening Balance History', disabled: !selected }, { value: 'refresh', label: 'Refresh accounts' }, { value: 'vouchers', label: 'Related vouchers', disabled: !selected }]} onChange={(value) => value === 'refresh' ? setReload((version) => version + 1) : value === 'details' ? setTab('contact') : value === 'audit' ? setTab('audit') : value === 'opening' ? setTab('opening') : navigate(`/vouchers?account=${encodeURIComponent(selected.name)}`)} /></div></header>
  <form className="lw-filters" onSubmit={apply}><label>From Date<input type="date" aria-label="From Date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} /></label><label>To Date<input type="date" aria-label="To Date" value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} /></label><label>Voucher Type<select aria-label="Voucher Type" value={filters.type} onChange={(event) => setFilters((value) => ({ ...value, type: event.target.value }))}><option value="">All Vouchers</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label><label>Reference<select aria-label="Reference" value={filters.reference} onChange={(event) => setFilters((value) => ({ ...value, reference: event.target.value }))}><option value="">All</option>{references.map((reference) => <option key={reference}>{reference}</option>)}</select></label><button type="submit" className="lw-primary" disabled={!ready}><Search size={16} />Search</button><button type="button" onClick={reset}><RotateCcw size={16} />Reset</button>
    <details className="lw-advanced"><summary>More Filters</summary><div className="lw-advanced-fields">
      <label>Financial Year<select aria-label="Financial Year" value={filters.financialYear} onChange={(event) => setFilters((current) => ({ ...current, financialYear: event.target.value, ...ledgerYearDateRange(event.target.value, detail.data?.fyStart) }))}><option value="">All financial years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
      <label>Branch<select aria-label="Branch" value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))}><option value="">All permitted branches</option>{branches.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Cost Centre<select aria-label="Cost Centre" value={filters.costCenter} onChange={(event) => setFilters((current) => ({ ...current, costCenter: event.target.value }))}><option value="">All cost centres</option>{costCenters.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Transaction Status<select aria-label="Transaction Status" value={filters.transactionStatus} onChange={(event) => setFilters((current) => ({ ...current, transactionStatus: event.target.value }))}><option value="">All posted transactions</option><option>Posted</option><option>Reconciled</option><option>Unreconciled</option></select></label>
      <label>Minimum Amount<input aria-label="Minimum Amount" type="number" min="0" step="0.01" value={filters.minAmount} onChange={(event) => setFilters((current) => ({ ...current, minAmount: event.target.value }))} /></label>
      <label>Maximum Amount<input aria-label="Maximum Amount" type="number" min="0" step="0.01" value={filters.maxAmount} onChange={(event) => setFilters((current) => ({ ...current, maxAmount: event.target.value }))} /></label>
      <label>Search transactions<input aria-label="Search transactions" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
    </div></details></form>
  {(notice || accountError || statement.error) && <div className={accountError || statement.error ? 'lw-error' : 'lw-notice'} role={accountError || statement.error ? 'alert' : 'status'}>{accountError || statement.error || notice}{(accountError || statement.error) && <button onClick={() => setReload((version) => version + 1)}>Retry</button>}<button aria-label="Dismiss message" onClick={() => setNotice('')} disabled={Boolean(accountError || statement.error)}><X size={13} /></button></div>}
  <section className="lw-stats">{[[`Opening Balance (${period.opening < 0 ? 'Cr' : 'Dr'})`, period.opening, Landmark, 'blue'], ['Total Debit', period.debit, ArrowDown, 'green'], ['Total Credit', period.credit, ArrowUp, 'red'], [`Closing Balance (${period.closing < 0 ? 'Cr' : 'Dr'})`, period.closing, Calculator, 'blue']].map(([label, value, Icon, tone]) => <article key={label} className={`lw-stat lw-${tone}`}><span><Icon size={23} /></span><div><p>{label}</p><strong>{ready ? `₹ ${amount(value)}` : '—'}</strong></div></article>)}</section>
  <div className="lw-tabs" role="tablist" aria-label="Ledger sections">{[['transactions', 'Transactions'], ['bills', 'Bill-wise Outstanding'], ['contact', 'Contact & Tax Details'], ['opening', 'Opening Balance History'], ['audit', 'Audit History']].map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => { setTab(key); if (key === 'bills') setBillReference(''); }}>{label}</button>)}</div>
  {tab === 'transactions' ? <><div className="lw-toolbar"><small>Totals include all posted period movements; row filters preserve actual running balances.</small><div><button disabled={!ready || !rows.length} onClick={exportStatement}><Download size={16} />Export</button><button disabled={!ready || !rows.length} onClick={printStatement}><Printer size={16} />Print</button><RowActionsMenu aria-label="Statement actions" options={[{ value: 'pdf', label: 'Export PDF', disabled: !ready }, { value: 'excel', label: 'Export Excel', disabled: !ready }, { value: 'refresh', label: 'Refresh statement' }, { value: 'sort', label: newest ? 'Oldest first' : 'Newest first' }]} onChange={(value) => value === 'refresh' ? setReload((version) => version + 1) : value === 'pdf' || value === 'excel' ? exportFormat(value) : (setSortField('date'), setNewest((value) => !value))} /></div></div>
  <div className="lw-table-area" ref={tableRef}><table className="lw-extended-table"><thead><tr>{[['Date', 'date'], ['Voucher No.', 'voucherNo'], ['Voucher Type', 'voucherType'], ['Reference No.', 'referenceNo'], ['Particulars', 'particulars'], ['Narration', 'narration'], ['Debit (₹)', 'debit'], ['Credit (₹)', 'credit'], ['Running Balance (₹)', 'balance']].map(([label, field]) => <th key={field} aria-sort={sortField === field ? newest ? 'descending' : 'ascending' : 'none'}><button onClick={() => sortColumn(field)}>{label}</button></th>)}</tr></thead><tbody>{!ready || !displayed.length ? <tr><td colSpan={9} className="lw-empty">{accountError || statement.error ? 'Unable to load the ledger. Use Retry to try again.' : loading || selected && (statement.loading || statement.key !== statementKey) ? 'Loading ledger statement…' : !selected ? 'No ledger accounts yet. Click New Ledger to create one.' : 'No transactions match these filters.'}</td></tr> : (printing ? sorted : displayed).map((row) => <Fragment key={row.key}><tr><td>{dateText(row.date)}</td><td>{row.voucherId ? <button className="lw-cell-link" onClick={() => setVoucherId(row.voucherId)}>{row.voucherNo}</button> : 'OPN'}</td><td><span className={`lw-voucher-type ${row.voucherType === 'Receipt' ? 'lw-green' : row.voucherType === 'Payment' ? 'lw-red' : 'lw-blue'}`}>{row.openingRow ? 'Opening' : row.voucherType}</span>{row.reconciliationApplicable && <small className="lw-reconciliation">{row.reconciled ? 'Reconciled' : 'Unreconciled'}</small>}</td><td>{row.openingRow ? '—' : <><span>{row.referenceNo || '—'}</span>{[...new Set([row.billRef, ...(row.allocations || []).map((allocation) => allocation.reference)].filter(Boolean))].map((reference) => <button key={reference} className="lw-cell-link" onClick={() => showBill(reference)}>{reference}</button>)}</>}</td><td title={row.particulars}>{!row.openingRow && <button aria-label={`Accounting details ${row.voucherNo}`} aria-expanded={expandedRows.includes(row.key)} className="lw-expand-row" onClick={() => setExpandedRows((current) => current.includes(row.key) ? current.filter((key) => key !== row.key) : [...current, row.key])}>{expandedRows.includes(row.key) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>}{row.particulars || row.partyName || (row.openingRow ? 'Opening Balance' : '')}</td><td title={row.narration}>{row.narration || '—'}</td><td>{row.debit ? amount(row.debit) : '—'}</td><td>{row.credit ? amount(row.credit) : '—'}</td><td><span className="lw-balance-badge">{balance(row.balance)}</span></td></tr>{expandedRows.includes(row.key) && <tr className="lw-accounting-details"><td colSpan={9}><p>Branch: {row.branch || 'Unassigned'} · Cost centre: {row.costCenter || 'Unassigned'} · Status: Posted{row.bankReference ? ` · Bank reference: ${row.bankReference}` : ''}{row.bankDate ? ` · Cleared: ${row.bankDate}` : ''}</p><table><thead><tr><th>Ledger</th><th>Dr / Cr</th><th>Amount</th><th>Narration</th></tr></thead><tbody>{(row.lines || []).map((line, index) => <tr key={index}><td>{line.ledgerName}</td><td>{line.side === 'debit' ? 'Dr' : 'Cr'}</td><td>{amount(line.amount)}</td><td>{line.narration || '—'}</td></tr>)}</tbody></table></td></tr>}</Fragment>)}</tbody></table></div>
  <footer className="lw-table-total"><div>{pages > 1 && <><button aria-label="Previous statement page" disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft size={14} /></button><span>{current} / {pages}</span><button aria-label="Next statement page" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={14} /></button></>}</div><strong>Total</strong><strong>{ready ? `₹ ${amount(debitTotal)}` : '—'}</strong><strong>{ready ? `₹ ${amount(creditTotal)}` : '—'}</strong><strong className="lw-final-balance">{ready ? `₹ ${balance(period.closing)}` : '—'}</strong></footer>
  </> : !selected ? <div className="lw-panel">Select a ledger to view details.</div> : <LedgerSupplement tab={tab} detail={detail.key === statementKey ? detail.data : null} account={profile} loading={loading || detail.loading || detail.key !== statementKey} error={detail.error} reference={billReference} onReference={setBillReference} onRetry={() => setReload((value) => value + 1)} onEdit={() => editLedger(true)} onVoucher={setVoucherId} />}
  </main></div>{groupError && <div className="lw-error" role="alert">Account groups: {groupError}<button onClick={() => setReload((value) => value + 1)}>Retry groups</button></div>}{groupEditor && <LedgerGroupEditor groups={groupDefinitions} onClose={() => setGroupEditor(false)} onSaved={(group) => { setGroupDefinitions((current) => [...current, group]); setGroupEditor(false); setNotice('Account group created.'); }} />}{voucherId && <LedgerVoucherDialog id={voucherId} onClose={() => setVoucherId('')} />}{editor && <LedgerAccountEditor customGroups={groupDefinitions} editor={editor} accounts={accounts} onClose={() => setEditor(null)} onSaved={(account) => { setEditor(null); setSelectedId(account._id || ''); setSearch(''); setExpanded((value) => [...new Set([...value, category(account)])]); setNotice('Ledger saved successfully.'); setPage(1); setReload((version) => version + 1); }} />}</div>;
}
