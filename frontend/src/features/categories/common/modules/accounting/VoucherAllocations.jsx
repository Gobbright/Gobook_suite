import { useEffect, useState } from 'react';
import { getVoucherBillReferences } from '../../../../../services/accountingService.js';

export function VoucherAllocations({ line, index, financialYear, date, excludeId, disabled, onChange }) {
  const [open, setOpen] = useState(Boolean(line.allocations?.length));
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !line.ledgerName) return;
    let active = true;
    setLoading(true);
    setError('');
    getVoucherBillReferences({ ledger: line.ledgerName, financialYear, date, excludeId }).then((data) => {
      if (active) setReferences((data.references || []).filter((bill) => bill.outstanding > 0 && bill.side !== line.side));
    }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, line.ledgerName, line.side, financialYear, date, excludeId]);
  const allocations = line.allocations || [];
  function update(position, field, value) {
    onChange(allocations.map((allocation, current) => current === position ? { ...allocation, [field]: value } : allocation));
  }
  return <div className="ve-allocations">
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>Allocate bills ({allocations.length})</button>
    {open && <div>
      {loading && <small role="status">Loading outstanding bills...</small>}
      {error && <small role="alert">{error}</small>}
      {allocations.map((allocation, position) => <div key={position} className="ve-allocation">
        <select aria-label={`Allocation type ${index + 1}.${position + 1}`} disabled={disabled} value={allocation.type} onChange={(event) => update(position, 'type', event.target.value)}>
          {['New Reference', 'Against Reference', 'Advance', 'On Account'].map((type) => <option key={type}>{type}</option>)}
        </select>
        {allocation.type !== 'On Account' && (allocation.type === 'Against Reference' ? <select aria-label={`Allocation reference ${index + 1}.${position + 1}`} disabled={disabled || loading} value={allocation.reference} onChange={(event) => update(position, 'reference', event.target.value)}>
          <option value="">Select outstanding bill</option>
          {references.map((bill) => <option key={bill.reference} value={bill.reference}>{bill.reference} ({bill.outstanding.toFixed(2)})</option>)}
        </select> : <input aria-label={`Allocation reference ${index + 1}.${position + 1}`} disabled={disabled} value={allocation.reference} placeholder="New reference" onChange={(event) => update(position, 'reference', event.target.value)} />)}
        <input aria-label={`Allocation amount ${index + 1}.${position + 1}`} disabled={disabled} type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => update(position, 'amount', event.target.value)} />
        <button type="button" disabled={disabled} aria-label={`Remove allocation ${index + 1}.${position + 1}`} onClick={() => onChange(allocations.filter((_, current) => current !== position))}>Remove</button>
      </div>)}
      <button type="button" disabled={disabled} onClick={() => onChange([...allocations, { type: 'New Reference', reference: line.billRef || '', amount: Math.max(0, Number(line.amount || 0) - allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)) }])}>Add allocation</button>
      <small>Allocated: {allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0).toFixed(2)} / {Number(line.amount || 0).toFixed(2)}</small>
    </div>}
  </div>;
}
