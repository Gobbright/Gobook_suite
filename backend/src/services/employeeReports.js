import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Employee } from '../models/Employee.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Payroll } from '../models/Payroll.js';
import { EmployeePermission } from '../models/EmployeePermission.js';
import { EmployeeNotification } from '../models/EmployeeNotification.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { HRDocument } from '../models/Document.js';
import { Holiday } from '../models/Holiday.js';
import { employeeMonth, leaveDaysInRange } from './employeeMonth.js';
import { httpError } from '../utils/httpError.js';

export const EMPLOYEE_REPORTS = ['employees', 'attendance', 'leaves', 'payroll', 'statutory', 'permissions', 'corrections', 'documents', 'holidays', 'notifications'];
const valueAt = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
function dataset(title, columns, records) {
  return { title, columns: columns.map(([key, label]) => ({ key, label })), rows: records.map((row) => columns.map(([key]) => {
    const value = valueAt(row, key);
    return value instanceof Date ? value.toISOString() : value ?? '';
  })) };
}
async function rows(Model, filter, select) {
  const result = await Model.find(filter).select(select).sort({ _id: 1 }).limit(20001).lean();
  if (result.length > 20000) throw httpError(413, 'This report exceeds 20,000 rows. Select a narrower period or employee');
  return result;
}
export async function employeeReportData(ownerUserId, kind, query = {}) {
  if (!EMPLOYEE_REPORTS.includes(kind)) throw httpError(400, 'Choose a supported employee report');
  const period = employeeMonth(query.month);
  for (const key of ['employeeId', 'department', 'shift', 'date']) if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 200)) throw httpError(400, 'Invalid report filter');
  if (query.date && (!/^\d{4}-\d{2}-\d{2}$/.test(query.date) || query.date < period.start || query.date > period.end)) throw httpError(400, 'Choose a date within the selected month');
  const employees = await rows(Employee, { userId: ownerUserId, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...(query.department ? { dept: query.department } : {}), ...(query.shift ? { shift: query.shift } : {}) }, 'employeeId name email phone dept designation status joinDate basicSalary salaryStructure statutoryDetails bankDetails familyMembers emergencyContact');
  const ids = employees.map((employee) => employee.employeeId);
  const objects = employees.map((employee) => employee._id);
  const filterEmployees = Boolean(query.employeeId || query.department || query.shift);
  const scoped = { userId: ownerUserId, ...(filterEmployees ? { employeeId: { $in: ids } } : {}) };
  if (kind === 'employees') return dataset('Employee Directory', [['employeeId', 'Employee ID'], ['name', 'Name'], ['dept', 'Department'], ['designation', 'Designation'], ['email', 'Email'], ['phone', 'Phone'], ['status', 'Status'], ['joinDate', 'Joining Date'], ['basicSalary', 'Basic Salary'], ['emergencyContact.name', 'Emergency Contact'], ['emergencyContact.phone', 'Emergency Mobile']], employees);
  if (kind === 'statutory') {
    const payroll = await rows(Payroll, { ...scoped, month: period.month }, 'employeeId name dept month basic salaryStructure');
    const byId = new Map(employees.map((employee) => [employee.employeeId, employee]));
    return dataset('Monthly PF ESI and TDS', [['employeeId', 'Employee ID'], ['name', 'Name'], ['month', 'Month'], ['basic', 'Basic Salary'], ['statutoryDetails.pfNumber', 'PF Number (Current)'], ['statutoryDetails.uan', 'UAN (Current)'], ['statutoryDetails.esiNumber', 'ESI Number (Current)'], ['pf', 'PF Deduction'], ['esi', 'ESI Deduction'], ['tds', 'TDS']], payroll.map((row) => ({ ...row, statutoryDetails: byId.get(row.employeeId)?.statutoryDetails, pf: row.salaryStructure?.pf ?? 'Not recorded', esi: row.salaryStructure?.esi ?? 'Not recorded', tds: row.salaryStructure?.tds ?? 'Not recorded' })));
  }
  if (kind === 'attendance') {
    const records = await rows(Attendance, { ...scoped, date: query.date || period.dates }, 'employeeId name dept date checkIn checkOut breakMinutes breaks hours status shift');
    return dataset('Attendance and Breaks', [['employeeId', 'Employee ID'], ['name', 'Name'], ['dept', 'Department'], ['date', 'Date'], ['checkIn', 'In Time'], ['checkOut', 'Out Time'], ['breakMinutes', 'Break Minutes'], ['breakRanges', 'Break Ranges'], ['hours', 'Net Working Hours'], ['status', 'Status']], records.map((row) => ({ ...row, breakRanges: (row.breaks || []).map((item) => `${item.start} - ${item.end || 'Ongoing'}`).join('; ') })));
  }
  if (kind === 'leaves') {
    const records = await rows(Leave, { userId: ownerUserId, ...(filterEmployees ? { empId: { $in: ids } } : {}), ...period.leaves }, 'empId name dept type from to days reason status');
    return dataset('Leave Requests', [['empId', 'Employee ID'], ['name', 'Name'], ['dept', 'Department'], ['type', 'Leave Type'], ['from', 'From'], ['to', 'To'], ['days', 'Total Request Days'], ['monthDays', 'Days in Selected Month'], ['reason', 'Reason'], ['status', 'Status']], records.map((row) => ({ ...row, monthDays: leaveDaysInRange(row, period.start, period.end) })));
  }
  if (kind === 'payroll') return dataset('Payroll and Payslips', [['employeeId', 'Employee ID'], ['name', 'Name'], ['dept', 'Department'], ['month', 'Month'], ['basic', 'Basic'], ['allowances', 'Allowances'], ['deductions', 'Deductions'], ['net', 'Net Salary'], ['status', 'Payment Status']], await rows(Payroll, { ...scoped, month: period.month }, 'employeeId name dept month basic allowances deductions net status'));
  if (kind === 'permissions') return dataset('Permission Requests', [['employeeId', 'Employee ID'], ['name', 'Name'], ['date', 'Date'], ['fromTime', 'From'], ['toTime', 'To'], ['reason', 'Reason'], ['status', 'Status']], await rows(EmployeePermission, { ownerUserId, ...(filterEmployees ? { employeeObjectId: { $in: objects } } : {}), date: period.dates }, 'employeeId name date fromTime toTime reason status'));
  if (kind === 'corrections') return dataset('Attendance Corrections', [['employeeId', 'Employee ID'], ['name', 'Name'], ['date', 'Date'], ['checkIn', 'Requested In'], ['checkOut', 'Requested Out'], ['reason', 'Reason'], ['status', 'Status']], await rows(AttendanceCorrection, { ownerUserId, ...(filterEmployees ? { employeeId: { $in: ids } } : {}), date: period.dates }, 'employeeId name date checkIn checkOut reason status'));
  if (kind === 'documents') return dataset('Employee Documents', [['employee', 'Employee'], ['name', 'Document'], ['category', 'Category'], ['uploadedOn', 'Uploaded On'], ['uploadedBy', 'Uploaded By'], ['size', 'Size']], await rows(HRDocument, { userId: ownerUserId, ...(filterEmployees ? { empId: { $in: objects.map(String) } } : {}), }, 'employee name category uploadedOn uploadedBy size'));
  if (kind === 'holidays') return dataset('Holidays', [['name', 'Holiday'], ['date', 'Date'], ['type', 'Type']], await rows(Holiday, { ownerUserId, date: period.dates }, 'name date type'));
  const createdAt = { $gte: new Date(`${period.start}T00:00:00+05:30`), $lte: new Date(`${period.end}T23:59:59.999+05:30`) };
  return dataset('Notification Delivery and Read Status', [['employeeId', 'Employee ID'], ['employeeName', 'Employee'], ['recipientEmail', 'Recipient'], ['senderEmail', 'Sender'], ['title', 'Title'], ['kind', 'Type'], ['emailStatus', 'Email Status'], ['createdAt', 'Saved At'], ['sentAt', 'SMTP Accepted At'], ['readAt', 'Viewed in App At'], ['verifiedAt', 'Login OTP Verified At']], await rows(EmployeeNotification, { ownerUserId, ...(filterEmployees ? { employeeObjectId: { $in: objects } } : {}), createdAt }, 'employeeId employeeName recipientEmail senderEmail title kind emailStatus createdAt sentAt readAt verifiedAt'));
}

