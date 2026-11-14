import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { adminService } from '../../services/adminService.js';
import { useLoad } from '../../hooks/useLoad.js';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import './employeeUpdates.css';

export function EmployeeUpdates({ compact = false }) {
  const [kind, setKind] = useState('');
  const [cursors, setCursors] = useState(['']);
  const before = cursors.at(-1);
  const { data, loading, error, reload } = useLoad(() => adminService.updates({ kind, before }), [kind, before], { keepPreviousData: true });
  const rows = compact ? data?.data?.slice(0, 5) : data?.data;
  return <section className="hr-screen employee-updates">
    {compact ? <div className="employee-updates-heading"><h2>Employee updates</h2><Link to="/employee-management/updates">View all</Link></div> : <PageHeader title="Employee Updates" subtitle="Saved leave, permissions, attendance, work progress and message receipts from your team" action={<button className="hr-btn" type="button" onClick={reload}><RefreshCw size={16} />Refresh</button>} />}
    {!compact && <label className="hr-field">Update type<select value={kind} onChange={e => { setKind(e.target.value); setCursors(['']); }}><option value="">All updates</option>{[['leave', 'Leave'], ['permission', 'Permissions'], ['attendance', 'Attendance'], ['correction', 'Corrections'], ['work', 'Work'], ['receipt', 'Message receipts']].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
    {error && <p className="error" role="alert">{error}<button className="hr-btn" type="button" onClick={reload}>Try again</button></p>}
    {loading && !data && <p role="status">Loading employee updates…</p>}
    <div className="employee-updates-list" aria-busy={loading}>{(rows || []).map(row => <article key={`${row.id}:${row.at}`}><div><strong>{row.employeeName} <span>{row.employeeId}</span></strong><h3>{row.title}<span className="hr-pill">{row.status}</span></h3><p>{row.message}</p><time dateTime={row.at}>{new Date(row.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</time></div><Link className="hr-btn" to={row.href}>View record</Link></article>)}</div>
    {!loading && !error && !rows?.length && <p>No employee updates recorded yet.</p>}
    {!compact && <div className="hr-actions"><button className="hr-btn" type="button" disabled={cursors.length === 1 || loading} onClick={() => setCursors(current => current.slice(0, -1))}>Previous</button><span>Page {cursors.length}</span><button className="hr-btn" type="button" disabled={!data?.nextCursor || loading} onClick={() => setCursors(current => [...current, data.nextCursor])}>Next</button></div>}
  </section>;
}
