import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, Car, Check, FileSpreadsheet, Filter, Percent, Search, Shirt, Smartphone, Store, Trash2, X } from 'lucide-react';
import { SelectDropdown } from '../../../../../components/forms/SelectDropdown.jsx';
import { AUTOMOBILE_PURCHASE_FILTER_GROUPS, AUTOMOBILE_PURCHASE_ADVANCED_FIELDS, automobilePurchaseValues } from '../../../automobile/automobilePurchaseReportFilters.js';
import { ELECTRONICS_PURCHASE_FILTER_GROUPS, electronicsPurchaseValues } from './electronicsPurchaseReportFilters.js';
import './electronicsSalesReportFilters.css';

const optionRows = (values) => values.map((value) => ({ value, label: value.replace(/^./, (letter) => letter.toUpperCase()) }));
const purchaseTypes = [['purchase-invoice', 'Purchase Invoice'], ['purchase-order', 'Purchase Order'], ['purchase-return', 'Purchase Return'], ['debit-note', 'Debit Note']].map(([value, label]) => ({ value, label }));
const procurementFields = AUTOMOBILE_PURCHASE_FILTER_GROUPS[1][1];
const fashionFields = [
  ['productCategory', 'Product category'], ['subcategory', 'Subcategory'], ['fabricType', 'Fabric type'], ['brand', 'Brand'], ['productName', 'Product name'],
  ['skuBarcode', 'SKU / item code'], ['barcode', 'Barcode'], ['color', 'Color'], ['size', 'Size'], ['pattern', 'Design / pattern'],
  ['material', 'Material / composition'], ['hsn', 'HSN code'], ['batchLot', 'Batch / lot number'], ['supplier', 'Supplier'], ['unit', 'Unit of measurement'],
];
const generalKeys = new Set(['documentNo', 'supplierInvoiceNo', 'branch', 'gstRate', 'minAmount', 'maxAmount', 'staff']);
const automobileFields = [...new Map([...AUTOMOBILE_PURCHASE_FILTER_GROUPS[0][1], ...AUTOMOBILE_PURCHASE_ADVANCED_FIELDS]
  .filter(([key]) => !generalKeys.has(key) && !procurementFields.some(([entry]) => entry === key)).map((field) => [field[0], field])).values()];
const categories = {
  automobile: { label: 'Automobile', icon: Car, fields: automobileFields, read: automobilePurchaseValues },
  electronics: { label: 'Electronics', icon: Smartphone, fields: ELECTRONICS_PURCHASE_FILTER_GROUPS[0][1], read: electronicsPurchaseValues },
  fashion: { label: 'Fashion & Lifestyle', icon: Shirt, fields: fashionFields },
  general: { label: 'Product & Category', icon: Box, fields: [] },
};

function Field({ label, children }) {
  return <label className="esrf-field"><span>{label}</span>{children}</label>;
}
function TextField({ label, value, onChange, type = 'text', ...props }) {
  return <Field label={label}><div className="esrf-search"><input aria-label={label} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} />{type === 'text' && <Search size={15} />}</div></Field>;
}
function SelectField({ label, value, onChange, options, allLabel = 'All Values', custom = false }) {
  return <Field label={label}><SelectDropdown aria-label={label} value={value || ''} onChange={onChange} options={[{ value: '', label: allLabel }, ...options]} buttonClassName="esrf-select" searchable allowCustom={custom} portal /></Field>;
}
function Group({ icon: Icon, title, children }) {
  return <section className="esrf-group"><h3><span><Icon size={21} strokeWidth={1.8} /></span>{title}</h3>{children}</section>;
}

