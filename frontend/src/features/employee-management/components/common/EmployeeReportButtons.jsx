import { useState } from 'react';
import { downloadEmployeeReport } from '../../services/employeeReports.js';
import { currentEmployeeMonth } from '../../services/monthScope.js';
export function EmployeeReportButtons({ kind, month = currentEmployeeMonth(), employeeId = '', department = '', shift = '', date = '', employee = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function download(format) {
    setBusy(format); setError('');
    try { await downloadEmployeeReport(kind, format, { month, employeeId, department, shift, date }, employee); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  return <div className="employee-report-downloads"><div className="hr-actions">{['pdf', 'xlsx'].map((format) => <button className="hr-btn" key={format} type="button" disabled={Boolean(busy)} onClick={() => download(format)}>{busy === format ? 'Downloading...' : format === 'pdf' ? 'Download PDF' : 'Download Excel'}</button>)}</div>{error && <p className="error" role="alert">{error}</p>}</div>;
}
