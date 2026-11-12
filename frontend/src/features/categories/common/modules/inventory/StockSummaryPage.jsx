import { useAutomobileListingLayout } from '../../../../../hooks/useAutomobileListingLayout.js';
import { AutomobileStockSummaryPage } from '../../../automobile/AutomobileStockSummaryPage.jsx';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStockSummaryTable } from '../../../../../hooks/useStockSummaryTable.js';
import { StockSummaryTable } from './StockSummaryTable.jsx';
import { stockDashboardFilters, stockProductLink } from '../../../../../utils/stockDashboard.js';

import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';

function StatCard({ label, value, sub, color, bg, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="bg-white border border-[#dfe7f1] rounded-xl p-4 text-left font-[inherit] disabled:opacity-60">
      <div className="text-xs text-[#536173] mb-1">{label}</div>
      <div className="text-[18px] font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs text-[#536173] mt-1">{sub}</div>
      <div className="h-1 rounded-full mt-3" style={{ background: bg }} />
    </button>
  );
}

function ItemTypeTabs({ value, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-[#dbe4ef] bg-white p-0.5">
      {['Product', 'Service'].map((t) => (
        <button
          key={t}
          type="button"
          className={`px-3 py-1.5 text-[13px] font-medium rounded cursor-pointer font-[inherit] ${value === t ? 'bg-blue-600 text-white' : 'text-[#374151] hover:bg-gray-50'}`}
          onClick={() => onChange(t)}
        >
          {t === 'Product' ? 'Products' : 'Services'}
        </button>
      ))}
    </div>
  );
}

export function StockSummaryPage({ productList = false }) {
  const useAutomobileLayout = useAutomobileListingLayout();
  return useAutomobileLayout ? <AutomobileStockSummaryPage productList={productList} /> : <DefaultStockSummaryPage productList={productList} />;
}

function DefaultStockSummaryPage({ productList }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(() => stockDashboardFilters(window.location.search));
  const [search, setSearch] = useState(() => stockDashboardFilters(window.location.search).search);
  const [status, setStatus] = useState(() => stockDashboardFilters(window.location.search).stockStatus || stockDashboardFilters(window.location.search).status || 'all');
  const [itemType, setItemType] = useState('Product');
  const [category, setCategory] = useState(() => stockDashboardFilters(window.location.search).category || 'All Categories');


  const query = { ...filters, search, category: category === 'All Categories' ? '' : category, status: ['active', 'inactive'].includes(status) ? status : filters.status, stockStatus: ['low', 'out', 'healthy', 'reserved', 'zero', 'overstock'].includes(status) ? status : '', itemType };
  const model = useStockSummaryTable(query);
  const { response, loading, error, retry, setPage } = model;
  const stats = response?.stats;
  const categories = ['All Categories', ...(response?.filterOptions?.category || [])];
  const drill = (extra = {}) => navigate(stockProductLink(query, extra));
  const change = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value, ...(key === 'warehouse' ? { warehouseMissing: '' } : {}) })); setPage(1); };

  function resetFilters() {
    setSearch('');
    setStatus('all');
    setItemType('Product');
    setCategory('All Categories');
    setPage(1);
    setFilters(stockDashboardFilters());
  }


  return (
    <div className="inventory-list-page p-4 md:p-7">
      <div className="inventory-list-header flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="m-0 text-[22px] font-bold text-[#111827]">{productList ? 'Products' : 'Stock Summary'}</h1>
          <p className="m-0 text-[13px] text-[#536173] mt-0.5">{productList ? 'Filtered inventory products from Stock Summary, at the selected dates and locations.' : 'Current product stock, value and reorder status in one place'}</p>
        </div>
      </div>

      {!productList && <div className="inventory-list-stats grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {[['Total Products', stats?.totalProducts, 'Distinct inventory products', '#2563eb', '#bfdbfe', {}], ['Total Physical Stock Quantity', stats?.totalQty, 'Physical quantity at cut-off', '#16a34a', '#bbf7d0', {}], ['Total Stock Value', stats?.totalValue == null ? 'Unavailable' : formatCurrency(stats.totalValue), response?.costingMethod || 'Configured costing method', '#7c3aed', '#ddd6fe', {}], ['Low Stock Items', stats?.lowStock, 'Available stock at or below minimum', '#d97706', '#fed7aa', { stockStatus: 'low' }], ['Out of Stock Items', stats?.outOfStock, 'No available stock', '#dc2626', '#fecaca', { stockStatus: 'out' }], ['Reserved Stock', stats?.reservedQty, 'Active reserved quantity', '#0891b2', '#a5f3fc', { stockStatus: 'reserved' }]].map(([label, value, sub, color, bg, extra]) => <StatCard key={label} label={label} value={loading || error ? '—' : typeof value === 'string' ? value : Number(value || 0).toLocaleString('en-IN')} sub={sub} color={color} bg={bg} onClick={() => drill(extra)} disabled={loading || !!error} />)}
      </div>}
      {error && <div className="mb-4 text-sm text-red-600" role="alert">{error} <button type="button" onClick={retry} className="underline">Retry</button></div>}
      {!loading && !error && response?.warnings?.length > 0 && <p className="ass-data-note" role="status">Historical stock needs reconciliation: {response.warnings.join(', ')}. Unknown costs are not shown as zero.</p>}
      {productList && <p className="ass-data-note">{filters.stockStatus && `Stock filter: ${filters.stockStatus}. `}{filters.movementDirection && `Stock ${filters.movementDirection}: ${filters.movementFrom} to ${filters.movementTo}. `}{filters.warehouseMissing === '1' && 'Unassigned warehouse. '}{filters.categoryMissing === '1' && 'Unassigned category. '}<button type="button" className="underline" onClick={() => navigate('/products')}>Open full product management</button></p>}

      <div className="inventory-list-panel bg-white border border-[#dfe7f1] rounded-xl">
        <div className="inventory-list-filters grid grid-cols-2 gap-2 px-3 py-3 border-b border-[#edf2f7] md:flex md:items-center md:gap-3 md:px-5 md:py-3.5 md:flex-wrap">
          <ItemTypeTabs value={itemType} onChange={(t) => { setItemType(t); setPage(1); }} />
          <div className="relative col-span-2 row-start-1 md:row-auto md:col-span-1 md:flex-1 md:max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#536173]" fill="none" height="13" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="13"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>
            <input className="h-11 md:h-auto border border-[#dbe4ef] rounded-lg md:rounded-md pl-9 pr-3 py-2 text-[13px] w-full outline-none focus:border-blue-500 font-[inherit] bg-white" aria-label="Search stock summary" placeholder="Search product, SKU, barcode or part number..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <SelectDropdown
            className="min-w-0 md:w-44 md:flex-none"
            buttonClassName="h-11 md:h-auto border border-[#dbe4ef] rounded-lg md:rounded-md px-3 py-2 text-[13px] outline-none font-[inherit] text-[#374151] bg-white cursor-pointer"
            value={category}
            onChange={(v) => { setCategory(v); setFilters((previous) => ({ ...previous, categoryMissing: '' })); setPage(1); }}
            options={categories}
          />
          <SelectDropdown
            className="min-w-0 md:w-44 md:flex-none"
            buttonClassName="h-11 md:h-auto border border-[#dbe4ef] rounded-lg md:rounded-md px-3 py-2 text-[13px] outline-none font-[inherit] text-[#374151] bg-white cursor-pointer"
            value={status}
            onChange={(v) => { setStatus(v); setFilters((previous) => ({ ...previous, status: '', stockStatus: '' })); setPage(1); }}
            options={[
              { value: 'all', label: 'All Stock' },
              { value: 'active', label: 'Active Products' },
              { value: 'low', label: 'Low Stock' },
              { value: 'out', label: 'Out of Stock' },
              { value: 'overstock', label: 'Overstock' },
              { value: 'healthy', label: 'In Stock' },
              { value: 'reserved', label: 'Reserved Stock' },
              { value: 'zero', label: 'Zero Physical Stock' },
              { value: 'inactive', label: 'Inactive Products' },
            ]}
          />
          <SelectDropdown aria-label="Brand" className="min-w-0 md:w-40 md:flex-none" value={filters.brand} onChange={(value) => change('brand', value)} options={[{ value: '', label: 'All Brands' }, ...(response?.filterOptions?.brand || []).map((value) => ({ value, label: value }))]} />
          <label className="ass-zero"><input type="checkbox" checked={filters.zeroStock === '1'} onChange={(event) => change('zeroStock', event.target.checked ? '1' : '')} />Zero Stock Only</label>
          {['warehouse', 'branch'].map((key) => <SelectDropdown key={key} aria-label={key === 'warehouse' ? 'Warehouse' : 'Branch'} className="min-w-0 md:w-40 md:flex-none" value={filters[key]} onChange={(value) => change(key, value)} options={[{ value: '', label: key === 'warehouse' ? 'All Warehouses' : 'All Branches' }, ...(response?.filterOptions?.[key] || []).map((value) => ({ value, label: value }))]} />)}
          {['dateFrom', 'dateTo'].map((key) => <label key={key} className="ass-date">{key === 'dateFrom' ? 'From Date' : 'To Date'}<input type="date" aria-label={key === 'dateFrom' ? 'From Date' : 'To Date'} value={filters[key]} onChange={(event) => change(key, event.target.value)} /></label>)}
          <button
            type="button"
            className="col-span-2 h-10 rounded-lg border border-[#dbe4ef] bg-[#f8fafc] px-3 text-[12px] font-semibold text-[#374151] hover:bg-white font-[inherit] md:col-span-1 md:h-9 md:flex-none"
            onClick={resetFilters}
          >
            Reset Filters
          </button>
        </div>

        <StockSummaryTable model={model} filters={query} />
      </div>
    </div>
  );
}
