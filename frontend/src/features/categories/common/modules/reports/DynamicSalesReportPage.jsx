import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Coins, Download, FileText, Filter, IndianRupee, LoaderCircle, Package, Printer, RefreshCw, Settings2, Star, Tag } from 'lucide-react';
import { apiClient } from '../../../../../services/apiClient.js';
import { getCurrentUser } from '../../../../../services/authService.js';
import { downloadReportTableCsv, downloadReportTablePdf, printReportTable } from '../../../../../services/reportDownloadService.js';
import { DynamicFilterSearch } from '../../../../../components/reports/DynamicFilterSearch.jsx';
import { datePresets, describeCondition, emptyFilters, formatReportDate, presetDateRange, reportStorageKey } from '../../../../../components/reports/reportFilters.js';
import './dynamicSalesReport.css';
import './compactSalesReport.css';

const salesBreakdowns = [['documents', 'Invoices'], ['transactions', 'Item details'], ['invoice', 'By Invoice'], ['item', 'By Product'], ['category', 'By Category'], ['brand', 'By Brand'], ['hourly', 'By Hour'], ['salesperson', 'By Salesperson'], ['channel', 'By Channel'], ['margin', 'Margin Analysis'], ['all', 'All dimensions']];
const purchaseBreakdowns = [['documents', 'Invoices'], ['transactions', 'Item details'], ['invoice', 'By Invoice'], ['item', 'By Product'], ['category', 'By Category'], ['brand', 'By Brand'], ['supplier', 'By Supplier'], ['branch', 'By Branch']];
const groupedColumns = [['name', 'Invoice'], ['invoices', 'Invoices'], ['quantity', 'Quantity'], ['sales', 'Net Sales'], ['discount', 'Discounts'], ['cost', 'Cost'], ['costedSales', 'Costed Sales'], ['margin', 'Gross Profit'], ['belowCostSales', 'Below-Cost Sales']];
const purchaseGroupedColumns = [['name', 'Invoice'], ['invoices', 'Invoices'], ['quantity', 'Quantity'], ['sales', 'Subtotal'], ['discount', 'Discounts'], ['tax', 'GST'], ['netAmount', 'Net Purchases']];
const transactionColumns = [['invoiceNumber', 'Invoice No.'], ['invoiceDate', 'Invoice Date'], ['customer', 'Customer'], ['product', 'Product'], ['quantity', 'Qty'], ['rate', 'Rate'], ['amount', 'Amount']];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
const initialView = () => ({ filters: emptyFilters(), analysis: 'documents', marginBy: 'product', metric: 'sales', sort: 'invoiceDate', direction: 'desc', page: 1, limit: 50, layoutVersion: 2 });
const emptyData = () => ({ data: [], total: 0, recordCount: 0, totals: {} });
export function reportRequest(view, overrides = {}, reportType = 'sales') {
  const { filters, ...query } = { ...view, ...overrides };
  return `/sales/invoices?${new URLSearchParams({ ...query, report: reportType, filters: JSON.stringify(filters) })}`;
}

export function DynamicSalesReportPage(props) {
  return <DynamicDocumentReportPage {...props} reportType="sales" />;
}

export function DynamicPurchaseReportPage(props) {
  return <DynamicDocumentReportPage {...props} reportType="purchase" />;
}