export async function employeeReportExcel(datasets, businessName, month) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = businessName;
  for (const data of datasets) {
    const sheet = workbook.addWorksheet(data.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));
    sheet.addRow([businessName]);
    sheet.addRow([data.title, month]);
    sheet.addRow(data.columns.map((column) => column.label));
    for (const row of data.rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true, size: 16 };
    sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2458BD' } };
    sheet.columns.forEach((column) => { column.width = 22; });
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: data.columns.length } };
    sheet.views = [{ state: 'frozen', ySplit: 3 }];
    sheet.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
export function employeeReportPdf(datasets, businessName, month) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `${businessName} employee reports ${month}` } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const heading = () => { doc.font('Helvetica-Bold').fontSize(14).fillColor('#17345c').text(businessName); doc.font('Helvetica').fontSize(9).text(`Employee reports | ${month}`).moveDown(); };
    heading();
    doc.on('pageAdded', heading);
    datasets.forEach((data, datasetIndex) => {
      if (datasetIndex) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text(data.title).moveDown(.5);
      doc.font('Helvetica').fontSize(9).text(`${data.rows.length} record(s)`).moveDown();
      data.rows.forEach((row, index) => {
        if (doc.y > 700) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9).text(`Record ${index + 1}`).moveDown(.3);
        row.forEach((value, column) => doc.font('Helvetica').fontSize(8).text(`${data.columns[column].label}: ${String(value === '' ? '-' : value)}`, { lineGap: 2 }));
        doc.moveDown();
      });
    });
    doc.end();
  });
}
