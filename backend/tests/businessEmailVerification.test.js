import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import express from 'express';
import { AppUser } from '../src/models/AppUser.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { businessEmailSettings } from '../src/services/businessEmail.js';
import { requireVerifiedBusinessEmail, requireBusinessEmailAdmin } from '../src/middleware/requireVerifiedBusinessEmail.js';
import { getEmailSettings, saveEmailSettings } from '../src/modules/retail/more-modules/emailController.js';
import { hrPayrollRouter } from '../src/modules/retail/hr-payroll/routes.js';
import { moreModulesRouter } from '../src/modules/retail/more-modules/routes.js';
import { salesRouter } from '../src/modules/retail/sales/routes.js';
import { settingsRouter } from '../src/modules/settings/routes.js';
import { runAppointmentReminders } from '../src/jobs/appointmentReminders.js';
import { ModuleRecord } from '../src/models/ModuleRecord.js';
import { Invoice } from '../src/models/Invoice.js';
import nodemailer from 'nodemailer';
import { sendInvoiceEmail } from '../src/modules/retail/sales/billing-invoicing/invoiceController.js';

afterEach(() => mock.restoreAll());
const owner = { id: 'owner', accountType: 'owner', businessId: 'business', email: 'owner@example.test', isSuperAdmin: true };
const verified = { emailSmtpHost: 'smtp.gmail.com', emailSmtpUser: 'business@gmail.com', emailSmtpPass: 'private-app-password', emailSmtpVerifiedAt: new Date() };
const query = (value) => ({ select() { return this; }, lean: async () => value });
test('incomplete app passwords are rejected before SMTP authentication or saving', async () => {
  const smtp = mock.method(nodemailer, 'createTransport', () => { throw new Error('Must not authenticate'); });
  const save = mock.method(BusinessSettings, 'findOneAndUpdate', async () => { throw new Error('Must not save'); });
  for (const appPassword of ['', 'abcdefghijkl', 'abcdefghijklmnopq']) {
    let failure;
    await saveEmailSettings({ user: owner, body: { email: 'owner@gmail.com', appPassword } }, {}, error => { failure = error; });
    assert.equal(failure?.statusCode, 400);
    assert.match(failure.message, /16-character/);
  }
  assert.equal(smtp.mock.callCount(), 0);
  assert.equal(save.mock.callCount(), 0);
});
async function invoke(handler, user = owner) {
  const result = {};
  await handler({ user }, { status(code) { result.status = code; return this; }, json(data) { result.data = data; } }, (error) => { result.next = true; result.error = error; });
  return result;
}

test('employee and marketing access requires verified SMTP credentials, including for existing accounts', async () => {
  let settings;
  mock.method(BusinessSettings, 'findOne', () => query(settings));
  for (const value of [null, { ...verified, emailSmtpVerifiedAt: null }, { ...verified, emailSmtpPass: '' }, { ...verified, emailSmtpHost: '' }, { ...verified, emailSmtpUser: '' }]) {
    settings = value;
    const result = await invoke(requireVerifiedBusinessEmail);
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'BUSINESS_EMAIL_VERIFICATION_REQUIRED');
    assert.equal(result.data.setupPath, '/email-setup');
    assert.equal(result.next, undefined);
  }
  settings = verified;
  assert.equal((await invoke(requireVerifiedBusinessEmail)).next, true);
});

test('business members use their own business owner verification, never their personal SMTP credentials', async () => {
  mock.method(AppUser, 'findOne', (filter) => { assert.deepEqual(filter, { businessId: 'business', accountType: 'owner' }); return query({ _id: owner.id }); });
  mock.method(BusinessSettings, 'findOne', (filter) => { assert.deepEqual(filter, { userId: owner.id }); return query(verified); });
  const user = { id: 'member', businessId: 'business', accountType: 'member' };
  assert.equal((await invoke(requireVerifiedBusinessEmail, user)).next, true);
  const result = await invoke(getEmailSettings, user);
  assert.equal(result.data.configured, true);
  assert.equal(result.data.canManage, false);
  assert.equal(result.data.email, verified.emailSmtpUser);
  assert.equal(JSON.stringify(result.data).includes(verified.emailSmtpPass), false);
});

