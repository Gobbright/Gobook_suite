import { BulkDeleteTable, BulkDeleteRow } from '../../../../../components/forms/BulkDeleteTable.jsx';
import { useMemo, useState } from 'react';
import { Check, Clock3, Download, Eye, FileText, Plus, Search, Upload, X } from 'lucide-react';
import { exportRows } from '../../../../../utils/exportRows.js';

import { useLoad } from '../../../hooks/useLoad.js';
import { adminService } from '../../../services/adminService.js';
import { leaveService } from '../../../services/leaveService.js';
import { LeaveNav } from './LeaveNav.jsx';
import { SERVER_ORIGIN } from '../../../../../services/apiBase.js';
import { openEmployeeAsset } from '../../../../../services/privateFiles.js';
import { getToken } from '../../../../../services/authToken.js';
import { currentEmployeeMonth } from '../../../services/monthScope.js';
import { MonthFilter } from '../../../components/common/MonthFilter.jsx';

const TYPES = ['Casual Leave', 'Sick Leave', 'Annual Leave', 'Unpaid Leave', 'Comp Off', 'Maternity Leave', 'Paternity Leave'];
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function countDays(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to || from}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusClass(status) {
  if (status === 'Approved') return 'hr-pill green';
  if (status === 'Rejected') return 'hr-pill red';
  return 'hr-pill amber';
}

function fileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LeaveRequests() {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error, setData } = useLoad(() => leaveService.adminLeaves(month), [month]);
  const employeesLoad = useLoad(adminService.employees, []);
  const leaves = useMemo(() => data?.data || [], [data]);
  const employees = useMemo(() => employeesLoad.data?.data || [], [employeesLoad.data]);
  const departments = [...new Set(employees.map((employee) => employee.dept).filter(Boolean))];
  const [tab, setTab] = useState('All Requests');
  const [status, setStatus] = useState('');
  const [dept, setDept] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ empId: '', type: 'Casual Leave', from: today(), to: today(), reason: '' });
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');

  const scoped = leaves.filter((row) => {
    const isMine = tab === 'My Requests' ? row.recordedBy !== 'Employee Portal' : true;
    const matchesQuery = !query || [row.name, row.empId, row.type, row.reason].some((value) => String(value || '').toLowerCase().includes(query.toLowerCase()));
    return isMine && matchesQuery && (!status || row.status === status) && (!dept || row.dept === dept) && (!type || row.type === type);
  });
  const pageSize = 6;
  const pages = Math.max(1, Math.ceil(scoped.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = scoped.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = scoped.find((row) => row._id === selectedId) || scoped[0];
  const pending = leaves.filter((row) => row.status === 'Pending').length;
  const approved = leaves.filter((row) => row.status === 'Approved').length;
  const rejected = leaves.filter((row) => row.status === 'Rejected').length;

  async function submitLeave(event) {
    event?.preventDefault();
    setSubmitError('');
    setSubmitMessage('');
    const empId = form.empId || employees[0]?.employeeId;
    if (!empId) {
      setSubmitError('Select an employee before submitting leave.');
      return;
    }
    if (!form.from || !form.to) {
      setSubmitError('From and to dates are required.');
      return;
    }
    setSubmitting(true);
    const days = countDays(form.from, form.to);
    try {
      let created;
      if (attachment) {
        const payload = new FormData();
        Object.entries({ ...form, empId, days }).forEach(([key, value]) => payload.append(key, value));
        payload.append('attachment', attachment);
        created = await leaveService.createAdminWithAttachment(payload);
      } else {
        created = await leaveService.createAdmin({ ...form, empId, days });
      }
      setData((current) => ({ data: [created, ...(current?.data || [])] }));
      setMonth(created.from.slice(0, 7));
      setSelectedId(created._id);
      setTab('All Requests');
      setStatus('');
      setDept('');
      setForm({ empId, type: 'Casual Leave', from: today(), to: today(), reason: '' });
      setAttachment(null);
      setSubmitMessage('Leave request submitted.');
      setApplyOpen(false);
    } catch (err) {
      setSubmitError(err.message || 'Unable to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function update(row, nextStatus) {
    const updated = await leaveService.updateStatus(row._id, nextStatus);
    setData((current) => ({ data: (current?.data || []).map((record) => record._id === updated._id ? updated : record) }));
  }

  return (
    <div className="hr-screen hr-leave-screen">
      <div className="hr-page-head"><div><h1>Leave Requests</h1><p>Review employee leave applications, approvals and balances.</p></div><div className="hr-actions"><button type="button" className="hr-btn" onClick={() => exportRows('Leave Requests', scoped, ['empId', 'name', 'type', 'from', 'to', 'days', 'reason', 'status'])}><Download size={16} />Export Leave Report</button><button type="button" className="hr-btn primary" onClick={() => setApplyOpen(true)}><Plus size={17} />Apply Leave</button></div></div>
      <div className="hr-leave-stats">{[['Total Requests', leaves.length, 'This account'], ['Pending Approval', pending, 'Requires action'], ['Approved Requests', approved, 'Approved leave'], ['Rejected Requests', rejected, 'Declined requests'], ['On Leave Today', leaves.filter((row) => row.status === 'Approved' && row.from <= today() && row.to >= today()).length, 'Approved absence']].map(([label, value, detail], index) => <section className="hr-stat-card" key={label}><span className={`hr-stat-icon ${['blue', 'orange', 'green', 'red', 'blue'][index]}`}>{index === 1 ? <Clock3 size={21} /> : <FileText size={21} />}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></section>)}</div>
      <div className="hr-leave-overview"><section className="hr-card"><h2>Leave Overview</h2><p>Requests at a glance</p><div>{[['Total applications', leaves.length], ['Approved', approved], ['Needs review', pending], ['Declined', rejected]].map(([label, value]) => <span key={label}><strong>{value}</strong><small>{label}</small></span>)}</div></section><section className="hr-card"><h2>Approval Performance</h2><p>Leave requests processed</p><strong>{leaves.length ? Math.round((approved + rejected) / leaves.length * 100) : 0}% Processed</strong><small>{approved + rejected} of {leaves.length} requests reviewed</small><div className="hr-snapshot-track"><span style={{ width: `${leaves.length ? (approved + rejected) / leaves.length * 100 : 0}%` }} /></div></section></div>
      <LeaveNav current="/employee-management/leave" />
      <div className="hr-toolbar"><MonthFilter month={month} onChange={(value) => { setMonth(value); setPage(1); setSelectedId(''); }} /></div>
      {error && <p className="error">{error}</p>}
      <div className="hr-leave-filters"><div className="hr-search"><Search size={16} /><input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search employee, leave type or reason..." /></div><select className="attendance-select" aria-label="Leave type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All Leave Types</option>{TYPES.map((item) => <option key={item}>{item}</option>)}</select><select className="attendance-select" aria-label="Leave status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All Status</option><option>Pending</option><option>Approved</option><option>Rejected</option></select></div>
      <div className="hr-tabs">{['All Requests', 'My Requests'].map((item) => <button key={item} className={tab === item ? 'active' : ''} type="button" onClick={() => { setTab(item); setPage(1); }}>{item}</button>)}</div>
      <div className="leave-request-layout">
        {applyOpen && <div className="hr-leave-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setApplyOpen(false); }}><form className="hr-card leave-apply-card" onSubmit={submitLeave} role="dialog" aria-modal="true" aria-label="Apply leave">
          <button className="hr-leave-dialog-close" type="button" onClick={() => setApplyOpen(false)} aria-label="Close"><X size={18} /></button>
          <h2>Apply Leave</h2>
          {submitError && <p className="error">{submitError}</p>}
          {submitMessage && <p className="leave-success-message">{submitMessage}</p>}
          <label className="hr-field">Employee<select value={form.empId} onChange={(e) => setForm((current) => ({ ...current, empId: e.target.value }))}><option value="">Select employee</option>{employees.map((employee) => <option key={employee._id} value={employee.employeeId}>{employee.name} ({employee.employeeId})</option>)}</select></label>
          <label className="hr-field">Leave Type<select value={form.type} onChange={(e) => setForm((current) => ({ ...current, type: e.target.value }))}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="hr-field">From<input type="date" value={form.from} onChange={(e) => setForm((current) => ({ ...current, from: e.target.value, to: current.to || e.target.value }))} /></label>
          <label className="hr-field">To<input type="date" value={form.to} onChange={(e) => setForm((current) => ({ ...current, to: e.target.value }))} /></label>
          <label className="hr-field">Reason<textarea value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Reason for leave" /></label>
          <label className="leave-upload">
            <Upload size={15} />
            {attachment ? attachment.name : 'Upload File'}
            <span>{attachment ? fileSize(attachment.size) : 'PDF, JPG, PNG (Max 5MB)'}</span>
            <input
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
            />
          </label>
          <button className="hr-btn primary full" type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
        </form></div>}
        <section className="hr-card leave-list-card">
          <div className="hr-toolbar">
            <select className="attendance-select" value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All Departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>
          </div>
          <div className="hr-table-wrap">
            <BulkDeleteTable onDeleteRecord={record => leaveService.remove(record._id)} onDeleted={ids => setData(current => ({ ...current, data: (current?.data || []).filter(row => !ids.includes(String(row._id))) }))} className="hr-table"><thead><tr><th>Employee</th><th>Leave Details</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead><tbody>
              {loading ? <tr><td colSpan={5}>Loading leaves...</td></tr> : null}
              {!loading && scoped.length === 0 ? <tr><td colSpan={5}>No leave requests found.</td></tr> : null}
              {visible.map((row) => <BulkDeleteRow record={row} key={row._id}><td><div className="hr-employee-cell"><span>{row.name?.[0] || 'E'}</span><div><strong>{row.name}</strong><small>{row.empId}</small></div></div></td><td>{row.type}<br /><small>{formatDate(row.from)} - {formatDate(row.to)}</small></td><td>{row.days} Day{row.days === 1 ? '' : 's'}</td><td><span className={statusClass(row.status)}>{row.status}</span></td><td><div className="row-actions"><button className="hr-icon-btn" type="button" onClick={() => update(row, 'Approved')} title="Approve"><Check size={14} /></button><button className="hr-icon-btn" type="button" onClick={() => update(row, 'Rejected')} title="Reject"><X size={14} /></button><button className="hr-icon-btn" type="button" onClick={() => setSelectedId(row._id)} title="View details"><Eye size={14} /></button></div></td></BulkDeleteRow>)}
            </tbody></BulkDeleteTable>
          </div>
          <div className="hr-table-footer hr-pagination"><span>Showing {scoped.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, scoped.length)} of {scoped.length} requests</span><div><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button><strong>{currentPage} / {pages}</strong><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button></div></div>
        </section>
        <aside className="hr-card leave-detail-card">
          <h2>Request Details</h2>
          {selected ? <>
            <div className="hr-employee-cell leave-detail-person"><span>{selected.name?.[0] || 'E'}</span><div><strong>{selected.name}</strong><small>{selected.empId}</small></div><i className={statusClass(selected.status)}>{selected.status}</i></div>
            {[
              ['Leave Type', selected.type],
              ['Duration', `${formatDate(selected.from)} - ${formatDate(selected.to)} (${selected.days} Day${selected.days === 1 ? '' : 's'})`],
              ['Reason', selected.reason || '-'],
              ['Applied On', formatDate(selected.applied)],
              ['Applied To', selected.recordedBy || 'HR Admin'],
            ].map(([key, value]) => <p className="hr-info-row" key={key}><span>{key}</span><strong>{value}</strong></p>)}
            {selected.attachment?.url ? (
              <a className="correction-document" href={`${SERVER_ORIGIN}${selected.attachment.url}`} onClick={(event) => { event.preventDefault(); openEmployeeAsset(selected.attachment.url, getToken()).catch((err) => setSubmitError(err.message)); }}>
                <FileText size={17} />
                <span>{selected.attachment.originalName || selected.attachment.fileName}<br /><small>{fileSize(selected.attachment.size)}</small></span>
                <Download size={15} />
              </a>
            ) : (
              <div className="correction-document"><FileText size={17} /><span>No attachment<br /><small>Upload file while submitting request</small></span></div>
            )}
            <div className="correction-actions"><button className="hr-btn primary" onClick={() => update(selected, 'Approved')}>Approve</button><button className="hr-btn danger" onClick={() => update(selected, 'Rejected')}>Reject</button></div>
          </> : <p>No request selected.</p>}
        </aside>
      </div>
      <section className="hr-card leave-workflow"><h2>Leave Workflow</h2>{['Employee raises leave request', 'Manager reviews request', 'Approve or reject action', 'Attendance updated', 'Leave balance updated'].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</section>
    </div>
  );
}
