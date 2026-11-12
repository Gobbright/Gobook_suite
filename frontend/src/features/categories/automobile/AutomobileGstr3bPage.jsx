import { useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, ClipboardList, Download, FileText, Info, Package, Printer, RefreshCw, Search, ShieldCheck, ShoppingCart, TriangleAlert, Wallet, X } from 'lucide-react';
import { gstService } from '../../../services/gstService.js';
import { useCurrentUser } from '../../../hooks/useCurrentUser.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { formatCurrency as money } from '../../../utils/formatCurrency.js';
import { gstr3bSummary, TAX_HEADS, validateGstr3b } from './automobileGstr3b.js';
import './automobileProducts.css';
import './automobileGstr3b.css';

const periods = () => Array.from({ length: 24 }, (_, index) => new Date(new Date().getFullYear(), new Date().getMonth() - index, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
const number = (value) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value) || 0);
function Badge({ children, tone = 'blue' }) { return <span className={`ag3-badge ${tone}`}>{children}</span>; }
function CardTitle({ title, subtitle, icon: Icon = FileText, tone = 'blue', children }) { return <header className="ag3-card-title"><span className={`ag3-icon ${tone}`}><Icon size={22} /></span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{children}</header>; }
function TaxTable({ rows, search, taxable = true, editable = false, onChange, disabled = false, label }) {
  const fields = [...(taxable ? ['taxable'] : []), ...TAX_HEADS];
  const filtered = rows.filter((row) => `${label} ${row.label} ${row.key}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="ag3-table-scroll"><table><thead><tr><th>{taxable ? 'Nature of Supplies' : 'Type of ITC'}</th>{fields.map((key) => <th key={key}>{key === 'taxable' ? 'Taxable Value' : key.toUpperCase()} (₹)</th>)}</tr></thead><tbody>{filtered.map((row) => <tr key={row.key}><td>{row.label}</td>{fields.map((key) => <td key={key}>{editable ? <input aria-label={`${row.label} ${key.toUpperCase()}`} type="number" min="0" step="0.01" value={row[key] ?? 0} disabled={disabled} onChange={(event) => onChange(row.key, key, event.target.value)} /> : number(row[key])}</td>)}</tr>)}{!filtered.length && <tr><td className="ag3-empty" colSpan={fields.length + 1}>{rows.length ? 'No rows match your search.' : 'No data recorded for this section.'}</td></tr>}</tbody><tfoot><tr><th>Total</th>{fields.map((key) => <td key={key}>{number(rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0))}</td>)}</tr></tfoot></table></div>;
}
function Facts({ rows }) { return <dl className="ag3-facts">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

export function AutomobileGstr3bPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState(() => periods()[0]);
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(''); const [dirty, setDirty] = useState(false); const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false); const [validated, setValidated] = useState(false); const [loadedAt, setLoadedAt] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setData(null); setError(''); setDirty(false); setValidated(false); setNotice(''); setExporting(false);
    gstService.getGstr3b(period).then((result) => { if (active) { setData(result); setLoadedAt(new Date().toLocaleString('en-IN')); } }).catch((err) => { if (active) setError(err.message || 'Unable to load GSTR-3B.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period, reload]);
  useEffect(() => {
    if (!exporting) return undefined;
    const close = (event) => { if (event.key === 'Escape') setExporting(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [exporting]);
  const ready = Boolean(data) && !loading;
  const locked = data?.status === 'filed';
  const disabled = !ready || locked || Boolean(busy);
  const report = gstr3bSummary(data || {});
  const issues = ready ? validateGstr3b(data) : [];
  const outward = (data?.outwardRows || []).filter((row) => ['a', 'b'].includes(row.key));
  const rcm = (data?.outwardRows || []).filter((row) => row.key === 'd');
  const exempt = (data?.outwardRows || []).filter((row) => ['c', 'e'].includes(row.key));
  const value = (amount) => ready ? money(amount) : '—';
  function editGroup(group, key, field, value) { setData((prev) => ({ ...prev, [group]: prev[group].map((row) => row.key === key ? { ...row, [field]: value } : row) })); setDirty(true); setValidated(false); }
  function editFee(field, value) { setData((prev) => ({ ...prev, [field]: value })); setDirty(true); setValidated(false); }
  async function persist() {
    const saved = await gstService.saveGstr3b({ period, status: 'draft', outwardRows: data.outwardRows, itcAvailable: data.itcAvailable, itcReversed: data.itcReversed, lateFeeCgst: Number(data.lateFeeCgst) || 0, lateFeeSgst: Number(data.lateFeeSgst) || 0 });
    setData((prev) => ({ ...prev, ...saved })); setDirty(false); return saved;
  }
  async function save() {
    if (issues.length) { setValidated(true); setNotice('Review validation issues before saving.'); return; }
    setBusy('saving'); setError('');
    try { await persist(); setNotice('GSTR-3B draft saved.'); } catch (err) { setError(err.message || 'Unable to save draft.'); } finally { setBusy(''); }
  }
  async function postAccounting() {
    if (issues.length) { setValidated(true); setNotice('Review validation issues before posting.'); return; }
    setBusy('posting'); setError('');
    try {
      await persist();
      const response = await gstService.postGstr3bAccountingAdjustment(period);
      setData((prev) => ({ ...prev, ...response.record, accountingVoucherNo: response.record?.accountingVoucherNo || response.voucher?.voucherNo || prev.accountingVoucherNo }));
      setNotice('GST accounting adjustment posted.');
    } catch (err) { setError(err.message || 'Unable to post accounting adjustment.'); } finally { setBusy(''); }
  }
  const state = !ready ? '—' : issues.length ? 'Needs Review' : 'Checks Passed';
  const csv = () => {
    const rows = [['Period', period], ['GSTIN', data.gstin], ['Section', 'Description', 'Taxable', 'CGST', 'SGST', 'IGST', 'Cess'], ...['outwardRows', 'itcAvailable', 'itcReversed'].flatMap((key) => (data[key] || []).map((row) => [key, row.label, row.taxable ?? '', ...TAX_HEADS.map((head) => row[head] || 0)])), ['Fees', 'CGST late fee', data.lateFeeCgst || 0], ['Fees', 'SGST late fee', data.lateFeeSgst || 0], ['Summary', 'Estimated net payable', report.payable]];
    download(`GSTR-3B-Review-${period}.csv`, '\uFEFF' + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n'), 'text/csv;charset=utf-8;');
  };
  return <div className="ag3-host"><main className="autop-page ag3-page" aria-busy={loading}>
    <header className="ag3-header"><div className="ag3-intro"><div><h1>GSTR-3B</h1><Badge>{locked ? 'Saved Filed Record' : 'Return Preparation'}</Badge></div><p>Prepare and export your GSTR-3B return data for the selected tax period.</p></div><div className="ag3-tools"><div className="ag3-filters"><label><span>Tax Period</span><SelectDropdown aria-label="Tax Period" value={period} onChange={setPeriod} options={periods()} disabled={Boolean(busy)} className="autop-dropdown" buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll /></label><label><span>Branch</span><SelectDropdown aria-label="Branch" value="business" options={[{ value: 'business', label: 'Business-wide GSTIN' }]} disabled className="autop-dropdown" buttonClassName="autop-dropdown-trigger" /></label><label><span>Search</span><div className="ag3-search"><Search size={16} /><input aria-label="Search descriptions or sections" placeholder="Search by description or section…" value={search} onChange={(event) => setSearch(event.target.value)} /></div></label></div><div className="autop-actions"><button className="ag3-primary" disabled={!ready} onClick={() => { setValidated(true); setNotice(issues.length ? `${issues.length} local validation issue(s) need review.` : 'Local data checks passed.'); }}><CheckCircle2 size={16} />Validate</button><button disabled={!ready} onClick={() => setExporting(true)}><Download size={16} />Prepare Export</button><button disabled={!ready} onClick={() => window.print()}><Printer size={16} />Print Summary</button><button disabled={loading || Boolean(busy)} onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />Refresh</button></div></div></header>
    {error && <div role="alert" className="autop-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
    {notice && <div className="ag3-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}
    <section className="ag3-stats">{[
      ['Outward Taxable Supplies', value(outward.reduce((sum, row) => sum + (Number(row.taxable) || 0), 0)), ShoppingCart, 'blue', 'Outward taxable + zero-rated'],
      ['Eligible Input Tax Credit', value(report.eligibleTotal), Package, 'green', 'After saved reversals'],
      ['Estimated Tax Liability', value(report.outputTotal), FileText, 'red', 'Output tax including RCM'],
      ['ITC Adjustments', value(report.reversalTotal), ArrowLeftRight, 'purple', 'Recorded ITC reversals'],
      ['Net Tax Payable', value(report.payable), Wallet, 'orange', 'Estimated cash tax + late fee'],
      ['Validation Status', state, CheckCircle2, 'green', ready ? `${issues.length} local issue(s)` : 'Loading data…'],
    ].map(([label, amount, Icon, tone, note]) => <article key={label}><span className={`ag3-icon ${tone}`}><Icon size={25} /></span><div><h2>{label}</h2><strong>{amount}</strong><small>{note}</small></div></article>)}</section>
    <div className="ag3-workspace"><div className="ag3-sections">
      <section className="ag3-card"><CardTitle icon={ShoppingCart} title="1. Outward Taxable Supplies (3.1)" subtitle="Supplies generated from your sales documents." /><TaxTable label="outward supplies 3.1" rows={outward} search={search} /><p className="ag3-note">Source sales determine these values. Update source documents to correct them.</p></section>
      <section className="ag3-card"><CardTitle icon={ArrowLeftRight} title="2. Inward Supplies Liable to Reverse Charge" subtitle="Recorded reverse-charge values from section 3.1(d)." /><TaxTable label="reverse charge 3.1(d)" rows={rcm} search={search} /></section>
      <section className="ag3-card ag3-itc"><CardTitle icon={Package} tone="green" title="3. Eligible Input Tax Credit (4)" subtitle="Review available ITC and recorded reversals."><button className="app-save-button ag3-save" disabled={disabled} onClick={save}>{busy === 'saving' ? 'Saving…' : 'Save'}{dirty ? ' *' : ''}</button></CardTitle><TaxTable label="available eligible ITC 4" rows={data?.itcAvailable || []} search={search} taxable={false} editable onChange={(...args) => editGroup('itcAvailable', ...args)} disabled={disabled} /><h3 className="ag3-subheading">ITC Reversals / Adjustments</h3><TaxTable label="ITC reversals adjustments 4" rows={data?.itcReversed || []} search={search} taxable={false} editable onChange={(...args) => editGroup('itcReversed', ...args)} disabled={disabled} /></section>
      <section className="ag3-card"><CardTitle icon={FileText} tone="red" title="4. Exempt, Nil Rated and Non-GST Supplies" subtitle="Recorded outward exempt and non-GST supplies." /><TaxTable label="exempt nil non gst 5" rows={exempt} search={search} /><p className="ag3-note">The current data source does not provide a separate section 5 inward-supplies breakdown.</p></section>
      <section className="ag3-card"><CardTitle icon={Wallet} title="5. Interest, Late Fee and Other Amounts (5.1)" subtitle="Late fees saved against the selected return period." /><div className="ag3-table-scroll"><table><thead><tr><th>Description</th><th>Amount (₹)</th></tr></thead><tbody>{[['lateFeeCgst', 'CGST Late Fee'], ['lateFeeSgst', 'SGST Late Fee']].filter(([, label]) => `late fee interest 5.1 ${label}`.toLowerCase().includes(search.toLowerCase())).map(([key, label]) => <tr key={key}><td>{label}</td><td><input aria-label={label} type="number" min="0" step="0.01" value={data?.[key] ?? 0} disabled={disabled} onChange={(event) => editFee(key, event.target.value)} /></td></tr>)}</tbody><tfoot><tr><th>Total</th><td>{number(report.lateFee)}</td></tr></tfoot></table></div><p className="ag3-note">Interest and penalty amounts are not recorded by the current return service.</p></section>
      <section className="ag3-card"><CardTitle icon={Wallet} title="6. Payment Summary" subtitle="Estimated cash requirement using same-head ITC offsets." /><div className="ag3-table-scroll"><table><thead><tr><th>Particulars</th>{TAX_HEADS.map((key) => <th key={key}>{key.toUpperCase()} (₹)</th>)}</tr></thead><tbody>{[['Total Tax Liability', report.output], ['Eligible ITC (after reversals)', report.eligible], ['ITC Utilized (estimate)', report.utilized]].map(([label, amounts]) => <tr key={label}><td>{label}</td>{TAX_HEADS.map((key) => <td key={key}>{number(amounts[key])}</td>)}</tr>)}</tbody><tfoot><tr><th>Estimated Cash Tax</th>{TAX_HEADS.map((key) => <td key={key}>{number(report.cash[key])}</td>)}</tr></tfoot></table></div><p className="ag3-note">Estimated net payable includes {money(report.lateFee)} late fees. This is not a GST portal liability calculation.</p></section>
    </div><aside className="ag3-sidebar">
      <section className="ag3-card"><CardTitle icon={ClipboardList} title="GSTR-3B Summary" /><Facts rows={[
        ['Total Taxable Value', value(report.taxable)], ['Total Tax Liability', value(report.outputTotal)], ['Total Eligible ITC', value(report.eligibleTotal)], ['ITC Reversals', value(report.reversalTotal)], ['Late Fee', value(report.lateFee)], ['Net Payable (Estimate)', value(report.payable)],
      ]} /></section>
      <section className="ag3-card"><CardTitle title="Tax Breakup (Estimated Cash)" /><Facts rows={TAX_HEADS.map((key) => [key.toUpperCase(), value(report.cash[key])])} /></section>
      <section className="ag3-card"><CardTitle icon={ShieldCheck} tone="green" title="Validation Results" /><Badge tone={issues.length ? 'amber' : 'green'}>{!ready ? 'Loading' : validated ? state : 'Not Run'}</Badge><div className={`ag3-validation ${issues.length ? 'has-issues' : ''}`}>{validated ? issues.length ? issues.map((issue, index) => <p key={index}><TriangleAlert size={14} />{issue}</p>) : <><p><CheckCircle2 size={14} />Required local values are present.</p><p><CheckCircle2 size={14} />No invalid numeric values found.</p><p><Info size={14} />Eligibility and portal rules need separate review.</p></> : <p>Run Validate to review local data checks.</p>}</div></section>
      <section className="ag3-card"><CardTitle title="Preparation Status" /><Facts rows={[
        ['Data Loaded On', ready ? loadedAt : '—'], ['Prepared By', user?.name || user?.businessName || 'Current user'], ['GSTIN', data?.gstin || 'Not configured'], ['Branch Scope', 'Business-wide GSTIN'], ['Records Included', ready ? `${data.invoiceCount ?? '—'} outward, ${data.purchaseCount ?? '—'} purchases` : '—'], ['Draft Status', locked ? 'Saved filed record' : dirty ? 'Unsaved Changes' : data?._id ? 'Saved Draft' : 'Generated From Documents'], ['Accounting Voucher', data?.accountingVoucherNo || 'Not posted'],
      ]} /><button className="ag3-post" disabled={disabled || Boolean(data?.accountingVoucherNo) || report.outputTotal + report.lateFee <= 0 || report.output.cess > 0} onClick={postAccounting}>{busy === 'posting' ? 'Posting…' : data?.accountingVoucherNo ? 'Accounting Posted' : 'Post Accounting Adjustment'}</button>{report.output.cess > 0 && <p className="ag3-note">Accounting posting for cess is not supported by the existing service.</p>}</section>
    </aside></div>
    <section className="ag3-preview"><CardTitle icon={ClipboardList} title="Monthly Summary Preview (GSTR-3B)" subtitle="Key figures from this return period" />{[['Outward Documents', ready ? data.invoiceCount ?? '—' : '—'], ['Taxable Value', value(report.taxable)], ['Tax Liability', value(report.outputTotal)], ['Eligible ITC', value(report.eligibleTotal)], ['Net Payable', value(report.payable)]].map(([label, amount]) => <div key={label}><span>{label}</span><strong>{amount}</strong></div>)}</section>
    <p className="ag3-footer-note"><TriangleAlert size={18} />This screen prepares GSTR-3B data for review. Official filing is completed through the GST portal or an authorized integration.</p>
    {exporting && <div className="ag3-overlay" onClick={(event) => { if (event.target === event.currentTarget) setExporting(false); }}><section className="ag3-dialog" role="dialog" aria-modal="true" aria-labelledby="ag3-export-title"><header><h2 id="ag3-export-title">Prepare GSTR-3B Export</h2><button autoFocus aria-label="Close export dialog" onClick={() => setExporting(false)}><X size={18} /></button></header><p>{period} · {issues.length} local validation issue(s){dirty ? ' · Includes unsaved changes' : ''}</p><p>Export the complete period for review. Search filters do not restrict exported records. JSON uses GoBook's data structure and is not an official GST portal upload file.</p><div><button onClick={csv}><Download size={16} />Download CSV</button><button onClick={() => download(`GSTR-3B-Review-${period}.json`, JSON.stringify({ period, gstin: data.gstin, outwardRows: data.outwardRows, itcAvailable: data.itcAvailable, itcReversed: data.itcReversed, lateFeeCgst: data.lateFeeCgst || 0, lateFeeSgst: data.lateFeeSgst || 0, summary: report, validation: issues }, null, 2), 'application/json')}><Download size={16} />Review JSON</button></div></section></div>}
  </main></div>;
}
