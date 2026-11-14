import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { useLoad } from '../../hooks/useLoad.js';
import { adminService } from '../../services/adminService.js';
import { workService } from '../../services/workService.js';
import './workManagement.css';

const STATUSES = ['Assigned', 'In Progress', 'Completed'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const statusClass = (status) => status === 'Completed' ? 'is-completed' : status === 'In Progress' ? 'is-progress' : 'is-assigned';
const day = (date) => date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No due date';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function WorkDialog({ admin, task, staff, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const requestId = useRef(crypto.randomUUID());
  const [form, setForm] = useState({ title: task?.title || '', description: task?.description || '', dueDate: task?.dueDate || '', priority: task?.priority || 'Normal', status: task?.status || 'Assigned', note: task?.note || '', allEmployees: false, employeeIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assigning = !task;
  const employees = (staff.data?.data || []).filter((row) => ['Active', 'Probation', 'On Leave'].includes(row.status || 'Active'));
  useEffect(() => {
    const element = dialogRef.current;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; focus?.focus(); };
  }, []);
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); setError(''); requestId.current = crypto.randomUUID(); }
  async function save(event) {
    event.preventDefault();
    if (assigning && !form.allEmployees && !form.employeeIds.length) { setError('Select at least one employee.'); return; }
    setBusy(true); setError('');
    try {
      if (assigning) {
        const result = await workService.assign({ title: form.title, description: form.description, dueDate: form.dueDate, priority: form.priority, allEmployees: form.allEmployees, employeeIds: form.allEmployees ? [] : form.employeeIds, requestId: requestId.current });
        onSaved(result.message);
      } else {
        await workService.update(admin, task._id, { version: task.__v ?? 0, status: form.status, note: form.note, ...(admin ? { title: form.title, description: form.description, dueDate: form.dueDate, priority: form.priority } : {}) });
        onSaved(form.status === 'Completed' ? 'Work marked as completed.' : 'Work updated.');
      }
    } catch (failure) { setError(failure.message || 'Unable to save work. Please try again.'); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog ref={dialogRef} className="work-dialog" aria-labelledby="work-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header><div><span className="work-eyebrow">{assigning ? 'Create an assignment' : admin ? task.employeeName : 'Your assignment'}</span><h2 id="work-dialog-title">{assigning ? 'Assign work' : admin ? 'Manage work' : 'Work details'}</h2></div><button className="work-icon-button" type="button" aria-label="Close work details" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <form onSubmit={save}>
      {error && <p className="work-error" role="alert">{error}</p>}
      {admin ? <>
        <label className="work-field">Work title<input autoFocus required maxLength={160} disabled={busy} placeholder="What needs to be done?" value={form.title} onChange={(event) => change('title', event.target.value)} /></label>
        <label className="work-field">Instructions<textarea rows={3} maxLength={5000} disabled={busy} placeholder="Add the steps and expected result…" value={form.description} onChange={(event) => change('description', event.target.value)} /></label>
        <div className="work-form-grid"><label className="work-field">Due date<input type="date" disabled={busy} value={form.dueDate} onChange={(event) => change('dueDate', event.target.value)} /></label><label className="work-field">Priority<select disabled={busy} value={form.priority} onChange={(event) => change('priority', event.target.value)}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label></div>
      </> : <section className="work-instructions"><h3>{task.title}</h3><p>{task.description || 'No additional instructions.'}</p><div><span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority} priority</span><span><CalendarDays size={14} />{day(task.dueDate)}</span></div><small>Assigned by {task.assignedBy || 'your administrator'}</small></section>}
      {assigning ? <fieldset className="work-recipients" disabled={busy || staff.loading || Boolean(staff.error)}><legend>Assign to</legend>
        <label className="work-all-employees"><input type="checkbox" checked={form.allEmployees} onChange={(event) => change('allEmployees', event.target.checked)} /><span>All active employees<small>Each employee tracks their own progress.</small></span><Users size={18} /></label>
        {!form.allEmployees && <div className="work-employee-options">{employees.map((row) => <label key={row._id}><input type="checkbox" checked={form.employeeIds.includes(row._id)} onChange={(event) => change('employeeIds', event.target.checked ? [...form.employeeIds, row._id] : form.employeeIds.filter((id) => id !== row._id))} /><span>{row.name}<small>{row.employeeId}{row.dept ? ` · ${row.dept}` : ''}</small></span></label>)}{!staff.loading && !employees.length && <p>Add an active employee before assigning work.</p>}</div>}
        {staff.loading && <p role="status">Loading employees…</p>}{staff.error && <p className="work-error" role="alert">{staff.error}</p>}
        <small>{form.allEmployees ? `${employees.length} active employees` : `${form.employeeIds.length} employees selected`}</small>
      </fieldset> : <>
        <label className="work-field">Work status<select disabled={busy || (!admin && task.status === 'Completed')} value={form.status} onChange={(event) => change('status', event.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
        {!admin && task.status === 'Completed' && <p className="work-hint">Your work is completed. Your administrator can reopen it if needed.</p>}
        <label className="work-field">Progress / completion note<textarea rows={3} maxLength={2000} disabled={busy} placeholder="Add an update or describe the completed work…" value={form.note} onChange={(event) => change('note', event.target.value)} /></label>
        {task.completedAt && <p className="work-hint">Completed {day(task.completedAt)}</p>}
      </>}
      <footer><button className="work-button" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="work-button is-primary" type="submit" disabled={busy || (assigning && (staff.loading || Boolean(staff.error) || !employees.length))}>{busy ? 'Saving…' : assigning ? 'Assign work' : 'Save update'}</button></footer>
    </form>
  </dialog>, document.body);
}

export default function WorkManagement({ admin = false }) {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const employee = admin ? params.get('employee') || '' : '';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(q);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const result = useLoad(() => workService.list(admin, { status, employee, q, page }), [admin, status, employee, q, page], { keepPreviousData: true });
  const staff = useLoad(() => admin ? adminService.employees() : Promise.resolve({ data: [] }), [admin]);
  const { data, loading, error, reload } = result;
  const summary = data?.summary || {};
  useEffect(() => { setSearch(q); }, [q]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') reload(); };
    const timer = setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [reload]);
  function filter(key, value) { setParams((current) => { const next = new URLSearchParams(current); next.delete('page'); if (value) next.set(key, value); else next.delete(key); return next; }); }
  function saved(message) { setDialog(null); setNotice(message); reload(); window.dispatchEvent(new Event('employee:work-changed')); }
  return <div className="work-screen">
    <header className="work-heading"><div><span className="work-eyebrow">{admin ? 'Your team, working together' : 'Focus on what comes next'}</span><h1>{admin ? 'Work Management' : 'My Work'}</h1><p>{admin ? 'Assign responsibilities and follow every employee’s progress.' : 'Your assigned work, progress updates and completed tasks.'}</p></div><div className="work-heading-actions"><button className="work-button" type="button" onClick={reload} aria-label="Refresh work"><RefreshCw size={16} />Refresh</button>{admin && <button className="work-button is-primary" type="button" onClick={() => setDialog({ task: null })}><Plus size={17} />Assign work</button>}</div></header>
    {notice && <p className="work-notice" role="status">{notice}</p>}
    {error && <div className="work-error" role="alert">{error}<button className="work-button" type="button" onClick={reload}>Try again</button></div>}
    <div className="work-stats" aria-busy={loading}>{[[ClipboardList, 'Total Work', summary.total, 'all'], [Clock3, 'Assigned', summary.assigned, 'assigned'], [Clock3, 'In Progress', summary.inProgress, 'progress'], [CheckCircle2, 'Completed', summary.completed, 'completed']].map(([Icon, label, value, tone]) => <section className={`work-stat tone-${tone}`} key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{value == null || (error && !data) ? '—' : value}</strong></div></section>)}</div>
    <section className="work-board" aria-label={admin ? 'Team work assignments' : 'My assigned work'}>
      <div className="work-board-toolbar"><div className="work-tabs" aria-label="Filter work status">{[['', 'All Work'], ['Assigned', 'Assigned'], ['In Progress', 'In Progress'], ['Completed', 'Completed']].map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => filter('status', value)}>{label}</button>)}</div>{summary.overdue > 0 && <span className="work-overdue-count">{summary.overdue} overdue</span>}</div>
      <div className="work-filters"><form className="work-search" onSubmit={(event) => { event.preventDefault(); filter('q', search.trim()); }}><Search size={17} /><input aria-label="Search work" placeholder={admin ? 'Search work or employee…' : 'Search your work…'} maxLength={160} value={search} onChange={(event) => setSearch(event.target.value)} /><button type="submit">Search</button></form>{admin && <select aria-label="Filter by employee" value={employee} onChange={(event) => filter('employee', event.target.value)}><option value="">All employees</option>{(staff.data?.data || []).map((row) => <option key={row._id} value={row._id}>{row.name} ({row.employeeId})</option>)}</select>}</div>
      {loading && !data ? <div className="work-empty" role="status">Loading work…</div> : !data?.data?.length ? <div className="work-empty"><ClipboardList size={34} /><h2>{error ? 'Work could not be loaded' : 'No work here yet'}</h2><p>{error ? 'Try refreshing this page.' : status || q || employee ? 'Try another filter to find your work.' : admin ? 'Assign a task to get your team started.' : 'Work assigned by your administrator will appear here.'}</p>{!error && admin && <button className="work-button is-primary" type="button" onClick={() => setDialog({ task: null })}><Plus size={16} />Assign work</button>}</div> : <div className="work-card-grid" aria-busy={loading}>{data.data.map((task) => {
        const overdue = task.dueDate && task.dueDate < today() && task.status !== 'Completed';
        return <article className={`work-task-card ${statusClass(task.status)}`} key={task._id}>
          <div className="work-task-tags"><span className={`work-status ${statusClass(task.status)}`}><i />{task.status}</span><span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span></div>
          <h2>{task.title}</h2><p className="work-task-description">{task.description || 'No additional instructions.'}</p>
          {admin && <div className="work-assignee"><span>{task.employeeName?.slice(0, 1) || 'E'}</span><div><strong>{task.employeeName}</strong><small>{task.employeeId}</small></div></div>}
          <div className={`work-task-due${overdue ? ' is-overdue' : ''}`}><CalendarDays size={15} /><span>{day(task.dueDate)}{overdue ? ' · Overdue' : ''}</span></div>
          {task.note && <p className="work-task-note">{task.note}</p>}
          <footer><small>{task.completedAt ? `Completed ${day(task.completedAt)}` : `Assigned ${day(task.createdAt)}`}</small><button className="work-button" type="button" onClick={() => setDialog({ task })}>{admin ? 'Manage work' : task.status === 'Completed' ? 'View details' : 'Update work'}</button></footer>
        </article>;
      })}</div>}
      {data && <div className="work-pagination"><span>{data.total} assignment{data.total === 1 ? '' : 's'}{loading ? ' · Refreshing…' : ''}</span><div><button className="work-button" type="button" disabled={page <= 1 || loading} onClick={() => filter('page', String(page - 1))}>Previous</button><span>Page {page}</span><button className="work-button" type="button" disabled={page * 12 >= data.total || loading} onClick={() => filter('page', String(page + 1))}>Next</button></div></div>}
    </section>
    {dialog && <WorkDialog admin={admin} task={dialog.task} staff={staff} onClose={() => setDialog(null)} onSaved={saved} />}
  </div>;
}
