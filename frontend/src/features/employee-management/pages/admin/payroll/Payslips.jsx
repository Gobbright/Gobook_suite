import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mail, Printer } from 'lucide-react';
import { EmployeeReportButtons } from '../../../components/common/EmployeeReportButtons.jsx';
import { BusinessLogo } from '../../../components/common/BusinessLogo.jsx';
import { adminService } from '../../../services/adminService.js';

import { useLoad } from '../../../hooks/useLoad.js';
import { payrollService } from '../../../services/payrollService.js';
import { PayrollNav, money, payrollMonth } from './PayrollNav.jsx';

export default function Payslips() {
  const [params] = useSearchParams();
  const [month, setMonth] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : payrollMonth());
  const [employeeId, setEmployeeId] = useState(() => params.get('employee') || '');
  const [message, setMessage] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const emailRequest = useRef(null);
  const business = useLoad(adminService.emailSettings, []);
  const { data, loading, error } = useLoad(() => payrollService.adminPayroll(month), [month]);
  const rows = data?.data || [];
  const selected = rows.find((row) => row.employeeId === employeeId) || rows[0];
  const gross = Number(selected?.basic || 0) + Number(selected?.allowances || 0);

  async function emailPayslip() {
    if (!selected || emailBusy) return;
    setEmailBusy(true);
    if (emailRequest.current?.id !== selected._id) emailRequest.current = { id: selected._id, requestId: crypto.randomUUID() };
    try { const result = await payrollService.email(selected._id, emailRequest.current.requestId); setMessage(result.message); emailRequest.current = null; }
    catch (failure) { setMessage(failure.message); }
    finally { setEmailBusy(false); }
  }

  return (
    <div className="hr-screen">
      <div className="hr-page-head">
        <div><h1>Payslips</h1><p>Generate and manage employee payslips</p></div>
        <div className="hr-actions">
          <input className="attendance-select" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          <select className="attendance-select" value={selected?.employeeId || ''} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Select employee</option>
            {rows.map((row) => <option key={row.employeeId} value={row.employeeId}>{row.name} ({row.employeeId})</option>)}
          </select>
        </div>
      </div>
      <PayrollNav current="/employee-management/payroll/payslips" />
      {error && <p className="error">{error}</p>}
      {message && <p className="leave-success-message">{message}</p>}
      <div className="payslip-layout">
        <aside className="hr-card payslip-list">
          <h2>Payslip List</h2>
          {rows.map((row) => <button className={row.employeeId === selected?.employeeId ? 'active' : ''} key={row.employeeId} type="button" onClick={() => setEmployeeId(row.employeeId)}><strong>{row.name}</strong><span>{row.employeeId} - {month}</span></button>)}
          {!rows.length && <p>No payslips available. Generate payroll first.</p>}
        </aside>
        <section className="hr-card payslip-preview">
          {loading ? <p>Loading payslip...</p> : selected ? <>
            <BusinessLogo user={{ businessName: business.data?.businessName || 'Business', businessLogoUrl: business.data?.logoUrl }} /><h2>{business.data?.businessName || 'Business'}</h2>
            <p>Payslip for the month of {month}</p>
            <div className="payslip-meta"><span>Employee Name <strong>{selected.name}</strong></span><span>Employee ID <strong>{selected.employeeId}</strong></span><span>Department <strong>{selected.dept || '-'}</strong></span><span>Payment Status <strong>{selected.status}</strong></span></div>
            <div className="payslip-columns"><section><h3>Earnings</h3><p><span>Basic Salary</span><strong>{money(selected.basic)}</strong></p><p><span>Allowances</span><strong>{money(selected.allowances)}</strong></p><b><span>Gross Salary</span><strong>{money(gross)}</strong></b></section><section><h3>Deductions</h3><p><span>Payroll Deductions</span><strong>{money(selected.deductions)}</strong></p><b className="danger"><span>Total Deductions</span><strong>{money(selected.deductions)}</strong></b></section></div>
            <div className="payslip-net">Net Salary <strong>{money(selected.net)}</strong></div>
            <EmployeeReportButtons kind="payroll" month={month} employeeId={selected.employeeId} /><div className="payslip-actions"><button className="hr-btn" type="button" onClick={() => window.print()}><Printer size={14} /> Print</button><button className="hr-btn" type="button" disabled={emailBusy} onClick={emailPayslip}><Mail size={14} />{emailBusy ? 'Queueing...' : 'Email PDF payslip'}</button></div>
          </> : <p>No payslip selected.</p>}
        </section>
      </div>
    </div>
  );
}
