import { EmployeePresenceBadge } from '../../../components/common/EmployeePresenceBadge.jsx';
import { useEmployeeDirectoryPresence } from '../../../hooks/useEmployeeDirectoryPresence.js';
import { BulkDeleteList, BulkDeleteItem } from '../../../../../components/forms/BulkDeleteTable.jsx';
import { exportRows } from '../../../../../utils/exportRows.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays, CheckCircle2, Download, Eye, MoreVertical, Plus, RefreshCw, Search, Upload, UserCheck,
  Users, X, KeyRound, ArrowUpRight, Pencil, Trash2,
} from 'lucide-react';

import { useLoad } from '../../../hooks/useLoad.js';
import { adminService } from '../../../services/adminService.js';
import { api } from '../../../../../services/api.js';
import { EmployeeDetailsModal } from '../../../components/common/EmployeeDetailsModal.jsx';
import { EmployeeAccessCard } from '../../../components/common/EmployeeAccessCard.jsx';
import { EmployeePasswordDialog } from '../../../components/common/EmployeePasswordDialog.jsx';
import { EmployeeTeamTools } from '../../../components/common/EmployeeTeamTools.jsx';
import './employeeCards.css';

const STATUSES = ['Active', 'Probation', 'On Leave', 'Inactive', 'Resigned', 'Terminated'];

function statusClass(status) {
  if (status === 'Active') return 'hr-pill green';
  if (status === 'Probation') return 'hr-pill amber';
  if (status === 'On Leave') return 'hr-pill blue';
  if (status === 'Inactive' || status === 'Resigned') return 'hr-pill gray';
  return 'hr-pill red';
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'E';
}

