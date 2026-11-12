import { BulkDeleteTable, BulkDeleteRow } from '../../../../../components/forms/BulkDeleteTable.jsx';
import { useState } from 'react';
import { CheckCircle2, Clock3, Download, Plus, RefreshCw, Wallet } from 'lucide-react';

import { useLoad } from '../../../hooks/useLoad.js';
import { payrollService } from '../../../services/payrollService.js';
import { PayrollNav, money, payrollMonth } from './PayrollNav.jsx';

function summarize(rows) {
  const totalEarnings = rows.reduce((sum, row) => sum + Number(row.basic || 0) + Number(row.allowances || 0), 0);
  const totalDeductions = rows.reduce((sum, row) => sum + Number(row.deductions || 0), 0);
  const netPayroll = rows.reduce((sum, row) => sum + Number(row.net || 0), 0);
  return { totalEarnings, totalDeductions, netPayroll, processed: rows.filter((row) => row.status === 'Paid').length };
}

function exportCsv(rows, month) {
  const header = ['Employee', 'Department', 'Gross Salary', 'Deductions', 'Net Salary', 'Status'];
  const lines = rows.map((row) => [row.name, row.dept, Number(row.basic || 0) + Number(row.allowances || 0), row.deductions, row.net, row.status].join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `payroll-summary-${month}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function PayrollProcessing() {
  const [month, setMonth] = useState(payrollMonth());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const { data, loading, error, setData } = useLoad(() => payrollService.adminPayroll(month), [month]);
  const rows = data?.data || [];
  const totals = summarize(rows);

  async function generatePayroll() {
    setBusy('generate');
    setMessage('');
    try {
      const result = await payrollService.generate(month);
      setData(result);
      setMessage(result.message || 'Payroll preview generated.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  async function approvePayroll() {
    setBusy('approve');
    setMessage('');
    try {
      const result = await payrollService.approve(month);
      setData(result);
      setMessage(result.message || 'Payroll approved.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="hr-screen hr-payroll-screen">
      <div className="hr-page-head">
        <div><h1>Payroll</h1><p>Manage employee salaries, payslips, deductions and monthly processing.</p></div>
        <div className="hr-actions">
          <button className="hr-btn" type="button" onClick={() => exportCsv(rows, month)} disabled={!rows.length}><Download size={16} />Export Payroll</button>
          <button className="hr-btn primary" type="button" onClick={generatePayroll} disabled={busy === 'generate'}><Plus size={17} />{busy === 'generate' ? 'Preparing...' : 'Run Payroll'}</button>
        </div>
      </div>
      <div className="hr-payroll-stats">{[
        [Wallet, 'Total Payroll', money(totals.netPayroll), month],
        [CheckCircle2, 'Amount Processed', money(rows.filter((row) => row.status === 'Paid').reduce((sum, row) => sum + Number(row.net || 0), 0)), `${rows.length ? Math.round(totals.processed / rows.length * 100) : 0}% of payroll`],
        [Clock3, 'Pending Amount', money(rows.filter((row) => row.status !== 'Paid').reduce((sum, row) => sum + Number(row.net || 0), 0)), 'Awaiting approval'],
        [CheckCircle2, 'Employees Paid', `${totals.processed} / ${rows.length}`, `${Math.max(0, rows.length - totals.processed)} pending`],
      ].map(([Icon, label, value, detail], index) => <section className="hr-stat-card" key={label}><span className={`hr-stat-icon ${['blue', 'green', 'orange', 'blue'][index]}`}><Icon size={21} /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></section>)}</div>
      <div className="hr-payroll-overview"><section className="hr-card"><h2>Payroll Completion</h2><strong>{rows.length ? Math.round(totals.processed / rows.length * 100) : 0}%</strong><div className="hr-snapshot-track"><span style={{ width: `${rows.length ? totals.processed / rows.length * 100 : 0}%` }} /></div><small>{totals.processed} employees processed · {Math.max(0, rows.length - totals.processed)} remaining</small></section><section className="hr-card"><h2>Total Allowances</h2><strong>{money(rows.reduce((sum, row) => sum + Number(row.allowances || 0), 0))}</strong><small>Included in gross salary</small></section><section className="hr-card"><h2>Total Deductions</h2><strong>{money(totals.totalDeductions)}</strong><small>Review before final payroll run</small></section></div>
      <div className="hr-payroll-controls"><input className="attendance-select" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="hr-btn" type="button" onClick={generatePayroll} disabled={busy === 'generate'}><RefreshCw size={15} />Refresh Preview</button><button className="hr-btn" type="button" onClick={approvePayroll} disabled={!rows.length || busy === 'approve'}><CheckCircle2 size={15} />Approve Payroll</button></div>
      <PayrollNav current="/employee-management/payroll" />
      {(error || message) && <p className={error || message.includes('not') ? 'error' : 'leave-success-message'}>{error || message}</p>}
      <div className="payroll-processing-layout">
        <section className="hr-card">
          <h2>Payroll Register</h2>
          <div className="leave-total-grid payroll-total-grid">
            <section className="hr-card"><span>Total Employees</span><strong>{rows.length}</strong></section>
            <section className="hr-card"><span>Total Earnings</span><strong>{money(totals.totalEarnings)}</strong></section>
            <section className="hr-card"><span>Total Deductions</span><strong>{money(totals.totalDeductions)}</strong></section>
            <section className="hr-card"><span>Net Payroll</span><strong>{money(totals.netPayroll)}</strong></section>
          </div>
          <div className="hr-table-wrap">
            <BulkDeleteTable onDeleteRecord={record => payrollService.remove(record._id)} onDeleted={ids => setData(current => ({ ...current, data: (current?.data || []).filter(row => !ids.includes(String(row._id))) }))} className="hr-table">
              <thead><tr><th>Employee</th><th>Department</th><th>Basic Salary</th><th>Allowances</th><th>Deductions</th><th>Net Salary</th><th>Status</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan="7">Loading payroll...</td></tr> : rows.length ? rows.map((row) => <BulkDeleteRow record={row} key={row._id || row.employeeId}><td><div className="hr-employee-cell"><span>{row.name?.[0] || 'E'}</span><div><strong>{row.name}</strong><small>{row.employeeId}</small></div></div></td><td>{row.dept || '-'}</td><td>{money(row.basic)}</td><td>{money(row.allowances)}</td><td>{money(row.deductions)}</td><td>{money(row.net)}</td><td><span className={`hr-pill ${row.status === 'Paid' ? 'green' : 'amber'}`}>{row.status}</span></td></BulkDeleteRow>) : <tr><td colSpan="7">No payroll generated for this month. Select Run Payroll to prepare a preview.</td></tr>}
              </tbody>
            </BulkDeleteTable>
          </div>
        </section>
        <aside className="payroll-side-stack">
          <section className="hr-card payroll-summary-card"><h2>Payroll Summary</h2><p><span>Total Employees</span><strong>{rows.length}</strong></p><p><span>Processed</span><strong>{totals.processed}</strong></p><p><span>Calculated</span><strong>{rows.length}</strong></p><p><span>Pending</span><strong>{Math.max(0, rows.length - totals.processed)}</strong></p><hr /><p><span>Total Earnings</span><strong>{money(totals.totalEarnings)}</strong></p><p><span>Total Deductions</span><strong>{money(totals.totalDeductions)}</strong></p><p><span>Net Payroll</span><strong>{money(totals.netPayroll)}</strong></p></section>
          <section className="hr-card payroll-action-list"><h2>Payroll Actions</h2><button type="button" onClick={() => exportCsv(rows, month)} disabled={!rows.length}>Export Summary <Download size={14} /></button><button type="button" onClick={() => exportCsv(rows, `${month}-details`)} disabled={!rows.length}>Export Details <Download size={14} /></button><button type="button" onClick={generatePayroll}><RefreshCw size={14} /> Recalculate</button></section>
        </aside>
      </div>
    </div>
  );
}
