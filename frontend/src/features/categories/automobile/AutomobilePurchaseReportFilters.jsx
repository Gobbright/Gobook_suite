import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { AUTOMOBILE_PURCHASE_PRIMARY_FIELDS, AUTOMOBILE_PURCHASE_ADVANCED_FIELDS, automobilePurchaseValues } from './automobilePurchaseReportFilters.js';

export function AutomobilePurchaseReportFilters({ filters, onChange, records, products, general, onGeneralChange, supplier, onSupplierChange, supplierOptions, branchOptions, staffOptions, gstRateOptions, datePreset, onDatePresetChange, dateFrom, dateTo, onDateFromChange, onDateToChange }) {
  const generalKeys = ['purchaseType', 'paymentStatus', 'documentNo', 'supplierInvoiceNo', 'branch', 'gstRate', 'minAmount', 'maxAmount', 'staff'];
  const selectOptions = {
    purchaseType: [['', 'All'], ['purchase-invoice', 'Purchase Invoice'], ['purchase-order', 'Purchase Order'], ['purchase-return', 'Purchase Return'], ['debit-note', 'Debit Note']].map(([value, label]) => ({ value, label })),
    supplier: [{ value: '', label: 'All suppliers' }, ...supplierOptions],
    branch: [{ value: '', label: 'All warehouses / branches' }, ...branchOptions],
    staff: [{ value: '', label: 'All users' }, ...staffOptions],
    gstRate: [{ value: '', label: 'All GST rates' }, ...gstRateOptions],
    dateRange: [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom Range']].map(([value, label]) => ({ value, label })),
    purchaseOrderNo: [{ value: '', label: 'All purchase orders' }, ...[...new Set(records.filter((record) => record.documentType === 'purchase-order').map((record) => record.number).filter(Boolean))].sort().map((value) => ({ value, label: value }))],
  };
  function renderField([key, label, choices]) {
    const isGeneral = generalKeys.includes(key);
    const value = key === 'dateRange' ? datePreset : key === 'supplier' ? supplier : isGeneral ? general[key] : filters[key];
    const update = key === 'dateRange' ? onDatePresetChange : key === 'supplier' ? onSupplierChange : (next) => (isGeneral ? onGeneralChange : onChange)((current) => ({ ...current, [key]: next }));
    const recorded = records.flatMap((record) => (record.items?.length ? record.items : [{}]).flatMap((item) => {
      const id = item.productId || item.product?._id || item.product?.id;
      const product = products.find((entry) => id && String(entry._id || entry.id) === String(id)) || item.product || {};
      const values = automobilePurchaseValues(key, record, item, product);
      return key === 'vehicleType' ? values.map((entry) => ['car', 'suv', 'car/suv'].includes(String(entry).toLowerCase()) ? 'Car/SUV' : entry) : values;
    }));
    const options = selectOptions[key] || [{ value: '', label: 'All' }, ...[...new Set([...(Array.isArray(choices) ? choices : []), ...recorded.map(String)])].sort().map((entry) => ({ value: key === 'paymentStatus' ? entry.toLowerCase() : entry, label: entry }))];
    const input = ['documentNo', 'supplierInvoiceNo', 'vehicleModel', 'partNumber', 'productSku', 'barcode', 'serialNumber', 'hsn', 'batchLot'].includes(key);
    return <label className="arh-filter" key={key}><span>{label}</span>{input || choices === 'number'
      ? <input aria-label={`Automobile purchase: ${label}`} type={choices === 'number' ? 'number' : 'text'} min={choices === 'number' ? '0' : undefined} step={choices === 'number' ? 'any' : undefined} value={value || ''} onChange={(event) => update(event.target.value)} />
      : <SelectDropdown aria-label={`Automobile purchase: ${label}`} value={value || ''} onChange={update} options={options} buttonClassName="autop-dropdown-trigger" searchable={key !== 'dateRange'} allowCustom={!selectOptions[key]} />}</label>;
  }
  return <div className="arh-invoice-filters arh-purchase-report-filter-group">
    <div className="arh-invoice-filters-heading"><div><strong>Primary filters</strong></div></div>
    <div className="arh-invoice-filters-grid">{AUTOMOBILE_PURCHASE_PRIMARY_FIELDS.map(renderField)}</div>
    {datePreset === 'custom' && <div className="arh-invoice-filters-grid">
      <label className="arh-filter"><span>From</span><input aria-label="Purchase report start date" type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => onDateFromChange(event.target.value)} /></label>
      <label className="arh-filter"><span>To</span><input aria-label="Purchase report end date" type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => onDateToChange(event.target.value)} /></label>
    </div>}
    <details className="arh-textile-invoice-filters"><summary>Advanced filters</summary>

      <div className="arh-invoice-filters-grid">{AUTOMOBILE_PURCHASE_ADVANCED_FIELDS.map(renderField)}</div>
    </details>
  </div>;
}

export function PurchaseReportFilterFields({ filters, onChange, records, products, groups, readValues, scope }) {
  return groups.map(([title, fields]) => <div className="arh-textile-invoice-filters" key={title}>
    <div className="arh-invoice-filters-heading"><div><strong>{title}</strong><span>Combined product filters match the same item. Totals show whole matching documents; unrecorded statuses do not match.</span></div></div>
    <div className="arh-invoice-filters-grid">{fields.map(([key, label, choices]) => {
      const update = (value) => onChange((current) => ({ ...current, [key]: value }));
      const recorded = records.flatMap((record) => (record.items?.length ? record.items : [{}]).flatMap((item) => {
        const id = item.productId || item.product?._id || item.product?.id;
        const product = products.find((entry) => id && String(entry._id || entry.id) === String(id)) || item.product || {};
        return readValues(key, record, item, product);
      }));
      const options = [...new Set([...(Array.isArray(choices) ? choices : []), ...recorded.map(String)])].sort().map((value) => ({ value, label: value }));
      return <label className="arh-filter" key={key}><span>{label}</span>{choices === 'number'
        ? <input aria-label={`${scope} purchase: ${label}`} type="number" min="0" step="any" value={filters[key]} onChange={(event) => update(event.target.value)} />
        : <SelectDropdown aria-label={`${scope} purchase: ${label}`} value={filters[key]} onChange={update} options={[{ value: '', label: `All ${label.toLowerCase()} values` }, ...options]} buttonClassName="autop-dropdown-trigger" searchable allowCustom />}</label>;
    })}</div>
  </div>);
}
