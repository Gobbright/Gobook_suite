import { BulkDeleteTable, BulkDeleteRow } from '../../../../../components/forms/BulkDeleteTable.jsx';
import { exportRows } from '../../../../../utils/exportRows.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays, CheckCircle2, Download, Eye, MoreVertical, Pencil, Plus, RefreshCw, Search, Upload, UserCheck,
  Users, X,
} from 'lucide-react';

import { useLoad } from '../../../hooks/useLoad.js';
import { adminService } from '../../../services/adminService.js';
import { api } from '../../../../../services/api.js';
import { EmployeeDetailsModal } from '../../../components/common/EmployeeDetailsModal.jsx';
import { EmployeeAccessCard } from '../../../components/common/EmployeeAccessCard.jsx';

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

function dateText(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function EmployeeList() {
  const [searchParams] = useSearchParams();
  const departmentParam = searchParams.get('department') || '';
  const designationParam = searchParams.get('designation') || '';
  const { data, loading, error, setData, reload } = useLoad(adminService.employees, []);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [viewEmployeeId, setViewEmployeeId] = useState(null);
  const [accessEmployee, setAccessEmployee] = useState(null);
  const [filters, setFilters] = useState({ dept: departmentParam, designation: designationParam, branch: '', manager: '', status: new Set() });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const importRef = useRef(null);
  const rows = useMemo(() => data?.data || [], [data]);
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
      && (!filters.dept || row.dept === filters.dept)
      && (!filters.designation || row.designation === filters.designation)
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
    await adminService.updateEmployee(row._id, { name: row.name, email: row.email, status: 'Inactive' });
    setData((current) => ({ ...current, data: (current?.data || []).map((item) => item._id === row._id ? { ...item, status: 'Inactive' } : item) }));
    setMenu(null);
  }

  function toggleMenu(event, row) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu((current) => current?.row._id === row._id ? null : {
      row,
      style: {
        top: Math.min(rect.bottom + 8, window.innerHeight - 190),
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
    document.addEventListener('mousedown', closeFromOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
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

      {error && <p className="error">{error}</p>}
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
            <select aria-label="Department" className="attendance-select" value={filters.dept} onChange={(e) => setFilters((current) => ({ ...current, dept: e.target.value }))}><option value="">All Departments</option>{options.depts.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Designation" className="attendance-select" value={filters.designation} onChange={(e) => setFilters((current) => ({ ...current, designation: e.target.value }))}><option value="">All Designations</option>{options.designations.map((item) => <option key={item}>{item}</option>)}</select>
            <select aria-label="Status" className="attendance-select" value={filters.status.size === 1 ? [...filters.status][0] : ''} onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value ? new Set([e.target.value]) : new Set() }))}><option value="">All Status</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
            <button className="hr-icon-btn hr-more-filters" type="button" onClick={() => setFiltersOpen(true)} title="More filters"><MoreVertical size={16} /></button>
            <button onClick={() => exportRows('Employees', filtered, ['employeeId', 'name', 'dept', 'designation', 'branch', 'reportingManager', 'joinDate', 'status'])} className="hr-icon-btn" type="button" title="Export"><Download size={16} /></button>
            <button className="hr-icon-btn" type="button" title="Refresh" onClick={reload}><RefreshCw size={16} /></button>
          </div>
        </div>

        <div className="hr-table-wrap">
          <BulkDeleteTable onDeleteRecord={record => adminService.deleteEmployee(record._id)} onDeleted={ids => reload()} className="hr-table">
            <thead><tr><th>Employee</th><th>ID</th><th>Department</th><th>Designation</th><th>Branch</th><th>Manager</th><th>Joining Date</th><th>Status</th><th>Login URL / QR</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10}>Loading employees...</td></tr> : null}
              {!loading && filtered.length === 0 ? <tr><td colSpan={10}>No employees found.</td></tr> : null}
              {visibleRows.map((row) => (
                <BulkDeleteRow record={row} key={row._id}>
                  <td>
                    <div className="hr-employee-cell"><span>{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.email || '-'}<br />{row.phone || '-'}</small></div></div>
                  </td>
                  <td>{row.employeeId}</td><td>{row.dept || '-'}</td><td>{row.designation || '-'}</td><td>{row.branch || '-'}</td><td>{row.reportingManager || '-'}</td><td>{dateText(row.joinDate)}</td>
                  <td><span className={statusClass(row.status || 'Active')}>{row.status || 'Active'}</span></td>
                  <td>{row.portalAccess?.loginPath && <a href={row.portalAccess.loginPath} target="_blank" rel="noreferrer" style={{ display: 'block', maxWidth: 260, overflowWrap: 'anywhere', fontSize: 12 }}>{new URL(row.portalAccess.loginPath, window.location.origin).href}</a>}<button className="hr-btn" type="button" onClick={() => setAccessEmployee(row)}>Login Settings / QR</button></td>
                  <td className="hr-menu-cell">
                    <div className="hr-row-actions"><button type="button" className="hr-icon-btn" title={`View ${row.name}`} onClick={() => setViewEmployeeId(row._id)}><Eye size={16} /></button><Link className="hr-icon-btn" title={`Edit ${row.name}`} to={`/employee-management/employees/add?edit=${row._id}`}><Pencil size={15} /></Link><button className="hr-icon-btn" type="button" title="More actions" onClick={(event) => toggleMenu(event, row)}><MoreVertical size={15} /></button></div>
                  </td>
                </BulkDeleteRow>
              ))}
            </tbody>
          </BulkDeleteTable>
        </div>
        <div className="hr-table-footer hr-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} employees</span><div><label>Rows per page: <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="6">6</option><option value="10">10</option><option value="20">20</option></select></label><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">‹</button><strong>{currentPage} / {pages}</strong><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">›</button></div></div>
      </section>

      {viewEmployeeId && <EmployeeDetailsModal employeeId={viewEmployeeId} onClose={() => { setViewEmployeeId(null); reload(); }} />}
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
        <div className="hr-row-menu hr-row-menu-portal" style={menu.style}>
          <button type="button" onClick={() => { setViewEmployeeId(menu.row._id); setMenu(null); }}>View Profile</button>
          <Link to={`/employee-management/employees/${menu.row._id}/documents`} onClick={() => setMenu(null)}>Documents</Link>
          <Link to={`/employee-management/employees/add?edit=${menu.row._id}`} onClick={() => setMenu(null)}>Edit</Link>
          <button type="button" onClick={() => deactivate(menu.row)} disabled={(menu.row.status || 'Active') === 'Inactive'}>Deactivate</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
