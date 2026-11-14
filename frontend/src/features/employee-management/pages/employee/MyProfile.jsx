import { Link } from 'react-router-dom';
import { EmployeeExtendedDetails } from '../../components/common/EmployeeExtendedDetails.jsx';
import { BriefcaseBusiness, HeartPulse, RefreshCw, UserRound, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { authService } from '../../services/authService.js';
import { EmployeePhoto } from '../../components/common/EmployeePhoto.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { employeeScreenPath } from '../../services/portalPaths.js';

const money = (value) => value == null ? '—' : Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function ProfileSection({ title, icon: Icon, fields }) {
  return <section className="card employee-profile-section">
    <h2><Icon size={18} aria-hidden="true" />{title}</h2>
    <div className="profile-grid">{fields.map(([label, value]) => <div className={`profile-field${['Email', 'Address'].includes(label) ? ' profile-field-wide' : ''}`} key={label}><strong>{label}</strong><p>{value == null || value === '' ? '—' : value}</p></div>)}</div>
  </section>;
}

export default function MyProfile() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(authService.me, []);
  const employee = data?.employee || {};
  return <>
    <PageHeader title="My Profile" subtitle="View your details. Contact your business administrator for changes." action={<Link to={employeeScreenPath(user, 'documents')}>My Documents</Link>} />
    {error ? <div className="employee-dashboard-error" role="alert"><span>{error}</span><button className="btn" type="button" onClick={reload}><RefreshCw size={15} />Try again</button></div> : loading ? <div className="card" role="status">Loading profile…</div> : <>
      <EmployeePhoto employee={employee} token={localStorage.getItem('employee_portal_token')} />
      <div className="employee-profile-sections">
        <ProfileSection title="Personal details" icon={UserRound} fields={[
          ['Name', employee.name], ['Mobile', employee.phone], ['Email', employee.email], ['Gender', employee.gender], ['Date of Birth', employee.dateOfBirth], ['Blood Group', employee.bloodGroup], ['Address', employee.address],
        ]} />
        <ProfileSection title="Work information" icon={BriefcaseBusiness} fields={[
          ['Business', data?.user?.businessName], ['Employee ID', employee.employeeId], ['Department', employee.dept], ['Designation', employee.designation], ['Branch', employee.branch], ['Reporting Manager', employee.reportingManager], ['Employment Type', employee.employmentType], ['Shift', employee.shift], ['Work Location', employee.workLocation], ['Joining Date', employee.joinDate], ['Status', employee.status],
        ]} />
        <ProfileSection title="Emergency contact" icon={HeartPulse} fields={[
          ['Emergency Contact', employee.emergencyContact?.name], ['Relationship', employee.emergencyContact?.relationship], ['Emergency Mobile', employee.emergencyContact?.phone],
        ]} />
        <ProfileSection title="Salary Structure" icon={Wallet} fields={[
          ['Monthly Basic Salary', money(employee.basicSalary)],
          ...Object.entries(employee.salaryStructure || {}).map(([key, value]) => [key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), money(value)]),
        ]} />
      </div>
      <EmployeeExtendedDetails employee={employee} />
    </>}
  </>;
}
