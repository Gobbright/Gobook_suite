import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, ClipboardList, FileText, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatCard } from '../../components/common/StatCard.jsx';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { currentEmployeeMonth, monthQuery } from '../../services/monthScope.js';

export default function Dashboard() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error } = useLoad(() => api.get('/employee/dashboard' + monthQuery(month)), [month]);
  const stats = data || {};
  return <><PageHeader title={user?.name ? 'Welcome, ' + user.name : 'Employee Dashboard'} subtitle={[user?.businessName, user?.employeeId].filter(Boolean).join(' · ')} action={<MonthFilter month={month} onChange={setMonth} />} />
    {error && <p className="error">{error}</p>}
    <div className="hr-actions" style={{ marginBottom: 18 }}><Link className="btn primary" to="/employee/attendance">Mark Attendance</Link><Link className="btn" to="/employee/leave/apply">Apply Leave</Link><Link className="btn" to="/employee/permissions">Request Permission</Link><Link className="btn" to="/employee/profile">My Profile</Link><Link className="btn" to="/employee/documents">My Documents</Link></div>
    <div className="grid stats">{[['Present Days', stats.presentDays, CalendarCheck], ['Pending Leaves', stats.pendingLeaves, ClipboardList], ['Pending Permissions', stats.pendingPermissions, ClipboardList], ['My Documents', stats.documents, FileText]].map(([label, value, Icon]) => <StatCard key={label} label={label} value={loading ? '…' : value || 0} icon={Icon} />)}</div>
    <section className="card"><h2>Payroll · {month}</h2><p>{loading ? 'Loading…' : stats.salary ? '₹' + Number(stats.salary.net || 0).toLocaleString('en-IN') + ' · ' + stats.salary.status : 'No payroll has been recorded for this month.'}</p><Link to="/employee/payslips">View Payslip</Link></section>
    <section className="card"><h2>Recent Attendance</h2><DataTable columns={[{ key: 'date', label: 'Date' }, { key: 'checkIn', label: 'Check In' }, { key: 'checkOut', label: 'Check Out' }, { key: 'hours', label: 'Hours' }, { key: 'status', label: 'Status' }]} rows={stats.recentAttendance || []} /></section>
  </>;
}
