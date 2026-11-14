import { AppUser } from '../../models/AppUser.js';
import { employeeMonth } from '../../services/employeeMonth.js';
import { EMPLOYEE_REPORTS, employeeReportData, employeeReportExcel, employeeReportPdf } from '../../services/employeeReports.js';
import { httpError } from '../../utils/httpError.js';

export async function downloadEmployeeReport(req, res, next) {
  try {
    const { kind, format } = req.params;
    if (!['pdf', 'xlsx'].includes(format) || !(kind === 'all' || EMPLOYEE_REPORTS.includes(kind))) throw httpError(400, 'Choose PDF or Excel and a supported report');
    const month = employeeMonth(req.query.month).month;
    const query = { ...req.query };
    if (req.employeeUser.role === 'employee') {
      if (!['payroll', 'attendance', 'leaves', 'permissions'].includes(kind)) throw httpError(403, 'This report is available to your administrator');
      query.employeeId = req.employeeUser.employeeId;
      delete query.department;
      delete query.shift;
    }
    const owner = await AppUser.findById(req.employeeUser.ownerUserId).select('name businessName').lean();
    if (!owner) throw httpError(404, 'Business not found');
    const datasets = [];
    for (const name of kind === 'all' ? EMPLOYEE_REPORTS : [kind]) datasets.push(await employeeReportData(req.employeeUser.ownerUserId, name, query));
    if (datasets.reduce((count, dataset) => count + dataset.rows.length, 0) > 20000) throw httpError(413, 'The combined report exceeds 20,000 rows. Select an employee or download individual reports');
    const businessName = owner.businessName || owner.name;
    const buffer = await (format === 'xlsx' ? employeeReportExcel(datasets, businessName, month) : employeeReportPdf(datasets, businessName, month));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="employee-${kind}-${month}.${format}"`);
    res.send(buffer);
  } catch (error) { next(error); }
}
