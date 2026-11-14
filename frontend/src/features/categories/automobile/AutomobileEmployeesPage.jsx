import { adminService } from '../../employee-management/services/adminService.js';
import { EmployeePresenceBadge } from '../../employee-management/components/common/EmployeePresenceBadge.jsx';
import { useEmployeeDirectoryPresence } from '../../employee-management/hooks/useEmployeeDirectoryPresence.js';
import { EmployeePasswordDialog } from '../../employee-management/components/common/EmployeePasswordDialog.jsx';
import '../../employee-management/pages/admin/employees/employeeCards.css';
import { BulkDeleteList, BulkDeleteItem } from '../../../components/forms/BulkDeleteTable.jsx';
import { RowActionsMenu } from '../../../components/forms/RowActionsMenu.jsx';
import { useEffect, useRef, useState } from 'react';
import { EmployeeTeamTools } from '../../employee-management/components/common/EmployeeTeamTools.jsx';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, ChevronLeft, ChevronRight, Download, Eye, KeyRound, Pencil, Trash2, Plus, RefreshCw, Search, Upload, UserCheck, UserMinus, UserPlus, Users, Wallet, X } from 'lucide-react';
import { api } from '../../../services/api.js';
import { EmployeeDetailsModal } from '../../employee-management/components/common/EmployeeDetailsModal.jsx';
import { EmployeeAccessCard } from '../../employee-management/components/common/EmployeeAccessCard.jsx';
import { getToken } from '../../../services/authToken.js';
import { SelectDropdown } from '../../../components/forms/SelectDropdown.jsx';
import { loadEmployeePages } from './automobileEmployeeDashboard.js';
import { EMPLOYEE_STATUSES, employeeDirectoryStats, employeeSalary, filterEmployeeDirectory } from './automobileEmployees.js';
import './automobileProducts.css';
import './automobileCustomers.css';
import './automobileEmployees.css';

