import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Boxes, ChartNoAxesCombined, CircleDollarSign, ClipboardList, FilePlus2, FileText, Package, PieChart, RefreshCw, ShoppingCart, TrendingUp, Trophy, Truck, Users, Wallet } from 'lucide-react';
import { apiClient } from '../../../services/apiClient.js';
import { useCurrentUser } from '../../../hooks/useCurrentUser.js';
import { canAccessPath } from '../../../constants/navigation.js';
import './automobileDashboard.css';

const formatMoney = (value) => value == null ? '—' : `₹ ${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const compactMoney = (value) => Math.abs(value) >= 100000 ? `₹ ${(value / 100000).toFixed(1)}L` : Math.abs(value) >= 1000 ? `₹ ${(value / 1000).toFixed(0)}k` : `₹ ${Math.round(value)}`;
const currentMonth = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
};
const COLORS = ['#2584ff', '#ff4669', '#ffb329', '#8c4cff', '#23c9b0', '#4c6cf1', '#a68ab8'];
const METRICS = [
  ['todaySales', "Today's Sales", ShoppingCart, 'blue'], ['monthlySales', 'Monthly Sales', BarChart3, 'green'],
  ['purchases', 'Total Purchases', ShoppingCart, 'pink'], ['purchaseOrders', 'Purchase Orders', ClipboardList, 'purple'],
  ['receivables', 'Receivables', Users, 'orange'], ['payables', 'Payables', Boxes, 'purple'],
  ['inventoryValue', 'Inventory Value', Package, 'purple'], ['lowStock', 'Low Stock Items', AlertTriangle, 'pink', true],
  ['customers', 'Total Customers', Users, 'blue', true], ['suppliers', 'Total Suppliers', Truck, 'cyan', true],
  ['profit', 'Profit (Selected Month)', TrendingUp, 'green'], ['cashBalance', 'Cash & Bank Balance', Wallet, 'blue'],
];

function Panel({ title, icon: Icon, children, href, note, className = '' }) {
  return <section className={`auto-panel ${className}`}><div className="auto-panel-heading"><h2><Icon size={17} />{title}</h2>{href ? <Link to={href}>View All <ArrowRight size={12} /></Link> : note ? <span>{note}</span> : null}</div>{children}</section>;
}
function Empty({ text = 'No activity for this period' }) { return <div className="auto-empty">{text}</div>; }
function Legend({ entries }) { return <div className="auto-chart-legend">{entries.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div>; }

function ComparisonChart({ data = [], series = ['sales', 'purchases'], labels = ['Sales', 'Purchase'], colors = ['#2584ff', '#ff6580'], line = false }) {
  const unique = useId().replaceAll(':', '');
  const width = 460, height = 198, left = 46, top = 14, innerWidth = 400, innerHeight = 150;
  const max = Math.max(1, ...data.flatMap((item) => series.map((key) => Number(item[key]) || 0)));
  const step = innerWidth / Math.max(data.length, 1);
  const xAt = (index) => left + step * (index + 0.5);
  const yAt = (value) => top + innerHeight - value / max * innerHeight;
  const hasData = data.some((item) => series.some((key) => item[key] > 0));
  return <><Legend entries={labels.map((label, index) => [label, colors[index]])} />{!hasData ? <Empty /> : <svg className="auto-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${labels.join(' versus ')} chart`}>
    <defs>{colors.map((color, index) => <linearGradient key={color} id={`${unique}-${index}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>)}</defs>
    {[0, 1, 2, 3, 4].map((index) => <g key={index}><line x1={left} y1={top + index * innerHeight / 4} x2={left + innerWidth} y2={top + index * innerHeight / 4} className="auto-grid-line" /><text x={left - 10} y={top + index * innerHeight / 4 + 4} textAnchor="end">{compactMoney(max * (1 - index / 4))}</text></g>)}
    {data.map((item, index) => <g key={index}><line x1={xAt(index)} y1={top} x2={xAt(index)} y2={top + innerHeight} className="auto-grid-line" />{(data.length < 9 || index % Math.ceil(data.length / 7) === 0) && <text x={xAt(index)} y={height - 10} textAnchor="middle">{item.label}</text>}{!line && series.map((key, s) => <rect key={key} x={xAt(index) + (s - 1) * Math.min(16, step / 3)} y={yAt(item[key])} width={Math.min(14, step / 3 - 1)} height={Number(item[key]) / max * innerHeight} rx="2.5" fill={colors[s]}><title>{`${item.label} · ${labels[s]}: ${formatMoney(item[key])}`}</title></rect>)}</g>)}
    {line && series.map((key, index) => {
      const path = data.map((item, i) => `${i ? 'L' : 'M'} ${xAt(i)} ${yAt(item[key])}`).join(' ');
      return <g key={key}><path d={`${path} L ${xAt(data.length - 1)} ${top + innerHeight} L ${xAt(0)} ${top + innerHeight} Z`} fill={`url(#${unique}-${index})`} /><path d={path} fill="none" stroke={colors[index]} strokeWidth="2.5" strokeLinejoin="round" />{data.map((item, i) => <circle key={i} cx={xAt(i)} cy={yAt(item[key])} r="3" fill={colors[index]}><title>{`${item.label} · ${labels[index]}: ${formatMoney(item[key])}`}</title></circle>)}</g>;
    })}
  </svg>}</>;
}

