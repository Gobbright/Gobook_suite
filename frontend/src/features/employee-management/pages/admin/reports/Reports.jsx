import { useState } from 'react';
import { adminService } from '../../../services/adminService.js';
import { useLoad } from '../../../hooks/useLoad.js';
import { EMPLOYEE_REPORTS } from '../../../services/employeeReports.js';
import { EmployeeReportButtons } from '../../../components/common/EmployeeReportButtons.jsx';
import { currentEmployeeMonth } from '../../../services/monthScope.js';
export default function Reports() {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const { data, error } = useLoad(adminService.employees, []);
  const employees = data?.data || [];
  const departments = [...new Set(employees.map((employee) => employee.dept).filter(Boolean))];
  return <div className="hr-screen"><div className="hr-page-head"><div><h1>Employee Reports</h1><p>Download business records as PDF or Excel.</p></div></div>{error && <p className="error" role="alert">{error}</p>}
    <section className="hr-card"><div className="hr-form-grid three"><label className="hr-field">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><label className="hr-field">Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.map((employee) => <option key={employee._id} value={employee.employeeId}>{employee.name} ({employee.employeeId})</option>)}</select></label><label className="hr-field">Department<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></label></div></section>
    <section className="hr-card"><h2>All employee reports</h2><p>Excel includes a separate sheet for every report. PDF combines the selected records. Employee and document directories show current records; dated reports use the selected month.</p><EmployeeReportButtons kind="all" month={month} employeeId={employeeId} department={department} /></section>
    <div className="employee-reports-grid">{EMPLOYEE_REPORTS.map(([kind, name]) => <section className="hr-card" key={kind}><h2>{name}</h2>{kind === 'statutory' && <p>Uses the payroll deduction snapshot. Older or manually adjusted payroll without a snapshot shows “Not recorded”.</p>}<EmployeeReportButtons kind={kind} month={month} employeeId={employeeId} department={department} /></section>)}</div>
  </div>;
}
