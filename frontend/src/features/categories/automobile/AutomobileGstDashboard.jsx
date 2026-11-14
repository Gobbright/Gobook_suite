import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, Building2, Calculator, Check, CheckCircle2, CircleCheck, Clock3, Coins, Download, FileText, HandCoins, Printer, RefreshCw, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { gstService } from '../../../services/gstService.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import './automobileGstDashboard.css';

const TAXES = [['igst', 'IGST', '#0564ff'], ['cgst', 'CGST', '#00c995'], ['sgst', 'SGST', '#a347ff'], ['cess', 'CESS', '#ff9d16']];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const compact = value => value ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : '0';
const periodText = date => date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const fyStart = date => date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
const fyText = year => `${year}-${String(year + 1).slice(-2)}`;
const shortPeriod = period => { const date = new Date(`1 ${period}`); return Number.isNaN(date.getTime()) ? period : date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
const returnLink = name => name === 'GSTR-1' ? '/gstr-1' : name === 'GSTR-9' ? '/gstr-9' : '/gstr-3b';
function Heading({ children, to, icon: Icon }) {
  return <div className="agd-card-heading"><h2>{Icon && <Icon size={22} />}{children}</h2>{to && <Link to={to}>View All <ArrowRight size={15} /></Link>}</div>;
}
function Legend({ lines = false }) {
  const entries = lines ? [['output', 'Output Tax', '#0564ff'], ['itc', 'ITC', '#00bc73']] : TAXES;
  return <div className={`agd-legend${lines ? ' agd-line-legend' : ''}`}>{entries.map(([key, label, color]) => <span key={key} style={{ '--series-color': color }}><i />{label}</span>)}</div>;
}
function TaxChart({ rows, lines = false }) {
  const width = 660, left = 54, right = 640, top = 16, bottom = 190;
  const keys = lines ? ['output', 'itc'] : TAXES.map(([key]) => key);
  const largest = Math.max(0, ...rows.flatMap(row => keys.map(key => Number(row[key]) || 0)));
  const step = largest > 0 ? 10 ** Math.floor(Math.log10(largest / 4)) : 1;
  const max = largest > 0 ? Math.ceil(largest / (4 * step)) * 4 * step : 4;
  const minimum = Math.min(0, ...rows.flatMap(row => keys.map(key => Number(row[key]) || 0)));
  const y = value => bottom - (value - minimum) / (max - minimum) * (bottom - top);
  const slot = (right - left) / Math.max(1, rows.length);
  const x = index => left + slot * (index + .5);
  const barWidth = Math.min(16, slot / 5.5);
  return <div className="agd-chart-wrap"><svg className="agd-chart" viewBox={`0 0 ${width} 222`} role="img" aria-label={lines ? 'Output tax and input tax credit trend' : 'Monthly IGST, CGST, SGST and cess liability'}>
    <title>{lines ? 'ITC vs Output Tax Trend' : 'Monthly Tax Liability'}</title>
    {Array.from({ length: 5 }, (_, i) => minimum + (max - minimum) * i / 4).map((value, i) => <g key={i}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e7edf5" /><text x={left - 11} y={y(value) + 4} textAnchor="end">₹ {compact(value)}</text></g>)}
    <line x1={left} x2={left} y1={top} y2={bottom} stroke="#8192aa" /><line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#8192aa" />
    {lines ? [['output', '#0564ff'], ['itc', '#00bc73']].map(([key, color]) => <g key={key}>
      <polygon points={`${x(0)},${y(0)} ${rows.map((row, index) => `${x(index)},${y(Number(row[key]) || 0)}`).join(' ')} ${x(rows.length - 1)},${y(0)}`} fill={color} opacity={key === 'itc' ? '.18' : '.06'} />
      <polyline points={rows.map((row, index) => `${x(index)},${y(Number(row[key]) || 0)}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      {rows.map((row, index) => <circle key={row.period} cx={x(index)} cy={y(Number(row[key]) || 0)} r="4" fill="white" stroke={color} strokeWidth="2.5"><title>{row.period} · {key === 'itc' ? 'ITC' : 'Output tax'}: {money(row[key])}</title></circle>)}
    </g>) : rows.map((row, index) => <g key={row.period}>{TAXES.map(([key, label, color], series) => { const value = Number(row[key]) || 0; return <rect key={key} x={x(index) + (series - 2) * (barWidth + 2)} y={Math.min(y(value), y(0))} width={barWidth} height={Math.abs(y(0) - y(value))} rx="2" fill={color}><title>{row.period} · {label}: {money(value)}</title></rect>; })}</g>)}
    {rows.map((row, index) => <text key={row.period} x={x(index)} y="213" textAnchor="middle">{row.month || row.period.slice(0, 3)}</text>)}
  </svg>{!largest && minimum === 0 && <span className="agd-chart-empty">No tax recorded for this financial year</span>}</div>;
}
function TaxBreakdown({ rows, ready }) {
  const complete = ready && rows.every(row => Number.isFinite(row.value));
  const total = rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  const positiveTotal = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0);
  let offset = 0;
  return <div className="agd-breakup"><svg viewBox="0 0 180 180" role="img" aria-label="Tax liability breakdown"><title>Tax liability breakdown by tax type</title><circle cx="90" cy="90" r="68" fill="none" stroke="#edf1f8" strokeWidth="29" />{rows.map(row => {
    const share = positiveTotal ? Math.max(0, Number(row.value) || 0) / positiveTotal * 100 : 0;
    const start = offset; offset += share;
    return <circle key={row.key} cx="90" cy="90" r="68" fill="none" stroke={TAXES.find(([key]) => key === row.key)?.[2]} strokeWidth="29" pathLength="100" strokeDasharray={`${Math.max(0, share - .35)} ${100 - Math.max(0, share - .35)}`} strokeDashoffset={-start} transform="rotate(-90 90 90)"><title>{row.label}: {money(row.value)}</title></circle>;
  })}<text x="90" y="87" textAnchor="middle" className="agd-donut-value">{ready ? `₹ ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(total)}` : '—'}</text><text x="90" y="107" textAnchor="middle">Total Tax</text></svg><div className="agd-tax-legend">{rows.map(row => <div key={row.key}><span><i style={{ background: TAXES.find(([key]) => key === row.key)?.[2] }} />{row.label}</span><strong>{ready ? money(row.value) : '—'}</strong><small>{complete ? `${positiveTotal ? (Math.max(0, Number(row.value) || 0) / positiveTotal * 100).toFixed(1) : '0.0'}%` : '?'}</small></div>)}</div></div>;
}
function Delta({ current, previous, period, red = false, ready }) {
  if (!ready || previous == null || Number(previous) === 0) return <small className="agd-metric-note">{ready ? 'No prior month comparison' : 'Loading tax records…'}</small>;
  const delta = (current - previous) / Math.abs(previous) * 100;
  const Icon = delta < 0 ? ArrowDown : ArrowUp;
  return <small className="agd-delta"><span className={red && delta > 0 ? 'is-red' : 'is-green'}><Icon size={13} fill="currentColor" />{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%</span> vs {shortPeriod(period)}</small>;
}

export function AutomobileGstDashboard() {
  const [period, setPeriod] = useState(() => periodText(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    gstService.getDashboard(period).then(response => { if (active) { setData(response); setUpdatedAt(response.generatedAt ? new Date(response.generatedAt) : null); } }).catch(failure => { if (active) setError(failure.message || 'Unable to load GST dashboard.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reload]);
  const ready = Boolean(data) && !loading;
  const selectedDate = new Date(`1 ${period}`);
  const financialYear = fyStart(selectedDate);
  const thisYear = fyStart(new Date());
  const years = Array.from({ length: 6 }, (_, index) => thisYear + 1 - index);
  const periods = Array.from({ length: 12 }, (_, index) => periodText(new Date(financialYear, index + 3, 1)));
  const changeYear = value => setPeriod(periodText(new Date(Number(value) + (selectedDate.getMonth() < 3 ? 1 : 0), selectedDate.getMonth(), 1)));
  const stats = data?.stats || {}, overview = data?.overview || {};
  const trend = data?.monthlyTrend || [];
  const previous = trend.length > 1 ? trend[trend.length - 2] : null;
  const filings = (data?.filingCalendar || []).filter(row => row.period === period);
  const filedCount = filings.filter(row => row.status === 'filed').length;
  const filingPercent = filings.length ? Math.round(filedCount / filings.length * 100) : 0;
  const business = data?.business || {};
  const breakdown = TAXES.map(([key, label]) => ({ key, label, value: overview.taxBreakup?.find(row => row.key === key)?.value ?? null }));
  const activity = overview.activity || [];
  const actions = data?.actions || [];
  const display = amount => ready && typeof amount === 'number' && Number.isFinite(amount) ? money(amount) : '—';
  function exportDashboard() {
    if (!ready) return;
    const rows = [['GST Dashboard', period], ['GSTIN', data.gstin], ['Output Tax Liability', stats.outputTax], ['Input Tax Credit', stats.itcAvailable], ['Net Tax Payable', stats.netTaxPayable], [], ['Return', 'Period', 'Status', 'Due Date'], ...(data.filingCalendar || []).map(row => [row.return, row.period, row.status, row.dueDate])];
    const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `GST-Dashboard-${period.replace(' ', '-')}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="agd-host">
    <main className="agd-page" aria-busy={loading}>
      <header className="agd-header"><div className="agd-header-title"><BarChart3 size={32} /><div><h1>GST Dashboard</h1><p>Track your GST returns, tax liability, ITC and reconciliation in one place.</p></div></div><div className="agd-header-controls"><div className="agd-business"><Building2 size={25} /><div><strong title={business.name}>{business.name || 'Business name not configured'}</strong><small>GSTIN: {data?.gstin || 'Not configured'}</small></div></div><SelectDropdown aria-label="Financial year" value={String(financialYear)} onChange={changeYear} options={years.map(year => ({ value: String(year), label: `FY ${fyText(year)}` }))} className="agd-year-select" buttonClassName="agd-select-trigger" menuClassName="agd-dropdown-menu" portal /><SelectDropdown aria-label="Filing period" value={period} onChange={setPeriod} options={periods.map(entry => ({ value: entry, label: `Period: ${shortPeriod(entry)}` }))} className="agd-period-select" buttonClassName="agd-select-trigger" menuClassName="agd-dropdown-menu" portal /><div className="agd-last-updated"><CheckCircle2 size={18} /><span>{loading ? 'Updating records…' : error ? 'Refresh required' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : 'Not updated'}</span></div><button type="button" className="agd-refresh" aria-label="Refresh dashboard" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={22} className={loading ? 'agd-spinning' : ''} /></button></div></header>
      <div className="agd-content">
        {error && <div role="alert" className="agd-error"><TriangleAlert size={19} /><span>{error}</span><button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></div>}
        <section className="agd-stats" aria-label="GST summary">
          {[
            ['Output Tax Liability', stats.outputTax, Coins, 'blue', previous?.output, false],
            ['Input Tax Credit (ITC)', stats.itcAvailable, HandCoins, 'green', previous?.itc, false],
            ['Net Tax Payable', stats.netTaxPayable, Calculator, 'red', previous ? Math.max(0, previous.output - previous.itc) : null, true],
          ].map(([label, amount, Icon, tone, prior, red]) => <article className={`agd-stat ${tone}`} key={label}><span className="agd-stat-icon"><Icon size={32} /></span><div><h2>{label}</h2><strong>{display(amount)}</strong><Delta ready={ready} current={amount || 0} previous={prior} period={previous?.period} red={red} /></div></article>)}
          <article className="agd-stat cyan"><span className="agd-stat-icon"><CircleCheck size={34} /></span><div className="agd-filing-metric"><h2>Returns Filed</h2><strong>{ready ? `${filedCount} / ${filings.length}` : '—'}</strong><div className="agd-progress-row"><div className="agd-progress" role="progressbar" aria-label="Monthly returns filed" aria-valuenow={filingPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${filingPercent}%` }} /></div><span>{ready ? `${filingPercent}%` : '—'}</span></div></div></article>
        </section>
        <section className="agd-primary-grid">
          <article className="agd-card agd-filing-card"><Heading to="/gst-reports">Filing Progress <span>(FY {fyText(financialYear)})</span></Heading><div className="agd-table-scroll"><table className="agd-filing-table"><thead><tr>{['Return', 'Description', 'Period', 'Due Date', 'Status', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{filings.map(row => {
            const name = row.return, filed = row.status === 'filed';
            const statusLabel = { filed: 'Filed', draft: 'Draft', 'not-started': 'Not started', pending: 'Pending' }[row.status] || 'Not recorded';
            return <tr key={name}><td><span className="agd-return-name"><FileText size={23} /><strong>{name}</strong></span></td><td>{name === 'GSTR-1' ? 'Outward supplies (Sales)' : 'Summary return (Monthly)'}</td><td>{shortPeriod(row.period)}</td><td>{row.dueDate || '?'}</td><td><span className={`agd-badge ${filed ? 'green' : row.recorded ? 'amber' : 'neutral'}`}>{filed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{statusLabel}</span></td><td><Link to={`${returnLink(name)}?period=${encodeURIComponent(row.period)}`} className={`agd-action ${!filed ? 'primary' : ''}`}>{filed ? 'View Return' : 'Prepare Return'}</Link></td></tr>;
          })}{!filings.length && <tr><td colSpan={6} className="agd-empty">{loading ? 'Loading filing records?' : error ? 'Filing records unavailable.' : 'No filing records for this period.'}</td></tr>}</tbody></table></div></article>
          <article className="agd-card agd-liability-card"><Heading>Monthly Tax Liability <span>(FY {fyText(financialYear)})</span></Heading><Legend />{ready ? <TaxChart rows={trend} /> : <div className="agd-placeholder">{loading ? 'Loading tax liability…' : 'Tax liability unavailable'}</div>}</article>
        </section>
        <section className="agd-secondary-grid">
          <article className="agd-card agd-trend-card"><div className="agd-chart-heading"><Heading>ITC vs Output Tax Trend</Heading><Legend lines /></div>{ready ? <TaxChart rows={trend} lines /> : <div className="agd-placeholder">{loading ? 'Loading tax trend…' : 'Tax trend unavailable'}</div>}</article>
          <article className="agd-card agd-breakdown-card"><Heading>Tax Liability Breakdown <span>({shortPeriod(period)})</span></Heading><TaxBreakdown rows={breakdown} ready={ready} /></article>
          <article className="agd-card agd-period-card"><Heading>This Period <span>({shortPeriod(period)})</span></Heading><dl>{[[BarChart3, 'Total Turnover', display(overview.salesTaxable)], [FileText, 'Total Invoices', overview.invoiceCount], [Users, 'B2B Invoices', overview.b2bInvoiceCount], [Building2, 'B2C Invoices', overview.b2cInvoiceCount]].map(([Icon, label, number]) => <div key={label}><dt><span><Icon size={20} /></span>{label}</dt><dd>{ready ? typeof number === 'number' ? number.toLocaleString('en-IN') : number : '—'}</dd></div>)}</dl></article>
        </section>
        <section className="agd-bottom-grid">
          <article className="agd-card agd-actions-card"><Heading to="/gst-reports" icon={TriangleAlert}>Action Required {ready && `(${actions.length})`}</Heading><ul>{actions.map(row => <li key={row.key}><i className={row.urgent ? 'urgent' : ''} /><span>{row.label}</span><Link to={row.to} className="agd-action">{row.action}</Link></li>)}</ul>{!actions.length && <p className="agd-empty">{loading ? 'Checking compliance tasks…' : error ? 'Compliance tasks unavailable.' : 'You’re all caught up. No pending actions.'}</p>}</article>
          <article className="agd-card agd-activity-card"><Heading to="/gst-reports" icon={Clock3}>Recent Activity</Heading><ul>{activity.slice(0, 4).map((row, index) => <li key={`${row.date}-${index}`}><span className={`agd-activity-icon ${row.status === 'filed' ? 'filed' : ''}`}>{row.status === 'filed' ? <Check size={12} strokeWidth={3} /> : <FileText size={12} />}</span><span>{row.label} <small>for {shortPeriod(row.period)}</small></span><time dateTime={row.date}>{new Date(row.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time></li>)}</ul>{!activity.length && <p className="agd-empty">{loading ? 'Loading recent activity…' : error ? 'Activity unavailable.' : 'No saved return activity for this period.'}</p>}</article>
        </section>
        <footer className="agd-footer"><span><ShieldCheck size={15} />Your GST workspace · {shortPeriod(period)}</span><div><Link to="/gst-reports">GST Reports <ArrowRight size={13} /></Link><button type="button" disabled={!ready} onClick={exportDashboard}><Download size={14} />Export</button><button type="button" disabled={!ready} onClick={() => window.print()}><Printer size={14} />Print</button></div></footer>
      </div>
    </main>
  </div>;
}
