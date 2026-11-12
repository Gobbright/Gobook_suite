import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { createLedgerGroup, getAccountingVoucher } from '../../../../../services/accountingService.js';
import { useFocusTrap } from '../../../../../hooks/useFocusTrap.js';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { exportRows } from '../../../../../utils/exportRows.js';
import { VoucherDetails } from './VoucherDetails.jsx';
import { LEDGER_GROUPS } from './LedgerAccountEditor.jsx';
import { ledgerGroupName } from './ledgerWorkspace.js';

const signedBalance = (value) => `${formatCurrency(Math.abs(Number(value) || 0))} ${Number(value) < 0 ? 'Cr' : 'Dr'}`;
const auditTime = (value) => value ? new Date(value).toLocaleString('en-IN') : '—';
const dateText = (value) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-IN') : '—';

export function LedgerGroupEditor({ groups, onClose, onSaved }) {
  const [name, setName] = useState(''), [parent, setParent] = useState('Current Assets');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const ref = useFocusTrap({ onClose: () => { if (!saving) onClose(); } });
  async function save(event) {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try { const result = await createLedgerGroup({ name, parent }); if (!result.group) throw new Error('Group was not saved. Please retry.'); onSaved(result.group); }
    catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }
  return <div className="lw-overlay"><section ref={ref} className="lw-dialog" role="dialog" aria-modal="true" aria-label="Create Group"><header><h2>Create Group</h2><button disabled={saving} aria-label="Close group editor" onClick={onClose}><X size={18} /></button></header><form onSubmit={save}><fieldset disabled={saving}><label>Group Name<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Under Group<select aria-label="Under Group" value={parent} onChange={(event) => setParent(event.target.value)}>{[...new Set([...LEDGER_GROUPS, ...groups.map((group) => group.name)])].map((group) => <option key={group}>{group}</option>)}</select></label></fieldset>{error && <p role="alert" className="lw-error">{error}</p>}<footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="lw-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Group'}</button></footer></form></section></div>;
}

