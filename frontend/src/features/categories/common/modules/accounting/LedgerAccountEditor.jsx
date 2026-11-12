import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createLedgerAccount, updateLedgerAccount } from '../../../../../services/accountingService.js';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';
import { ledgerGroupName } from './ledgerWorkspace.js';

export const LEDGER_GROUPS = ['Bank Accounts', 'Cash-In-Hand', 'Fixed Assets', 'Current Assets', 'Current Liabilities', 'Capital Account', 'Sundry Debtors', 'Sundry Creditors', 'Direct Incomes', 'Indirect Incomes', 'Direct Expenses', 'Indirect Expenses'];

export function LedgerAccountEditor({ editor, accounts, customGroups, onClose, onSaved }) {
  const existing = editor.kind === 'edit' ? editor.account : null;
  const duplicate = editor.kind === 'duplicate';
  const [form, setForm] = useState(() => ({
    name: duplicate ? `${editor.account.name} (Copy)` : existing?.name || '',
    group: ledgerGroupName(editor.account?.group || 'Bank Accounts'),
    opening: Math.abs(Number(existing?.opening || 0)), side: Number(existing?.opening) < 0 ? 'Cr' : 'Dr',
    code: existing?.code || '', gstin: editor.account?.gstin || '', contact: editor.account?.contact || '',
    phone: editor.account?.phone || '', email: editor.account?.email || '', address: editor.account?.address || '',
    creditLimit: editor.account?.creditLimit ?? '', creditDays: editor.account?.creditDays ?? '', changeReason: '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const ref = useFocusTrap({ onClose: () => { if (!lock.current) onClose(); } });
  const title = existing ? 'Edit Ledger' : duplicate ? 'Duplicate Ledger' : 'New Ledger';
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!form.name.trim() || !form.group.trim() || !Number.isFinite(Number(form.opening)) || Number(form.opening) < 0) { setError('Enter a name, account group and a valid opening balance.'); return; }
    if (accounts.some((account) => account._id !== existing?._id && account.name.trim().toLowerCase() === form.name.trim().toLowerCase())) { setError('A ledger with this name already exists.'); return; }
    if (form.creditLimit !== '' && (!Number.isFinite(Number(form.creditLimit)) || Number(form.creditLimit) < 0) || form.creditDays !== '' && (!Number.isInteger(Number(form.creditDays)) || Number(form.creditDays) < 0 || Number(form.creditDays) > 3650)) { setError('Credit limit must be positive or zero and credit period must be whole days between 0 and 3650.'); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      const payload = { ...form, name: form.name.trim(), group: ledgerGroupName(form.group.trim()), opening: Number(form.opening) * (form.side === 'Cr' ? -1 : 1), color: editor.account?.color || '#0075ff' };
      delete payload.side;
      if (form.creditLimit === '' && !existing) delete payload.creditLimit; else payload.creditLimit = Number(form.creditLimit || 0);
      if (form.creditDays === '' && !existing) delete payload.creditDays; else payload.creditDays = form.creditDays === '' ? null : Number(form.creditDays);
      if (existing?.revision) payload.revision = existing.revision;
      const result = existing ? await updateLedgerAccount(existing._id, payload) : await createLedgerAccount(payload);
      if (!result.account?._id) throw new Error('Ledger could not be saved. Please retry.');
      onSaved(result.account);
    } catch (failure) { setError(failure.message || 'Unable to save ledger.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <div className="lw-overlay"><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="lw-dialog"><header><h2>{title}</h2><button type="button" aria-label="Close ledger editor" disabled={saving} onClick={onClose}><X size={18} /></button></header><form onSubmit={save}>
    <fieldset disabled={saving}><label>Account Name<input autoFocus required value={form.name} readOnly={Boolean(existing && editor.nameLocked)} onChange={(event) => change('name', event.target.value)} /></label>{existing && editor.nameLocked && <small>Accounts with accounting history keep their name so existing vouchers stay linked.</small>}
    <label>Account Group<input required list="lw-account-groups" value={form.group} onChange={(event) => change('group', event.target.value)} /><datalist id="lw-account-groups">{[...new Set([...LEDGER_GROUPS, ...(customGroups || []).map((group) => group.name), ...accounts.map((account) => ledgerGroupName(account.group))])].map((value) => <option key={value} value={value} />)}</datalist></label>
    <div className="lw-opening-fields"><label>Opening Balance<input type="number" min="0" step="0.01" required readOnly={Boolean(existing && editor.openingLocked)} value={form.opening} onChange={(event) => change('opening', event.target.value)} /></label><label>Balance Side<select disabled={Boolean(existing && editor.openingLocked)} value={form.side} onChange={(event) => change('side', event.target.value)}><option>Dr</option><option>Cr</option></select></label></div>
    {existing && editor.openingLocked && <small>Opening balances with posted history are protected. Use an Opening Balance adjustment voucher.</small>}
    {duplicate && <small>The new account starts with no opening balance or transactions. Ledger code is not copied.</small>}
    <details className="lw-editor-details" open={editor.showDetails || undefined}><summary>Contact, tax &amp; credit details</summary><div className="lw-editor-grid">
      {[['code', 'Ledger Code'], ['gstin', 'GSTIN'], ['contact', 'Contact Person'], ['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']].map(([key, label]) => <label key={key}>{label}<input type={key === 'email' ? 'email' : 'text'} maxLength={key === 'address' ? 2000 : 200} value={form[key]} onChange={(event) => change(key, event.target.value)} /></label>)}
      <label>Credit Limit<input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => change('creditLimit', event.target.value)} /></label><label>Credit Period (Days)<input type="number" min="0" max="3650" step="1" value={form.creditDays} onChange={(event) => change('creditDays', event.target.value)} /></label>
    </div></details>
    {existing && <label>Change Reason<input maxLength={500} value={form.changeReason} onChange={(event) => change('changeReason', event.target.value)} placeholder="Required when correcting an unposted opening balance" /></label>}</fieldset>
    {error && <p role="alert" className="lw-error">{error}</p>}<footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="lw-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Ledger'}</button></footer>
  </form></section></div>;
}
