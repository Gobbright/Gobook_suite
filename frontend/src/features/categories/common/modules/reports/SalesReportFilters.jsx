import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Car, Check, FileSpreadsheet, Filter, Percent, Search, Shirt, Smartphone, Store, Trash2, X } from 'lucide-react';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { hasSelection } from './salesReportSelections.js';
import './electronicsSalesReportFilters.css';

function Group({ icon: Icon, title, children, className = '' }) {
  return <section className={`esrf-group ${className}`}><h3><span><Icon size={21} strokeWidth={1.8} /></span>{title}</h3>{children}</section>;
}

const ELECTRONICS_FIELDS = [
  ['productCategory', 'Product Category'], ['subcategory', 'Subcategory'], ['brand', 'Product Brand'], ['productModel', 'Product Model'],
  ['productType', 'Product Type / Condition'], ['sku', 'SKU / Item Code'], ['barcode', 'Barcode'], ['serialNumber', 'Serial Number'],
  ['imei', 'IMEI Number'], ['warrantyStatus', 'Warranty Status'], ['warrantyPeriod', 'Warranty Period'], ['color', 'Color'],
  ['storage', 'Storage / Capacity'], ['ram', 'RAM'], ['processor', 'Processor'], ['supplier', 'Supplier'], ['hsn', 'HSN Code'], ['stockStatus', 'Stock Status'],
];
const CATEGORY_CONFIG = {
  electronics: { label: 'Electronics', icon: Smartphone, fields: ELECTRONICS_FIELDS },
  automobile: { label: 'Automobile', icon: Car, fields: [
    ['productCategory', 'Product Category'], ['partType', 'Part Type'], ['vehicleType', 'Vehicle Type'], ['vehicleBrand', 'Vehicle Brand'],
    ['vehicleModel', 'Vehicle Model / Compatibility'], ['partNumber', 'Part Number'], ['skuBarcode', 'SKU / Barcode'], ['brandManufacturer', 'Brand / Manufacturer'],
    ['hsn', 'HSN Code'], ['warranty', 'Warranty Status'], ['serialNumber', 'Serial Number'], ['batchLot', 'Batch / Lot'], ['stockStatus', 'Stock Status'], ['supplier', 'Supplier'],
  ] },
  fashion: { label: 'Fashion & Lifestyle', icon: Shirt, fields: [
    ['productCategory', 'Product Category'], ['subcategory', 'Subcategory'], ['fabricType', 'Fabric Type'], ['brand', 'Product Brand'],
    ['size', 'Size'], ['color', 'Color'], ['pattern', 'Design / Pattern'], ['skuBarcode', 'SKU / Barcode'],
    ['hsn', 'HSN Code'], ['batchLot', 'Batch / Lot'], ['supplier', 'Supplier'], ['season', 'Season'],
  ] },
};