function Donut({ entries, totalLabel, totalText }) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  let offset = 0;
  return <div className="auto-donut-layout"><div className="auto-donut"><svg viewBox="0 0 160 160" role="img" aria-label={`${totalLabel}: ${totalText}`}><circle cx="80" cy="80" r="62" fill="none" stroke="var(--auto-grid)" strokeWidth="25" />{total > 0 && entries.map((entry, index) => {
    const fraction = entry.value / total * 100;
    const start = offset; offset += fraction;
    return <circle key={entry.name} cx="80" cy="80" r="62" fill="none" stroke={entry.color || COLORS[index % COLORS.length]} strokeWidth="25" pathLength="100" strokeDasharray={`${fraction} ${100 - fraction}`} strokeDashoffset={-start} transform="rotate(-90 80 80)"><title>{`${entry.name}: ${entry.value.toLocaleString('en-IN')} (${fraction.toFixed(1)}%)`}</title></circle>;
  })}</svg><div><strong>{totalText}</strong><small>{totalLabel}</small></div></div><ul className="auto-donut-legend">{entries.length ? entries.map((entry, index) => <li key={entry.name}><i style={{ background: entry.color || COLORS[index % COLORS.length] }} /><span>{entry.name}</span><b>{entry.count ? entry.value.toLocaleString('en-IN') : `${total ? (entry.value / total * 100).toFixed(0) : 0}%`}</b></li>) : <li>No sales categories yet</li>}</ul></div>;
}