const base = '/employee-management/employees';
const money = (value) => `₹ ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
function Badge({ value }) { return <span className={`aem-badge ${String(value || 'Active').toLowerCase().replaceAll(' ', '-')}`}>{value || 'Active'}</span>; }
function Filter({ label, value, onChange, options }) { return <label className="aem-filter"><span>{label}</span><SelectDropdown aria-label={label} value={value} onChange={onChange} options={options} buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll /></label>; }
function exportEmployees(rows) {
  const fields = [['Employee ID', 'employeeId'], ['Name', 'name'], ['Department', 'dept'], ['Designation', 'designation'], ['Branch', 'branch'], ['Joining Date', 'joinDate'], ['Status', 'status'], ['Mobile', 'phone'], ['Email', 'email']];
  const quote = (value) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const csv = [fields.map(([label]) => label), ...rows.map((row) => fields.map(([, key]) => row[key]))].map((row) => row.map(quote).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })); const link = document.createElement('a'); link.href = url; link.download = 'Automobile-Employees.csv'; link.click(); URL.revokeObjectURL(url);
}
export function AutomobileEmployeesPage() {
  const [searchParams] = useSearchParams();
  const departmentParam = searchParams.get('department') || '';
  const designationParam = searchParams.get('designation') || '';
  useEffect(() => { setFilters(current => ({ ...current, dept: departmentParam, designation: designationParam })); setPage(1); }, [departmentParam, designationParam]);
  const [presence, setPresence] = useEmployeeDirectoryPresence();
  const [viewEmployeeId, setViewEmployeeId] = useState(null);
  const [passwordEmployee, setPasswordEmployee] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const deleteLock = useRef(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ search: '', dept: departmentParam, designation: designationParam, branch: '', status: '' }); const [selectedId, setSelectedId] = useState(''); const [page, setPage] = useState(1); const [size, setSize] = useState('12');
  const [salaryOpen, setSalaryOpen] = useState(false); const [importing, setImporting] = useState(false); const [importResult, setImportResult] = useState(null); const fileRef = useRef(null);
  useEffect(() => { let active = true; setLoading(true); setReady(false); setError(''); loadEmployeePages(api.hrListEmployees).then((employees) => { if (active) { setRows(employees); setReady(true); } }).catch((err) => { if (active) { setRows([]); setError(err.message || 'Unable to load employees.'); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reload]);
  const filtered = filterEmployeeDirectory(rows, filters); const selected = filtered.find((row) => row._id === selectedId) || filtered[0];
  useEffect(() => { if (!salaryOpen) return undefined; const close = (event) => { if (event.key === 'Escape') setSalaryOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [salaryOpen]);
  const counts = employeeDirectoryStats(rows); const salary = selected ? employeeSalary(selected) : null;
  const pages = Math.max(1, Math.ceil(filtered.length / Number(size))); const currentPage = Math.min(page, pages); const visible = filtered.slice((currentPage - 1) * Number(size), currentPage * Number(size));
  const options = (key, label) => [{ value: '', label }, ...(['dept', 'designation'].includes(key) ? [{ value: '__unassigned__', label: 'Unassigned' }] : []), ...[...new Set(rows.map((row) => row[key]).filter(Boolean))].sort()];
  function setFilter(key, value) { setFilters((prev) => ({ ...prev, [key]: value })); setPage(1); }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setImporting(true); setImportResult(null); const form = new FormData(); form.append('file', file);
    try { const result = await api.hrImportEmployees(form); setImportResult(result); setReload((value) => value + 1); } catch (err) { setImportResult({ error: err.message || 'Import failed.' }); } finally { setImporting(false); }
  }
  async function deleteEmployee(row) {
    if (deleteLock.current || !window.confirm(`Delete employee "${row.name}"? This permanently removes the employee and their attendance, leave and payroll records.`)) return;
    deleteLock.current = true; setDeletingId(row._id);
    try { await adminService.deleteEmployee(row._id); setRows((current) => current.filter((employee) => employee._id !== row._id)); setSelectedId((current) => current === row._id ? '' : current); }
    catch (failure) { setError(failure.message || 'Unable to delete employee.'); }
    finally { deleteLock.current = false; setDeletingId(null); }
  }
  return <div className="acu-host aem-host"><main className="autop-page acu-page aem-page" aria-busy={loading}>
    <header className="autop-header"><div><p className="aem-breadcrumb">Employee Management › Employees</p><h1>Employees</h1><p>Manage employee profiles, salary structures, documents, branches and employment status.</p></div><div className="autop-actions"><button disabled={!ready} onClick={() => exportEmployees(filtered)}><Download size={17} />Export</button><input type="file" accept=".xlsx" ref={fileRef} onChange={importFile} hidden /><button disabled={importing} onClick={() => fileRef.current?.click()}><Upload size={17} />{importing ? 'Importing…' : 'Import'}</button><Link className="aem-primary-link" to={`${base}/add`}><Plus size={18} />Add Employee</Link></div></header>
    <EmployeeTeamTools />
    {error && <div className="autop-error" role="alert">{error}<button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}{importResult && <div className={importResult.error ? 'autop-error' : 'acu-notice'} role="status"><div>{importResult.error || `Import complete: ${importResult.imported || 0} added, ${importResult.updated || 0} updated, ${importResult.skipped || 0} skipped.`}{importResult.errors?.length > 0 && <details><summary>View row issues ({importResult.errors.length})</summary>{importResult.errors.map((message, index) => <p key={index}>{message}</p>)}</details>}</div><button aria-label="Dismiss import result" onClick={() => setImportResult(null)}><X size={16} /></button></div>}
    <section className="aem-stats">{[['Total Employees', counts.total, Users, 'blue', 'All employee records'], ['Active Employees', counts.active, UserCheck, 'green', ready && counts.total ? `${Math.round(counts.active / counts.total * 1000) / 10}% active` : 'Current employee status'], ['Departments', counts.departments, Building2, 'purple', 'Across employee records'], ['New Joiners', counts.newJoiners, UserPlus, 'orange', 'Joined this month'], ['Inactive / Exited', counts.exited, UserMinus, 'red', 'Inactive, resigned or terminated']].map(([label, value, Icon, tone, detail]) => <article key={label}><span className={`acu-icon ${tone}`}><Icon size={23} /></span><div><h2>{label}</h2><strong>{ready ? value : '—'}</strong><small>{detail}</small></div></article>)}</section>
    <section className="aem-filters"><label className="aem-search"><span>Search</span><div><Search size={16} /><input aria-label="Search employees" placeholder="Name / ID / Mobile / Email" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} /></div></label><Filter label="Department" value={filters.dept} onChange={(value) => setFilter('dept', value)} options={options('dept', 'All Departments')} /><Filter label="Designation" value={filters.designation} onChange={(value) => setFilter('designation', value)} options={options('designation', 'All Designations')} /><Filter label="Branch" value={filters.branch} onChange={(value) => setFilter('branch', value)} options={options('branch', 'All Branches')} /><Filter label="Status" value={filters.status} onChange={(value) => setFilter('status', value)} options={[{ value: '', label: 'All Status' }, ...EMPLOYEE_STATUSES]} /><button title="Refresh employees" aria-label="Refresh employees" disabled={loading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={17} /></button></section>
    <div className="aem-workspace aem-card-workspace"><section className="acu-card aem-directory hr-employee-list-screen"><div className="aem-section-heading"><h2>Employee Directory ({filtered.length})</h2></div><BulkDeleteList onDeleteRecord={record => adminService.deleteEmployee(record._id)} onDeleted={() => setReload(value => value + 1)} canDelete={record => record.lifecycleStatus !== 'cancelled'}><div className="hr-employee-card-grid">{visible.map(row => <BulkDeleteItem record={row} key={row._id} className="hr-employee-card">
<div className="hr-employee-card-top"><EmployeePresenceBadge employee={row} presence={presence?.[row._id]} /><div className="hr-menu-cell"><RowActionsMenu aria-label={`Actions for ${row.name}`} options={[{value:'view',label:'View Profile'}, {value:'salary',label:'View Salary'}, {value:'access',label:'Login & QR'}, {value:'edit',label:'Edit'}, {value:'delete',label:'Delete',disabled:Boolean(deletingId)}]} onChange={action => { if(action==='access'){setSelectedId(row._id);setAccessOpen(true);}else if(action==='salary'){setSelectedId(row._id);setSalaryOpen(true);}else if(action==='view')setViewEmployeeId(row._id);else if(action==='edit')window.location.assign(`${base}/add?edit=${row._id}`);else deleteEmployee(row);}} /></div></div>
<div className="hr-employee-card-identity"><span className="hr-employee-avatar">{initials(row.name)}</span><div><h2>{row.name}</h2><p>{row.designation || 'Employee'}</p><span className="hr-employee-code">{row.employeeId}</span></div></div>
<dl className="hr-employee-card-facts"><div><dt>Department</dt><dd>{row.dept || 'Not assigned'}</dd></div><div><dt>Branch</dt><dd>{row.branch || 'Not assigned'}</dd></div></dl>
<div className="hr-employee-card-contact"><span>{row.email || 'No email added'}</span><span>{row.phone || 'No phone added'}</span></div>
<div className="hr-employee-card-actions"><button type="button" className="hr-btn hr-employee-view" onClick={() => setViewEmployeeId(row._id)}><Eye size={16} />View details</button><button type="button" className="hr-btn hr-employee-password" onClick={() => setPasswordEmployee(row)}><KeyRound size={16} />Set password</button></div>
<div className="hr-employee-card-secondary-actions"><Link to={`${base}/add?edit=${row._id}`} aria-label={`Edit ${row.name}`}><Pencil size={14} />Edit</Link><button type="button" aria-label={`Delete ${row.name}`} disabled={Boolean(deletingId)} onClick={() => deleteEmployee(row)}><Trash2 size={14} />{deletingId === row._id ? 'Deleting?' : 'Delete'}</button></div>
</BulkDeleteItem>)}{!visible.length && <p className="hr-employee-empty">{loading ? 'Loading employees?' : ready ? 'No employees match these filters.' : 'Employee data unavailable.'}</p>}</div></BulkDeleteList><footer className="aem-pagination"><span>Showing {filtered.length ? (currentPage - 1) * Number(size) + 1 : 0}–{Math.min(currentPage * Number(size), filtered.length)} of {filtered.length} employees</span><div><SelectDropdown aria-label="Employees per page" value={size} onChange={(value) => { setSize(value); setPage(1); }} options={[{ value: '12', label: '12 per page' }, { value: '24', label: '24 per page' }, { value: '48', label: '48 per page' }]} buttonClassName="autop-dropdown-trigger" menuClassName="autop-dropdown-menu" portal closeOnScroll /><button aria-label="Previous employees page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15} /></button><span>{currentPage}</span><button aria-label="Next employees page" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={15} /></button></div></footer></section>

    </div>
    {passwordEmployee && <EmployeePasswordDialog employee={passwordEmployee} onClose={() => setPasswordEmployee(null)} onUpdated={() => { setReload(value => value + 1); setPresence(current => ({ ...current, [passwordEmployee._id]: { online: false } })); }} />}
    {viewEmployeeId && <EmployeeDetailsModal employeeId={viewEmployeeId} onClose={() => { setViewEmployeeId(null); setReload((value) => value + 1); }} />}
    {accessOpen && selected && <div className="acu-overlay" onClick={(event) => { if (event.target === event.currentTarget) setAccessOpen(false); }}><div className="employee-access-dialog" role="dialog" aria-modal="true" aria-label="Employee login and QR"><button className="hr-btn" type="button" onClick={() => setAccessOpen(false)}>Close</button><EmployeeAccessCard employee={selected} onUpdated={() => setReload((value) => value + 1)} /></div></div>}
    {salaryOpen && selected && <div className="acu-overlay" onClick={(event) => { if (event.target === event.currentTarget) setSalaryOpen(false); }}><section className="acu-dialog aem-salary-dialog" role="dialog" aria-modal="true" aria-labelledby="aem-salary-title"><header><h2 id="aem-salary-title">Salary Structure · {selected.name}</h2><button autoFocus aria-label="Close salary structure" onClick={() => setSalaryOpen(false)}><X size={18} /></button></header><p>Monthly amounts saved in the employee profile.</p><div className="aem-salary-grid">{[['Earnings', salary.earnings], ['Deductions', salary.deductions]].map(([label, items]) => <section key={label}><h3>{label}</h3>{items.map(([name, value]) => <div key={name}><span>{name}</span><strong>{money(value)}</strong></div>)}</section>)}</div><div className="aem-salary-total"><span>Gross {money(salary.gross)}</span><span>Deductions {money(salary.totalDeductions)}</span><strong>Net {money(salary.net)}</strong></div><div className="acu-dialog-actions"><Link className="aem-primary-link" to="/employee-management/payroll/salary">Manage Salary Structure</Link></div></section></div>}
  </main></div>;
}