test('a missing owner cannot inherit a member mailbox and only the main user can change the sender', async () => {
  mock.method(AppUser, 'findOne', () => query(null));
  const lookup = mock.method(BusinessSettings, 'findOne', () => query(verified));
  assert.equal(await businessEmailSettings({ id: 'member', businessId: 'missing-business', accountType: 'member' }), null);
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal((await invoke(requireBusinessEmailAdmin, { id: 'member', role: 'Admin', accountType: 'member' })).error.statusCode, 403);
  assert.equal((await invoke(requireBusinessEmailAdmin)).error, undefined);
});

test('lookup errors keep protected features closed', async () => {
  mock.method(BusinessSettings, 'findOne', () => { throw new Error('Unavailable'); });
  const result = await invoke(requireVerifiedBusinessEmail);
  assert.equal(result.error.message, 'Unavailable');
  assert.equal(result.data, undefined);
});

test('direct employee creation, imports and campaign API requests cannot bypass verification', async () => {
  mock.method(BusinessSettings, 'findOne', () => query(null));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = owner; next(); });
  app.use('/hr-payroll', hrPayrollRouter);
  app.use('/more-modules', moreModulesRouter);
  app.use('/sales', salesRouter);
  app.use('/settings', settingsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [method, path] of [['POST', '/hr-payroll/employees'], ['POST', '/hr-payroll/employees/import'], ['GET', '/more-modules/email-campaigns'], ['POST', '/more-modules/email-campaigns'], ['PUT', '/more-modules/email-campaigns/example'], ['POST', '/more-modules/email-campaigns/test'], ['POST', '/more-modules/email-campaigns/example/send'], ['POST', '/sales/invoices/example/send-email'], ['POST', '/settings/test-email']]) {
      const response = await fetch(`${origin}${path}`, { method });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal((await response.json()).code, 'BUSINESS_EMAIL_VERIFICATION_REQUIRED');
    }
    const setup = await fetch(`${origin}/more-modules/email-settings`);
    assert.equal(setup.status, 200);
    assert.equal((await setup.json()).configured, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('scheduled appointment reminders skip unverified business mailboxes without marking reminders sent', async () => {
  const hospital = { _id: owner.id, businessName: 'Hospital' };
  mock.method(AppUser, 'find', () => query([hospital]));
  mock.method(BusinessSettings, 'find', () => ({ select: async () => [{ ...verified, userId: owner.id, emailSmtpVerifiedAt: null }] }));
  const appointments = mock.method(ModuleRecord, 'find', () => { throw new Error('Must not prepare email delivery'); });
  const update = mock.method(BusinessSettings, 'updateOne', async () => { throw new Error('Must not mark reminders sent'); });
  const result = await runAppointmentReminders({ force: true });
  assert.equal(result.results[0].skipped, 'email-verification-required');
  assert.equal(appointments.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('invoice delivery uses the verified business mailbox instead of platform SMTP', async () => {
  const user = { id: owner.id, accountType: 'owner', category: 'retail' };
  mock.method(AppUser, 'findById', () => query(user));
  mock.method(Invoice, 'findOne', () => query({ _id: 'invoice', number: 'INV-001', documentType: 'invoice', customer: { name: 'Customer' }, items: [{ description: 'Item', qty: 1, rate: 100 }] }));
  mock.method(BusinessSettings, 'findOne', () => query({ ...verified, businessName: 'Own Business' }));
  let transport, mail, error, response;
  mock.method(nodemailer, 'createTransport', (options) => { transport = options; return { sendMail: async (input) => { mail = input; } }; });
  await sendInvoiceEmail({ user, params: { id: 'invoice' }, body: { toEmail: 'customer@example.test' }, query: {} }, { json(data) { response = data; } }, (failure) => { error = failure; });
  assert.ifError(error);
  assert.equal(transport.auth.user, verified.emailSmtpUser);
  assert.equal(transport.auth.pass, verified.emailSmtpPass);
  assert.equal(mail.to, 'customer@example.test');
  assert.ok(mail.from.includes(verified.emailSmtpUser));
  assert.equal(response.message, 'Email sent successfully');
});
