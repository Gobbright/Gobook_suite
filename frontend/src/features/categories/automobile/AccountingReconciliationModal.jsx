import { useState } from 'react';
import { AccountingModal } from './AccountingModal.jsx';
import { reconciliationPayload } from './automobileBankReconciliation.js';
import { formatCurrency } from '../../../utils/formatCurrency.js';

export function AccountingReconciliationModal({ entry, bank, saving, saveError, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...entry }));
  const [error, setError] = useState('');
  function change(field, value) {
    setError('');
    setDraft((previous) => ({ ...previous, [field]: value, ...(field === 'reconciled' ? {
      bankDate: value ? previous.bankDate || entry.date : '',
      bankReference: value ? previous.bankReference || entry.vchNo : '',
    } : {}) }));
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    try { reconciliationPayload(draft); } catch (failure) { setError(failure.message); return; }
    if (await onSave([draft])) onClose();
  }
  return <AccountingModal title="Reconcile Bank Entry" busy={saving} onClose={onClose}>
    <form onSubmit={submit}>
      {(error || saveError) && <p className="autop-error" role="alert">{error || saveError}</p>}
      <fieldset disabled={saving} className="accounting-modal-fields">
        <label>Bank Account<input readOnly value={bank} /></label>
        <label>Voucher Number<input readOnly value={entry.vchNo || ''} /></label>
        <label>Book Date<input readOnly type="date" value={entry.date || ''} /></label>
        <label>Amount<input readOnly value={formatCurrency(Number(entry.deposit || 0) - Number(entry.withdrawal || 0))} /></label>
        <label className="accounting-modal-full">Description<input readOnly value={entry.particulars || ''} /></label>
        <label>Status<select value={draft.reconciled ? 'cleared' : 'uncleared'} onChange={(event) => change('reconciled', event.target.value === 'cleared')}>
          <option value="uncleared">Unreconciled</option><option value="cleared">Reconciled</option>
        </select></label>
        <label>Bank Cleared Date{draft.reconciled ? ' *' : ''}<input type="date" required={Boolean(draft.reconciled)} disabled={!draft.reconciled} value={draft.bankDate || ''} onChange={(event) => change('bankDate', event.target.value)} /></label>
        <label className="accounting-modal-full">Bank Reference<input disabled={!draft.reconciled} value={draft.bankReference || ''} onChange={(event) => change('bankReference', event.target.value)} /></label>
        <label className="accounting-modal-full">Reconciliation Notes<textarea maxLength={500} value={draft.reconciliationNotes || ''} onChange={(event) => change('reconciliationNotes', event.target.value)} /></label>
      </fieldset>
      <footer className="accounting-modal-actions"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="app-save-button autop-primary">{saving ? 'Saving…' : 'Save'}</button></footer>
    </form>
  </AccountingModal>;
}
