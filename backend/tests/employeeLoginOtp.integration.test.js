import assert from 'node:assert/strict';
import test, { before, after, mock } from 'node:test';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { PendingEmployeeLogin } from '../src/models/PendingEmployeeLogin.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { EmployeeNotification } from '../src/models/EmployeeNotification.js';
import { startEmployeeLogin, verifyEmployeeLoginOtp, resendEmployeeLoginOtp } from '../src/modules/employee-portal/employeeLoginController.js';

const uri = process.env.SECURITY_TEST_MONGODB_URI;
const options = { skip: !uri };
const dbName = `gobook_employee_otp_test_${process.pid}_${Date.now()}`;
const businesses = [];
const mails = [];
async function invoke(handler, body) {
  const result = { status: 200 };
  await handler({ body }, { status(code) { result.status = code; return this; }, json(data) { result.data = data; return this; } }, (error) => { result.error = error; result.status = error.statusCode || 500; });
  return result;
}
before(async () => {
  if (!uri) return;
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([AppUser, Employee, EmployeeLogin, BusinessSettings, PendingEmployeeLogin, SecuritySession, EmployeeNotification].map((Model) => Model.init()));
  mock.method(nodemailer, 'createTransport', (transport) => ({ sendMail: async (mail) => { mails.push({ ...mail, sender: transport.auth.user }); } }));
  for (const name of ['alpha', 'beta']) {
    const owner = await AppUser.create({ name, businessName: `${name} business`, email: `${name}-owner@example.test`, status: 'Active', accountType: 'owner' });
    const employee = await Employee.create({ userId: owner._id, employeeId: 'EMP-001', name: `${name} employee`, email: `${name}-employee@example.test`, category: 'retail', status: 'Active', loginAccess: true });
    const password = `${name}Employee@123`;
    const login = await EmployeeLogin.create({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, passwordHash: await bcrypt.hash(password, 4), role: 'employee', loginEnabled: true, status: 'Active' });
    await BusinessSettings.create({ userId: owner._id, emailSmtpHost: 'smtp.gmail.com', emailSmtpPort: 587, emailSmtpUser: `${name}-sender@gmail.com`, emailSmtpPass: 'fixture-app-password', emailSmtpVerifiedAt: new Date() });
    businesses.push({ owner, employee, login, password });
  }
});
after(async () => {
  mock.restoreAll();
  if (uri && mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, dbName);
    assert.match(dbName, /^gobook_employee_otp_test_\d+_\d+$/);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
async function start(business) {
  const result = await invoke(startEmployeeLogin, { username: business.owner.email, employeeId: 'EMP-001', password: business.password, email: 'forged-destination@example.test', ownerUserId: '507f1f77bcf86cd799439099' });
  assert.equal(result.status, 202, result.error?.message);
  assert.equal(result.data.token, undefined);
  const mail = mails.findLast((item) => item.to === business.employee.email);
  return { challengeId: result.data.challengeId, otp: mail.html.match(/>([0-9]{6})</)[1] };
}
let alphaProof, betaProof;

test('shared login isolates duplicate employee IDs across businesses and uses each verified sender', options, async () => {
  alphaProof = await start(businesses[0]);
  betaProof = await start(businesses[1]);
  assert.notEqual(alphaProof.challengeId, betaProof.challengeId);
  assert.deepEqual(mails.map((mail) => [mail.to, mail.sender]), [['alpha-employee@example.test', 'alpha-sender@gmail.com'], ['beta-employee@example.test', 'beta-sender@gmail.com']]);
  assert.equal(await SecuritySession.countDocuments({}), 0);
  assert.equal((await Employee.findById(businesses[0].employee._id)).emailVerifiedAt, undefined);
  const wrongBusinessPassword = await invoke(startEmployeeLogin, { username: businesses[0].owner.email, employeeId: 'EMP-001', password: businesses[1].password });
  assert.equal(wrongBusinessPassword.status, 401);
  assert.equal(mails.length, 2);
});

test('concurrent successful OTP submissions create exactly one employee session', options, async () => {
  const results = await Promise.all([invoke(verifyEmployeeLoginOtp, alphaProof), invoke(verifyEmployeeLoginOtp, alphaProof)]);
  assert.equal(results.filter((result) => result.data?.token).length, 1);
  assert.equal(results.filter((result) => result.error?.statusCode === 400).length, 1);
  const user = results.find((result) => result.data?.user).data.user;
  assert.equal(user.ownerUserId, String(businesses[0].owner._id));
  assert.equal(user.employeeId, 'EMP-001');
  assert.equal(await SecuritySession.countDocuments({ subject: String(businesses[0].login._id) }), 1);
  const verified = await Employee.findById(businesses[0].employee._id).lean();
  assert.equal(verified.emailVerifiedAddress, businesses[0].employee.email);
  assert.ok(verified.emailVerifiedAt instanceof Date);
});

test('concurrent wrong guesses reserve at most five attempts before comparison', options, async () => {
  const attempts = await Promise.all(Array.from({ length: 10 }, () => invoke(verifyEmployeeLoginOtp, { ...betaProof, otp: '000000' })));
  assert.ok(attempts.every((result) => result.status === 400));
  const stored = await PendingEmployeeLogin.findOne({ employeeLoginId: businesses[1].login._id }).lean();
  assert.equal(stored.otpAttempts, 5);
  assert.equal((await invoke(verifyEmployeeLoginOtp, betaProof)).status, 400);
  assert.equal(await SecuritySession.countDocuments({ subject: String(businesses[1].login._id) }), 0);
});

test('concurrent resend claims send one email, rotate proof and invalidate the previous challenge', options, async () => {
  const beforeCount = mails.length;
  await PendingEmployeeLogin.updateOne({ employeeLoginId: businesses[1].login._id }, { $set: { sentAt: new Date(Date.now() - 61000) } });
  const results = await Promise.all([invoke(resendEmployeeLoginOtp, betaProof), invoke(resendEmployeeLoginOtp, betaProof)]);
  assert.equal(results.filter((result) => result.status === 202).length, 1);
  assert.equal(mails.length, beforeCount + 1);
  assert.equal((await invoke(verifyEmployeeLoginOtp, betaProof)).status, 400);
  betaProof = { challengeId: results.find((result) => result.status === 202).data.challengeId, otp: mails.at(-1).html.match(/>([0-9]{6})</)[1] };
});

test('a password changed after OTP delivery prevents session creation', options, async () => {
  await EmployeeLogin.updateOne({ _id: businesses[1].login._id }, { $set: { passwordHash: await bcrypt.hash('Replacement@123', 4) } });
  assert.equal((await invoke(verifyEmployeeLoginOtp, betaProof)).status, 400);
  assert.equal(await SecuritySession.countDocuments({ subject: String(businesses[1].login._id) }), 0);
});