export function SalesReportGeneralFilters({ invoiceFilters, documentType, seriesOptions, documentTypes, onChange, onDocumentTypeChange }) {
  const select = (label, key, allLabel, values) => <label className="esrf-field"><span>{label}</span><SelectDropdown aria-label={label} value={invoiceFilters[key] || ''} onChange={(value) => onChange(key, value)} options={[{ value: '', label: allLabel }, ...values]} buttonClassName="esrf-select" multiple portal /></label>;
  return <section className="esrf-inline-general" aria-label="General Filters"><h3><FileSpreadsheet size={17} />General Filters</h3><div className="esrf-grid esrf-page-grid">
    <label className="esrf-field"><span>Invoice Number</span><div className="esrf-search"><input aria-label="Invoice Number" placeholder="Search invoice number..." value={invoiceFilters.invoiceNo} onChange={(event) => onChange('invoiceNo', event.target.value)} /><Search size={15} /></div></label>
    {select('Invoice Series', 'invoiceSeries', 'All Series', seriesOptions)}
    {select('Invoice Status', 'invoiceStatus', 'All Status', ['draft', 'completed', 'cancelled', 'returned'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })))}
    <label className="esrf-field"><span>Customer</span><div className="esrf-search"><input aria-label="Customer" placeholder="Name, mobile or type" value={invoiceFilters.customer} onChange={(event) => onChange('customer', event.target.value)} /></div></label>
    <label className="esrf-field"><span>Invoice Type</span><SelectDropdown aria-label="Invoice Type" value={documentType} onChange={onDocumentTypeChange} options={documentTypes} buttonClassName="esrf-select" multiple portal /></label>
    {select('Billing Type', 'billingType', 'All Billing Types', [{ value: 'b2b', label: 'B2B' }, { value: 'b2c', label: 'B2C' }])}
    {select('Payment Status', 'payment', 'All Status', [{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'partially paid', label: 'Partially Paid' }, { value: 'overdue', label: 'Overdue' }])}
    {select('Payment Mode', 'paymentMode', 'All Modes', ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'].map((label) => ({ value: label.toLowerCase(), label })))}
  </div></section>;
}

function FilterPanel({ invoiceFilters, dimensions, categoryFilters, category = 'electronics', documentType, reportView, options, onApply, onClose }) {
  const [invoice, setInvoice] = useState({ ...invoiceFilters });
  const [dimension, setDimension] = useState({ ...dimensions });
  const [categoryValues, setCategoryValues] = useState({ ...categoryFilters });
  const [view, setView] = useState(reportView);
  const categoryConfig = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.electronics;
  const CategoryIcon = categoryConfig.icon;
  const [tab, setTab] = useState('general');
  const panelRef = useRef(null);
  const update = (key, value) => setInvoice((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    panelRef.current?.querySelector('button')?.focus();
    function keyDown(event) {
      if (event.defaultPrevented) return;
      const panel = panelRef.current;
      if (event.key === 'Escape') {
        // Let an open dropdown consume Escape first.
        if (panel?.querySelector('[aria-expanded="true"]')) return;
        event.preventDefault(); onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      document.removeEventListener('keydown', keyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const select = (label, key, allLabel, values, dimensionField = false) => <label className="esrf-field" key={key}><span>{label}</span><SelectDropdown
    aria-label={label} value={(dimensionField ? dimension : invoice)[key] || ''}
    onChange={(value) => dimensionField ? setDimension((current) => ({ ...current, [key]: value })) : update(key, value)}
    options={[{ value: '', label: allLabel }, ...(values || [])]} buttonClassName="esrf-select" multiple portal
  /></label>;
  const rangeInvalid = invoice.minAmount !== '' && invoice.maxAmount !== '' && Number(invoice.minAmount) > Number(invoice.maxAmount);

  return createPortal(<div className="esrf-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form ref={panelRef} className="esrf-panel" role="dialog" aria-modal="true" aria-labelledby="esrf-title" onInvalidCapture={(event) => {
      const target = event.target;
      const hiddenPanel = target.closest('[role="tabpanel"][hidden]');
      if (!hiddenPanel) return;
      event.preventDefault();
      setTab(hiddenPanel.id === 'esrf-category-panel' ? 'category' : 'general');
      requestAnimationFrame(() => target.focus());
    }} onSubmit={(event) => { event.preventDefault(); if (!rangeInvalid) onApply({ invoice, dimensions: dimension, categoryFilters: categoryValues, documentType, reportView: view }); }}>
      <header className="esrf-header"><span className="esrf-header-icon"><Filter size={28} strokeWidth={1.8} /></span><div><h2 id="esrf-title">More Filters</h2><p>Select one or more values in each filter</p></div><button type="button" aria-label="Close filters" className="esrf-close" onClick={onClose}><X size={25} /></button></header>
      <div className="esrf-tabs" role="tablist" aria-label="Filter groups" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 'general' : event.key === 'End' ? 'category' : tab === 'general' ? 'category' : 'general';
        setTab(next); panelRef.current.querySelector(`#esrf-tab-${next}`)?.focus();
      }}>
        {['general', 'category'].map((value) => <button type="button" key={value} role="tab" id={`esrf-tab-${value}`} aria-controls={`esrf-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value === 'general' ? <Filter size={15} /> : <CategoryIcon size={15} />}{value === 'general' ? 'General' : categoryConfig.label}{value === 'category' && Object.values(categoryValues).filter(hasSelection).length > 0 && <span aria-hidden="true">{Object.values(categoryValues).filter(hasSelection).length}</span>}</button>)}
      </div>
      <div className="esrf-body">
        <div id="esrf-general-panel" role="tabpanel" aria-labelledby="esrf-tab-general" hidden={tab !== 'general'}>
        <Group icon={Box} title="Product & Category"><div className="esrf-grid">
          {select('Product / Item', 'item', 'All Products', options.dimensions.item, true)}
          {select('Category', 'category', 'All Categories', options.dimensions.category, true)}
          {select('Brand', 'brand', 'All Brands', options.dimensions.brand, true)}
        </div></Group>
        <Group icon={Store} title="Sales & Location"><div className="esrf-grid">
          {select('Salesperson', 'salesperson', 'All Salespeople', options.dimensions.salesperson, true)}
          {select('Sale Time', 'hourly', 'All Hours', options.dimensions.hourly, true)}
          {select('Branch / Store', 'branch', 'All Branches / Stores', options.branches)}
        </div></Group>
        <Group icon={Percent} title="Tax & Amount"><div className="esrf-grid esrf-tax-grid">
          {select('GST', 'gst', 'All Invoices', [{ value: 'gst', label: 'GST Invoice' }, { value: 'non-gst', label: 'Non-GST Invoice' }])}
          {select('Tax Rate', 'taxRate', 'All Tax Rates', options.taxRates)}
          <fieldset className="esrf-field esrf-amount"><legend>Amount Range</legend><div><label><span>₹</span><input aria-label="Minimum Amount" type="number" min="0" step="any" placeholder="Min Amount" value={invoice.minAmount} onChange={(event) => update('minAmount', event.target.value)} /></label><span>–</span><label><span>₹</span><input aria-label="Maximum Amount" type="number" min={invoice.minAmount || '0'} step="any" placeholder="Max Amount" value={invoice.maxAmount} onChange={(event) => update('maxAmount', event.target.value)} /></label></div></fieldset>
        </div>{rangeInvalid && <p className="esrf-error" role="alert">Maximum amount must be at least the minimum amount.</p>}</Group>
        </div>
        <div id="esrf-category-panel" role="tabpanel" aria-labelledby="esrf-tab-category" hidden={tab !== 'category'}>
          <Group icon={CategoryIcon} title={`${categoryConfig.label} Filters`}><div className="esrf-grid esrf-electronics-grid">
            {options.reportViews?.length > 0 && <label className="esrf-field"><span>Report View</span><SelectDropdown aria-label="Fashion sales report" value={view} onChange={setView} options={options.reportViews} buttonClassName="esrf-select" portal /></label>}
            {categoryConfig.fields.map(([key, label]) => <label className="esrf-field" key={key}><span>{label}</span><SelectDropdown aria-label={label} value={categoryValues[key] || ''} onChange={(value) => setCategoryValues((current) => ({ ...current, [key]: value }))} options={[{ value: '', label: 'All Values' }, ...(options.category?.[key] || [])]} buttonClassName="esrf-select" multiple portal searchable /></label>)}
            <label className="esrf-field"><span>Minimum Discount %</span><div className="esrf-search"><input aria-label="Minimum Discount Percentage" type="number" min="0" max="100" step="any" placeholder="0%" value={categoryValues.discountPercent || ''} onChange={(event) => setCategoryValues((current) => ({ ...current, discountPercent: event.target.value }))} /></div></label>
            <label className="esrf-field"><span>Minimum Discount Amount</span><div className="esrf-search"><input aria-label="Minimum Discount Amount" type="number" min="0" step="any" placeholder="₹ 0" value={categoryValues.discountAmount || ''} onChange={(event) => setCategoryValues((current) => ({ ...current, discountAmount: event.target.value }))} /></div></label>
          </div></Group>
        </div>
      </div>
      <footer className="esrf-footer"><button type="button" className="esrf-clear" onClick={() => { setInvoice((current) => ({ ...current, ...Object.fromEntries(['gst', 'taxRate', 'minAmount', 'maxAmount', 'branch'].map((key) => [key, ''])) })); setDimension(Object.fromEntries(Object.keys(dimension).map((key) => [key, '']))); setCategoryValues(Object.fromEntries(Object.keys(categoryValues).map((key) => [key, '']))); }}><Trash2 size={19} />Clear All</button><div><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="esrf-apply" disabled={rangeInvalid}><Check size={24} />Apply Filters</button></div></footer>
    </form>
  </div>, document.body);
}

export function SalesReportFilters(props) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(() => setOpen(false));
  const count = ['gst', 'taxRate', 'minAmount', 'maxAmount', 'branch'].filter((key) => hasSelection(props.invoiceFilters[key])).length + Object.values(props.dimensions).filter(hasSelection).length + Object.values(props.categoryFilters || {}).filter(hasSelection).length;
  return <><button type="button" className="esrf-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Filter size={19} />More Filters{count > 0 && <span>{count}</span>}</button>{open && <FilterPanel {...props} onClose={closeRef.current} onApply={(value) => { props.onApply(value); setOpen(false); }} />}</>;
}
