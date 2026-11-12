import { useState } from 'react';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { stockChartFilter } from '../../../../../utils/stockDashboard.js';
import '../../../automobile/automobileStockSummary.css';

const COLORS = ['#2582ff', '#23a0ca', '#ffbf34', '#a58af6', '#ff596b', '#20c99b', '#a4abb4'];
const quantity = (value) => Number(value).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const valueLabel = (value, metric) => value == null ? 'Unavailable' : metric === 'value' ? formatCurrency(value) : quantity(value);

function ChartState({ loading, error, empty, children }) {
  return loading || error || empty ? <div className="ass-chart-empty" role="status">{loading ? 'Loading stock data…' : error ? 'Stock data is unavailable. Use Retry to reload.' : 'No stock data for these filters.'}</div> : children;
}

function Donut({ items, metric, centerLabel, onSelect }) {
  const incomplete = items.some((item) => item.total == null);
  const negative = items.some((item) => item.total < 0);
  const sum = items.reduce((total, item) => total + Number(item.total || 0), 0);
  let offset = 0;
  return <div className="ass-category-chart">
    <div className="ass-donut ass-interactive-donut">
      <svg viewBox="0 0 100 100" aria-label={centerLabel}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e8eff9" strokeWidth="20" />
        {!incomplete && !negative && sum > 0 && items.map((item, index) => {
          const length = item.total / sum * 251.327;
          const start = offset; offset += length;
          return item.total > 0 && <circle key={item.key} cx="50" cy="50" r="40" fill="none" stroke={item.color || COLORS[index % COLORS.length]} strokeWidth="20" strokeDasharray={`${length} ${251.327 - length}`} strokeDashoffset={-start} transform="rotate(-90 50 50)" role="link" tabIndex="0" aria-label={`${item.name}: ${valueLabel(item.total, metric)}. Open filtered products.`} onClick={() => onSelect(item)} onKeyDown={(event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(item); } }}><title>{item.name}: {valueLabel(item.total, metric)}</title></circle>;
        })}
      </svg>
      <div><strong>{incomplete ? 'Unavailable' : negative ? 'See details' : valueLabel(sum, metric)}</strong><small>{centerLabel}</small></div>
    </div>
    <div className="ass-legend">{incomplete && <p role="status">Valuation incomplete. Reconcile historical costs.</p>}{negative && <p role="status">Negative balances are listed below, not plotted.</p>}{items.map((item, index) => <button key={item.key} type="button" onClick={() => onSelect(item)}><i style={{ background: item.color || COLORS[index % COLORS.length] }} /><span title={item.name}>{item.name}</span><small>{!incomplete && !negative && sum > 0 ? `${(item.total / sum * 100).toFixed(1)}%` : '—'}</small><b>{valueLabel(item.total, metric)}</b></button>)}</div>
  </div>;
}

export function StockDashboardCharts({ response, loading, error, onNavigate }) {
  const [warehouseMetric, setWarehouseMetric] = useState('quantity');
  const [categoryMetric, setCategoryMetric] = useState('value');
  const warehouses = response?.warehouses || [];
  const categories = response?.categories || [];
  const distribution = response?.distribution || [];
  const trend = response?.trend || [];
  const maxWarehouse = Math.max(1, ...warehouses.map((item) => Number(item[warehouseMetric]) || 0));
  const maxTrend = Math.max(1, ...trend.flatMap((point) => [point.inwardQty, point.outwardQty]));
  const metricSelect = (label, value, onChange) => <SelectDropdown aria-label={label} value={value} onChange={onChange} options={[{ value: 'quantity', label: 'Stock Quantity' }, { value: 'value', label: 'Stock Value' }]} className="autop-dropdown" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal />;
  return <div className="ass-charts ass-dashboard-charts">
    <section className="ass-chart"><header><h2>Warehouse-wise Stock {warehouseMetric === 'quantity' ? 'Quantity' : 'Value'}</h2>{metricSelect('Warehouse chart metric', warehouseMetric, setWarehouseMetric)}</header><ChartState loading={loading} error={error} empty={!warehouses.length}>
      {warehouseMetric === 'value' && warehouses.some((item) => item.value == null) ? <div className="ass-chart-empty">Valuation incomplete. Reconcile historical costs.</div> : <div className="ass-bar-chart"><div className="ass-axis"><span>{valueLabel(maxWarehouse, warehouseMetric)}</span><span>{valueLabel(maxWarehouse / 2, warehouseMetric)}</span><span>0</span></div><div className="ass-bars ass-scroll-bars">{warehouses.map((item) => <button type="button" key={item.key} className="ass-bar-item" title={`${item.name}: ${valueLabel(item[warehouseMetric], warehouseMetric)}. Open filtered products.`} onClick={() => onNavigate(stockChartFilter('warehouse', item.key))}><div className="ass-bar-track"><div className="ass-bar" style={{ height: `${Math.max(0, item[warehouseMetric] / maxWarehouse * 100)}%` }}><strong>{valueLabel(item[warehouseMetric], warehouseMetric)}</strong></div></div><span>{item.name}</span></button>)}</div></div>}
    </ChartState></section>
    <section className="ass-chart"><header><h2>Category-wise Stock {categoryMetric === 'value' ? 'Value' : 'Quantity'}</h2>{metricSelect('Category chart metric', categoryMetric, setCategoryMetric)}</header><ChartState loading={loading} error={error} empty={!categories.length}><Donut items={categories.map((item) => ({ ...item, total: item[categoryMetric] }))} metric={categoryMetric} centerLabel={categoryMetric === 'value' ? 'Total Value' : 'Total Quantity'} onSelect={(item) => onNavigate(stockChartFilter('category', item.key))} /></ChartState></section>
    <section className="ass-chart"><header><h2>Stock Status Distribution</h2></header><ChartState loading={loading} error={error} empty={!response?.stats?.totalProducts}><Donut items={distribution.map((item) => ({ ...item, total: item.count, color: { healthy: '#00ac57', low: '#f29a00', out: '#ff2750', inactive: '#758092', overstock: '#892cff' }[item.key] }))} metric="quantity" centerLabel="Products" onSelect={(item) => onNavigate({ stockStatus: item.key })} /></ChartState></section>
    <section className="ass-chart"><header><h2>Stock In vs Stock Out</h2><span className="ass-trend-key"><i />Stock In <i />Stock Out</span></header><ChartState loading={loading} error={error} empty={!trend.some((point) => point.inwardQty || point.outwardQty)}><div className="ass-bar-chart"><div className="ass-axis"><span>{quantity(maxTrend)}</span><span>{quantity(maxTrend / 2)}</span><span>0</span></div><div className="ass-bars ass-scroll-bars">{trend.map((point) => <div key={point.label} className="ass-trend-point"><div className="ass-trend-pair">{[['in', 'inwardQty'], ['out', 'outwardQty']].map(([direction, field]) => <button type="button" className={`ass-trend-bar ass-trend-${direction}`} key={direction} disabled={!point[field]} title={`${point.label}: Stock ${direction} ${quantity(point[field])}. Open filtered products.`} aria-label={`${point.label} stock ${direction}: ${quantity(point[field])}`} onClick={() => onNavigate({ movementFrom: point.from, movementTo: point.to, movementDirection: direction })} style={{ height: `${Math.max(point[field] ? 2 : 0, point[field] / maxTrend * 100)}%` }} />)}</div><span>{point.label}</span></div>)}</div></div></ChartState></section>
  </div>;
}
