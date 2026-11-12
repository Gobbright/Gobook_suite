import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, Search, Users } from 'lucide-react';

import { useLoad } from '../../../hooks/useLoad.js';
import { adminService } from '../../../services/adminService.js';

export default function EmployeeGroupsPage({ kind }) {
  const isDepartment = kind === 'departments';
  const field = isDepartment ? 'dept' : 'designation';
  const title = isDepartment ? 'Departments' : 'Designations';
  const [query, setQuery] = useState('');
  const { data, loading, error } = useLoad(adminService.employees, []);
  const employees = useMemo(() => data?.data || [], [data]);
  const groups = useMemo(() => Object.entries(employees.reduce((result, employee) => {
    const name = employee[field]?.trim() || 'Unassigned';
    result[name] = (result[name] || 0) + 1;
    return result;
  }, {})).sort((a, b) => b[1] - a[1]), [employees, field]);
  const visible = groups.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()));

  return <div className="hr-screen hr-groups-screen">
    <div className="hr-page-head"><div><h1>{title}</h1><p>Explore employees by {isDepartment ? 'department' : 'designation'}.</p></div><Link className="hr-btn primary" to="/employee-management/employees/add">Add Employee</Link></div>
    {error && <p className="error">{error}</p>}
    <div className="hr-groups-summary">
      <section className="hr-stat-card"><span className="hr-stat-icon blue"><BriefcaseBusiness size={22} /></span><div><span>Total {title}</span><strong>{groups.length}</strong><small>Across your workforce</small></div></section>
      <section className="hr-stat-card"><span className="hr-stat-icon green"><Users size={22} /></span><div><span>Total Employees</span><strong>{employees.length}</strong><small>In this account</small></div></section>
    </div>
    <section className="hr-card"><div className="hr-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} /></div>
      <div className="hr-groups-grid">{loading ? <p>Loading {title.toLowerCase()}...</p> : visible.length ? visible.map(([name, count]) => <Link key={name} to={`/employee-management/employees?${isDepartment ? 'department' : 'designation'}=${encodeURIComponent(name)}`}><span className="hr-stat-icon blue">{isDepartment ? <BriefcaseBusiness size={20} /> : <Users size={20} />}</span><span><strong>{name}</strong><small>{count} employee{count === 1 ? '' : 's'}</small></span><span aria-hidden="true">›</span></Link>) : <p>No {title.toLowerCase()} found.</p>}</div>
    </section>
  </div>;
}
