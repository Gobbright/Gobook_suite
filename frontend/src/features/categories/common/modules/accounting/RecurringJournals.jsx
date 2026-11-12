import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRecurringJournals, createRecurringJournal, updateRecurringJournal, generateRecurringJournal } from '../../../../../services/accountingService.js';

export function RecurringJournals({ journals }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [form, setForm] = useState({ name: '', sourceVoucher: '', frequency: 'Monthly', nextDate: '', endDate: '' });
  useEffect(() => {
    if (!open) return;
    let active = true; setLoading(true); setError('');
    getRecurringJournals().then((data) => { if (active) setRows(data.schedules || []); }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, reload]);
  async function perform(work) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message || 'Unable to update recurring journal.'); }
    finally { setBusy(false); }
  }
  return <details className="jv-recurring" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>Recurring journals</summary>{open && <div>
    <p>Generate each due occurrence as a draft for review. Nothing posts automatically. Bill references and attachments must be assigned to each occurrence.</p>
    {error && <p role="alert">{error}<button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>Retry</button></p>}
    <form onSubmit={(event) => { event.preventDefault(); perform(async () => { await createRecurringJournal(form); setForm({ name: '', sourceVoucher: '', frequency: 'Monthly', nextDate: '', endDate: '' }); }); }}><fieldset disabled={busy || loading}>
      <label>Name<input aria-label="Recurring journal name" required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Source journal<select required aria-label="Recurring source journal" value={form.sourceVoucher} onChange={(event) => setForm({ ...form, sourceVoucher: event.target.value })}><option value="">Select a journal</option>{journals.filter((journal) => !journal.legacy && ['Draft', 'Posted'].includes(journal.status)).map((journal) => <option key={journal._id} value={journal._id}>{journal.voucherNo || journal.entryNo}</option>)}</select></label>
      <label>Frequency<select aria-label="Recurring frequency" value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>{['Weekly', 'Monthly', 'Quarterly', 'Yearly'].map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
      <label>First date<input aria-label="Recurring first date" required type="date" value={form.nextDate} onChange={(event) => setForm({ ...form, nextDate: event.target.value })} /></label>
      <label>End date<input aria-label="Recurring end date" type="date" min={form.nextDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label><button type="submit">Configure recurring journal</button>
    </fieldset></form>
    {loading ? <p role="status">Loading recurring journals…</p> : !rows.length ? <p>No recurring journals configured.</p> : <div className="ve-table-scroll"><table><thead><tr><th>Name</th><th>Frequency</th><th>Next date</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row._id}><td>{row.name}<details><summary>Audit history</summary>{row.auditHistory?.map((event, index) => <p key={index}>{event.action} · {new Date(event.at).toLocaleString('en-IN')} · {event.actorId}{event.date ? ` · ${event.date}` : ''}</p>)}</details></td><td>{row.frequency}</td><td>{row.nextDate}</td><td>{row.active ? 'Active' : 'Paused / Complete'}</td><td><button type="button" disabled={busy} onClick={() => perform(() => updateRecurringJournal(row._id, { active: !row.active, revision: row.revision }))}>{row.active ? 'Pause' : 'Resume'}</button><button type="button" disabled={busy || !row.active || row.nextDate > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })} onClick={() => perform(async () => { const data = await generateRecurringJournal(row._id, row.nextDate); navigate(`/journal-entry/${data.voucher._id}/edit`); })}>Generate due draft</button></td></tr>)}</tbody></table></div>}
  </div>}</details>;
}
