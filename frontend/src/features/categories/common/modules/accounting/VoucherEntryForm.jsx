import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ChevronRight, Copy, FileText, Home, MessageCircle, Plus, Save, Settings, Stamp, Trash2, WalletCards, Zap } from 'lucide-react';
import { AutocompleteInput } from '../../../../../components/forms/AutocompleteInput.jsx';
import './voucherEntry.css';
import { VoucherAllocations } from './VoucherAllocations.jsx';
import { VoucherAttachments } from './VoucherAttachments.jsx';

const shortcuts = [['F2', 'Date'], ['F7', 'Journal'], ['F4', 'Contra'], ['F5', 'Payment'], ['F6', 'Receipt'], ['F9', 'Purchase'], ['F8', 'Sales'], ['Alt + I', 'Insert Row'], ['Alt + D', 'Delete Row'], ['Ctrl + S', 'Save'], ['Esc', 'Cancel']];
const currency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

export function VoucherEntryForm({ form, editingId, voucherTypes, ledgers, saving, error, onChange, onLineChange, onAdd, onRemove, onDuplicate, onCancel, onSubmit, onRefreshNumber, numbering, loading = false }) {
  const [uploading, setUploading] = useState(false);
  const blocked = saving || loading;
  const mode = form.entryMode || 'manual';
  const group = form.bookGroup || 'General';
  const [activeRow, setActiveRow] = useState(0);
  const formRef = useRef(null);
  const dateRef = useRef(null);
  const actionRef = useRef(null);
  const debit = form.lines.filter((line) => line.side === 'debit').reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0) / 100;
  const credit = form.lines.filter((line) => line.side === 'credit').reduce((sum, line) => sum + Math.round((Number(line.amount) || 0) * 100), 0) / 100;
  const balanced = Math.abs(debit - credit) < 0.01;
  const groups = [...new Set(ledgers.map((ledger) => ledger.group).filter(Boolean))];
  const accounts = ledgers.filter((ledger) => ledger.active !== false && (group === 'General' || ledger.group === group)).map((ledger) => ledger.name);

  function focusRow(index) {
    requestAnimationFrame(() => {
      const input = formRef.current?.querySelector(`[aria-label="Account / Ledger ${index + 1}"]`);
      input?.focus();
      input?.scrollIntoView({ block: 'nearest' });
    });
  }

  function addRow() { onAdd(); focusRow(form.lines.length); }
  function duplicateRow(index) { onDuplicate(index); focusRow(index + 1); }
  function deleteRow(index) {
    if (form.lines.length <= 2) return;
    onRemove(index);
    focusRow(Math.min(index, form.lines.length - 2));
  }
  function runShortcut(key) {
    if (blocked || uploading) return;
    const type = { F7: 'Journal', F4: 'Contra', F5: 'Payment', F6: 'Receipt', F9: 'Purchase', F8: 'Sales' }[key];
    if (type) onChange('voucherType', type);
    else if (key === 'F2') dateRef.current?.focus();
    else if (key === 'Alt + I') addRow();
    else if (key === 'Alt + D') deleteRow(Math.min(activeRow, form.lines.length - 1));
    else if (key === 'Ctrl + S' && !numbering) formRef.current?.requestSubmit(actionRef.current);
    else if (key === 'Esc') onCancel();
  }

  useEffect(() => {
    function keydown(event) {
      if (event.defaultPrevented || event.isComposing) return;
      const key = event.key.toLowerCase();
      let shortcut;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        shortcut = { i: 'Alt + I', d: 'Alt + D' }[key];
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 's') shortcut = 'Ctrl + S';
      else if (!event.altKey && !event.ctrlKey && !event.metaKey) {
        shortcut = key === 'escape' ? 'Esc' : shortcuts.find(([name]) => name.toLowerCase() === key)?.[0];
      }
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) runShortcut(shortcut);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  return <form ref={formRef} className="ve-page" data-local-shortcuts="alt+i alt+d" aria-busy={blocked || uploading} onSubmit={(event) => { if (uploading || blocked) { event.preventDefault(); return; } onSubmit(event, event.nativeEvent.submitter?.value || 'Posted'); }}>
    <nav className="ve-breadcrumb" aria-label="Breadcrumb"><Home size={17} /><span>Accounting</span><ChevronRight size={15} /><button type="button" disabled={blocked} onClick={onCancel}>Vouchers</button><ChevronRight size={15} /><strong>{editingId ? 'Edit Voucher' : 'New Voucher'}</strong></nav>
    <header className="ve-heading"><div className="ve-title"><span className="ve-title-icon"><FileText size={32} /></span><div><h1>{editingId ? 'Edit Voucher' : 'New Voucher'}</h1><p>Create a {mode === 'manual' ? 'manual voucher entry with debit and credit accounts.' : 'voucher entry against a bill with debit and credit accounts.'}</p></div></div><div className="ve-modes"><button type="button" aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} disabled={blocked} onClick={() => onChange('entryMode', 'manual')}><WalletCards size={18} />Manual Entry</button><button type="button" aria-pressed={mode === 'bill'} className={mode === 'bill' ? 'active' : ''} disabled={blocked} onClick={() => onChange('entryMode', 'bill')}><Stamp size={19} />Against Bill</button></div></header>
    <fieldset disabled={blocked} className="ve-fields ve-card">
      <label>Voucher Type <em>*</em><span className="ve-icon-input"><CalendarDays size={19} /><select required aria-label="Voucher Type" value={form.voucherType} onChange={(e) => onChange('voucherType', e.target.value)}>{[...new Set(['Journal', 'Contra', 'Payment', 'Receipt', 'Purchase', 'Sales', 'Credit Note', 'Debit Note', ...voucherTypes])].map((type) => <option key={type}>{type}</option>)}</select></span></label>
      <label>Voucher No. <em>*</em><select aria-label="Voucher numbering mode" value={form.numberingMode || 'auto'} disabled={!!editingId || saving} onChange={(event) => onChange('numberingMode', event.target.value)}><option value="auto">Automatic</option><option value="manual">Manual</option></select><span className="ve-number"><input required readOnly={!editingId && form.numberingMode !== 'manual'} value={form.voucherNo} placeholder="Auto number" onChange={(e) => onChange('voucherNo', e.target.value)} /><button type="button" title="Refresh voucher number" aria-label="Refresh voucher number" disabled={!!editingId || blocked || numbering} onClick={onRefreshNumber}><Settings size={20} /></button></span></label>
      <label>Voucher Date <em>*</em><input ref={dateRef} required type="date" value={form.date} onChange={(e) => onChange('date', e.target.value)} /></label>
      <label>Book / Account Group<select value={group} onChange={(e) => onChange('bookGroup', e.target.value)}><option>General</option>{groups.filter((name) => name !== 'General').map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Reference<input value={form.referenceNo} placeholder="Ref. No. / Bill No." onChange={(e) => onChange('referenceNo', e.target.value)} /></label>
    </fieldset>
    {form.status === 'Posted' && editingId && <label>Alteration reason <em>*</em><input required aria-label="Alteration reason" disabled={blocked} value={form.alterationReason || ''} onChange={(event) => onChange('alterationReason', event.target.value)} /></label>}
    {error && <div className="ve-error" role="alert">{error}</div>}
    <div className="ve-body"><div className="ve-main"><section className="ve-card ve-lines" aria-label="Voucher ledger entries"><div className="ve-table-scroll"><table><thead><tr><th>S.No</th><th>Account / Ledger <em>*</em></th><th>Narration</th>{mode === 'bill' && <th>Bill Reference</th>}<th>Type</th><th className="ve-right">Amount (₹)</th><th>Actions</th></tr></thead><tbody>{form.lines.map((line, index) => <tr key={index} onFocus={() => setActiveRow(index)} className={activeRow === index ? 've-active-row' : ''}><td>{index + 1}</td><td><AutocompleteInput aria-label={`Account / Ledger ${index + 1}`} disabled={blocked} value={line.ledgerName} onChange={(value) => onLineChange(index, 'ledgerName', value)} options={accounts} placeholder="Select account / ledger..." inputClassName="ve-ledger-input" /></td><td><input aria-label={`Narration ${index + 1}`} disabled={blocked} value={line.narration} placeholder="Enter narration..." onChange={(e) => onLineChange(index, 'narration', e.target.value)} /></td>{mode === 'bill' && <td><input aria-label={`Bill Reference ${index + 1}`} disabled={blocked} value={line.billRef} placeholder="Bill No." onChange={(e) => onLineChange(index, 'billRef', e.target.value)} /><VoucherAllocations line={line} index={index} financialYear={form.financialYear} date={form.date} excludeId={editingId} disabled={blocked} onChange={(allocations) => onLineChange(index, 'allocations', allocations)} /></td>}<td><select aria-label={`Type ${index + 1}`} disabled={blocked} className={`ve-side ${line.side}`} value={line.side} onChange={(e) => onLineChange(index, 'side', e.target.value)}><option value="debit">Dr</option><option value="credit">Cr</option></select></td><td><input aria-label={`Amount ${index + 1}`} disabled={blocked} className="ve-amount" type="number" min="0" step="0.01" value={line.amount} onChange={(e) => onLineChange(index, 'amount', e.target.value)} /></td><td><div className="ve-row-actions"><button type="button" aria-label={`Duplicate row ${index + 1}`} title="Duplicate row" disabled={blocked} onClick={() => duplicateRow(index)}><Copy size={22} /></button><button type="button" className="ve-delete" aria-label={`Delete row ${index + 1}`} title="Delete row" disabled={blocked || form.lines.length <= 2} onClick={() => deleteRow(index)}><Trash2 size={22} /></button></div></td></tr>)}</tbody></table></div><div className="ve-table-footer"><button type="button" className="ve-primary" disabled={blocked} onClick={addRow}><Plus size={20} />Add Row <kbd>Alt+I</kbd></button><div className="ve-totals"><strong>Total</strong><strong aria-label="Total debit">{currency(debit)}</strong><strong aria-label="Total credit">{currency(credit)}</strong></div></div></section>
    <div className="ve-notes-balance"><section className="ve-card ve-notes"><label htmlFor="voucher-narration"><MessageCircle size={23} />Narration / Remarks</label><div><textarea id="voucher-narration" maxLength={500} disabled={blocked} value={form.narration} onChange={(e) => onChange('narration', e.target.value)} placeholder="Enter narration / remarks..." /><span>{form.narration.length} / 500</span></div></section><section className="ve-card ve-balance"><div className={balanced && debit > 0 ? 've-balanced' : 've-unbalanced'}><CheckCircle2 size={34} /><div><strong>{balanced && debit > 0 ? 'Entry is Balanced' : debit === 0 && credit === 0 ? 'Add voucher entries' : 'Entry is not balanced'}</strong><p>{balanced ? `Total Debit = Total Credit = ${currency(debit)}` : `Difference = ${currency(Math.abs(debit - credit))}`}</p><small aria-label="Voucher difference">Difference: {currency(debit - credit)}</small></div></div></section></div></div>
    <aside className="ve-card ve-shortcuts"><h2><Zap size={25} />Shortcut Keys</h2>{shortcuts.map(([key, label], index) => <button type="button" disabled={blocked || key === 'Ctrl + S' && numbering || key === 'Alt + D' && form.lines.length <= 2} className={`ve-shortcut ${index === 7 ? 've-shortcut-divider' : ''}`} key={key} onClick={() => runShortcut(key)}><kbd>{key}</kbd><span>{label}</span></button>)}</aside></div>
    <VoucherAttachments attachments={form.attachments || []} disabled={blocked} onChange={(files) => onChange('attachments', files)} onBusy={setUploading} />
    <footer className="ve-footer"><button type="button" disabled={blocked || uploading} onClick={onCancel}>Cancel</button><div><button type="submit" value="Draft" disabled={blocked || numbering || uploading || !!editingId && form.status === 'Posted'}><Save size={19} />Save as Draft</button><button type="submit" value="new" disabled={blocked || numbering || uploading}><Plus size={21} />Save &amp; New</button><button ref={actionRef} type="submit" value="Posted" disabled={blocked || numbering || uploading} className="ve-primary"><Check size={22} />{saving ? 'Saving...' : loading ? 'Loading...' : 'Save & Post'}</button></div></footer>
  </form>;
}
