import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { leaveService } from '../../services/leaveService.js';
import { SelectDropdown } from '../../../../components/forms/SelectDropdown.jsx';

export default function ApplyLeave() {
  const [form, setForm] = useState({ type: 'Casual Leave', from: '', to: '', reason: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const days = form.from && form.to && form.to >= form.from ? (Date.parse(form.to + 'T00:00:00Z') - Date.parse(form.from + 'T00:00:00Z')) / 86400000 + 1 : 0;
  async function submit(event) {
    event.preventDefault(); setMessage('');
    if (!days) { setMessage('Choose a valid leave date range.'); return; }
    setBusy(true);
    try { await leaveService.apply(form); setMessage('Leave request submitted for administrator approval.'); setForm({ type: 'Casual Leave', from: '', to: '', reason: '' }); }
    catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <><PageHeader title="Apply Leave" subtitle="Submit your leave request to your administrator" />{message && <p role="status" className={message.includes('submitted') ? 'card' : 'error'}>{message}</p>}<form className="card form-grid" onSubmit={submit}>
    <div className="field"><label>Leave Type</label><SelectDropdown value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={['Casual Leave', 'Sick Leave', 'Annual Leave', 'Unpaid Leave', 'Comp Off']} /></div>
    <div className="field"><label>Calendar Days</label><input type="number" value={days} readOnly /></div>
    <div className="field"><label>From</label><input type="date" required max={form.to || undefined} value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></div>
    <div className="field"><label>To</label><input type="date" required min={form.from || undefined} value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></div>
    <div className="field field-full"><label>Reason</label><textarea required maxLength={1000} rows="4" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div>
    <button className="btn primary" disabled={busy || !days}>{busy ? 'Submitting…' : 'Apply Leave'}</button>
  </form></>;
}