export function LedgerSupplement({ tab, detail, account, loading, error, reference, onReference, onRetry, onEdit, onVoucher }) {
  if (loading) return <div className="lw-panel" role="status">Loading ledger details…</div>;
  if (error) return <div className="lw-panel lw-error" role="alert">{error}<button onClick={onRetry}>Retry details</button></div>;
  const profile = detail?.account || account || {};
  if (tab === 'bills') {
    const rows = (detail?.outstanding || []).filter((bill) => !reference || bill.reference === reference);
    return <section className="lw-panel"><header><h3>Bill-wise Outstanding</h3><div>{reference && <button onClick={() => onReference('')}>Show all bills</button>}<button disabled={!rows.length} onClick={() => exportRows(`${profile.name} Outstanding`, rows, ['reference', 'date', 'financialYear', 'dueDate', 'outstanding', 'side'])}>Export outstanding</button></div></header><p>Outstanding as of the selected To Date, including unsettled carried references.</p><table><thead><tr>{['Bill Reference', 'Date', 'Financial Year', 'Due Date', 'Outstanding', 'Status', 'Vouchers'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{!rows.length ? <tr><td colSpan={7}>No outstanding bill references.</td></tr> : rows.map((bill) => <tr key={bill.reference}><td>{bill.reference}</td><td>{dateText(bill.date)}</td><td>{bill.financialYear || '—'}</td><td>{dateText(bill.dueDate)}</td><td>{signedBalance(bill.balance)}</td><td>{bill.overdue ? 'Overdue' : bill.dueDate ? 'Within credit period' : 'No credit period'}</td><td>{bill.vouchers.map((voucher) => <button key={voucher.id} onClick={() => onVoucher(voucher.id)}>{voucher.number}</button>)}</td></tr>)}</tbody></table></section>;
  }
  if (tab === 'contact') return <section className="lw-panel"><header><h3>Contact &amp; Tax Details</h3><button onClick={onEdit}>Edit details &amp; credit</button></header><dl className="lw-profile">{[['Ledger Code', profile.code], ['Account Group', ledgerGroupName(profile.group)], ['GSTIN', profile.gstin], ['Contact', profile.contact], ['Phone', profile.phone], ['Email', profile.email], ['Address', profile.address], ['Credit Limit', profile.creditLimit > 0 ? formatCurrency(profile.creditLimit) : 'Not configured'], ['Credit Period', profile.creditDays != null ? `${profile.creditDays} days` : 'Not configured'], ['Credit Exposure', detail?.credit ? formatCurrency(detail.credit.exposure) : null], ['Available Credit', detail?.credit?.available != null ? formatCurrency(detail.credit.available) : 'Not configured']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>{detail?.credit?.exceeded && <p role="status" className="lw-error">Credit limit exceeded by {formatCurrency(detail.credit.exposure - detail.credit.limit)}.</p>}{detail?.linkedParty && <p>Credit settings are linked to this {detail.linkedParty.kind.toLowerCase()}'s existing master record.</p>}</section>;
  if (tab === 'opening') return <section className="lw-panel"><header><h3>Opening Balance History</h3></header><p>Master opening: {signedBalance(profile.opening)}. Posted entries are preserved; adjustments use accounting vouchers.</p>{!(detail?.openingHistory || []).length && <p>No opening-balance change history was recorded for this legacy ledger.</p>}{(detail?.openingHistory || []).map((entry, index) => <article className="lw-audit-entry" key={index}><strong>{signedBalance(entry.before)} → {signedBalance(entry.after)}</strong><p>{auditTime(entry.at)} · {entry.actorId || 'System'} · {entry.reason}</p></article>)}{(detail?.openingAdjustments || []).map((voucher) => <article className="lw-audit-entry" key={voucher.id}><button onClick={() => onVoucher(voucher.id)}>{voucher.number}</button> · {dateText(voucher.date)}<p>{voucher.narration}</p></article>)}</section>;
  return <section className="lw-panel"><header><h3>Audit History</h3></header>{!(detail?.auditHistory || []).length && !(detail?.legacyAudit || []).length && <p>No historical audit records are available for this legacy ledger.</p>}{(detail?.auditHistory || []).map((entry, index) => <article className="lw-audit-entry" key={index}><strong>{entry.action}</strong><p>{auditTime(entry.at)} · {entry.actorId || 'System'} · {entry.reason}</p><details><summary>Recorded changes</summary><pre>{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details></article>)}{(detail?.legacyAudit || []).map((entry) => <article className="lw-audit-entry" key={entry._id}><strong>{entry.action} · System audit</strong><p>{auditTime(entry.performedAt)} · {entry.performedBy?.email || entry.performedBy?.userId || 'System'}</p></article>)}</section>;
}

export function LedgerVoucherDialog({ id, onClose }) {
  const [state, setState] = useState({ loading: true, voucher: null, error: '' });
  const [reload, setReload] = useState(0);
  const ref = useFocusTrap({ onClose });
  useEffect(() => {
    let active = true;
    setState({ loading: true, voucher: null, error: '' });
    getAccountingVoucher(id).then((data) => { if (!data.voucher) throw new Error('Voucher not found'); if (active) setState({ loading: false, voucher: data.voucher, error: '' }); }).catch((failure) => { if (active) setState({ loading: false, voucher: null, error: failure.message }); });
    return () => { active = false; };
  }, [id, reload]);
  return <div className="lw-overlay"><section ref={ref} className="lw-dialog lw-voucher-dialog" role="dialog" aria-modal="true" aria-label="Voucher details"><header><h2>Voucher details</h2><button aria-label="Close voucher details" onClick={onClose}><X size={18} /></button></header>{state.loading ? <p role="status">Loading voucher…</p> : state.error ? <div role="alert">{state.error}<button onClick={() => setReload((value) => value + 1)}>Retry voucher</button></div> : <VoucherDetails voucher={state.voucher} readOnly onClose={onClose} />}</section></div>;
}
