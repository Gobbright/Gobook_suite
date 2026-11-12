import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUp, BarChart3, CalendarDays, Calculator, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Database, Download, FileText, Link2, Percent, PieChart, Printer, RefreshCw, ShoppingBag, ShoppingCart, TriangleAlert } from 'lucide-react';
import { gstService } from '../../../services/gstService.js';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import './automobileProducts.css';
import './automobileGstDashboard.css';

const periodText = (date) => date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const initialPeriod = () => periodText(new Date());
const shortMoney = (value) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const colors = ['#0874ff', '#a052ff', '#ffb321', '#00ba91'];
const links = [
  ['GSTR-1 Report', '/gstr-1', FileText], ['GSTR-3B Summary', '/gstr-3b', ClipboardCheck],
  ['Purchase Register', '/purchase-reports', ShoppingBag], ['Sales Register', '/sales-reports', FileText],
  ['ITC Reconciliation', '/gst-reconciliation', ClipboardCheck], ['HSN Summary', '/gst-reports', FileText],
  ['E-Way Bill', '/billing/e-way-bill/new', FileText], ['GST Reports', '/gst-reports', FileText],
];
function Badge({ children, tone = 'amber' }) { return <span className={`agd-badge ${tone}`}>{children}</span>; }
function Heading({ icon: Icon = FileText, title, to }) { return <div className="agd-card-heading"><h2><Icon size={19} />{title}</h2>{to && <Link to={to}>View All →</Link>}</div>; }
function Range({ value, onChange }) { return <SelectDropdown aria-label="Trend range" value={value} onChange={onChange} options={[{ value: '6', label: 'Last 6 Months' }, { value: '3', label: 'Last 3 Months' }]} className="agd-range" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll />; }
function TaxChart({ rows, lines = false }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.output, row.itc]));
  const x = (index) => 58 + index * (290 / Math.max(1, rows.length - 1));
  const y = (value) => 174 - value / max * 145;
  return <svg className="agd-chart" viewBox="0 0 395 210" role="img" aria-label={lines ? 'Output and input tax trend' : 'Sales output and purchase input tax comparison'}>
    <title>Monthly output tax and input tax credit</title>
    {[0, 1, 2, 3, 4].map((i) => <g key={i}><line x1="43" x2="376" y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="#e6effc" /><text x="37" y={y(max * i / 4) + 4} textAnchor="end">{shortMoney(max * i / 4)}</text></g>)}
    {lines ? [['output', '#ff3458'], ['itc', '#00bd81']].map(([key, color]) => <g key={key}>
      <polygon points={`58,174 ${rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ')} ${x(rows.length - 1)},174`} fill={color} opacity=".10" />
      <polyline points={rows.map((row, i) => `${x(i)},${y(row[key])}`).join(' ')} fill="none" stroke={color} strokeWidth="2" />
      {rows.map((row, i) => <circle key={row.period} cx={x(i)} cy={y(row[key])} r="3.5" fill={color} stroke="white"><title>{row.period}: {money(row[key])}</title></circle>)}
    </g>) : rows.map((row, i) => <g key={row.period}><rect x={x(i) - 14} y={y(row.output)} width="15" height={174 - y(row.output)} rx="2" fill="#0874ff"><title>{row.period} output: {money(row.output)}</title></rect><rect x={x(i) + 4} y={y(row.itc)} width="15" height={174 - y(row.itc)} rx="2" fill="#9ec8ff"><title>{row.period} input: {money(row.itc)}</title></rect></g>)}
    {rows.map((row, i) => <text key={row.period} x={x(i)} y="198" textAnchor="middle">{row.month} {row.period?.slice(-4)}</text>)}
  </svg>;
}
function MiniTable({ columns, rows, empty }) { return <div className="agd-table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="agd-empty">{empty}</td></tr>}</tbody></table></div>; }

export function AutomobileGstDashboard() {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [barRange, setBarRange] = useState('6');
  const [lineRange, setLineRange] = useState('6');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    gstService.getDashboard(period).then((response) => { if (active) setData(response); }).catch((err) => { if (active) setError(err.message || 'Unable to load GST dashboard.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reload]);
  function movePeriod(amount) {
    const date = new Date(`1 ${period}`);
    date.setMonth(date.getMonth() + amount);
    setPeriod(periodText(date));
  }
  const stats = data?.stats || {};
  const overview = data?.overview || {};
  const breakup = overview.taxBreakup || [];
  const recon = overview.reconciliation;
  const calendar = data?.filingCalendar || [];
  const pending = calendar.filter((row) => row.status !== 'filed');
  const currentFilings = calendar.filter((row) => row.period === period);
  const filed = currentFilings.length > 0 && currentFilings.every((row) => row.status === 'filed');
  const trend = data?.monthlyTrend || [];
  const outputTotal = breakup.reduce((sum, row) => sum + row.value, 0);
  const ready = Boolean(data) && !loading;
  const value = (number) => ready ? money(number || 0) : '—';
  const tax = (key) => breakup.find((row) => row.key === key)?.value || 0;
  const metricCards = [
    ['GST Sales Summary', overview.salesTaxable, ShoppingCart, 'blue', 'Taxable outward supplies'],
    ['GST Purchase Summary', overview.purchaseTaxable, ShoppingBag, 'green', 'Taxable purchase register'],
    ['Output Tax (Sales)', stats.outputTax, ArrowUp, 'red', 'Tax on outward supplies'],
    ['Input Tax (Purchase)', stats.itcAvailable, ArrowDownToLine, 'purple', 'ITC after reversals'],
    ['Estimated Net Tax Liability', stats.netTaxPayable, Calculator, 'blue', 'Output tax less available ITC'],
    ['CGST Summary', tax('cgst'), Percent, 'blue', 'Output central tax'],
    ['SGST Summary', tax('sgst'), Percent, 'purple', 'Output state tax'],
    ['IGST Summary', tax('igst'), Percent, 'orange', 'Output integrated tax'],
  ];
  const reconLabel = !recon?.reviewed ? 'Not Reviewed' : recon.exceptions ? 'In Review' : 'Matched';
  const exceptions = ready ? [
    ...(recon?.exceptions ? [['Purchase ITC differences', recon.exceptions, <Badge tone="red">Review</Badge>]] : []),
    ...(!data.gstin ? [['Business GSTIN missing', 1, <Badge tone="red">Review</Badge>]] : []),
  ] : [];
  function exportDashboard() {
    if (!ready) return;
    const rows = [['Period', period], ['GSTIN', data.gstin], ['Metric', 'Amount'], ...metricCards.map(([label, amount]) => [label, amount || 0]), [], ['Return', 'Period', 'Status', 'Due Date'], ...calendar.map((row) => [row.return, row.period, row.status, row.dueDate])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `GST-Dashboard-${period.replace(' ', '-')}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="agd-host"><main className="autop-page agd-page" aria-busy={loading}>
    <header className="autop-header"><div><div className="agd-title"><h1>GST Dashboard</h1><span>{period}</span></div><p>Overview of your GST transactions, tax liability and compliance status.</p></div><div className="autop-actions"><button aria-label="Refresh dashboard" onClick={() => setReload((v) => v + 1)} disabled={loading}><RefreshCw size={17} /></button><button onClick={exportDashboard} disabled={!ready}><Download size={17} />Export</button><button onClick={() => window.print()} disabled={!ready}><Printer size={17} />Print</button></div></header>
    {error && <div role="alert" className="autop-error">{error}<button onClick={() => setReload((v) => v + 1)}>Retry</button></div>}
    <section className="agd-stats" aria-label="GST summary">
      {metricCards.map(([label, amount, Icon, color, note]) => <article className="agd-stat" key={label}><span className={`agd-icon ${color}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{value(amount)}</strong><small>{note}</small></div></article>)}
      <article className="agd-stat"><span className="agd-icon blue"><FileText size={25} /></span><div><h2>Filing Status <em>(This Period)</em></h2><Badge tone={filed ? 'green' : 'amber'}>{ready ? (filed ? 'Filed' : 'Pending') : 'Loading'}</Badge><small>GSTR-1 and GSTR-3B</small></div></article>
      <article className="agd-stat"><span className="agd-icon blue"><Database size={25} /></span><div><h2>Reconciliation Status</h2><Badge tone={recon?.reviewed && !recon.exceptions ? 'green' : 'amber'}>{ready ? reconLabel : 'Loading'}</Badge><small>{ready ? `${recon?.exceptions || 0} purchase ITC differences` : 'Loading records…'}</small></div></article>
    </section>
    <section className="agd-visuals">
      <article className="agd-card"><div className="agd-chart-heading"><Heading icon={BarChart3} title="GST Sales vs Purchase Tax Trend" /><Range value={barRange} onChange={setBarRange} /></div><div className="agd-legend"><span style={{ '--dot': '#0874ff' }}>Output Tax (Sales)</span><span style={{ '--dot': '#9ec8ff' }}>Input Tax (Purchase)</span></div>{ready ? <TaxChart rows={trend.slice(-Number(barRange))} /> : <p className="agd-placeholder">{loading ? 'Loading trend…' : 'Trend unavailable'}</p>}</article>
      <article className="agd-card"><div className="agd-chart-heading"><Heading icon={BarChart3} title="Output Tax vs Input Tax Trend" /><Range value={lineRange} onChange={setLineRange} /></div><div className="agd-legend"><span style={{ '--dot': '#ff3458' }}>Output Tax</span><span style={{ '--dot': '#00bd81' }}>Input Tax</span></div>{ready ? <TaxChart rows={trend.slice(-Number(lineRange))} lines /> : <p className="agd-placeholder">{loading ? 'Loading trend…' : 'Trend unavailable'}</p>}</article>
      <article className="agd-card"><Heading icon={PieChart} title="GST Tax Breakup" /><p className="agd-period-note">{period} · Output tax</p><div className="agd-breakup"><svg viewBox="0 0 160 160" role="img" aria-label="Output tax breakup"><title>Output GST tax breakup</title><circle cx="80" cy="80" r="63" fill="none" stroke="#edf3fd" strokeWidth="25" />{breakup.map((row, i) => { const share = outputTotal > 0 ? row.value / outputTotal * 100 : 0; const offset = breakup.slice(0, i).reduce((sum, entry) => sum + entry.value, 0) / (outputTotal || 1) * 100; return <circle key={row.key} cx="80" cy="80" r="63" fill="none" stroke={colors[i]} strokeWidth="25" pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)"><title>{row.label}: {money(row.value)}</title></circle>; })}<text x="80" y="78" textAnchor="middle" className="agd-donut-value">{ready ? shortMoney(outputTotal) : '—'}</text><text x="80" y="96" textAnchor="middle">Output Tax</text></svg><div className="agd-tax-legend">{breakup.filter((row) => row.key !== 'cess' || row.value).map((row, i) => <div key={row.key}><span style={{ '--dot': colors[i] }}>{row.label} <b>{outputTotal ? (row.value / outputTotal * 100).toFixed(1) : '0'}%</b></span><strong>{money(row.value)}</strong></div>)}</div></div></article>
      <article className="agd-card agd-filing"><Heading icon={CalendarDays} title="Current Filing Period" /><div className="agd-period-nav"><button onClick={() => movePeriod(-1)} aria-label="Previous filing month"><ChevronLeft size={17} /></button><strong>{period}</strong><button onClick={() => movePeriod(1)} aria-label="Next filing month"><ChevronRight size={17} /></button></div>{['GSTR-1', 'GSTR-3B'].map((name) => <div className="agd-status-row" key={name}><Link to={name === 'GSTR-1' ? '/gstr-1' : '/gstr-3b'}>{name === 'GSTR-1' ? 'GSTR-1 (Sales)' : 'GSTR-3B (Summary)'}</Link><Badge tone={currentFilings.find((row) => row.return === name)?.status === 'filed' ? 'green' : 'amber'}>{ready ? (currentFilings.find((row) => row.return === name)?.status === 'filed' ? 'Filed' : 'Pending') : '—'}</Badge></div>)}<div className="agd-status-row"><Link to="/gst-reconciliation">GSTR-2B / ITC</Link><Badge>{ready ? reconLabel : '—'}</Badge></div><p className="agd-period-note">GSTIN: {data?.gstin || 'Not configured'}</p></article>
    </section>
    <section className="agd-card agd-links"><Heading icon={Link2} title="Quick Links" /><div>{links.map(([label, to, Icon], i) => <Link key={label} to={to} style={{ '--link-bg': ['#eef6ff', '#edfdf5', '#fff1f4', '#f5f0ff', '#fff7eb'][i % 5] }}><Icon size={24} /><span>{label}</span><ChevronRight size={14} /></Link>)}</div></section>
    <section className="agd-bottom">
      <article className="agd-card"><Heading icon={FileText} title="Filing Status Overview" to="/gstr-1" /><MiniTable columns={['Return', 'Period', 'Status', 'Action']} rows={calendar.slice().reverse().map((row) => [row.return, row.period, <Badge tone={row.status === 'filed' ? 'green' : 'amber'}>{row.status === 'filed' ? 'Filed' : 'Pending'}</Badge>, <Link to={row.return === 'GSTR-1' ? '/gstr-1' : '/gstr-3b'}>View</Link>])} empty={loading ? 'Loading filings…' : 'No filing records available.'} /></article>
      <article className="agd-card"><Heading icon={Clock3} title="Recent Tax Activities" to="/gst-reports" /><MiniTable columns={['Date', 'Activity', 'Period']} rows={(overview.activity || []).map((row) => [new Date(row.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' }), row.label, row.period])} empty={loading ? 'Loading activity…' : 'No saved return activity.'} /></article>
      <article className="agd-card"><Heading icon={ClipboardCheck} title="Pending Compliance Tasks" to="/gstr-3b" /><MiniTable columns={['Task', 'Due Date', 'Status']} rows={pending.slice().reverse().slice(0, 5).map((row) => [`Review ${row.return} · ${row.period}`, row.dueDate, <Badge>Pending</Badge>])} empty={loading ? 'Loading tasks…' : 'No pending returns in this window.'} /><p className="agd-period-note">Standard monthly calendar; verify your applicable filing schedule.</p></article>
      <article className="agd-card"><Heading icon={TriangleAlert} title="Exception Alerts" to="/gst-reconciliation" /><MiniTable columns={['Issue', 'Count', 'Status']} rows={exceptions} empty={loading ? 'Loading exceptions…' : error ? 'Exception data unavailable.' : 'No exceptions found in available records.'} />{ready && !recon?.reviewed && <p className="agd-period-note">GSTR-2B reconciliation has not been reviewed.</p>}</article>
    </section>
  </main></div>;
}