export default function EmployeeList() {
  const [searchParams] = useSearchParams();
  const departmentParam = searchParams.get('department') || '';
  const designationParam = searchParams.get('designation') || '';
  const { data, loading, error, setData, reload } = useLoad(adminService.employees, [], { keepPreviousData: true });
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [viewEmployeeId, setViewEmployeeId] = useState(null);
  const [accessEmployee, setAccessEmployee] = useState(null);
  const [passwordEmployee, setPasswordEmployee] = useState(null);
  const [filters, setFilters] = useState({ dept: departmentParam, designation: designationParam, branch: '', manager: '', status: new Set() });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const deleteLock = useRef(false);
  const importRef = useRef(null);
  const rows = useMemo(() => data?.data || [], [data]);
  const [presence, setPresence] = useEmployeeDirectoryPresence();
  useEffect(() => {
    setFilters((current) => ({ ...current, dept: departmentParam, designation: designationParam }));
  }, [departmentParam, designationParam]);

  const options = useMemo(() => ({
    depts: [...new Set(rows.map((r) => r.dept).filter(Boolean))],
    designations: [...new Set(rows.map((r) => r.designation).filter(Boolean))],
    branches: [...new Set(rows.map((r) => r.branch).filter(Boolean))],
    managers: [...new Set(rows.map((r) => r.reportingManager).filter(Boolean))],
  }), [rows]);

  const filtered = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [row.name, row.email, row.phone, row.employeeId, row.dept, row.designation].some((value) => String(value || '').toLowerCase().includes(q));
    const matchesStatus = filters.status.size === 0 || filters.status.has(row.status || 'Active');
    return matchesQuery
      && matchesStatus
      && (!filters.dept || (filters.dept === '__unassigned__' ? !row.dept?.trim() : row.dept === filters.dept))
      && (!filters.designation || (filters.designation === '__unassigned__' ? !row.designation?.trim() : row.designation === filters.designation))
      && (!filters.branch || row.branch === filters.branch)
      && (!filters.manager || row.reportingManager === filters.manager);
  });

  const counts = {
    total: rows.length,
    active: rows.filter((r) => (r.status || 'Active') === 'Active').length,
    onLeave: rows.filter((r) => r.status === 'On Leave').length,
  };
  const joinedThisMonth = rows.filter((row) => {
    const joined = new Date(row.joinDate);
    const now = new Date();
    return !Number.isNaN(joined.getTime()) && joined.getFullYear() === now.getFullYear() && joined.getMonth() === now.getMonth();
  }).length;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => { setPage(1); }, [query, filters, pageSize]);

  async function importEmployees(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setImporting(true);
    setImportMessage('');
    try {
      const result = await api.hrImportEmployees(body);
      setImportMessage(`Import complete: ${result?.imported || 0} added, ${result?.updated || 0} updated, ${result?.skipped || 0} skipped.`);
      reload();
    } catch (err) {
      setImportMessage(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  function toggleStatus(status) {
    setFilters((current) => {
      const next = new Set(current.status);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return { ...current, status: next };
    });
  }

  async function deactivate(row) {
    try {
      await adminService.updateEmployee(row._id, { name: row.name, email: row.email, status: 'Inactive' });
      setData((current) => ({ ...current, data: (current?.data || []).map((item) => item._id === row._id ? { ...item, status: 'Inactive' } : item) }));
      setPresence((current) => ({ ...current, [row._id]: { online: false } }));
      setMenu(null);
    } catch (err) { setImportMessage(err.message || 'Unable to deactivate employee.'); }
  }

  async function removeEmployee(row) {
    if (deleteLock.current || !window.confirm(`Delete employee "${row.name}"? This permanently removes the employee and their attendance, leave and payroll records.`)) return;
    deleteLock.current = true; setDeletingId(row._id); setMenu(null);
    try {
      await adminService.deleteEmployee(row._id);
      setData(current => ({ ...current, data: (current?.data || []).filter(item => item._id !== row._id) }));
      reload();
    } catch (err) { setImportMessage(err.message || 'Unable to delete employee.'); }
    finally { deleteLock.current = false; setDeletingId(null); }
  }

  function toggleMenu(event, row) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((current) => current?.row._id === row._id ? null : {
      row,
      style: {
        top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 280)),
        left: Math.max(8, Math.min(rect.right - 178, window.innerWidth - 190)),
      },
    });
  }

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const closeFromOutside = (event) => {
      if (event.target.closest?.('.hr-row-menu-portal, .hr-menu-cell')) return;
      setMenu(null);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', closeFromOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  return (
    <div className="hr-screen hr-employee-list-screen">
      <div className="hr-page-head">
        <div>
          <h1>Employees</h1>
          <p>Manage your team, roles and employee information</p>
        </div>
        <div className="hr-actions">
          <input ref={importRef} type="file" accept=".xlsx" hidden onChange={importEmployees} />
          <button className="hr-btn" type="button" disabled={importing} onClick={() => importRef.current?.click()}><Upload size={16} />{importing ? 'Importing...' : 'Import Employees'}</button>
          <Link className="hr-btn primary" to="/employee-management/employees/add"><Plus size={15} /> Add Employee</Link>
        </div>
      </div>

      <EmployeeTeamTools />
      {error && <p className="error">{error}</p>}
      <div className="hr-alert"><Link to="/employee-management/settings">Employee login settings: verify your Google app password for employee OTPs</Link></div>
      {importMessage && <p role="status" className="hr-alert">{importMessage}</p>}

      <div className="hr-stat-grid">
        {[
          [Users, counts.total, 'Total Employees', 'blue'],
          [CheckCircle2, counts.active, 'Active Employees', 'green'],
          [CalendarDays, counts.onLeave, 'On Leave', 'orange'],
          [UserCheck, joinedThisMonth, 'New Joiners (This Month)', 'blue'],
        ].map(([Icon, value, label, tone]) => (
          <section className="hr-stat-card" key={label}>
            <span className={`hr-stat-icon ${tone}`}><Icon size={21} /></span>
            <div><strong>{value}</strong><span>{label}</span></div>
          </section>
        ))}
      </div>

      <section className="hr-card">
        <div className="hr-toolbar">
          <div className="hr-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, ID, email or mobile..." /></div>
          <div className="hr-toolbar-actions hr-employee-filters">
            <select aria-label="Department" className="attendance-select" value={filters.dept} onChange={(e) => setFilters((current) => ({ ...current, dept: e.target.value }))}><option value="">All Departments</option><option value="__unassigned__">Unassigned</option>{options.depts.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Designation" className="attendance-select" value={filters.designation} onChange={(e) => setFilters((current) => ({ ...current, designation: e.target.value }))}><option value="">All Designations</option><option value="__unassigned__">Unassigned</option>{options.designations.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Status" className="attendance-select" value={filters.status.size === 1 ? [...filters.status][0] : ''} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value ? new Set([e.target.value]) : new Set() }))}><option value="">All Status</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
            <button className="hr-icon-btn hr-more-filters" type="button" onClick={() => setFiltersOpen(true)} title="More filters"><MoreVertical size={16} /></button>
            <button onClick={() => exportRows('Employees', filtered, ['employeeId', 'name', 'dept', 'designation', 'branch', 'reportingManager', 'joinDate', 'status'])} className="hr-icon-btn" type="button" title="Export"><Download size={16} /></button>
            <button className="hr-icon-btn" type="button" title="Refresh" onClick={reload}><RefreshCw size={16} /></button>
          </div>
        </div>

        <BulkDeleteList onDeleteRecord={record => adminService.deleteEmployee(record._id)} onDeleted={reload}>
          <div className="hr-employee-card-grid" aria-label="Employees" aria-busy={loading}>
            {loading && rows.length === 0 && <p className="hr-employee-empty" role="status">Loading employees…</p>}
            {!loading && filtered.length === 0 && <div className="hr-employee-empty"><Users size={28} /><h2>No employees found</h2><p>Try another search or add an employee to your team.</p></div>}
            {visibleRows.map((row) => {
              return <BulkDeleteItem record={row} key={row._id} className="hr-employee-card">
                <div className="hr-employee-card-top"><EmployeePresenceBadge employee={row} presence={presence?.[row._id]} /><div className="hr-menu-cell"><button className="hr-icon-btn" type="button" aria-label={`More actions for ${row.name}`} aria-expanded={menu?.row._id === row._id} aria-haspopup="menu" onClick={(event) => toggleMenu(event, row)}><MoreVertical size={18} /></button></div></div>
                <div className="hr-employee-card-identity"><span className="hr-employee-avatar">{initials(row.name)}</span><div><h2>{row.name}</h2><p>{row.designation || 'Employee'}</p><span className="hr-employee-code">{row.employeeId}</span></div></div>
                <dl className="hr-employee-card-facts"><div><dt>Department</dt><dd>{row.dept || '—'}</dd></div><div><dt>Shift</dt><dd>{row.shift || 'Not assigned'}</dd></div></dl>
                <div className="hr-employee-card-contact"><span>{row.email || 'No email added'}</span><span>{row.phone || 'No phone added'}</span></div>
                <div className="hr-employee-card-actions"><button type="button" className="hr-btn hr-employee-view" onClick={() => setViewEmployeeId(row._id)}><Eye size={16} />View details<ArrowUpRight size={14} /></button><button type="button" className="hr-btn hr-employee-password" aria-label={`Set password for ${row.name}`} onClick={() => setPasswordEmployee(row)}><KeyRound size={16} />Set password</button></div>
                <div className="hr-employee-card-secondary-actions"><Link to={`/employee-management/employees/add?edit=${row._id}`} aria-label={`Edit ${row.name}`}><Pencil size={14} />Edit</Link><button type="button" aria-label={`Delete ${row.name}`} disabled={Boolean(deletingId)} onClick={() => removeEmployee(row)}><Trash2 size={14} />{deletingId === row._id ? 'Deleting…' : 'Delete'}</button></div>
              </BulkDeleteItem>;
            })}
          </div>
        </BulkDeleteList>
        <div className="hr-table-footer hr-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} employees</span><div><label>Cards per page: <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="12">12</option><option value="24">24</option><option value="48">48</option></select></label><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button><strong>{currentPage} / {pages}</strong><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button></div></div>
      </section>

      {viewEmployeeId && <EmployeeDetailsModal employeeId={viewEmployeeId} onClose={() => { setViewEmployeeId(null); reload(); }} />}
      {passwordEmployee && <EmployeePasswordDialog employee={passwordEmployee} onClose={() => setPasswordEmployee(null)} onUpdated={() => { reload(); setPresence((current) => ({ ...current, [passwordEmployee._id]: { online: false } })); }} />}
      {accessEmployee && <div className="employee-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccessEmployee(null); }}><div className="employee-access-dialog" role="dialog" aria-modal="true" aria-label="Employee login settings"><button className="hr-icon-btn" type="button" aria-label="Close login settings" onClick={() => setAccessEmployee(null)}><X size={18} /></button><EmployeeAccessCard employee={accessEmployee} onUpdated={reload} /></div></div>}
      {filtersOpen && (
        <aside className="hr-filter-panel">
          <div className="hr-panel-head"><h2>Filter Employees</h2><button type="button" onClick={() => setFiltersOpen(false)}><X size={17} /></button></div>
          {[
            ['Department', 'dept', options.depts],
            ['Designation', 'designation', options.designations],
            ['Branch', 'branch', options.branches],
            ['Reporting Manager', 'manager', options.managers],
          ].map(([label, key, items]) => (
            <label className="hr-field" key={key}>{label}<select value={filters[key]} onChange={(e) => setFilters((current) => ({ ...current, [key]: e.target.value }))}><option value="">All</option>{items.map((item) => <option key={item}>{item}</option>)}</select></label>
          ))}
          <div className="hr-check-list"><strong>Employment Status</strong>{STATUSES.map((status) => <label key={status}><input type="checkbox" checked={filters.status.has(status)} onChange={() => toggleStatus(status)} />{status}</label>)}</div>
          <div className="hr-panel-actions"><button className="hr-btn" type="button" onClick={() => setFilters({ dept: '', designation: '', branch: '', manager: '', status: new Set() })}>Reset</button><button className="hr-btn primary" type="button" onClick={() => setFiltersOpen(false)}>Apply Filters</button></div>
        </aside>
      )}

      {menu && createPortal(
        <div className="hr-row-menu hr-row-menu-portal" style={menu.style} role="menu" aria-label={`Actions for ${menu.row.name}`}>
          <button type="button" role="menuitem" onClick={() => { setViewEmployeeId(menu.row._id); setMenu(null); }}>View details</button>
          <button type="button" role="menuitem" onClick={() => { setPasswordEmployee(menu.row); setMenu(null); }}>{menu.row.portalAccess?.passwordConfigured || menu.row.loginAccess ? 'Reset password' : 'Set password'}</button>
          <button type="button" role="menuitem" onClick={() => { setAccessEmployee(menu.row); setMenu(null); }}>Login settings / QR</button>
          <Link to={`/employee-management/employees/${menu.row._id}/documents`} onClick={() => setMenu(null)}>Documents</Link>
          <Link to={`/employee-management/employees/add?edit=${menu.row._id}`} onClick={() => setMenu(null)}>Edit</Link>
          <button type="button" onClick={() => deactivate(menu.row)} disabled={(menu.row.status || 'Active') === 'Inactive'}>Deactivate</button>
          <button type="button" role="menuitem" disabled={Boolean(deletingId)} onClick={() => removeEmployee(menu.row)}>Delete employee</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
