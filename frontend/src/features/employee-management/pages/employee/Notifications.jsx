import { useEffect, useRef, useState } from 'react';
import { notificationService } from '../../services/notificationService.js';
import { adminService } from '../../services/adminService.js';
import { useLoad } from '../../hooks/useLoad.js';
import { EmployeeReportButtons } from '../../components/common/EmployeeReportButtons.jsx';
import { currentEmployeeMonth } from '../../services/monthScope.js';

const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) : '';
export default function Notifications({ admin = false }) {
  const [month, setMonth] = useState('all');
  const [page, setPage] = useState(1);
  const [employee, setEmployee] = useState('');
  const [read, setRead] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', message: '', target: 'all' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const requestId = useRef(null);
  const { data, loading, error, reload } = useLoad(() => notificationService.list(admin, { month, page, employee, read }), [admin, month, page, employee, read]);
  const staff = useLoad(() => admin ? adminService.employees() : Promise.resolve({ data: [] }), [admin]);
  useEffect(() => { const timer = setInterval(reload, 30000); return () => clearInterval(timer); }, [reload]);
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); requestId.current = null; }
  async function view(row, open = true) {
    if (open) setSelected(row); setActionError('');
    if (admin ? !row.ownerReadAt : !row.readAt) {
      try { const saved = await (admin ? notificationService.readOwner(row._id) : notificationService.read(row._id)); if (open) setSelected(saved); reload(); window.dispatchEvent(new Event('employee:notifications-changed')); }
      catch (failure) { setActionError(failure.message); }
    }
  }
  async function send(event) {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('');
    requestId.current ||= crypto.randomUUID();
    try {
      const saved = await notificationService.send({ title: form.title, message: form.message, allEmployees: form.target === 'all', employeeIds: form.target === 'all' ? [] : [form.target], requestId: requestId.current });
      setNotice(saved.message); setForm({ title: '', message: '', target: 'all' }); requestId.current = null; reload();
    } catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); }
  }
  async function retry(row) {
    setBusy(true); setActionError('');
    try { const saved = await notificationService.retry(row._id); setNotice(saved.message); reload(); }
    catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); }
  }
  async function markAllRead() {
    setBusy(true); setActionError('');
    try {
      await (admin ? notificationService.readAllOwner() : notificationService.readAll());
      setSelected(null); reload(); window.dispatchEvent(new Event('employee:notifications-changed'));
    } catch (failure) { setActionError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="hr-screen employee-notifications">
    <div className="hr-page-head"><div><h1>{admin ? 'Employee Notifications' : 'My Notifications'}</h1><p>{admin ? 'Saved messages, email status and employee read receipts.' : 'Your saved business updates and sign-in alerts.'}</p></div><div className="hr-actions"><button className="hr-btn" type="button" disabled={busy || loading || Boolean(error) || !(admin ? data?.ownerUnread : data?.unread)} onClick={markAllRead}>Mark all as read</button><button className="hr-btn" type="button" onClick={reload}>Refresh</button></div></div>
    {(error || actionError) && <p className="error" role="alert">{error || actionError}</p>}{notice && <p role="status" className="hr-alert">{notice}</p>}
    {admin && <form className="hr-card" onSubmit={send}><h2>Send employee notification</h2><div className="hr-form-grid">
      <label className="hr-field">Send to<select value={form.target} disabled={busy} onChange={(event) => change('target', event.target.value)}><option value="all">All employees</option>{(staff.data?.data || []).map((row) => <option key={row._id} value={row._id}>{row.name} ({row.employeeId})</option>)}</select></label>
      <label className="hr-field">Title<input required maxLength={200} disabled={busy} value={form.title} onChange={(event) => change('title', event.target.value)} /></label></div>
      <label className="hr-field">Message<textarea required maxLength={5000} disabled={busy} value={form.message} onChange={(event) => change('message', event.target.value)} /></label>
      <p>Saved in each employee inbox and queued for email from your connected business mailbox. Email failures can be retried from history.</p>
      <button className="hr-btn primary" disabled={busy || staff.loading || Boolean(staff.error)}>{busy ? 'Saving...' : 'Send Notification'}</button>{staff.error && <p className="error">{staff.error}</p>}
    </form>}
    <section className="hr-card"><div className="hr-form-grid three">
      <label className="hr-field">History<select value={month === 'all' ? 'all' : 'month'} onChange={(event) => { setMonth(event.target.value === 'all' ? 'all' : currentEmployeeMonth()); setPage(1); }}><option value="all">All history</option><option value="month">Selected month</option></select>{month !== 'all' && <input aria-label="Notification month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} />}</label>
      <label className="hr-field">{admin ? 'Employee read status' : 'Read status'}<select value={read} onChange={(event) => { setRead(event.target.value); setPage(1); }}><option value="">All messages</option><option value="unread">Not viewed in app</option><option value="read">Viewed in app</option></select></label>
      {admin && <label className="hr-field">Employee<select value={employee} onChange={(event) => { setEmployee(event.target.value); setPage(1); }}><option value="">All employees</option>{(staff.data?.data || []).map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></label>}
    </div><p>{data?.total || 0} messages{!admin && ` / ${data?.unread || 0} unread`}. {admin && 'Read receipts confirm viewing in the employee portal. Email acceptance does not confirm inbox delivery or email opening.'}</p>
    {loading ? <p role="status">Loading notifications...</p> : <div className="employee-notification-list">{(data?.data || []).map((row) => <article key={row._id} className={(admin ? row.ownerReadAt : row.readAt) ? 'is-read' : ''}>
      <div><strong>{row.title}</strong>{admin && !row.ownerReadAt && row.kind !== 'login-otp' && <span className="hr-pill">Unread</span>}<p>{admin ? `${row.employeeName} (${row.employeeId})` : row.kind === 'login-otp' ? 'Sign-in alert' : 'Business update'}</p><small>{when(row.createdAt)}</small></div>
      <div><span className="hr-pill">{row.emailStatus === 'Accepted' ? 'Email accepted' : `Email: ${row.emailStatus}`}</span><span className={`hr-pill ${row.readAt ? 'green' : ''}`}>{row.readAt ? 'Viewed in app' : 'Not viewed'}</span>{row.verifiedAt && <span className="hr-pill green">Login OTP verified</span>}</div>
      <div className="hr-actions"><button className="hr-btn" type="button" onClick={() => view(row)}>View message</button>{!admin && !row.readAt && <button className="hr-btn" type="button" onClick={() => view(row, false)}>Mark as read</button>}{admin && row.emailStatus === 'Failed' && row.kind !== 'login-otp' && row.attempts < 5 && <button className="hr-btn" disabled={busy} type="button" onClick={() => retry(row)}>Retry email</button>}</div>
    </article>)}{!data?.data?.length && <p>No notifications found.</p>}</div>}
    <div className="hr-actions"><button className="hr-btn" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="hr-btn" type="button" disabled={page * 50 >= (data?.total || 0)} onClick={() => setPage(page + 1)}>Next</button></div>
    {admin && <><EmployeeReportButtons kind="notifications" month={month === 'all' ? currentEmployeeMonth() : month} employeeId={(staff.data?.data || []).find((row) => row._id === employee)?.employeeId || ''} />{month === 'all' && <small>Downloads use the current month. Choose Selected month to export older history.</small>}</>}
    </section>
    {selected && <section className="hr-card employee-notification-detail" aria-label="Notification details"><div className="hr-page-head"><h2>{selected.title}</h2><button className="hr-btn" type="button" onClick={() => setSelected(null)}>Close message</button></div><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selected.message}</p><p>Recipient: {selected.recipientEmail || 'No email saved'}{selected.senderEmail && ` / From: ${selected.senderEmail}`}</p><p>{selected.readAt ? `Viewed in app: ${when(selected.readAt)}` : 'Not viewed in app yet'}</p>{selected.lastError && <p className="error">{selected.lastError}</p>}</section>}
  </div>;
}
