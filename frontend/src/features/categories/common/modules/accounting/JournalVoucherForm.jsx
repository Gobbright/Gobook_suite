import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, CheckCircle2, ChevronRight, CirclePlus, FileText, Home, List, MessageCircle, Plus, Save, Settings, Trash2, Zap } from 'lucide-react';
import { AutocompleteInput } from '../../../../../components/forms/AutocompleteInput.jsx';
import { VoucherAllocations } from './VoucherAllocations.jsx';
import { VoucherAttachments } from './VoucherAttachments.jsx';
import { JournalNarrationTemplates } from './JournalNarrationTemplates.jsx';
import { journalEntryError, journalLedgerOption } from './journalEntryRules.js';
import './voucherEntry.css';
import './journalVoucher.css';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
const shortcuts = [['Alt + I', 'Insert Row'], ['Alt + D', 'Delete Row'], ['Ctrl + S', 'Save Voucher'], ['F2', 'Date'], ['Esc', 'Cancel']];
export function JournalVoucherForm({ form, editingId, ledgers, saving, numbering, loading, error, notice, onChange, onLineChange, onAdd, onInsert, onRemove, onCancel, onNew, onSubmit, onRefreshNumber, onRetry }) {
  const ref = useRef(null);
  const dateRef = useRef(null);
  const saveRef = useRef(null);
  const [active, setActive] = useState(0);
  const [uploading, setUploading] = useState(false);
  const blocked = saving || loading || uploading;
  const validation = journalEntryError(form, ledgers);
  const invalid = Boolean(validation) || Boolean(editingId && form.status !== 'Draft');
  const total = (side) => form.lines.filter((line) => line.side === side).reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0) / 100;
  const debit = total('debit'), credit = total('credit');
  const balanced = debit > 0 && Math.abs(debit - credit) < .01;
  const groups = [...new Set(ledgers.filter((ledger) => ledger.active !== false).map((ledger) => ledger.group).filter(Boolean))];
  const options = ledgers.filter((ledger) => ledger.active !== false && (form.bookGroup === 'General' || ledger.group === form.bookGroup)).map(journalLedgerOption);
  function focusRow(index) {
    requestAnimationFrame(() => {
      const input = ref.current?.querySelector(`[aria-label="Account / Ledger ${index + 1}"]`);
      input?.focus(); input?.scrollIntoView({ block: 'nearest' });
    });
  }
  function add() { onAdd(); focusRow(form.lines.length); }
  function insert(index) { onInsert(index); focusRow(index + 1); }
  function remove(index) { if (form.lines.length <= 2) return; onRemove(index); focusRow(Math.min(index, form.lines.length - 2)); }
  function amount(index, side, value) {
    onLineChange(index, 'side', side);
    onLineChange(index, 'amount', value);
  }
  function run(key) {
    if (blocked) return;
    if (key === 'Alt + I') add();
    else if (key === 'Alt + D') remove(Math.min(active, form.lines.length - 1));
    else if (key === 'Ctrl + S' && !numbering && !invalid) ref.current?.requestSubmit(saveRef.current);
    else if (key === 'F2') dateRef.current?.focus();
    else if (key === 'Esc') onCancel();
  }
  useEffect(() => {
    function keydown(event) {
      if (event.defaultPrevented || event.isComposing) return;
      if (document.querySelector('[data-navigation-overlay]')) return;
      const key = event.key.toLowerCase();
      let action;
      if (event.altKey && !event.ctrlKey && !event.metaKey) action = { i: 'Alt + I', d: 'Alt + D' }[key];
      else if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') action = 'Ctrl + S';
      else if (!event.altKey && !event.ctrlKey && !event.metaKey) action = { f2: 'F2', escape: 'Esc' }[key];
      if (!action) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) run(action);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  return <form ref={ref} className="ve-page jv-page" data-local-shortcuts="alt+i alt+d" aria-busy={saving || loading} onSubmit={(event) => onSubmit(event, event.nativeEvent.submitter?.value || 'Posted')}>
    <nav className="ve-breadcrumb" aria-label="Breadcrumb"><Link to="/dashboard" aria-label="Home"><Home size={17} /></Link><span>Accounting</span><ChevronRight size={14} /><Link to="/vouchers">Vouchers</Link><ChevronRight size={14} /><strong>Journal Entry</strong></nav>
    <header className="ve-heading"><div className="ve-title"><span className="ve-title-icon"><FileText size={30} /></span><div><h1>{editingId ? 'Edit Journal Entry' : 'Journal Entry'}</h1><p>Record non-cash transactions, adjustments, or transfers between accounts.</p></div></div><div className="jv-heading-actions"><button type="button" disabled={saving} onClick={onCancel}><List size={18} />Journal List</button><button type="button" className="ve-primary" disabled={blocked} onClick={onNew}><Plus size={19} />New Journal</button></div></header>
    {editingId && form.status === 'Posted' && <label>Alteration reason<input required aria-label="Alteration reason" disabled={saving} value={form.alterationReason || ''} onChange={(event) => onChange('alterationReason', event.target.value)} /></label>}
    {error && <div role="alert" className="ve-error jv-error">{error}<button type="button" disabled={blocked || numbering} onClick={onRetry}>Retry loading</button></div>}
    {notice && <p role="status" className="jv-notice">{notice}</p>}
    <div className="jv-body"><div className="jv-main"><fieldset className="ve-fields ve-card jv-fields" disabled={blocked}>
      <label>Voucher No. <em>*</em><span className="ve-number"><input required aria-label="Voucher No." placeholder="Auto number" value={form.voucherNo} onChange={(event) => onChange('voucherNo', event.target.value)} /><button type="button" aria-label="Refresh voucher number" title="Refresh voucher number" disabled={Boolean(editingId) || numbering} onClick={onRefreshNumber}><Settings size={18} /></button></span></label>
      <label>Voucher Date <em>*</em><input ref={dateRef} required aria-label="Voucher Date" type="date" value={form.date} onChange={(event) => onChange('date', event.target.value)} /></label>
      <label>Book / Account Group<select aria-label="Book / Account Group" value={form.bookGroup} onChange={(event) => onChange('bookGroup', event.target.value)}><option>General</option>{[...new Set([...groups, form.bookGroup])].filter((value) => value && value !== 'General').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Reference<input aria-label="Reference" placeholder="Ref. No. / Bill No. (Optional)" value={form.referenceNo} onChange={(event) => onChange('referenceNo', event.target.value)} /></label>
    </fieldset>
    <section className="ve-card ve-lines jv-lines" aria-label="Journal ledger entries"><div className="ve-table-scroll"><table><thead><tr><th>S.No</th><th>Account / Ledger <em>*</em></th><th>Narration</th><th>Debit (₹)</th><th>Credit (₹)</th><th>Actions</th></tr></thead><tbody>{form.lines.map((line, index) => <tr key={index} className={active === index ? 've-active-row' : ''} onFocus={() => setActive(index)}><td>{index + 1}</td><td><AutocompleteInput aria-label={`Account / Ledger ${index + 1}`} inputClassName="jv-ledger-input" value={line.ledgerName} disabled={blocked} options={options} placeholder="Select account / ledger..." onChange={(value) => onLineChange(index, 'ledgerName', value)} /></td><td><input aria-label={`Narration ${index + 1}`} placeholder="Enter narration..." disabled={blocked} value={line.narration} onChange={(event) => onLineChange(index, 'narration', event.target.value)} /><details className="jv-line-options"><summary>Cost centre / bill allocation</summary><input aria-label={`Cost centre ${index + 1}`} placeholder="Cost centre (optional)" disabled={blocked} value={line.costCenter || ''} onChange={(event) => onLineChange(index, 'costCenter', event.target.value)} /><VoucherAllocations line={line} index={index} date={form.date} financialYear={form.financialYear} excludeId={editingId} disabled={blocked} onChange={(value) => onLineChange(index, 'allocations', value)} /></details></td>{['debit', 'credit'].map((side) => <td key={side}><input className="ve-amount" type="number" min="0" step="0.01" aria-label={`${side === 'debit' ? 'Debit' : 'Credit'} ${index + 1}`} value={line.side === side ? line.amount : ''} disabled={blocked} onChange={(event) => amount(index, side, event.target.value)} /></td>)}<td><div className="ve-row-actions"><button type="button" aria-label={`Insert row after ${index + 1}`} title="Insert row" disabled={blocked} onClick={() => insert(index)}><CirclePlus size={19} /></button><button type="button" className="ve-delete" aria-label={`Delete row ${index + 1}`} title="Delete row" disabled={blocked || form.lines.length <= 2} onClick={() => remove(index)}><Trash2 size={19} /></button></div></td></tr>)}</tbody></table></div><div className="ve-table-footer"><button type="button" className="ve-primary" disabled={blocked} onClick={add}><Plus size={19} />Add Row<kbd>Alt+I</kbd></button><div className="ve-totals"><strong>Total</strong><strong aria-label="Total debit">{money(debit)}</strong><strong aria-label="Total credit">{money(credit)}</strong></div></div></section>
    <div className="ve-notes-balance"><section className="ve-card ve-notes"><label htmlFor="journal-remarks"><MessageCircle size={21} />Narration / Remarks</label><div><textarea id="journal-remarks" maxLength={500} value={form.narration} disabled={blocked} placeholder="Enter narration / remarks..." onChange={(event) => onChange('narration', event.target.value)} /><span>{form.narration.length} / 500</span></div></section><section className="ve-card ve-balance"><div className={balanced ? 've-balanced' : 've-unbalanced'}><CheckCircle2 size={33} /><div><strong>{balanced ? 'Entry is Balanced' : debit === 0 && credit === 0 ? 'Add journal entries' : 'Entry is not balanced'}</strong><p>{balanced ? `Total Debit = Total Credit = ${money(debit)}` : `Difference = ${money(Math.abs(debit - credit))}`}</p>{validation && <small className="jv-validation" aria-live="polite">{validation}</small>}</div></div></section></div></div>
    <aside className="jv-aside"><section className="ve-card jv-details"><h2><BookOpen size={21} />Journal Details</h2><dl>{[['Voucher Type', 'Journal'], ['Voucher No.', form.voucherNo || (numbering ? 'Generating…' : '—')], ['Date', form.date ? form.date.split('-').reverse().join('-') : '—'], ['Total Debit', money(debit)], ['Total Credit', money(credit)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === 'Voucher Type' ? <span>{value}</span> : value}</dd></div>)}</dl></section><section className="ve-card jv-options-card"><details className="jv-options"><summary>Documents &amp; templates</summary><VoucherAttachments attachments={form.attachments} disabled={blocked} onChange={(value) => onChange('attachments', value)} onBusy={setUploading} /><JournalNarrationTemplates value={form.narration} onChange={(value) => onChange('narration', value)} disabled={blocked} /></details></section><section className="ve-card ve-shortcuts"><h2><Zap size={23} />Shortcut Keys</h2>{shortcuts.map(([key, label]) => <button className="ve-shortcut" type="button" key={key} disabled={blocked || key === 'Ctrl + S' && (numbering || invalid) || key === 'Alt + D' && form.lines.length <= 2} onClick={() => run(key)}><kbd>{key}</kbd><span>{label}</span></button>)}</section></aside></div>
    <footer className="ve-footer"><button type="button" disabled={saving} onClick={onCancel}>Cancel</button><div><button type="submit" value="Draft" disabled={blocked || numbering || !!editingId && form.status === 'Posted'}><Save size={18} />Save as Draft</button><button type="submit" value="new" disabled={blocked || numbering || invalid}><Plus size={19} />Save &amp; New</button><button ref={saveRef} type="submit" className="ve-primary" value="Posted" disabled={blocked || numbering || invalid}><Check size={20} />{saving ? 'Saving…' : 'Save & Post'}</button></div></footer>
  </form>;
}