export function PurchaseReportGeneralFilters({ general, onGeneralChange, supplier, onSupplierChange, status, onStatusChange, options, reportView, onReportViewChange, datePreset, onDatePresetChange, dateFrom, dateTo, onDateFromChange, onDateToChange, search, onSearchChange }) {
  const update = (key) => (value) => onGeneralChange((current) => ({ ...current, [key]: value }));
  return <section className="esrf-inline-general" aria-label="General Filters"><h3><FileSpreadsheet size={17} />General Filters</h3><div className="esrf-grid esrf-page-grid">
    <SelectField label="Date Range" value={datePreset} onChange={onDatePresetChange} allLabel="All Dates" options={optionRows(['today', 'yesterday']).concat([{ value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' }, { value: 'previous-month', label: 'Previous Month' }, { value: 'custom', label: 'Custom Range' }])} />
    <TextField label="From" type="date" value={dateFrom} max={dateTo || undefined} onChange={(value) => { onDatePresetChange('custom'); onDateFromChange(value); }} />
    <TextField label="To" type="date" value={dateTo} min={dateFrom || undefined} onChange={(value) => { onDatePresetChange('custom'); onDateToChange(value); }} />
    <Field label="Report View"><SelectDropdown aria-label="Purchase report type" value={reportView} onChange={onReportViewChange} options={options.reportViews} buttonClassName="esrf-select" portal /></Field>
    <TextField label="Purchase Invoice Number" value={general.documentNo} onChange={update('documentNo')} placeholder="Invoice number or series" />
    <TextField label="Supplier Invoice Number" value={general.supplierInvoiceNo} onChange={update('supplierInvoiceNo')} placeholder="Supplier's bill number" />
    <SelectField label="Supplier" value={supplier} onChange={onSupplierChange} options={options.suppliers} allLabel="All Suppliers" />
    <SelectField label="Purchase Type" value={general.purchaseType} onChange={update('purchaseType')} options={purchaseTypes} allLabel="All Purchase Types" />
    <SelectField label="Payment Status" value={general.paymentStatus} onChange={update('paymentStatus')} options={optionRows(['paid', 'unpaid', 'partially paid', 'overdue'])} allLabel="All Status" />
    <SelectField label="Payment Mode" value={general.paymentMode} onChange={update('paymentMode')} options={optionRows(['cash', 'upi', 'card', 'bank transfer', 'credit']).map((row) => ({ ...row, label: row.value === 'upi' ? 'UPI' : row.label }))} allLabel="All Modes" />
    <SelectField label="Purchase Status" value={status} onChange={onStatusChange} options={options.statuses} allLabel="All Status" />
    <TextField label="Find Purchases" value={search} onChange={onSearchChange} placeholder="Supplier, product or document" />
  </div></section>;
}

function PurchaseFilterPanel({ general, categoryFilters, category, records, products, options, onApply, onClose }) {
  const [draft, setDraft] = useState({ ...general });
  const [details, setDetails] = useState({ ...categoryFilters });
  const [tab, setTab] = useState('general');
  const panelRef = useRef(null);
  const config = categories[category] || categories.general;
  const Icon = config.icon;
  const procurement = category === 'fashion' ? procurementFields.filter(([key]) => ['minQty', 'maxQty', 'minRate', 'maxRate', 'discountPercent', 'discountAmount'].includes(key)) : category === 'general' ? [] : procurementFields;
  const invalidRange = [['minAmount', 'maxAmount', draft], ['minQty', 'maxQty', details], ['minRate', 'maxRate', details]].some(([min, max, values]) => values[min] !== '' && values[min] != null && values[max] !== '' && values[max] != null && Number(values[min]) > Number(values[max]));
  const update = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const previousFocus = document.activeElement;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    panelRef.current?.querySelector('button')?.focus();
    function keyDown(event) {
      if (event.defaultPrevented) return;
      const panel = panelRef.current;
      if (event.key === 'Escape' && !panel?.querySelector('[aria-expanded="true"]')) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
    document.addEventListener('keydown', keyDown);
    return () => { document.body.style.overflow = previousOverflow; if (root) root.inert = previousInert; document.removeEventListener('keydown', keyDown); previousFocus?.focus(); };
  }, [onClose]);

  function renderField([key, label, choices]) {
    const change = (value) => setDetails((current) => ({ ...current, [key]: value }));
    if (choices === 'number') return <TextField key={key} label={label} value={details[key]} onChange={change} type="number" min="0" step="any" />;
    const recorded = config.read ? records.flatMap((record) => (record.items?.length ? record.items : [{}]).flatMap((item) => {
      const id = item.productId || item.product?._id || item.product?.id;
      const product = products.find((entry) => id && String(entry._id || entry.id) === String(id)) || item.product || {};
      if (key === 'purchaseOrderNo') return [record.documentType === 'purchase-order' ? record.number : '', ...config.read(key, record, item, product), records.find((entry) => String(entry._id || entry.id) === String(record.extra?.linkedPurchaseOrderId))?.number].filter(Boolean);
      const values = config.read(key, record, item, product);
      return key === 'vehicleType' ? values.map((value) => /^(car|suv|car\/suv)$/i.test(value) ? 'Car/SUV' : value) : values;
    })) : (options.category?.[key] || []).map((option) => option.value);
    const values = [...new Set([...(Array.isArray(choices) ? choices : []), ...recorded.map(String)].map((value) => key === 'vehicleType' && /^(car|suv|car\/suv)$/i.test(value) ? 'Car/SUV' : value))].filter(Boolean).sort().map((value) => ({ value, label: value }));
    return <SelectField key={key} label={label} value={details[key]} onChange={change} options={values} custom />;
  }

  return createPortal(<div className="esrf-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form ref={panelRef} className="esrf-panel" role="dialog" aria-modal="true" aria-labelledby="purchase-filter-title" onInvalidCapture={(event) => {
    const hiddenPanel = event.target.closest('[role="tabpanel"][hidden]');
    if (hiddenPanel) { event.preventDefault(); setTab(hiddenPanel.id === 'purchase-category-panel' ? 'category' : 'general'); requestAnimationFrame(() => event.target.focus()); }
  }} onSubmit={(event) => { event.preventDefault(); if (!invalidRange) onApply({ general: draft, categoryFilters: details }); }}>
    <header className="esrf-header"><span className="esrf-header-icon"><Filter size={28} strokeWidth={1.8} /></span><div><h2 id="purchase-filter-title">More Filters</h2><p>Refine your purchase report with advanced filters</p></div><button type="button" className="esrf-close" aria-label="Close filters" onClick={onClose}><X size={25} /></button></header>
    <div className="esrf-tabs" role="tablist" aria-label="Filter groups" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const next = event.key === 'Home' ? 'general' : event.key === 'End' ? 'category' : tab === 'general' ? 'category' : 'general';
      setTab(next); panelRef.current?.querySelector(`#purchase-tab-${next}`)?.focus();
    }}>{['general', 'category'].map((value) => <button type="button" key={value} role="tab" id={`purchase-tab-${value}`} aria-controls={`purchase-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value === 'general' ? <Filter size={15} /> : <Icon size={15} />}{value === 'general' ? 'General' : config.label}</button>)}</div>
    <div className="esrf-body">
      <div id="purchase-general-panel" role="tabpanel" aria-labelledby="purchase-tab-general" hidden={tab !== 'general'}>
        <Group icon={Store} title="Supplier & Location"><div className="esrf-grid">
          <TextField label="Supplier Code" value={draft.supplierCode} onChange={update('supplierCode')} placeholder="Supplier code" />
          <SelectField label="Branch / Warehouse" value={draft.branch} onChange={update('branch')} options={options.branches} allLabel="All Branches / Warehouses" />
          <SelectField label="Created By" value={draft.staff} onChange={update('staff')} options={options.staff} allLabel="All Users" />
        </div></Group>
        {procurement.length > 0 && <Group icon={Box} title="Procurement & Inventory"><div className="esrf-grid esrf-electronics-grid">{procurement.map(renderField)}</div></Group>}
        <Group icon={Percent} title="Tax & Amount"><div className="esrf-grid esrf-tax-grid">
          <SelectField label="GST" value={draft.gstType} onChange={update('gstType')} options={[{ value: 'gst', label: 'GST Purchase' }, { value: 'non-gst', label: 'Non-GST Purchase' }, { value: 'itc', label: 'Input Tax Credit Eligible' }]} allLabel="All Purchases" />
          <SelectField label="Tax Rate" value={draft.gstRate} onChange={update('gstRate')} options={options.gstRates} allLabel="All Tax Rates" />
          <fieldset className="esrf-field esrf-amount"><legend>Amount Range</legend><div><label><span>₹</span><input aria-label="Minimum Amount" type="number" min="0" step="any" placeholder="Min Amount" value={draft.minAmount} onChange={(event) => update('minAmount')(event.target.value)} /></label><span>–</span><label><span>₹</span><input aria-label="Maximum Amount" type="number" min={draft.minAmount || '0'} step="any" placeholder="Max Amount" value={draft.maxAmount} onChange={(event) => update('maxAmount')(event.target.value)} /></label></div></fieldset>
        </div></Group>
      </div>
      <div id="purchase-category-panel" role="tabpanel" aria-labelledby="purchase-tab-category" hidden={tab !== 'category'}><Group icon={Icon} title={`${config.label} Filters`}><div className="esrf-grid esrf-electronics-grid">{config.fields.map(renderField)}</div></Group></div>
      {invalidRange && <p className="esrf-error" role="alert">Maximum values must be at least the corresponding minimum values.</p>}
    </div>
    <footer className="esrf-footer"><button type="button" className="esrf-clear" onClick={() => { setDraft((current) => ({ ...current, ...Object.fromEntries(['supplierCode', 'branch', 'staff', 'gstType', 'gstRate', 'minAmount', 'maxAmount'].map((key) => [key, ''])) })); setDetails(Object.fromEntries(Object.keys(details).map((key) => [key, '']))); }}><Trash2 size={19} />Clear All</button><div><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="esrf-apply" disabled={invalidRange}><Check size={24} />Apply Filters</button></div></footer>
  </form></div>, document.body);
}

export function PurchaseReportFilters(props) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(() => setOpen(false));
  const count = ['supplierCode', 'branch', 'staff', 'gstType', 'gstRate', 'minAmount', 'maxAmount'].filter((key) => Boolean(props.general[key])).length + Object.values(props.categoryFilters).filter(Boolean).length;
  return <><button type="button" className="esrf-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Filter size={19} />More Filters{count > 0 && <span>{count}</span>}</button>{open && <PurchaseFilterPanel {...props} onClose={closeRef.current} onApply={(value) => { props.onApply(value); setOpen(false); }} />}</>;
}
