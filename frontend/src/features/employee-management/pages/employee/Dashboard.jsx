import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarCheck, ChevronRight, ClipboardList, FileText, RefreshCw, Timer, Wallet } from 'lucide-react';
import { StatCard } from '../../components/common/StatCard.jsx';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../services/api.js';
import { currentEmployeeMonth, monthQuery } from '../../services/monthScope.js';
import { employeeScreenPath } from '../../services/portalPaths.js';
import { EmployeeWorkOverview } from '../../components/common/EmployeeWorkOverview.jsx';
import { EmployeeNotificationOverview } from '../../components/common/EmployeeNotificationOverview.jsx';

function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function EmployeeDashboardContent({ user, month, setMonth, data, loading, error, reload }) {
  const stats = data || {};
  const initials = (user?.name || 'Employee').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const path = (screen) => employeeScreenPath(user, screen);
  const shortcuts = [
    ['Apply Leave', 'Plan your time away', 'leave/apply', ClipboardList, 'violet'],
    ['Request Permission', 'Request a few hours off', 'permissions', Timer, 'amber'],
    ['My Documents', 'Your files, in one place', 'documents', FileText, 'teal'],
  ];
  return <div className="employee-home">
    <section className="employee-welcome">
      <div className="employee-welcome-main"><span className="employee-welcome-avatar" aria-hidden="true">{initials}</span><div><span className="employee-eyebrow">Employee dashboard</span><h1>{user?.name ? 'Welcome, ' + user.name : 'Employee Dashboard'}</h1><p>{[user?.businessName, user?.employeeId].filter(Boolean).join(' · ')}</p><span className="employee-welcome-description">Your work, attendance and team updates in one place.</span></div></div>
      <div className="employee-welcome-period"><span className="employee-today">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span><MonthFilter month={month} onChange={setMonth} /></div>
    </section>

    {error && <div className="employee-dashboard-error" role="alert"><span>{error}</span><button className="btn" type="button" onClick={reload}><RefreshCw size={15} />Try again</button></div>}

    <section className="employee-shortcuts" aria-label="Quick actions">
      <Link className="employee-attendance-shortcut" to={path('attendance')}><span className="employee-shortcut-icon"><CalendarCheck size={24} /></span><div><strong>Mark Attendance</strong><span>Check in or out for today.</span></div><ArrowUpRight size={22} aria-hidden="true" /></Link>
      {shortcuts.map(([label, description, screen, Icon, tone]) => <Link className={`employee-shortcut employee-shortcut-${tone}`} to={path(screen)} key={screen}><span className="employee-shortcut-icon"><Icon size={21} /></span><div><strong>{label}</strong><span>{description}</span></div><ChevronRight size={16} aria-hidden="true" /></Link>)}
    </section>

    <div className="employee-home-updates"><EmployeeWorkOverview user={user} /><EmployeeNotificationOverview user={user} /></div>

    <section aria-labelledby="employee-month-summary">
      <div className="employee-section-heading"><div><span className="employee-eyebrow">Monthly overview</span><h2 id="employee-month-summary">Your month at a glance</h2></div><span className="employee-period-label">{monthLabel(month)}</span></div>
      <div className="grid stats employee-summary-stats" aria-busy={loading}>
        {[
          ['Present Days', stats.presentDays, CalendarCheck, 'green', 'Attendance this month'],
          ['Pending Leaves', stats.pendingLeaves, ClipboardList, 'blue', 'Awaiting a decision'],
          ['Pending Permissions', stats.pendingPermissions, Timer, 'amber', 'Awaiting a decision'],
          ['My Documents', stats.documents, FileText, 'rose', 'Shared by your business'],
        ].map(([label, value, Icon, tone, detail]) => <StatCard key={label} label={label} value={error ? '—' : value ?? 0} icon={Icon} tone={tone} detail={detail} loading={loading} />)}
      </div>
    </section>

    <div className="employee-home-details">
      <section className="card employee-recent-attendance" aria-labelledby="employee-attendance-title">
        <div className="employee-section-heading"><div><h2 id="employee-attendance-title">Recent Attendance</h2><p>Your latest activity in {monthLabel(month)}.</p></div><Link className="employee-text-link" to={path('attendance/monthly')}>View all<ArrowUpRight size={15} /></Link></div>
        {loading ? <div className="employee-dashboard-placeholder" role="status">Loading attendance…</div> : error ? <div className="employee-dashboard-placeholder">Attendance could not be loaded.</div> : <DataTable showCount={false} showSerial={false} columns={[
          { key: 'date', label: 'Date', render: (row) => <strong>{new Date(`${row.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong> },
          { key: 'checkIn', label: 'Check In' }, { key: 'checkOut', label: 'Check Out' }, { key: 'hours', label: 'Hours' },
          { key: 'status', label: 'Status', render: (row) => <span className={`employee-attendance-badge ${['Present', 'WFH', 'On Duty'].includes(row.status) ? 'is-present' : row.status === 'Absent' ? 'is-absent' : 'is-other'}`}>{row.status || 'Not marked'}</span> },
        ]} rows={stats.recentAttendance || []} empty="No attendance recorded for this month yet." />}
      </section>
      <section className="card employee-payroll-card" aria-labelledby="employee-payroll-title">
        <span className="employee-payroll-icon" aria-hidden="true"><Wallet size={24} /></span><span className="employee-eyebrow">Your earnings</span><h2 id="employee-payroll-title">Monthly payslip</h2><p>{monthLabel(month)}</p>
        {loading ? <div className="employee-dashboard-placeholder" role="status">Loading payroll…</div> : error ? <p className="employee-payroll-empty">Payroll could not be loaded.</p> : stats.salary ? <div className="employee-payroll-amount"><span>Net pay</span><strong>{Number(stats.salary.net || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })}</strong><span className="employee-payroll-status">{stats.salary.status}</span></div> : <p className="employee-payroll-empty">Your payslip will appear here once payroll is recorded for this month.</p>}
        <Link className="btn employee-payslip-link" to={path('payslips')}>View Payslip<ArrowUpRight size={16} /></Link>
      </section>
    </div>
    <p className="employee-home-footer">Need to update your details? <Link to={path('profile')}>View My Profile<ChevronRight size={14} /></Link></p>
  </div>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentEmployeeMonth);
  const result = useLoad(() => api.get('/employee/dashboard' + monthQuery(month)), [month]);
  return <EmployeeDashboardContent user={user} month={month} setMonth={setMonth} {...result} />;
}
