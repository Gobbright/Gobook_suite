import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../../../../../../services/api.js';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const labelFor = (value) => String(value || '').replaceAll('-', ' ');

export function SalesWorkflowDialog({ document: doc, isReturn = false, onClose, onComplete }) {
  const state = isReturn ? doc.returnStatus || 'completed' : doc.lifecycleStatus || 'posted';
  const dispatch = doc.fulfillmentStatus || 'unknown';
  const actions = isReturn
    ? state === 'requested' ? [['receive', 'Confirm goods received']] : state === 'received' ? [['approve', 'Approve inspection']] : []
    : state === 'draft' ? [['post', 'Post invoice']]
    : state === 'posted' ? [
      ...(dispatch !== 'dispatched' ? [['dispatch', 'Mark goods dispatched']] : []),
      ...(dispatch === 'unknown' ? [['confirm-undispatched', 'Confirm goods not dispatched']] : []),
      ...(dispatch === 'not-dispatched' ? [['cancel', 'Cancel invoice']] : []),
    ] : [];
  const [action, setAction] = useState(actions[0]?.[0] || '');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState(() => Object.fromEntries((doc.items || []).map((item) => [String(item._id), item.itemType === 'Service' ? 0 : item.qty])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const previous = window.document.activeElement;
    const overflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    return () => { window.document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const reasonRequired = ['cancel', 'confirm-undispatched', 'approve'].includes(action);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { action, reason, ...(action === 'approve' ? { items: doc.items.map((item) => ({ lineId: String(item._id), restockQty: quantities[String(item._id)] })) } : {}) };
      if (isReturn) await api.transitionSalesReturn(doc.id || doc._id, payload);
      else await api.transitionInvoice(doc.id || doc._id, payload);
      await onComplete(); onClose();
    } catch (failure) { setError(failure.message || 'Unable to update this document'); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') {
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a')];
      if (event.shiftKey && window.document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && window.document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sales-workflow-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
      <header className="mb-4 flex items-start justify-between gap-3"><div><h2 id="sales-workflow-title" className="m-0 text-lg font-bold">{doc.number}</h2><p className="m-0 mt-1 text-sm capitalize text-slate-500">{labelFor(state)}{!isReturn ? ` / ${labelFor(dispatch)}` : ''}</p></div><button type="button" aria-label="Close workflow" onClick={onClose} disabled={busy} className="rounded-lg p-2"><X size={18} /></button></header>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!isReturn && state === 'posted' ? <div className="mb-4 grid gap-2 text-sm"><a className="text-blue-600" href={`/billing/credit-note/new?sourceInvoice=${encodeURIComponent(doc.id || doc._id)}`}>Create financial credit adjustment (no stock change)</a>{dispatch === 'dispatched' ? <a className="text-blue-600" href={`/billing/sales-return/new?sourceInvoice=${encodeURIComponent(doc.id || doc._id)}`}>Request a sales return</a> : null}</div> : null}
      {actions.length ? <form onSubmit={submit} className="grid gap-4"><fieldset disabled={busy} className="m-0 grid gap-4 border-0 p-0"><label className="grid gap-2 text-sm font-semibold">Action<select value={action} onChange={(event) => setAction(event.target.value)} className={field}>{actions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <p className="m-0 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{action === 'post' ? 'Posting finalizes the invoice and deducts stock. Later bill edits update stock and accounting together.' : action === 'dispatch' ? 'Confirm that the goods have physically left your business. Future goods returns must use Sales Return.' : action === 'cancel' ? 'Cancellation keeps the invoice and its history, reverses accounting, and restores the stock that was deducted. This is only available before dispatch.' : action === 'confirm-undispatched' ? 'Verify that goods for this older invoice have not left your business. Record why you can confirm this.' : action === 'receive' ? 'Confirm the returned goods have arrived. They remain outside sellable stock until inspection is approved.' : 'Enter the quantity approved for sellable stock for every line. Use zero for damaged or rejected goods. The full return is credited, while only approved quantities are restocked.'}</p>
        {action === 'approve' ? <div className="grid gap-3">{doc.items.map((item) => <label key={String(item._id)} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><span>{item.description}{item.size ? ` / ${item.size}` : ''}<small className="block text-slate-500">Returned: {item.qty} {item.unit}. {item.itemType === 'Service' ? 'Service: no stock' : 'Approve for restocking:'}</small></span><input aria-label={`Approved quantity for ${item.description}`} type="number" min={0} max={item.itemType === 'Service' ? 0 : item.qty} step="any" required disabled={item.itemType === 'Service'} value={quantities[String(item._id)]} onChange={(event) => setQuantities((current) => ({ ...current, [String(item._id)]: event.target.value }))} className={field} /></label>)}</div> : null}
        <label className="grid gap-2 text-sm font-semibold">{action === 'approve' ? 'Inspection notes' : 'Reason / notes'}{reasonRequired ? ' (required)' : ''}<textarea required={reasonRequired} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className={field} rows={3} /></label><button type="submit" className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving...' : actions.find(([value]) => value === action)?.[1]}</button></fieldset></form> : <p className="text-sm text-slate-500">This document is complete and retained for your records.</p>}
      {doc.cancelReason ? <p className="mt-4 text-sm text-slate-600">Cancellation reason: {doc.cancelReason}</p> : null}
      {doc.inspectionNotes ? <p className="mt-4 text-sm text-slate-600">Inspection: {doc.inspectionNotes}</p> : null}
      {doc.lifecycleEvents?.length ? <div className="mt-5 border-t border-slate-200 pt-4"><h3 className="m-0 text-sm font-bold">History</h3>{doc.lifecycleEvents.map((event, index) => <p key={index} className="mb-0 text-xs text-slate-500">{labelFor(event.action)} / {new Date(event.at).toLocaleString()}{event.reason ? ` / ${event.reason}` : ''}</p>)}</div> : null}
    </section>
  </div>, window.document.body);
}