function InvoiceTable({ rows = [], purchase = false, user }) {
  return <div className="auto-table-wrap"><table><thead><tr><th>Date</th><th>Invoice No.</th><th>{purchase ? 'Supplier' : 'Customer'}</th><th>Amount</th>{!purchase && <th>Status</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.date ? new Date(`${row.date}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td><td>{canAccessPath(`/billing/${purchase ? 'purchase-entry' : 'invoice'}/${row.id}/view`, user) ? <Link to={`/billing/${purchase ? 'purchase-entry' : 'invoice'}/${row.id}/view`}>{row.number}</Link> : row.number}</td><td>{row.name}</td><td>{formatMoney(row.amount)}</td>{!purchase && <td><span className={`auto-status ${row.status.toLowerCase()}`}>{row.status}</span></td>}</tr>)}</tbody></table>{!rows.length && <Empty text={`No ${purchase ? 'purchase entries' : 'sales invoices'} this month`} />}</div>;
}

export function AutomobileDashboardPage() {
  const user = useCurrentUser() || {};
  const [period, setPeriod] = useState(currentMonth);
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [trend, setTrend] = useState('Monthly');
  const owner = user.isSuperAdmin || user.accountType === 'owner' || user.role === 'Super Admin';
  useEffect(() => {
    if (!owner) return;
    let active = true;
    apiClient('/settings/branches').then((result) => { if (active) setBranches(result.branches || []); }).catch(() => {});
    return () => { active = false; };
  }, [owner]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const query = new URLSearchParams({ period, ...(branch ? { branch } : {}) });
    const endpoint = user.category === 'automobile' ? 'automobile-summary' : 'retail-summary';
    apiClient(`/dashboard/${endpoint}?${query}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, branch, refresh, user.category]);
  const monthLabel = period ? new Date(`${period}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
  const daily = data?.daily || [];
  const weekly = Array.from({ length: Math.ceil(daily.length / 7) }, (_, index) => ({ label: `Week ${index + 1}`, ...daily.slice(index * 7, index * 7 + 7).reduce((sum, day) => ({ sales: sum.sales + day.sales, purchases: sum.purchases + day.purchases }), { sales: 0, purchases: 0 }) }));
  const inventory = data?.inventory || {};
  const link = (path) => canAccessPath(path.split('?')[0], user) ? path : undefined;
  return <div className="auto-dashboard" aria-busy={loading}>
    <div className="auto-toolbar"><div className="auto-welcome"><h1>Hello, {user.name || user.businessName || 'there'}</h1><p>{user.category === 'automobile' ? "Here's what's happening with your automobile business today." : "Here's what's happening with your retail business today."}</p></div><div className="auto-filters">{owner && <label><span className="auto-sr-only">Branch</span><select value={branch} onChange={(event) => setBranch(event.target.value)}><option value="">All Branches</option>{branches.map((item) => <option key={item._id || item.code || item.name} value={item.code || item.name}>{item.name}</option>)}</select></label>}<label><span className="auto-sr-only">Dashboard month</span><input type="month" value={period} onChange={(event) => { if (/^\d{4}-\d{2}$/.test(event.target.value)) setPeriod(event.target.value); }} /></label><button type="button" className="auto-refresh" aria-label="Refresh dashboard" onClick={() => setRefresh((value) => value + 1)} disabled={loading}><RefreshCw size={17} className={loading ? 'auto-spinning' : ''} /></button></div></div>
    {error && <div className="auto-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    {loading && <div className="auto-loading" role="status">Loading your business overview…</div>}
    <div className="auto-metrics">{METRICS.map(([key, label, Icon, tone, count]) => {
      const metric = data?.metrics?.[key];
      return <article className="auto-metric" key={key}><span className={`auto-icon ${tone}`}><Icon size={25} /></span><div><h3>{label}</h3><strong>{metric ? count ? Number(metric.value).toLocaleString('en-IN') : formatMoney(metric.value) : '—'}</strong>{metric?.change != null ? <small className={metric.change < 0 ? 'negative' : 'positive'}>{metric.change < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}{Math.abs(metric.change).toFixed(1)}% <span>vs previous {key === 'todaySales' ? 'day' : 'month'}</span></small> : <small className="auto-metric-caption">{['todaySales'].includes(key) ? 'Today' : ['monthlySales', 'purchases', 'purchaseOrders', 'profit'].includes(key) ? monthLabel : 'Current balance'}</small>}</div></article>;
    })}</div>
    <div className="auto-chart-row"><Panel title="Sales vs Purchase" icon={BarChart3} note={monthLabel}><ComparisonChart data={weekly} /></Panel><Panel title="Revenue Trend" icon={ChartNoAxesCombined}><div className="auto-trend-switch" aria-label="Revenue grouping">{['Daily', 'Weekly', 'Monthly'].map((value) => <button key={value} aria-pressed={trend === value} className={trend === value ? 'selected' : ''} onClick={() => setTrend(value)}>{value}</button>)}</div><ComparisonChart data={trend === 'Monthly' ? data?.monthly : trend === 'Weekly' ? weekly : daily} line /></Panel><Panel title="Category Wise Sales" icon={PieChart} note={monthLabel}><Donut entries={data?.categorySales || []} totalLabel="Total Sales" totalText={data ? compactMoney(data.metrics.monthlySales.value) : '—'} /></Panel></div>
    <div className="auto-middle-row"><Panel title="Top Selling Products" icon={Trophy} href={link('/products')}><div className="auto-table-wrap"><table><thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Sales Value</th></tr></thead><tbody>{data?.topProducts?.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><span className="auto-product-icon"><Package size={14} /></span>{item.name}</td><td>{item.quantity.toLocaleString('en-IN')}</td><td>{formatMoney(item.value)}</td></tr>)}</tbody></table>{!data?.topProducts?.length && <Empty text="Your best sellers will appear here" />}</div></Panel><Panel title="Payment Collection Trend" icon={CircleDollarSign} note="Last 7 months"><ComparisonChart data={data?.monthly} series={['received', 'pending']} labels={['Received', 'Pending']} colors={['#12c28c', '#ffae26']} /></Panel><Panel title="Inventory Status" icon={Boxes} href={link('/stock-summary')}><Donut totalLabel="Total Items" totalText={data ? Number(inventory.total || 0).toLocaleString('en-IN') : '—'} entries={[{ name: 'In Stock', value: inventory.inStock || 0, color: '#10c38d', count: true }, { name: 'Low Stock', value: inventory.lowStock || 0, color: '#ffb128', count: true }, { name: 'Out of Stock', value: inventory.outOfStock || 0, color: '#ff4568', count: true }]} /></Panel></div>
    <div className="auto-bottom-row"><Panel title="Recent Sales Invoices" icon={FileText} href={link('/billing/invoice')}><InvoiceTable rows={data?.recentSales} user={user} /></Panel><Panel title="Low Stock Alerts" icon={AlertTriangle} href={link('/stock-alerts')}><div className="auto-table-wrap"><table><thead><tr><th>Product</th><th>Current Stock</th></tr></thead><tbody>{data?.lowStock?.map((item) => <tr key={item.id}><td>{item.name}</td><td className="auto-stock-warning">{item.stock} {item.unit}</td></tr>)}</tbody></table>{!data?.lowStock?.length && <Empty text="No low stock alerts" />}</div></Panel><Panel title="Pending Customer Payments" icon={Users} href={link('/billing/receivables')}><div className="auto-table-wrap"><table><thead><tr><th>Customer</th><th>Amount</th></tr></thead><tbody>{data?.pendingCustomers?.map((item) => <tr key={item.name}><td><span className="auto-avatar">{item.name.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span>{item.name}</td><td>{formatMoney(item.value)}</td></tr>)}</tbody></table>{!data?.pendingCustomers?.length && <Empty text="No pending customer payments" />}</div></Panel><Panel title="Recent Purchase Entries" icon={FilePlus2} href={link('/billing/purchase-entry')}><InvoiceTable rows={data?.recentPurchases} purchase user={user} /></Panel></div>
    <p className="auto-footnote">Sales, purchases and charts reflect {monthLabel}. Inventory and outstanding balances show the current position. Profit is based on recorded accounting postings.</p>
  </div>;
}
