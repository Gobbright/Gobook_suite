import { useRequestedEmployeeMonth } from '../../hooks/useRequestedEmployeeMonth.js';
import { TimeInput12 } from '../../../../components/forms/TimeInput12.jsx';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { currentEmployeeDate, currentEmployeeMonth } from '../../services/monthScope.js';
import { selfService } from '../../services/selfService.js';
import { LeaveNav } from '../admin/leave/LeaveNav.jsx';

export default function Permissions({ admin = false }) {
  const [month, setMonth] = useRequestedEmployeeMonth();
  const [form, setForm] = useState({ date: currentEmployeeDate(), fromTime: '09:00', toTime: '11:00', reason: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const { data, error, loading, reload } = useLoad(() => admin ? selfService.adminPermissions(month) : selfService.permissions(month), [month, admin]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setMessage('');
    try { const created = await selfService.requestPermission(form); setMonth(created.date.slice(0, 7)); setForm((value) => ({ ...value, reason: '' })); setMessage('Permission request submitted to your administrator.'); reload(); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }
  async function review(row, status) {
    setBusy(true); setActionError('');
    try { await selfService.reviewPermission(row._id, status); setMessage(`Permission ${status.toLowerCase()}.`); reload(); }
    catch (err) { setActionError(err.message); } finally { setBusy(false); }
  }
  const columns = [...(admin ? [{ key: 'name', label: 'Employee' }, { key: 'employeeId', label: 'Employee ID' }] : []), { key: 'date', label: 'Date' }, { key: 'fromTime', label: 'From' }, { key: 'toTime', label: 'To' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }, ...(admin ? [{ key: 'actions', label: 'Review', render: (row) => row.status === 'Pending' ? <div className="hr-actions"><button className="hr-btn" disabled={busy} onClick={() => review(row, 'Approved')}>Approve</button><button className="hr-btn" disabled={busy} onClick={() => review(row, 'Rejected')}>Reject</button></div> : row.reviewedBy }] : [])];
  return <div className={admin ? 'hr-screen' : ''}><PageHeader title="Permission Requests" subtitle={admin ? 'Review employee requests for time away' : 'Request permission for part of a working day'} action={<MonthFilter month={month} onChange={setMonth} />} />{admin && <LeaveNav current="/employee-management/leave/permissions" />}{(error || actionError) && <p className="error" role="alert">{error || actionError}</p>}{message && <p role="status">{message}</p>}
    {!admin && <form className="card" onSubmit={submit}><div className="hr-form-grid"><label className="hr-field">Date<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label className="hr-field">From<TimeInput12 label="From" required value={form.fromTime} onChange={(event) => setForm({ ...form, fromTime: event.target.value })} /></label><label className="hr-field">To<TimeInput12 label="To" required value={form.toTime} onChange={(event) => setForm({ ...form, toTime: event.target.value })} /></label><label className="hr-field">Reason<textarea required maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label></div><button className="btn primary" disabled={busy}>{busy ? 'Submitting…' : 'Request Permission'}</button></form>}
    {loading ? <div className="card">Loading requests…</div> : <DataTable columns={columns} rows={data?.data || []} />}
  </div>;
}
