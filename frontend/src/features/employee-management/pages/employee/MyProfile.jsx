import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { authService } from '../../services/authService.js';
import { EmployeePhoto } from '../../components/common/EmployeePhoto.jsx';

export default function MyProfile() {
  const { data, loading, error } = useLoad(authService.me, []);
  const employee = data?.employee;
  const fields = [
    ['Business', data?.user?.businessName], ['Employee ID', employee?.employeeId], ['Name', employee?.name],
    ['Email', employee?.email], ['Mobile', employee?.phone], ['Gender', employee?.gender], ['Date of Birth', employee?.dateOfBirth], ['Blood Group', employee?.bloodGroup], ['Address', employee?.address],
    ['Department', employee?.dept], ['Designation', employee?.designation], ['Branch', employee?.branch], ['Reporting Manager', employee?.reportingManager], ['Employment Type', employee?.employmentType], ['Shift', employee?.shift], ['Work Location', employee?.workLocation], ['Joining Date', employee?.joinDate], ['Status', employee?.status],
    ['Emergency Contact', employee?.emergencyContact?.name], ['Relationship', employee?.emergencyContact?.relationship], ['Emergency Mobile', employee?.emergencyContact?.phone], ['Monthly Basic Salary', employee?.basicSalary == null ? '' : '₹' + Number(employee.basicSalary).toLocaleString('en-IN')],
  ];
  return <><PageHeader title="My Profile" subtitle="View your details. Contact your business administrator for changes." action={<Link to="/employee/documents">My Documents</Link>} />{error && <p className="error">{error}</p>}{loading ? <div className="card">Loading profile…</div> : <><EmployeePhoto employee={employee} token={localStorage.getItem('employee_portal_token')} /><div className="card profile-grid">{fields.map(([label, value]) => <div className="profile-field" key={label}><strong>{label}</strong><p>{value || '—'}</p></div>)}</div><section className="card"><h2>Salary Structure</h2><div className="profile-grid">{Object.entries(employee?.salaryStructure || {}).map(([key, value]) => <div className="profile-field" key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong><p>₹{Number(value || 0).toLocaleString('en-IN')}</p></div>)}</div></section></>}</>;
}
