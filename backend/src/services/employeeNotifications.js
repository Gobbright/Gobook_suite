import { AppUser } from '../models/AppUser.js';
import { Employee } from '../models/Employee.js';
import { EmployeeNotification } from '../models/EmployeeNotification.js';
import { employeeLoginEmailSettings } from './employeeLoginEmail.js';
import { employeeMailBranding } from './employeeMailBranding.js';
import { buildBrandedEmail, sendMail, textToEmailHtml, escapeHtml } from '../utils/mailer.js';
import { env } from '../config/env.js';
import { employeeAccessView } from './employeeAccess.js';
import { employeeReportData, employeeReportPdf } from './employeeReports.js';

export async function queueEmployeeNotification(ownerUserId, employee, { requestKey, kind = 'announcement', title, message, report }) {
  return EmployeeNotification.findOneAndUpdate({ ownerUserId, employeeObjectId: employee._id, requestKey }, { $setOnInsert: { ownerUserId, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name, recipientEmail: employee.email || '', requestKey, kind, title, message, ...(report ? { report } : {}), emailStatus: 'Pending' } }, { upsert: true, new: true, runValidators: true });
}
export async function queueEmployeeEvent(ownerUserId, employeeId, event) {
  const employee = await Employee.findOne({ userId: ownerUserId, employeeId }).lean();
  if (employee) await queueEmployeeNotification(ownerUserId, employee, event);
}

export async function dispatchEmployeeNotifications(limit = 25) {
  // A crashed worker cannot know whether SMTP accepted the last message. Keep it
  // visible for the owner instead of automatically sending a duplicate.
  await EmployeeNotification.updateMany({ emailStatus: 'Sending', updatedAt: { $lt: new Date(Date.now() - 5 * 60000) } }, { $set: { emailStatus: 'Unknown', lastError: 'Sending was interrupted. Delivery could not be confirmed.' } });
  let processed = 0;
  for (; processed < limit; processed++) {
    const item = await EmployeeNotification.findOneAndUpdate({ emailStatus: 'Pending', kind: { $ne: 'login-otp' } }, { $set: { emailStatus: 'Sending', lastError: '' }, $inc: { attempts: 1 } }, { new: true, sort: { createdAt: 1 } }).lean();
    if (!item) break;
    let accepted = false;
    try {
      const [owner, employee, sender] = await Promise.all([
        AppUser.findOne({ _id: item.ownerUserId, status: 'Active' }).select('name businessName').lean(),
        Employee.findOne({ _id: item.employeeObjectId, userId: item.ownerUserId }).lean(),
        employeeLoginEmailSettings(item.ownerUserId),
      ]);
      if (!owner || !employee || !employee.email || employee.email !== item.recipientEmail) throw new Error('recipient-changed');
      const brand = await employeeMailBranding(item.ownerUserId, sender.settings, owner.businessName || owner.name);
      if (item.report?.kind === 'payroll') {
        const data = await employeeReportData(item.ownerUserId, 'payroll', { employeeId: employee.employeeId, month: item.report.month });
        if (!data.rows.length) throw new Error('Payslip not found');
        brand.attachments.push({ filename: `payslip-${employee.employeeId}-${item.report.month}.pdf`, content: await employeeReportPdf([data], brand.branding.name, item.report.month), contentType: 'application/pdf' });
      }
      const notificationUrl = new URL(`${employeeAccessView(employee, owner).portalBasePath}/notifications`, env.clientUrl).href;
      const bodyHtml = `${textToEmailHtml(item.message)}<p><a href="${escapeHtml(notificationUrl)}">View your employee notifications</a></p>`;
      const info = await sendMail({ to: item.recipientEmail, subject: `${brand.branding.name}: ${item.title}`, smtp: { ...sender.smtp, from: { name: brand.branding.name, address: sender.smtp.user } }, attachments: brand.attachments, html: buildBrandedEmail({ title: item.title, greeting: `Hi ${employee.name},`, bodyHtml, branding: brand.branding, footerText: `Sent by ${brand.branding.name}.`, badge: 'Employee notification' }) });
      if (info?.rejected?.length) throw new Error('rejected');
      accepted = true;
      await EmployeeNotification.updateOne({ _id: item._id, emailStatus: 'Sending' }, { $set: { emailStatus: 'Accepted', senderEmail: sender.smtp.user, sentAt: new Date() } });
    } catch {
      await EmployeeNotification.updateOne({ _id: item._id, emailStatus: 'Sending' }, { $set: { emailStatus: accepted ? 'Unknown' : 'Failed', lastError: accepted ? 'SMTP accepted the email but its receipt could not be saved. Check delivery before sending again.' : 'Email could not be sent. Check the app password connection and employee email. The notification remains available in the employee inbox.' } });
    }
  }
  return { processed };
}
