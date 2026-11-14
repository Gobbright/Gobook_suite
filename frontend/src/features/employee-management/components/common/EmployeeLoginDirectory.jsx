import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminService } from '../../services/adminService.js';
import { useLoad } from '../../hooks/useLoad.js';
import { employeeLoginUrl, employeeLoginRows } from '../../services/employeeQr.js';
import { exportRows } from '../../../../utils/exportRows.js';
import { EmployeeAccessCard } from './EmployeeAccessCard.jsx';
import './EmployeeLoginDirectory.css';

export function EmployeeLoginDirectory({ employees = [], loading = false, error = '', onRefresh, initialEmployeeId = '' }) {
  const sender = useLoad(adminService.emailSettings, []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('10');
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const dialog = useRef(null);
  const openedInitial = useRef(false);
  const text = search.trim().toLowerCase();
  const filtered = employees.filter((employee) => [employee.name, employee.employeeId, employee.email, employee.designation, employee.portalAccess?.businessUsername].some((value) => String(value || '').toLowerCase().includes(text)));
  const limit = pageSize === 'all' ? Math.max(1, filtered.length) : Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * limit, currentPage * limit);
  const allLinks = employeeLoginRows(employees);
  const verifiedCount = employees.filter((employee) => employee.portalAccess?.emailVerified).length;
  useEffect(() => {
    if (!initialEmployeeId || openedInitial.current) return;
    const employee = employees.find((row) => String(row._id) === String(initialEmployeeId));
    if (employee) { openedInitial.current = true; setSelected(employee); }
  }, [employees, initialEmployeeId]);
  useEffect(() => {
    if (!selected) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    function keys(event) {
      if (event.key === 'Escape') setSelected(null);
      if (event.key !== 'Tab') return;
      const elements = [...(dialog.current?.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])') || [])].filter((item) => item.getClientRects().length);
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keys);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keys); previousFocus?.focus?.(); };
  }, [selected]);
  async function copy(employee) {
    const url = employeeLoginUrl(employee.portalAccess);
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setMessage(`${employee.employeeId} login URL copied.`); }
    catch { setMessage('Select the employee URL below and copy it.'); }
  }
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(allLinks.map((row) => row['Login URL']).join('\n'));
      setMessage(`Copied ${allLinks.length} employee login URLs.`);
    } catch { setMessage('Clipboard is unavailable. Use Download all URLs to save the full list.'); }
  }
  return <section className="employee-login-directory" aria-labelledby="employee-login-directory-title">
    <header className="employee-directory-head"><div><span className="employee-directory-eyebrow">Employee access</span><h2 id="employee-login-directory-title">Employee login URLs &amp; QR cards</h2><p>Personal links with the business username and employee ID filled in.</p></div><div><Link to="/employee-management/employees/add">Add employee</Link><Link to="/employee-management/settings">Email / OTP settings</Link></div></header>
    <div className="employee-directory-status"><span className={sender.data?.configured ? 'is-ready' : ''}>{sender.loading ? 'Checking business email…' : sender.error ? 'Business email status unavailable' : sender.data?.configured ? 'Google app password verified' : 'App password verification required'}</span><span>{verifiedCount} / {employees.length} employees completed login OTP</span></div>
    <div className="employee-directory-toolbar"><label><span className="sr-only">Search employee login links</span><input aria-label="Search employee login links" placeholder="Search employee name, ID or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><div className="employee-directory-batch-actions"><button type="button" disabled={loading || !allLinks.length} onClick={copyAll}>Copy all URLs</button><button type="button" disabled={loading || !allLinks.length} onClick={() => exportRows('Employee Login URLs', allLinks)}>Download all URLs</button>{onRefresh && <button type="button" disabled={loading} onClick={() => { sender.reload(); onRefresh(); }}>Refresh links</button>}</div></div>
    {message && <p className="employee-directory-message" role="status">{message}</p>}
    {error ? <p className="error" role="alert">{error}</p> : loading ? <p className="employee-directory-empty" role="status">Loading employee login links…</p> : !filtered.length ? <p className="employee-directory-empty">{employees.length ? 'No employees match your search.' : 'Create an employee to generate their personal login URL and QR card.'}</p> : <div className="employee-directory-table-wrap"><table><thead><tr><th>Employee</th><th>Business username</th><th>Personal login URL</th><th>Verification</th><th>Actions</th></tr></thead><tbody>{rows.map((employee) => {
      const access = employee.portalAccess || {};
      const url = employeeLoginUrl(access);
      return <tr key={employee._id}><td data-label="Employee"><strong>{employee.name}</strong><span>{employee.employeeId} · {employee.designation || 'Employee'}</span></td><td data-label="Business username"><span>{access.businessUsername || sender.data?.loginUsername || '—'}</span></td><td data-label="Personal login URL">{url ? <a href={url} target="_blank" rel="noreferrer">{url}</a> : <span>Open QR settings to generate this link.</span>}</td><td data-label="Verification"><span className={`employee-directory-badge ${access.emailVerified ? 'is-verified' : ''}`}>{access.emailVerified ? 'Login OTP verified' : 'Login OTP pending'}</span><span className="employee-directory-access-status">{access.loginEnabled ? 'Login enabled' : 'Login disabled'}</span></td><td data-label="Actions"><div className="employee-directory-actions"><button type="button" disabled={!url} onClick={() => copy(employee)}>Copy URL</button><button type="button" onClick={() => setSelected(employee)}>View QR / details</button></div></td></tr>;
    })}</tbody></table></div>}
    <footer className="employee-directory-footer"><span>{filtered.length} employee{filtered.length === 1 ? '' : 's'}{search && ' found'}</span><div><label>Show <select aria-label="Employee login links per page" value={pageSize} onChange={(event) => { setPageSize(event.target.value); setPage(1); }}><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">All employees</option></select></label><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
    {selected && <div className="employee-directory-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section ref={dialog} className="employee-access-dialog" role="dialog" aria-modal="true" aria-label={`${selected.name} login and QR settings`} tabIndex={-1}><button className="employee-directory-close" type="button" onClick={() => setSelected(null)}>Close</button><EmployeeAccessCard employee={selected} onUpdated={onRefresh} /></section></div>}
  </section>;
}

export default function EmployeeLoginLinksPage() {
  const { state } = useLocation();
  const result = useLoad(adminService.employees, []);
  return <EmployeeLoginDirectory employees={result.data?.data || []} loading={result.loading} error={result.error} onRefresh={result.reload} initialEmployeeId={state?.employeeId || ''} />;
}
