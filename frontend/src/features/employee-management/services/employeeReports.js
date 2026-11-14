import { API_BASE_URL } from '../../../services/apiBase.js';
import { getToken } from '../../../services/authToken.js';
export const EMPLOYEE_REPORTS = [['employees', 'Employee Directory'], ['attendance', 'Attendance & Breaks'], ['leaves', 'Leave Requests'], ['payroll', 'Payroll & Payslips'], ['statutory', 'Monthly PF / ESI / TDS'], ['permissions', 'Permission Requests'], ['corrections', 'Attendance Corrections'], ['documents', 'Employee Documents'], ['holidays', 'Holidays'], ['notifications', 'Notification Delivery & Read Status']];
export async function downloadEmployeeReport(kind, format, filters = {}, employee = false) {
  const token = employee ? localStorage.getItem('employee_portal_token') : getToken();
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null && value !== ''));
  const response = await fetch(`${API_BASE_URL}/${employee ? 'employee/reports' : 'admin/employee-reports'}/${kind}/${format}?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Report download failed'); }
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: `employee-${kind}-${filters.month || 'report'}.${format}` });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
