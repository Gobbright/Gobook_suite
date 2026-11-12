import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, ClipboardList, Database, ListFilter, Package, Search, Warehouse } from 'lucide-react';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { useStockSummaryTable } from '../../../hooks/useStockSummaryTable.js';
import { StockSummaryTable } from '../common/modules/inventory/StockSummaryTable.jsx';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { STOCK_STATUS_OPTIONS, stockDashboardFilters, stockProductLink } from '../../../utils/stockDashboard.js';
import './automobileProducts.css';
import './automobileStockSummary.css';

const EMPTY = stockDashboardFilters();
const number = (value) => Number(value) || 0;
function Dropdown({ label, value, onChange, options, className = '' }) {
  return <SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} placeholder={label === 'More stock actions' ? 'More' : label} className={`autop-dropdown ${className}`} buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal />;
}

export function AutomobileStockSummaryPage({ productList = false }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(() => ({ ...EMPTY, ...stockDashboardFilters(window.location.search) }));
  const query = { ...filters, itemType: 'Product' };
  const model = useStockSummaryTable(query, 10);
  const { response: dashboard, loading, error, setPage, setChecked } = model;
  const change = (key, value) => setFilters((previous) => ({ ...previous, [key]: value, ...(key === 'warehouse' || key === 'category' ? { [`${key}Missing`]: '' } : {}) }));
  const drill = (extra = {}) => navigate(stockProductLink(filters, extra));
  const cards = [
    ['Total Products', number(dashboard?.stats?.totalProducts).toLocaleString('en-IN'), Package, 'blue', 'Distinct inventory products', {}],
    ['Total Physical Stock Quantity', number(dashboard?.stats?.totalQty).toLocaleString('en-IN'), Warehouse, 'blue', 'Physical quantity at cut-off', {}],
    ['Total Stock Value', dashboard?.stats?.totalValue == null ? 'Unavailable' : money(dashboard.stats.totalValue), Database, 'green', dashboard?.costingMethod || 'Configured costing method', {}],
    ['Low Stock Items', number(dashboard?.stats?.lowStock), ClipboardList, 'orange', 'Available stock at or below minimum', { stockStatus: 'low' }],
    ['Out of Stock Items', number(dashboard?.stats?.outOfStock), AlertTriangle, 'red', 'No available stock', { stockStatus: 'out' }],
    ['Reserved Stock', number(dashboard?.stats?.reservedQty).toLocaleString('en-IN'), Package, 'purple', 'Active reserved quantity', { stockStatus: 'reserved' }],
  ];
  return <div className="inventory-list-page ass-container"><div className="autop-page ass-page">
    <header className="autop-header"><div><h1>{productList ? 'Products' : 'Stock Summary'}</h1><p>{productList ? 'Filtered products from Stock Summary, using the selected dates and stock locations.' : 'View stock quantity and valuation across warehouses, branches, categories and brands.'}</p></div><div className="autop-actions"><Link className="ass-button" to={productList ? '/stock-summary' : '/stock-ledger'}><BookOpen size={17} />{productList ? 'Stock Summary' : 'View Ledger'}</Link><Dropdown label="More stock actions" value="" options={[{ value: '/stock-alerts', label: 'Stock Alerts' }, { value: '/warehouse', label: 'Warehouses' }, { value: '/products', label: 'Products' }]} onChange={navigate} className="ass-more" /></div></header>
    {!productList && <div className="autop-stats ass-stats">{cards.map(([label, total, Icon, color, hint, extra]) => <button type="button" disabled={loading || !!error} key={label} className={`autop-stat autop-${color}`} onClick={() => drill(extra)}><div className="autop-stat-icon"><Icon size={24} /></div><div><span>{label}</span><strong>{loading || error ? '—' : total}</strong><small>{hint}</small></div></button>)}</div>}
    {error && <div className="autop-error" role="alert">{error}<button onClick={model.retry}>Retry</button></div>}

    <div className="autop-filters ass-filters"><label className="autop-search"><Search size={17} /><input aria-label="Search stock summary" placeholder="Search by product name, SKU, part number or barcode..." value={filters.search} onChange={(event) => change('search', event.target.value)} /></label>{[['brand', 'Brand'], ['category', 'Category'], ['warehouse', 'Warehouse'], ['branch', 'Branch']].map(([key, label]) => <Dropdown key={key} label={label} value={filters[key]} onChange={(next) => change(key, next)} className="autop-filter" options={[{ value: '', label }, ...(dashboard?.filterOptions?.[key] || []).map((next) => ({ value: next, label: next }))]} />)}<Dropdown label="Stock status" value={filters.stockStatus} onChange={(value) => change('stockStatus', value)} className="autop-filter" options={STOCK_STATUS_OPTIONS} />{[['dateFrom', 'From Date'], ['dateTo', 'To Date']].map(([key, label]) => <label className="ass-date" key={key}>{label}<input aria-label={label} type="date" value={filters[key]} onChange={(event) => change(key, event.target.value)} /></label>)}<label className="ass-zero"><input type="checkbox" checked={filters.zeroStock === '1'} onChange={(event) => change('zeroStock', event.target.checked ? '1' : '')} />Zero Stock Only</label><button onClick={() => { setFilters(EMPTY); setPage(1); setChecked([]); }}><ListFilter size={15} />Clear Filters</button></div>
    {productList && <p className="ass-data-note">{filters.stockStatus && `Stock filter: ${filters.stockStatus}. `}{filters.movementDirection && `Stock ${filters.movementDirection}: ${filters.movementFrom} to ${filters.movementTo}. `}{filters.warehouseMissing === '1' && 'Unassigned warehouse. '}{filters.categoryMissing === '1' && 'Unassigned category. '}<Link to="/products">Open full product management</Link></p>}
    {!loading && !error && dashboard?.warnings?.length > 0 && <p className="ass-data-note" role="status">Historical records need reconciliation: {dashboard.warnings.join(', ')}. Unknown costs are not shown as zero.</p>}
    <StockSummaryTable model={model} filters={query} automobile />
  </div></div>;
}
