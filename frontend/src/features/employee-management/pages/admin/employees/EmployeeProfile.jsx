import EmployeeDocuments from './EmployeeDocuments.jsx';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLoad } from '../../../hooks/useLoad.js';
import { adminService } from '../../../services/adminService.js';
import { currentEmployeeMonth } from '../../../services/monthScope.js';
import { MonthFilter } from '../../../components/common/MonthFilter.jsx';
import { EmployeeAccessCard } from '../../../components/common/EmployeeAccessCard.jsx';
import { DataTable } from '../../../components/common/DataTable.jsx';
import { EmployeePhoto } from '../../../components/common/EmployeePhoto.jsx';
import { getToken } from '../../../../../services/authToken.js';

export default function EmployeeProfile({ employeeId }) {
  const params = useParams();
  const id = employeeId || params.id;
  const [month, setMonth] = useState(currentEmployeeMonth);
  const [tab, setTab] = useState('Overview');
  const { data, loading, error, reload } = useLoad(() => adminService.employeeOverview(id, month), [id, month]);
  const employee = data?.employee;
  if (loading) return <section className="hr-card">Loading employee profile…</section>;
  if (error) return <p className="error">{error}</p>;
  if (!employee) return <section className="hr-card">Employee not found.</section>;
  const facts = [['Employee ID', employee.employeeId], ['Name', employee.name], ['Email', employee.email], ['Phone', employee.phone], ['Gender', employee.gender], ['Date of Birth', employee.dateOfBirth], ['Blood Group', employee.bloodGroup], ['Address', employee.address], ['Department', employee.dept], ['Designation', employee.designation], ['Branch', employee.branch], ['Manager', employee.reportingManager], ['Joining Date', employee.joinDate], ['Employment Type', employee.employmentType], ['Shift', employee.shift], ['Work Location', employee.workLocation], ['Emergency Name', employee.emergencyContact?.name], ['Emergency Phone', employee.emergencyContact?.phone], ['Emergency Relationship', employee.emergencyContact?.relationship], ['Status', employee.status], ['Role', employee.employeeRole], ['Category', employee.category], ['Login Access', employee.loginAccess ? 'Enabled' : 'Disabled'], ['Basic Salary', Number(employee.basicSalary || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })], ...Object.entries(employee.salaryStructure || {}).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })])];
  const views = { Attendance: { rows: data.attendance, columns: ['date', 'checkIn', 'checkOut', 'hours', 'status'] }, Leave: { rows: data.leaves, columns: ['type', 'from', 'to', 'days', 'status'] }, Payroll: { rows: data.payroll, columns: ['month', 'basic', 'allowances', 'deductions', 'net', 'status'] }, Permissions: { rows: data.permissions, columns: ['date', 'fromTime', 'toTime', 'reason', 'status'] } };
  const view = views[tab];
  return <div className="hr-screen"><div className="hr-page-head"><div><h1>{employee.name}</h1><p>{employee.employeeId} · {employee.status}</p></div><div className="hr-actions"><MonthFilter month={month} onChange={setMonth} /><button className="hr-btn" type="button" onClick={() => setTab('Login & QR')}>Reset Password</button><Link className="hr-btn" to={'/employee-management/employees/add?edit=' + id}>Edit Employee</Link><Link className="hr-btn" to={'/employee-management/employees/' + id + '/documents'}>Documents ({data.documents})</Link></div></div>
    <EmployeePhoto employee={employee} token={getToken()} /><div className="hr-profile-grid">{[['Present Days', data.attendance.filter((row) => ['Present', 'Late', 'WFH', 'On Duty'].includes(row.status)).length], ['Pending Leaves', data.leaves.filter((row) => row.status === 'Pending').length], ['Basic Salary', '₹' + Number(employee.basicSalary || 0).toLocaleString('en-IN')], ['Documents', data.documents]].map(([label, value]) => <section className="hr-mini-card" key={label}><strong>{value}</strong><span>{label}</span></section>)}</div>
    <div className="hr-tabs">{['Overview', 'Attendance', 'Leave', 'Permissions', 'Payroll', 'Documents', 'Login & QR'].map((value) => <button type="button" key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value}</button>)}</div>
    {tab === 'Overview' && <section className="hr-card profile-grid">{facts.map(([label, value]) => <div className="profile-field" key={label}><strong>{label}</strong><p>{value || '—'}</p></div>)}</section>}
    {view && <section className="hr-card"><DataTable columns={view.columns.map((key) => ({ key, label: key.replace(/([A-Z])/g, ' $1') }))} rows={view.rows || []} /></section>}
    {tab === 'Documents' && <EmployeeDocuments employeeId={id} />}
    {tab === 'Login & QR' && <EmployeeAccessCard employee={employee} onUpdated={reload} />}
  </div>;
}
