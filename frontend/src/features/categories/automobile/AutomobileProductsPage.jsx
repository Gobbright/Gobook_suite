import { BulkDeleteTable, BulkDeleteRow } from '../../../components/forms/BulkDeleteTable.jsx';
import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, FileSearch, ListFilter, MoreHorizontal, Package, Pencil, Plus, RefreshCw, Search, Tag, Trash2, Upload, Warehouse } from 'lucide-react';
import { api, SERVER_ORIGIN } from '../../../services/api.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { formatCurrency } from '../../../utils/formatCurrency.js';
import './automobileProducts.css';

const unique = (rows, key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
const minimum = (row) => Number(row.minStockLevel || row.reorderLevel || 0);
const compatibility = (row) => String(row.compatibleModel || '').split(/[,;\n]/).map((value) => value.trim()).filter(Boolean);
const status = (row) => row.status || 'Active';
const productImageUrl = (row) => {
  const image = row.imageUrl || row.images?.[0]?.url || row.images?.[0] || '';
  if (!image) return '';
  const value = typeof image === 'string' ? image : image.url || '';
  if (!value) return '';
  return /^(https?:|data:|blob:)/i.test(value) ? value : `${SERVER_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
};

function ProductDropdown({ label, value, onChange, options, className = '' }) {
  return <SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} className={`autop-dropdown ${className}`} buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal />;
}

function Filter({ label, value, onChange, options }) {
  return <ProductDropdown className="autop-filter" label={label} value={value} onChange={onChange} options={[{ value: '', label }, ...options.map((option) => ({ value: option, label: option }))]} />;
}

const productIdentity = (row, industry) => industry === 'electronics' ? row.modelNumber || row.modelFamily || '' : industry === 'fashion' ? row.code || row.sku || '' : row.partNumber || '';
const productDetails = (row, industry) => industry === 'electronics'
  ? [row.ram, row.storage, row.processor].filter(Boolean).join(' / ')
  : industry === 'fashion' ? [...new Set([row.size, row.colour, row.color, ...(row.variants || []).flatMap((variant) => [variant.size, variant.colour, variant.color])].filter(Boolean))].join(' / ')
    : row.compatibleModel || '';
export function AutomobileProductsPage({ onEdit, onNew, refreshKey, industry = 'automobile', onImport }) {
  const identityLabel = industry === 'electronics' ? 'Model' : industry === 'fashion' ? 'SKU / Item Code' : 'Part No.';
  const detailsLabel = industry === 'electronics' ? 'Specifications' : industry === 'fashion' ? 'Size / Colour' : 'Vehicle Compatibility';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState(() => ({ search: new URLSearchParams(window.location.search).get('search') || '', brand: '', category: '', warehouse: '', status: '', compatibleModel: '' }));
  const [sort, setSort] = useState('name');
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState([]);
  const allRef = useRef(null);
  const moreRef = useRef(null);
  const searchRef = useRef(null);
  useEffect(() => {
    const closeMore = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) moreRef.current.open = false;
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && moreRef.current?.open) {
        moreRef.current.open = false;
        moreRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeMore, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeMore, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const rows = []; let current = 1;
        while (active) {
          const response = await api.invListProducts({ itemType: 'Product', page: current, limit: 500 });
          const batch = response.data || []; rows.push(...batch);
          if (!batch.length || rows.length >= Number(response.total)) break;
          current++;
        }
        if (active) { setProducts(rows); setChecked((previous) => previous.filter((id) => rows.some((row) => row._id === id))); }
      } catch (failure) { if (active) setError(failure.message || 'Unable to load products.'); }
      finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [reload, refreshKey]);
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.querySelector('[role="dialog"]')) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  const filtered = useMemo(() => products.filter((row) => {
    const text = [row.description, row.code, row.partNumber, row.manufacturerPartNumber, row.barcode, row.brand, productIdentity(row, industry), productDetails(row, industry)].join(' ').toLowerCase();
    return text.includes(filters.search.toLowerCase()) && ['brand', 'category', 'warehouse'].every((key) => !filters[key] || row[key] === filters[key]) && (!filters.status || status(row) === filters.status) && (!filters.compatibleModel || (industry === 'automobile' ? compatibility(row) : [productDetails(row, industry)]).includes(filters.compatibleModel));
  }).sort((a, b) => sort === 'price' ? Number(a.rate || 0) - Number(b.rate || 0) : sort === 'stock' ? Number(a.stock || 0) - Number(b.stock || 0) : sort === 'name-desc' ? b.description.localeCompare(a.description) : a.description.localeCompare(b.description)), [products, filters, sort, industry]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * size, currentPage * size);
  const allChecked = rows.length > 0 && rows.every((row) => checked.includes(row._id));
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = !allChecked && rows.some((row) => checked.includes(row._id)); }, [rows, checked, allChecked]);
  const change = (key, value) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(1); };
  const duplicateGroups = new Map();
  products.forEach((row) => { const key = String(industry === 'automobile' ? row.partNumber || row.barcode || '' : row.barcode || row.code || '').trim().toLowerCase(); if (key) duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1); });
  const cards = [
    ['Total Products', products.length, Package, 'blue', 'Inventory catalogue'],
    ['Active Products', products.filter((row) => status(row) === 'Active').length, CheckCircle2, 'green', 'Available for business'],
    ['Low Stock Items', products.filter((row) => Number(row.stock || 0) <= minimum(row)).length, AlertTriangle, 'red', 'Review stock levels'],
    ['Duplicate Review', [...duplicateGroups.values()].filter((count) => count > 1).length, FileSearch, 'orange', industry === 'automobile' ? 'Matching part no. / barcode' : 'Matching barcode / SKU'],
    ['Total Brands', unique(products, 'brand').length, Tag, 'purple', 'Brands in your catalogue'],
    ['Warehouses Covered', unique(products, 'warehouse').length, Warehouse, 'blue', 'Stock locations'],
  ];
  async function deleteProduct(row) {
    if (!window.confirm(`Delete ${row.description || 'this product'}?`)) return;
    setActionError('');
    setDeletingId(row._id);
    try {
      await api.invDeleteProduct(row._id);
      setProducts((previous) => previous.filter((product) => product._id !== row._id));
      setChecked((previous) => previous.filter((id) => id !== row._id));
      const nextPageCount = Math.max(1, Math.ceil((filtered.length - 1) / size));
      if (currentPage > nextPageCount) setPage(nextPageCount);
    } catch (failure) {
      setActionError(failure.message || `Could not delete ${row.description || 'product'}.`);
    } finally {
      setDeletingId('');
    }
  }
  const exportRows = () => {
    const fields = industry === 'automobile' ? ['description', 'code', 'partNumber', 'brand', 'category', 'compatibleModel', 'stock', 'warehouse', 'rate', 'status'] : ['description', 'code', 'identity', 'brand', 'category', 'details', 'stock', 'warehouse', 'rate', 'status'];
    const cell = (value) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
    const blob = new Blob(['\uFEFF' + [fields.join(','), ...filtered.filter((row) => !checked.length || checked.includes(row._id)).map((row) => fields.map((key) => cell(key === 'identity' ? productIdentity(row, industry) : key === 'details' ? productDetails(row, industry) : row[key])).join(','))].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${industry}-products.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="autop-page">
    <header className="autop-header"><div><h1>Products</h1><p>{industry === 'automobile' ? 'Manage automobile parts, accessories and inventory-ready product records with compatibility and stock controls.' : industry === 'electronics' ? 'Manage electronics, models, specifications and stock.' : 'Manage fashion products, sizes, colours and stock.'}</p></div><div className="autop-actions"><button className="autop-primary" onClick={onNew} title="Add products through Purchase Entry"><Plus size={17} />New Product</button><button disabled={!onImport} onClick={onImport} title={onImport ? 'Import products' : 'Products are added through Purchase Entry'}><Upload size={16} />Import Products</button><button onClick={exportRows} disabled={loading || !!error || !filtered.length}><Download size={16} />Export</button><details ref={moreRef} className="autop-more"><summary><MoreHorizontal size={17} />More</summary><div><Link to="/product-masters">Product masters</Link><Link to="/warehouse">Manage warehouses</Link><Link to="/stock-alerts">Stock alerts</Link></div></details></div></header>
    <div className="autop-stats">{cards.map(([label, value, Icon, color, hint]) => <article key={label} className={`autop-stat autop-${color}`}><div className="autop-stat-icon"><Icon size={24} /></div><div><span>{label}</span><strong>{loading || error ? '—' : value.toLocaleString('en-IN')}</strong><small>{hint}</small></div></article>)}</div>
    <div className="autop-filters"><label className="autop-search"><Search size={17} /><input ref={searchRef} aria-label="Search products" placeholder={industry === 'automobile' ? 'Search by product name, SKU, part number or barcode...' : 'Search by product name, SKU, model or barcode...'} value={filters.search} onChange={(event) => change('search', event.target.value)} /></label><Filter label="Brand" value={filters.brand} onChange={(value) => change('brand', value)} options={unique(products, 'brand')} placeholder="All Brands" /><Filter label="Category" value={filters.category} onChange={(value) => change('category', value)} options={unique(products, 'category')} placeholder="All Categories" /><Filter label="Warehouse" value={filters.warehouse} onChange={(value) => change('warehouse', value)} options={unique(products, 'warehouse')} placeholder="All Warehouses" /><Filter label="Status" value={filters.status} onChange={(value) => change('status', value)} options={['Active', 'Inactive']} placeholder="All Status" /><Filter label={detailsLabel} value={filters.compatibleModel} onChange={(value) => change('compatibleModel', value)} options={[...new Set(products.flatMap((row) => industry === 'automobile' ? compatibility(row) : [productDetails(row, industry)]).filter(Boolean))].sort()} placeholder="All Makes & Models" /><button onClick={() => { setFilters({ search: '', brand: '', category: '', warehouse: '', status: '', compatibleModel: '' }); setPage(1); }}><ListFilter size={16} />Clear Filters</button></div>
    {error && <div className="autop-error" role="alert">{error}<button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    {actionError && <div className="autop-error" role="alert">{actionError}<button onClick={() => setActionError('')}>Dismiss</button></div>}
    <div className="autop-workspace autop-full"><section className="autop-list" aria-label={`${industry} products`}><div className="autop-list-header"><span>{checked.length ? `${checked.length} selected · ` : ''}Showing {rows.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, filtered.length)} of {filtered.length.toLocaleString('en-IN')} products</span><div><div className="autop-sort"><span>Sort by</span><ProductDropdown label="Sort products" value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={[{ value: 'name', label: 'Product Name (A - Z)' }, { value: 'name-desc', label: 'Product Name (Z - A)' }, { value: 'price', label: 'Selling Price (Low - High)' }, { value: 'stock', label: 'Stock (Low - High)' }]} /></div><button aria-label="Refresh products" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} /></button></div></div>
    <div className="autop-table-scroll"><BulkDeleteTable onDeleteRecord={record => api.invDeleteProduct(record._id)} onDeleted={ids => setReload(value => value + 1)} canDelete={record => record.lifecycleStatus !== 'cancelled'}><thead><tr><th><input ref={allRef} type="checkbox" aria-label="Select all products on this page" checked={allChecked} onChange={() => setChecked((previous) => allChecked ? previous.filter((id) => !rows.some((row) => row._id === id)) : [...new Set([...previous, ...rows.map((row) => row._id)])])} /></th><th>Image</th>{['Product Name', identityLabel, 'Brand', 'Category', detailsLabel, 'Stock', 'Warehouse', 'Selling Price', 'Status', 'Actions'].map((label) => <th key={label}>{label}{label === 'Product Name' && <small>Code / SKU</small>}{label === 'Part No.' && <small>OEM No.</small>}</th>)}</tr></thead><tbody>{loading || error || !rows.length ? <tr><td colSpan={12} className="autop-empty">{loading ? 'Loading products…' : error ? 'Products could not be loaded. Please retry.' : 'No products found. Add products through Purchase Entry or adjust your filters.'}</td></tr> : rows.map((row) => { const imageUrl = productImageUrl(row); return <BulkDeleteRow record={row} key={row._id} className={checked.includes(row._id) ? 'autop-selected' : ''}><td><input type="checkbox" aria-label={`Select ${row.description}`} checked={checked.includes(row._id)} onChange={() => setChecked((previous) => previous.includes(row._id) ? previous.filter((id) => id !== row._id) : [...previous, row._id])} /></td><td><button type="button" className="autop-image-button" aria-label={`Edit ${row.description} image`} title={imageUrl ? 'View product image' : 'No product image'} onClick={() => onEdit(row)}><span className="autop-image">{imageUrl ? <img src={imageUrl} alt={row.description || 'Product'} loading="lazy" /> : <Package size={17} />}</span></button></td><td><button className="autop-name" onClick={() => onEdit(row)}>{row.description}</button><small>{row.code || '—'}</small></td><td>{row.partNumber || '—'}<small>{row.manufacturerPartNumber || '—'}</small></td><td><span className="autop-brand">{row.brand || '—'}</span></td><td>{row.category || '—'}</td><td className="autop-compat-cell">{productDetails(row, industry) || (industry === 'automobile' ? 'All Makes (All Models)' : '?')}</td><td className={Number(row.stock || 0) <= minimum(row) ? 'autop-low' : 'autop-stock'}>{Number(row.stock || 0)}<small>({minimum(row)})</small></td><td>{row.warehouse || '—'}</td><td className="autop-price">{formatCurrency(row.rate || 0)}</td><td><span className={`autop-badge ${status(row) === 'Inactive' ? 'autop-inactive' : ''}`}>{status(row)}</span></td><td><RowActionsMenu aria-label={`Actions for ${row.description}`} disabled={deletingId === row._id} options={[{ value: 'edit', label: 'Edit' }, { value: 'delete', label: 'Delete' }]} onChange={(action) => action === 'edit' ? onEdit(row) : deleteProduct(row)} /></td></BulkDeleteRow>; })}</tbody></BulkDeleteTable></div>
    <footer className="autop-pagination"><div className="autop-page-size"><span>Rows per page</span><ProductDropdown label="Rows per page" value={size} onChange={(value) => { setSize(Number(value)); setPage(1); }} options={[10, 25, 50, 100]} /></div><span>{rows.length ? (currentPage - 1) * size + 1 : 0}–{Math.min(currentPage * size, filtered.length)} of {filtered.length.toLocaleString('en-IN')} products</span><nav aria-label="Product pages"><button aria-label="First page" disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft size={14} /></button><button aria-label="Previous page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => Math.max(1, Math.min(currentPage - 2, pages - 4)) + index).map((value) => <button key={value} className={value === currentPage ? 'autop-primary' : ''} aria-current={value === currentPage ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}<button aria-label="Next page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button><button aria-label="Last page" disabled={currentPage === pages} onClick={() => setPage(pages)}><ChevronsRight size={14} /></button></nav></footer></section>
    </div>
  </div>;
}
