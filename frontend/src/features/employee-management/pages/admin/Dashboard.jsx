import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  Clock3,
  FileText,
  ShieldAlert,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  CalendarDays,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatCard } from '../../components/common/StatCard.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { adminService } from '../../services/adminService.js';
import { payrollService } from '../../services/payrollService.js';
import { attendanceService } from '../../services/attendanceService.js';
import { payrollMonth } from './payroll/PayrollNav.jsx';

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'EM';
}

function dashboardDate(date) {
  if (!date) return 'Employee operations overview';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function Dashboard() {
  const { data, loading, error } = useLoad(adminService.dashboard, []);
  const employeeLoad = useLoad(adminService.employees, []);
  const payrollLoad = useLoad(() => payrollService.adminPayroll(payrollMonth()), []);
  const attendanceHistory = useLoad(() => attendanceService.adminMonthly(payrollMonth()), []);
  const stats = data || {};
  const recentEmployees = stats.recentEmployees || [];
  const attendanceRate = Number(stats.attendanceRate || 0);
  const activeEmployees = Number(stats.activeEmployees || 0);
  const present = Number(stats.present || 0);
  const absent = Number(stats.absent || 0);
  const late = Number(stats.late || 0);
  const notMarked = Number(stats.notMarked || 0);
  const pendingLeaves = Number(stats.pendingLeaves || 0);
  const pendingCorrections = Number(stats.pendingCorrections || 0);
  const pendingPermissions = Number(stats.pendingPermissions || 0);
  const approvalLoad = pendingLeaves + pendingCorrections + pendingPermissions;
  const watchCount = absent + late + notMarked;
  const allEmployees = employeeLoad.data?.data || [];
  const newJoiners = allEmployees.filter((employee) => {
    const date = new Date(employee.joinDate);
    const now = new Date();
    return !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const payrollRows = payrollLoad.data?.data || [];
  const payrollPaid = payrollRows.filter((row) => row.status === 'Paid').length;
  const payrollStatus = payrollRows.length ? payrollPaid === payrollRows.length ? 'Complete' : 'In progress' : 'Not run';
  const departmentEntries = Object.entries(allEmployees.reduce((result, employee) => {
    const name = employee.dept || 'Other';
    result[name] = (result[name] || 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]);
  const departmentCounts = departmentEntries.length <= 6 ? departmentEntries : [
    ...departmentEntries.slice(0, 5),
    ['Others', departmentEntries.slice(5).reduce((sum, [, count]) => sum + count, 0)],
  ];
  const totalForDepartments = departmentCounts.reduce((sum, [, count]) => sum + count, 0);
  let departmentPosition = 0;
  const departmentGradient = totalForDepartments ? `conic-gradient(${departmentCounts.map(([, count], index) => {
    const start = departmentPosition;
    departmentPosition += count / totalForDepartments * 100;
    return `${['#1463f5', '#12b76a', '#f59e0b', '#9355ea', '#e35aa2', '#94a3b8'][index]} ${start}% ${departmentPosition}%`;
  }).join(', ')})` : '#e8effb';
  const attendanceGradient = activeEmployees ? `conic-gradient(#19ba6b 0 ${present / activeEmployees * 100}%, #f6a522 ${present / activeEmployees * 100}% ${(present + late) / activeEmployees * 100}%, #ef4a55 ${(present + late) / activeEmployees * 100}% ${(present + late + absent) / activeEmployees * 100}%, #e1e8f4 ${(present + late + absent) / activeEmployees * 100}% 100%)` : '#e8effb';
  const attendanceDates = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - index));
    return new Date(day.getTime() - day.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const historyRows = attendanceHistory.data?.data || [];
  const trend = attendanceDates.map((date) => {
    const dayRows = historyRows.filter((row) => row.date === date);
    return { date, rate: dayRows.length && activeEmployees ? Math.round(dayRows.filter((row) => ['Present', 'Late', 'WFH', 'On Duty'].includes(row.status)).length / activeEmployees * 100) : null };
  });
  const healthItems = [
    {
      icon: ShieldAlert,
      tone: watchCount > 0 ? 'amber' : 'green',
      label: 'Attendance Watch',
      value: loading ? '--' : watchCount,
      detail: watchCount > 0 ? `${absent} absent, ${late} late, ${notMarked} not marked` : 'No attendance exceptions today',
      to: '/employee-management/attendance',
    },
    {
      icon: ClipboardCheck,
      tone: approvalLoad > 0 ? 'rose' : 'green',
      label: 'Approval Queue',
      value: loading ? '--' : approvalLoad,
      detail: approvalLoad > 0 ? 'Review leave, permission and correction requests' : 'All approvals are clear',
      to: pendingPermissions ? '/employee-management/leave/permissions' : pendingCorrections ? '/employee-management/attendance/corrections' : '/employee-management/leave',
    },
    {
      icon: Sparkles,
      tone: 'blue',
      label: 'Recent Joiners',
      value: loading ? '--' : newJoiners,
      detail: newJoiners > 0 ? 'Check profiles and document readiness' : 'Add employees to begin onboarding',
      to: '/employee-management/employees',
    },
  ];
  const attendanceItems = [
    ['Present', present, 'green'],
    ['Late', late, 'amber'],
    ['Absent', absent, 'red'],
    ['Not Marked', notMarked, 'gray'],
  ];

  return (
    <div className="employee-admin-dashboard">
      <PageHeader
        title="Employee Management Dashboard"
        subtitle="Overview of your workforce, attendance, leave, payroll, and approvals."
        action={<span className="hr-dashboard-date"><CalendarDays size={17} />{dashboardDate(stats.date)}</span>}
      />

      {error && <p className="error">{error}</p>}

      <div className="grid stats dashboard-stats">
        <StatCard label="Total Employees" value={stats.employees || 0} detail={`${activeEmployees} active`} icon={Users} tone="blue" loading={loading} />
        <StatCard label="Present Today" value={present} detail={`${attendanceRate}% attendance`} icon={UserCheck} tone="green" loading={loading} />
        <StatCard label="On Leave" value={stats.onLeave || 0} detail="Approved absence" icon={Clock3} tone="amber" loading={loading} />
        <StatCard label="Pending Approvals" value={approvalLoad} detail="Leave and attendance" icon={ClipboardCheck} tone="violet" loading={loading} />
        <StatCard label="Payroll Status" value={payrollStatus} detail={`${payrollPaid} of ${payrollRows.length} paid this month`} icon={Wallet} tone="blue" loading={payrollLoad.loading} />
        <StatCard label="New Joiners" value={newJoiners} detail="This month" icon={UserPlus} tone="blue" loading={employeeLoad.loading} />
      </div>

      <div className="dashboard-grid dashboard-grid-top">
        <section className="card dashboard-panel attendance-panel">
          <div className="dashboard-panel-head">
            <div>
              <h2>Today Attendance</h2>
              <p>{stats.activeEmployees || 0} active employees</p>
            </div>
            <Link to="/employee-management/attendance">View attendance<ArrowRight size={15} /></Link>
          </div>

          <div className="attendance-rate"><div className="hr-dashboard-attendance-chart" style={{ background: attendanceGradient }}><div><strong>{loading ? '--' : `${attendanceRate}%`}</strong><span>Attendance</span></div></div></div>

          <div className="attendance-breakdown">
            {attendanceItems.map(([label, value, tone]) => (
              <div key={label}>
                <span className={`attendance-dot attendance-dot-${tone}`} />
                <span>{label}</span>
                <strong>{loading ? '--' : value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card dashboard-panel department-panel">
          <div className="dashboard-panel-head"><div><h2>Department Distribution</h2><p>Employee count by department</p></div></div>
          {departmentCounts.length ? <div className="hr-department-content"><div className="hr-department-donut" style={{ background: departmentGradient }}><span><strong>{totalForDepartments}</strong><small>Total</small></span></div><div className="hr-department-list">{departmentCounts.map(([name, count], index) => <div key={name}><span className="hr-department-dot" style={{ background: ['#1463f5', '#12b76a', '#f59e0b', '#9355ea', '#e35aa2', '#94a3b8'][index] }} /><span>{name}</span><strong>{count} <small>({Math.round(count / totalForDepartments * 100)}%)</small></strong></div>)}</div></div> : <p className="empty dashboard-empty">No employees yet.</p>}
        </section>

        <section className="card dashboard-panel quick-actions-panel">
          <div className="dashboard-panel-head">
            <div><h2>Quick Actions</h2><p>Common employee operations</p></div>
          </div>
          <nav className="dashboard-actions" aria-label="Employee quick actions">
            <Link to="/employee-management/employees/add"><span className="action-icon action-icon-blue"><UserPlus size={18} /></span><span><strong>Add Employee</strong><small>Create profile and login</small></span><ArrowRight size={16} /></Link>
            <Link to="/employee-management/attendance"><span className="action-icon action-icon-green"><CalendarCheck size={18} /></span><span><strong>Attendance</strong><small>Review today records</small></span><ArrowRight size={16} /></Link>
            <Link to="/employee-management/leave"><span className="action-icon action-icon-amber"><Clock3 size={18} /></span><span><strong>Leave Requests</strong><small>Approve pending leave</small></span><ArrowRight size={16} /></Link>
            <Link to="/employee-management/payroll/processing"><span className="action-icon action-icon-violet"><Wallet size={18} /></span><span><strong>Payroll Run</strong><small>Process monthly salary</small></span><ArrowRight size={16} /></Link>
          </nav>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="card dashboard-panel recent-employees-panel">
          <div className="dashboard-panel-head">
            <div><h2>Recent Employees</h2><p>Latest employee profiles</p></div>
            <Link to="/employee-management/employees">View all<ArrowRight size={15} /></Link>
          </div>
          {loading ? (
            <div className="dashboard-list-loading"><span /><span /><span /></div>
          ) : recentEmployees.length ? (
            <div className="recent-employee-list">
              {recentEmployees.map((employee) => (
                <Link key={employee._id} to="/employee-management/employees" className="recent-employee-row">
                  <span className="employee-avatar">{initials(employee.name)}</span>
                  <span className="employee-summary"><strong>{employee.name}</strong><small>{employee.employeeId} - {employee.designation || employee.dept || 'Employee'}</small></span>
                  <span className={`employee-status employee-status-${String(employee.status).toLowerCase()}`}>{employee.status}</span>
                </Link>
              ))}
            </div>
          ) : <p className="empty dashboard-empty">No employees added yet.</p>}
        </section>

        <section className="card dashboard-panel pending-panel">
          <div className="dashboard-panel-head"><div><h2>Pending Actions</h2><p>Items requiring review</p></div></div>
          <Link to="/employee-management/leave" className="pending-row"><span className="action-icon action-icon-amber"><Clock3 size={18} /></span><span><strong>Leave requests</strong><small>Awaiting approval</small></span><b>{loading ? '--' : stats.pendingLeaves || 0}</b></Link>
          <Link to="/employee-management/attendance/corrections" className="pending-row"><span className="action-icon action-icon-rose"><ClipboardCheck size={18} /></span><span><strong>Corrections</strong><small>Attendance changes</small></span><b>{loading ? '--' : stats.pendingCorrections || 0}</b></Link>
          <Link to="/employee-management/leave/permissions" className="pending-row"><span className="action-icon action-icon-amber"><Clock3 size={18} /></span><span><strong>Permission requests</strong><small>Time away requests</small></span><b>{loading ? '--' : pendingPermissions}</b></Link>
          <Link to="/employee-management/payroll/payslips" className="pending-row"><span className="action-icon action-icon-violet"><FileText size={18} /></span><span><strong>Payslips</strong><small>Review generated salary slips</small></span><b><ArrowRight size={15} /></b></Link>
        </section>
        <section className="card dashboard-panel hr-trend-panel">
          <div className="dashboard-panel-head"><div><h2>Attendance Trend</h2><p>Recorded attendance during the last 7 days</p></div></div>
          {trend.some((day) => day.rate != null) ? <div className="hr-trend-chart">
            <svg viewBox="0 0 348 156" role="img" aria-label="Seven day attendance trend">
              {[30, 85, 140].map((y) => <line key={y} x1="30" x2="318" y1={y} y2={y} stroke="#e6edf9" />)}
              {trend.slice(1).map((day, index) => day.rate != null && trend[index].rate != null ? <line key={day.date} x1={30 + index * 48} y1={140 - trend[index].rate * 1.1} x2={30 + (index + 1) * 48} y2={140 - day.rate * 1.1} stroke="#155bf1" strokeWidth="3" /> : null)}
              {trend.map((day, index) => day.rate != null ? <circle key={day.date} cx={30 + index * 48} cy={140 - day.rate * 1.1} r="4" fill="#155bf1" /> : null)}
            </svg>
            <div>{trend.map((day) => <span key={day.date}>{new Date(`${day.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}<small>{day.rate == null ? '—' : `${day.rate}%`}</small></span>)}</div>
          </div> : <p className="empty dashboard-empty">No attendance recorded in the last 7 days.</p>}
        </section>
      </div>
      <section className="dashboard-focus-grid" aria-label="Employee operations focus">
        {healthItems.map(({ icon: Icon, tone, label, value, detail, to }) => (
          <Link className={`dashboard-focus-card focus-${tone}`} to={to} key={label}>
            <span className="dashboard-focus-icon"><Icon size={18} /></span>
            <span className="dashboard-focus-copy"><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
            <ArrowRight size={16} />
          </Link>
        ))}
      </section>
    </div>
  );
}
