import { useEffect, useState } from 'react';
import { ExportButtons } from '../../../../../components/forms/ExportButtons.jsx';
import { formatCurrency } from '../../../../../utils/formatCurrency.js';
import { VoucherAttachments } from './VoucherAttachments.jsx';
import './voucherEntry.css';

export function VoucherDetails({ voucher, busy, error, onClose, onEdit, onDuplicate, onAction, canControl, readOnly = false }) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(voucher.date);
  const manual = !voucher.sourceType;
  useEffect(() => {
    function keydown(event) { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); } }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [busy, onClose]);
  return <section className="ve-page ve-detail" aria-busy={busy}>
    <nav className="ve-breadcrumb"><button disabled={busy} onClick={onClose}>Back to vouchers</button><span>{voucher.voucherNo}</span></nav>
    <header className="ve-heading"><div className="ve-title"><h1>{voucher.voucherType} · {voucher.voucherNo}</h1></div><strong>{voucher.status}{voucher.reversedBy ? ' · Reversed' : ''}</strong></header>
    <div className="ve-card ve-fields"><div>Date: {voucher.date}</div><div>Financial year: {voucher.financialYear || 'Not recorded'}</div><div>Reference: {voucher.referenceNo || '—'}</div><div>Party: {voucher.partyName || '—'}</div><div>Source: {voucher.sourceNumber || voucher.sourceType || 'Manual'}{voucher.sourceId ? ` · ${voucher.sourceId}` : ''}</div><div>Branch: {voucher.branch || 'Unassigned'}</div>{voucher.recurringJournalId && <div>Recurring journal: {String(voucher.recurringJournalId)}</div>}{voucher.reversalOf && <div>Reverses: {String(voucher.reversalOf)}</div>}{voucher.reversedBy && <div>Reversed by: {String(voucher.reversedBy)}</div>}</div>
    {error && <p className="ve-error" role="alert">{error}</p>}
    <div className="ve-card ve-lines"><div className="ve-table-scroll"><table><thead><tr><th>Ledger</th><th>Narration</th><th>Bill allocations</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{voucher.lines.map((line, index) => <tr key={line._id || index}><td>{line.ledgerName}</td><td>{line.narration || '—'}{line.costCenter && <small className="block">Cost centre: {line.costCenter}</small>}</td><td>{line.allocations?.length ? line.allocations.map((allocation, position) => <div key={position}>{allocation.type}: {allocation.reference || 'On Account'} · {formatCurrency(allocation.amount)}</div>) : line.billRef || '—'}</td><td>{line.side === 'debit' ? formatCurrency(line.amount) : '—'}</td><td>{line.side === 'credit' ? formatCurrency(line.amount) : '—'}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Total · Difference {formatCurrency(voucher.debitTotal - voucher.creditTotal)}</td><td>{formatCurrency(voucher.debitTotal)}</td><td>{formatCurrency(voucher.creditTotal)}</td></tr></tfoot></table></div></div>
    <p className="ve-card ve-notes">{voucher.narration || 'No voucher narration'}</p>
    <VoucherAttachments attachments={voucher.attachments} readOnly />
    <div className="ve-detail-actions">
      <button disabled={busy} onClick={() => window.print()}>Print</button>
      <ExportButtons title={`${voucher.voucherType} ${voucher.voucherNo}`} filename={voucher.voucherNo} rows={voucher.lines} columns={[
        { label: 'Ledger', value: (line) => line.ledgerName }, { label: 'Side', value: (line) => line.side }, { label: 'Amount', value: (line) => line.amount }, { label: 'Narration', value: (line) => line.narration }, { label: 'Bills', value: (line) => JSON.stringify(line.allocations || []) },
      ]} />
      {!readOnly && <button disabled={busy} onClick={() => onDuplicate(voucher)}>Duplicate</button>}
      {!readOnly && manual && !voucher.reversedBy && voucher.status !== 'Cancelled' && <>
        {!voucher.reversalOf && (voucher.status === 'Draft' || canControl && voucher.voucherType !== 'Journal') && <button disabled={busy} onClick={() => onEdit(voucher)}>{voucher.status === 'Draft' ? 'Edit Draft' : 'Alter with reason'}</button>}
        {canControl && !voucher.reversalOf && <button disabled={busy} onClick={() => setAction('cancel')}>Cancel Voucher</button>}
        {canControl && voucher.status === 'Posted' && <button disabled={busy} onClick={() => setAction('reverse')}>Reverse Voucher</button>}
      </>}
    </div>
    {action && <form className="ve-card ve-notes" onSubmit={(event) => { event.preventDefault(); onAction(action, voucher, reason, date).then(() => { setAction(''); setReason(''); }).catch(() => {}); }}>
      <label>{action === 'reverse' ? 'Reversal' : 'Cancellation'} reason<input required maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {action === 'reverse' && <label>Reversal date<input required type="date" disabled={busy} value={date} onChange={(event) => setDate(event.target.value)} /></label>}
      <button type="submit" disabled={busy}>Confirm {action === 'reverse' ? 'Reversal' : 'Cancellation'}</button><button type="button" disabled={busy} onClick={() => setAction('')}>Back</button>
    </form>}
    <section aria-label="Voucher audit history"><h2>Audit history</h2>{!(voucher.auditHistory || []).length && <p>No historical audit events were recorded for this legacy voucher.</p>}{(voucher.auditHistory || []).map((entry, index) => <article key={index} className="ve-audit"><strong>{entry.action}</strong><p>{new Date(entry.at).toLocaleString('en-IN')} · Actor: {entry.actorId || 'System'}{entry.reason ? ` · ${entry.reason}` : ''}</p><details><summary>View recorded changes</summary><pre className="overflow-auto text-xs">{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details></article>)}</section>
  </section>;
}