function DynamicDocumentReportPage({ reportType, onIndustryReports }) {
  const purchase = reportType === 'purchase';
  const reportTitle = purchase ? 'Purchase Report' : 'Sales Report';
  const reportSection = purchase ? 'Purchase Reports' : 'Sales Reports';
  const noun = purchase ? 'purchases' : 'sales';
  const breakdowns = purchase ? purchaseBreakdowns : salesBreakdowns;
  const user = getCurrentUser();
  const savedKey = reportStorageKey(user, reportType, 'saved');
  const [applied, setApplied] = useState(initialView);
  const [draft, setDraft] = useState(applied.filters);
  const [fields, setFields] = useState([]);
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const filterControls = useRef(null);
  const exportMenu = useRef(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied.filters);
  const industry = user?.category === 'automobile' || /fashion|textile|electronics|technology/.test(user?.retailSubcategory || '');
  const invoiceColumns = ['documents', 'transactions'].includes(applied.analysis);
  const columns = invoiceColumns
    ? transactionColumns.map(([key, label]) => purchase && key === 'customer' ? ['supplier', 'Supplier'] : [key, label])
    : purchase ? purchaseGroupedColumns : groupedColumns;
  useEffect(() => {
    const close = event => { if (!exportMenu.current?.contains(event.target)) setExportOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setExportOpen(false); setCustomOpen(false); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    apiClient(`/sales/invoices?report=${reportType}&view=filter-config`, { signal: abort.signal }).then(result => { if (!abort.signal.aborted) { const order = ['customer', 'supplier', 'product', 'category', 'brand', 'branch', 'salesperson', 'paymentMode', 'invoiceNumber', 'amount', 'gstRate', 'date', 'status', 'paymentStatus', 'documentType', 'reverseCharge']; setFields(purchase ? result.fields : [...result.fields].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))); setConfigError(''); } }).catch(failure => { if (!abort.signal.aborted) setConfigError(failure.message); });
    return () => abort.abort();
  }, [reportType, purchase, refresh]);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(''); setData(emptyData());
    apiClient(reportRequest(applied, {}, reportType), { signal: abort.signal }).then(result => { if (!abort.signal.aborted) setData(result); }).catch(failure => { if (!abort.signal.aborted) setError(failure.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [applied, reportType, refresh]);
  const loadOptions = useCallback((field, q, page, signal) => apiClient(`/sales/invoices?${new URLSearchParams({ report: reportType, view: 'filter-options', field, q, page: String(page), limit: '50' })}`, { signal }), [reportType]);
  const changeView = patch => setApplied(previous => ({ ...previous, ...patch, ...(patch.analysis ? { sort: ['documents', 'transactions'].includes(patch.analysis) ? 'invoiceDate' : 'sales', direction: 'desc' } : {}), page: 1 }));
  const apply = filters => { setApplied(previous => ({ ...previous, filters, page: 1 })); setNotice(''); };
  const dateCondition = draft.conditions.find(condition => condition.field === 'date');
  function changeDate(preset) {
    const range = presetDateRange(preset);
    setDraft(previous => ({ ...previous, conditions: [...previous.conditions.filter(condition => condition.field !== 'date'), { id: dateCondition?.id || crypto.randomUUID(), field: 'date', operator: 'between', ...range, preset }] }));
  }
  function customDate(key, value) {
    setDraft(previous => ({ ...previous, conditions: [...previous.conditions.filter(condition => condition.field !== 'date'), { id: dateCondition?.id || crypto.randomUUID(), field: 'date', operator: 'between', min: dateCondition?.min || '', max: dateCondition?.max || '', [key]: value, preset: 'custom' }] }));
  }
  const headings = columns.map(([key, label]) => key === 'name' ? applied.analysis === 'margin' ? `Margin by ${applied.marginBy}` : breakdowns.find(([value]) => value === applied.analysis)?.[1] : label);
  async function exportReport(kind) {
    setExporting(kind); setNotice(''); setExportOpen(false);
    try {
      const rows = []; let page = 1, total = Infinity;
      while (rows.length < total) {
        const response = await apiClient(reportRequest(applied, { page, limit: 500 }, reportType));
        rows.push(...response.data); total = response.total;
        if (!response.data.length) break;
        page += 1;
      }
      const values = rows.map(row => columns.map(([key]) => key === 'rate' && row[key] == null ? '—' : row[key]));
      const subtitle = applied.filters.conditions.map(condition => describeCondition(condition, fields)).join(applied.filters.logic === 'or' ? ' OR ' : ' AND ') || `All ${noun}`;
      if (kind === 'csv') downloadReportTableCsv(reportTitle, headings, values);
      else if (kind === 'pdf') await downloadReportTablePdf(reportTitle, headings, values, { subtitle });
      else printReportTable(reportTitle, headings, values, { subtitle });
    } catch (failure) { setNotice(failure.message || 'Could not export this report.'); }
    finally { setExporting(''); }
  }
  const totalPages = Math.max(1, Math.ceil(data.total / applied.limit));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, Math.min(applied.page - 2, totalPages - 4)) + index);
  const renderValue = (key, row) => {
    if (key === 'invoiceNumber') return <a href={`/billing/${purchase ? 'purchase-entry' : 'invoice'}/${row.invoiceId}/view`}>{row.invoiceNumber}</a>;
    if (key === 'rate' && row.rate == null) return <span title="Items have different rates">—</span>;
    if (key === 'invoiceDate') return formatReportDate(row.invoiceDate);
    if (['name', 'customer', 'supplier', 'product'].includes(key)) return row[key];
    return ['invoices', 'quantity'].includes(key) ? Number(row[key] || 0).toLocaleString('en-IN') : money(row[key]);
  };
  return <main className="dsr-page dsr-reference dsr-compact" data-report-type={reportType} aria-busy={loading}>
    <nav className="dsr-breadcrumb" aria-label="Breadcrumb"><a href="/reports">Reports</a><ChevronRight size={14} /><a href={`/${reportType}-reports`}>{reportSection}</a><ChevronRight size={14} /><strong>{reportTitle}</strong></nav>
    <header className="dsr-header">
      <div className="dsr-heading"><span className="dsr-heading-icon"><BarChart3 size={28} strokeWidth={2.6} /></span><div><h1>{reportTitle}</h1><p>View and analyze your {reportType} transactions with flexible filters.</p></div></div>
      <div className="dsr-header-actions">
        <div className="dsr-save-buttons" data-report-filter-action><button type="button" onClick={() => filterControls.current?.openSave()}><Star size={19} />Save Filter</button><button type="button" aria-label="Saved Filters" title="Saved Filters" onClick={() => filterControls.current?.openSaved()}><ChevronDown size={14} /></button></div>
        <div className="dsr-export" ref={exportMenu}><button type="button" aria-haspopup="menu" aria-expanded={exportOpen} disabled={loading || !!error || !data.total || !!exporting} onClick={() => setExportOpen(previous => !previous)}>{exporting && exporting !== 'print' ? <LoaderCircle className="drf-spin" size={18} /> : <Download size={19} />}Export<ChevronDown size={14} /></button>
          {exportOpen && <div className="dsr-export-menu" role="menu"><button type="button" role="menuitem" onClick={() => exportReport('csv')}><Download size={16} />CSV</button><button type="button" role="menuitem" onClick={() => exportReport('pdf')}><FileText size={16} />PDF</button></div>}
        </div>
        <button type="button" className="dsr-print" disabled={loading || !!error || !data.total || !!exporting} onClick={() => exportReport('print')}>{exporting === 'print' ? <LoaderCircle className="drf-spin" size={18} /> : <Printer size={19} />}Print</button>
      </div>
    </header>

    <section className="dsr-metrics" aria-label={`Filtered ${reportType} totals`}>{[
      ['Total Invoices', data.recordCount, FileText, 'invoices', false],
      ['Total Quantity', data.totals.quantity, Package, 'quantity', false],
      ['Subtotal', data.totals.sales, IndianRupee, 'subtotal', true],
      ['Total GST', data.totals.tax, Tag, 'gst', true],
      [purchase ? 'Net Purchases' : 'Net Sales', data.totals.netAmount, Coins, 'net', true],
    ].map(([label, value, Icon, key, currency]) => <article key={key} className={`dsr-summary-${key}`}><span className="dsr-metric-icon"><Icon size={25} strokeWidth={1.7} /></span><div><span>{label}</span><strong>{loading ? '—' : currency ? money(value) : Number(value || 0).toLocaleString('en-IN')}</strong></div></article>)}</section>

    <section className="dsr-filter-card" aria-label={`${reportTitle} filters`}>
      <DynamicFilterSearch variant="reference" controlsRef={filterControls} fields={fields} value={draft} onChange={setDraft} onApply={filters => {
        const invalidDate = filters.conditions.find(condition => condition.field === 'date' && condition.operator === 'between' && (!condition.min || !condition.max || condition.min > condition.max));
        if (invalidDate) { setNotice('Choose a valid From Date and To Date before applying.'); return; }
        apply(filters);
      }} loadOptions={loadOptions} loading={loading} disabled={!fields.length} savedStorageKey={savedKey} />
    </section>
    <div className="dsr-date-bar">
      <button type="button" className={`dsr-options-trigger${optionsOpen ? ' active' : ''}`} aria-expanded={optionsOpen} onClick={() => setOptionsOpen(previous => !previous)}><Settings2 size={16} />Report options<ChevronDown size={13} /></button>
      <div className="dsr-date-presets">{datePresets.filter(([key]) => key !== 'custom').map(([key, label]) => <button type="button" key={key} className={dateCondition?.preset === key ? 'active' : ''} onClick={() => { changeDate(key); setCustomOpen(false); }}>{label}</button>)}<button type="button" className={`dsr-custom-trigger${customOpen || dateCondition?.preset === 'custom' ? ' active' : ''}`} aria-expanded={customOpen} onClick={() => setCustomOpen(previous => !previous)}><CalendarDays size={17} />Custom Range<ChevronDown size={13} /></button></div>
      {customOpen && <div className="dsr-custom-dates"><label>From Date<input id="dsr-date-from" aria-label="Report from date" type="date" value={dateCondition?.min || ''} max={dateCondition?.max || undefined} onChange={event => customDate('min', event.target.value)} /></label><span>—</span><label>To Date<input aria-label="Report to date" type="date" value={dateCondition?.max || ''} min={dateCondition?.min || undefined} onChange={event => customDate('max', event.target.value)} /></label><button type="button" onClick={() => setCustomOpen(false)}>Done</button></div>}
    </div>
    {optionsOpen && <section className="dsr-report-options" aria-label="Report options">
      <label>View<select aria-label={`${reportTitle} breakdown`} value={applied.analysis} onChange={event => changeView({ analysis: event.target.value })}>{breakdowns.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Match<select aria-label="Combine filter conditions" value={draft.logic} onChange={event => setDraft(previous => ({ ...previous, logic: event.target.value }))}><option value="and">All conditions (AND)</option><option value="or">Any condition (OR)</option></select></label>
      {applied.analysis === 'margin' && <label>Margin by<select aria-label="Margin breakdown" value={applied.marginBy} onChange={event => changeView({ marginBy: event.target.value })}>{['product', 'invoice', 'customer', 'branch'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      <label>Show<select aria-label={`${reportTitle} metric`} value={applied.metric} onChange={event => changeView({ metric: event.target.value })}>{(purchase ? [['sales', 'All Purchases'], ['discounts', 'Discounted Purchases']] : [['sales', 'All Sales'], ['discounts', 'Discounted Sales'], ['profitability', 'Sales with Recorded Cost'], ['below-cost', 'Below-Cost Sales']]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <button type="button" aria-label="Refresh report" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />Refresh</button>
      {(purchase || industry) && onIndustryReports && <button type="button" onClick={onIndustryReports}>{purchase ? 'More purchase reports' : 'Industry reports'}</button>}
    </section>}
    {dirty && <p className="dsr-pending"><Filter size={13} />Filters changed. Select Apply to update the report.</p>}
    {(configError || notice) && <p className="dsr-error" role="alert">{configError || notice}</p>}

    <section className="dsr-results" aria-label={`${reportType} transactions`}>
      {error ? <div className="dsr-empty" role="alert"><strong>Could not load this report</strong><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : <div className="dsr-table-scroll"><table><thead><tr>{columns.map(([key], index) => <th key={key} className={index >= (invoiceColumns ? 4 : 1) ? 'dsr-number' : ''} aria-sort={applied.sort === key ? applied.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" aria-label={`Sort by ${headings[index]}`} onClick={() => changeView({ sort: key, direction: applied.sort === key && applied.direction === 'desc' ? 'asc' : 'desc' })}>{headings[index]}{applied.sort === key && (applied.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan={columns.length}><div className="dsr-empty" role="status"><LoaderCircle className="drf-spin" size={24} /><p>Loading filtered {noun}…</p></div></td></tr> : data.data.length ? data.data.map(row => <tr key={row.id || row.name}>{columns.map(([key], index) => <td key={key} className={index >= (invoiceColumns ? 4 : 1) ? 'dsr-number' : ''}>{renderValue(key, row)}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="dsr-empty"><Filter size={26} strokeWidth={1.5} /><strong>No {noun} match your filters</strong><p>Try a wider date range, remove a condition, or clear all filters and apply again.</p></div></td></tr>}
      </tbody></table></div>}
    </section>



    <footer className="dsr-pagination"><span>{data.total ? `Showing ${(applied.page - 1) * applied.limit + 1} to ${Math.min(applied.page * applied.limit, data.total)} of ${data.total} entries` : 'Showing 0 entries'}</span><label className="dsr-page-size">Rows<select aria-label="Report page size" value={applied.limit} onChange={event => changeView({ limit: Number(event.target.value) })}>{[25, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</select></label><div className="dsr-page-buttons"><button type="button" aria-label="Previous report page" disabled={loading || applied.page <= 1} onClick={() => setApplied(previous => ({ ...previous, page: previous.page - 1 }))}><ChevronLeft size={17} /></button>{pageNumbers.map(page => <button key={page} type="button" className={applied.page === page ? 'active' : ''} aria-label={`Report page ${page}`} aria-current={applied.page === page ? 'page' : undefined} disabled={loading} onClick={() => setApplied(previous => ({ ...previous, page }))}>{page}</button>)}<button type="button" aria-label="Next report page" disabled={loading || applied.page >= totalPages} onClick={() => setApplied(previous => ({ ...previous, page: previous.page + 1 }))}><ChevronRight size={17} /></button></div></footer>
  </main>;
}
