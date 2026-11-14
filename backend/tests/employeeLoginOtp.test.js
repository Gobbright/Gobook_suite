import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import nodemailer from 'nodemailer';
import { AppUser } from '../src/models/AppUser.js';
import { BusinessSettings } from '../src/models/BusinessSettings.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeLogin } from '../src/models/EmployeeLogin.js';
import { PendingEmployeeLogin } from '../src/models/PendingEmployeeLogin.js';
import { SecuritySession } from '../src/models/SecuritySession.js';
import { EmployeeNotification } from '../src/models/EmployeeNotification.js';
import { employeeAccessView } from '../src/services/employeeAccess.js';
import { startEmployeeLogin, verifyEmployeeLoginOtp, resendEmployeeLoginOtp } from '../src/modules/employee-portal/employeeLoginController.js';
import { saveEmailSettings } from '../src/modules/retail/more-modules/emailController.js';
import { updateSettings } from '../src/modules/settings/settingsController.js';

afterEach(() => mock.restoreAll());
const ownerId = '507f1f77bcf86cd799439011';
const password = 'EmployeeOnly@123';
const passwordHash = await bcrypt.hash(password, 4);
const query = (value) => ({ select() { return this; }, limit() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
async function invoke(handler, body, extra = {}) {
  const result = { status: 200 };
  await handler({ body, ...extra }, { status(code) { result.status = code; return this; }, json(data) { result.data = data; return this; } }, (error) => { result.error = error; });
  return result;
}
function fixture() {
  const owner = { _id: ownerId, name: 'Owner', businessName: 'Anbu Retail', email: 'owner@example.test', status: 'Active' };
  const employee = { _id: '507f1f77bcf86cd799439022', userId: ownerId, name: 'Employee One', employeeId: 'EMP-001', email: 'employee@example.test', loginAccess: true, status: 'Active', portalVersion: 1 };
  const access = employeeAccessView(employee, owner);
  employee.portalAlias = access.businessSlug;
  const login = { _id: '507f1f77bcf86cd799439033', ownerUserId: ownerId, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, role: 'employee', loginEnabled: true, status: 'Active', passwordHash };
  const settings = { logoUrl: '/api/files/logos/own-business', emailSmtpHost: 'smtp.gmail.com', emailSmtpUser: 'business@gmail.com', emailSmtpPass: 'verified-app-password', emailSmtpPort: 587, emailSmtpSecure: false, emailSmtpVerifiedAt: new Date('2026-11-12T01:00:00Z') };
  let pending;
  const mails = [];
  const transports = [];
  const sessions = mock.method(SecuritySession, 'create', async () => ({}));
  mock.method(EmployeeNotification, 'create', async (data) => ({ _id: '507f1f77bcf86cd799439055', ...data }));
  mock.method(EmployeeNotification, 'updateOne', async () => ({ matchedCount: 1 }));
  mock.method(AppUser, 'findOne', (filter) => query(filter.email === owner.email && owner.status === 'Active' ? owner : null));
  mock.method(AppUser, 'findById', (id) => { assert.equal(String(id), ownerId); return query(owner); });
  mock.method(Employee, 'find', () => query([employee]));
  mock.method(Employee, 'updateOne', async (filter, update) => { assert.equal(String(filter.userId), ownerId); Object.assign(employee, update.$set); return { matchedCount: 1 }; });
  mock.method(Employee, 'findOne', (filter) => { assert.equal(String(filter.userId), ownerId); assert.equal(filter.employeeId, employee.employeeId); return query(employee); });
  mock.method(EmployeeLogin, 'findOne', (filter) => { assert.equal(String(filter.ownerUserId), ownerId); return query(login); });
  mock.method(EmployeeLogin, 'findById', () => query(login));
  mock.method(BusinessSettings, 'findOne', (filter) => { assert.deepEqual(filter, { userId: ownerId }); return query(settings); });
  mock.method(nodemailer, 'createTransport', (options) => { transports.push(options); return { verify: async () => true, sendMail: async (mail) => { mails.push(mail); } }; });
  const matches = (filter) => pending && (!filter.challengeHash || pending.challengeHash === filter.challengeHash) && (!filter.otpHash || (typeof filter.otpHash === 'object' ? Boolean(pending.otpHash) : filter.otpHash === pending.otpHash)) && (!('consumedAt' in filter) || pending.consumedAt === filter.consumedAt) && (!filter.otpExpiresAt || pending.otpExpiresAt > filter.otpExpiresAt.$gt) && (!filter.otpAttempts || pending.otpAttempts < filter.otpAttempts.$lt);
  mock.method(PendingEmployeeLogin, 'updateOne', async (filter, update) => {
    if (update.$setOnInsert) { pending ||= { _id: '507f1f77bcf86cd799439044', employeeLoginId: login._id, otpAttempts: 0, consumedAt: null, ...update.$setOnInsert }; return { modifiedCount: 0 }; }
    if (!matches(filter)) return { modifiedCount: 0 };
    Object.assign(pending, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete pending[key];
    return { modifiedCount: 1 };
  });
  mock.method(PendingEmployeeLogin, 'findOneAndUpdate', (filter, update) => {
    if (!pending || (filter.sentAt ? pending.sentAt > filter.sentAt.$lte : !matches(filter))) return query(null);
    if (update.$set) Object.assign(pending, update.$set);
    if (update.$inc) pending.otpAttempts += update.$inc.otpAttempts;
    return query({ ...pending });
  });
  mock.method(PendingEmployeeLogin, 'findOne', (filter) => query(matches(filter) ? { ...pending } : null));
  return { owner, employee, login, settings, mails, transports, sessions, access, get pending() { return pending; }, credentials: { username: owner.email, employeeId: employee.employeeId, password } };
}
async function start(state) {
  const result = await invoke(startEmployeeLogin, state.credentials);
  assert.ifError(result.error);
  assert.equal(result.status, 202);
  return { challengeId: result.data.challengeId, otp: state.mails.at(-1).html.match(/>([0-9]{6})</)[1] };
}

async function withLoginMode(nodeEnv, skip, run) {
  const previous = { nodeEnv: env.nodeEnv, employeeLoginSkipOtp: env.employeeLoginSkipOtp };
  Object.assign(env, { nodeEnv, employeeLoginSkipOtp: skip });
  try { await run(); } finally { Object.assign(env, previous); }
}

test('development skip logs in with a valid password without mail setup or email verification', async () => {
  await withLoginMode('development', true, async () => {
    const state = fixture();
    state.settings.emailSmtpVerifiedAt = null;
    const result = await invoke(startEmployeeLogin, state.credentials);
    assert.ifError(result.error);
    assert.equal(result.data.otpRequired, false);
    assert.ok(result.data.token);
    assert.equal(result.data.user.employeeId, state.employee.employeeId);
    assert.equal(result.data.user.businessLogoUrl, state.settings.logoUrl);
    assert.equal(state.sessions.mock.callCount(), 1);
    assert.equal(state.mails.length, 0);
    assert.equal(state.pending, undefined);
    assert.equal(state.employee.emailVerifiedAt, undefined);
  });
});

test('development skip still rejects incorrect passwords and disabled employee access', async () => {
  await withLoginMode('development', true, async () => {
    const state = fixture();
    assert.equal((await invoke(startEmployeeLogin, { ...state.credentials, password: 'wrong' })).error.statusCode, 401);
    state.employee.loginAccess = false;
    assert.equal((await invoke(startEmployeeLogin, state.credentials)).error.statusCode, 401);
    assert.equal(state.sessions.mock.callCount(), 0);
  });
});

test('production requires OTP to the employee email even if the skip flag is enabled', async () => {
  await withLoginMode('production', true, async () => {
    const state = fixture();
    const result = await invoke(startEmployeeLogin, { ...state.credentials, skipOtp: true });
    assert.ifError(result.error);
    assert.equal(result.status, 202);
    assert.equal(result.data.otpRequired, true);
    assert.equal(result.data.token, undefined);
    assert.equal(state.sessions.mock.callCount(), 0);
    assert.equal(state.mails[0].to, state.employee.email);
  });
});

for (const identifierType of ['employeeId', 'email']) test(`three-field login accepts ${identifierType} and sends OTP only to the saved employee email`, async () => {
  const state = fixture();
  const result = await invoke(startEmployeeLogin, { businessName: state.owner.businessName, identifier: state.employee[identifierType], password });
  assert.ifError(result.error);
  assert.equal(result.status, 202);
  assert.equal(state.mails[0].to, state.employee.email);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('three-field login rejects another business or employee identifier before sending OTP', async () => {
  const state = fixture();
  for (const changes of [{ businessName: 'Wrong business' }, { identifier: 'EMP-999' }, { identifier: 'other@example.test' }, { identifier: { $ne: '' } }]) {
    const result = await invoke(startEmployeeLogin, { businessName: state.owner.businessName, identifier: state.employee.employeeId, password, ...changes });
    assert.equal(result.error.statusCode, 401);
  }
  assert.equal(state.mails.length, 0);
});

test('employee name, business name, ID and email send OTP only to the saved employee email', async () => {
  const state = fixture();
  const result = await invoke(startEmployeeLogin, { username: state.employee.name, businessName: state.owner.businessName, employeeId: state.employee.employeeId, employeeEmail: state.employee.email, password });
  assert.ifError(result.error);
  assert.equal(result.status, 202);
  assert.equal(state.mails[0].to, state.employee.email);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('mismatched employee name, email and business cannot redirect an OTP', async () => {
  const state = fixture();
  const body = { username: state.employee.name, businessName: state.owner.businessName, employeeId: state.employee.employeeId, employeeEmail: state.employee.email, password };
  for (const change of [{ username: 'Another employee' }, { businessName: 'Another business' }, { employeeEmail: 'other@example.test' }]) {
    assert.equal((await invoke(startEmployeeLogin, { ...body, ...change })).error.statusCode, 401);
  }
  assert.equal(state.mails.length, 0);
});

test('password verification sends an OTP only from the verified owner mailbox and cannot issue a session', async () => {
  const state = fixture();
  const proof = await start(state);
  assert.equal(state.sessions.mock.callCount(), 0);
  assert.equal(state.mails[0].to, state.employee.email);
  assert.equal(state.transports[0].auth.user, state.settings.emailSmtpUser);
  assert.equal(state.transports[0].auth.pass, state.settings.emailSmtpPass);
  assert.notEqual(state.pending.challengeHash, proof.challengeId);
  assert.notEqual(state.pending.otpHash, proof.otp);
  assert.equal(await bcrypt.compare(proof.otp, state.pending.otpHash), true);
  const result = await invoke(verifyEmployeeLoginOtp, proof);
  assert.ifError(result.error);
  assert.ok(result.data.token);
  assert.equal(result.data.user.businessLogoUrl, state.settings.logoUrl);
  assert.equal(result.data.user.ownerUserId, ownerId);
  assert.equal(result.data.user.role, 'employee');
  assert.equal(result.data.user.loginPath, '/employee-login');
  assert.equal(state.employee.emailVerifiedAddress, state.employee.email);
  assert.ok(state.employee.emailVerifiedAt instanceof Date);
  assert.equal(state.sessions.mock.callCount(), 1);
  assert.equal((await invoke(verifyEmployeeLoginOtp, proof)).error.statusCode, 400);
  assert.equal(state.sessions.mock.callCount(), 1);
});

test('wrong credentials, query objects and another business username never send email', async () => {
  const state = fixture();
  for (const body of [{ ...state.credentials, password: 'Wrong-password' }, { ...state.credentials, username: 'other@example.test' }, { ...state.credentials, username: { $ne: '' } }, { ...state.credentials, employeeId: {} }, { ...state.credentials, password: 'x'.repeat(73) }]) {
    assert.equal((await invoke(startEmployeeLogin, body)).error.statusCode, 401);
  }
  assert.equal(state.mails.length, 0);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('legacy personal login links also require employee email OTP', async () => {
  const state = fixture();
  const result = await invoke(startEmployeeLogin, { ...state.credentials, businessSlug: state.access.businessSlug });
  assert.ifError(result.error);
  assert.equal(result.data.otpRequired, true);
  assert.equal(result.data.token, undefined);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('unverified sender and disabled accounts cannot start employee sign-in', async () => {
  const state = fixture();
  state.settings.emailSmtpVerifiedAt = null;
  assert.equal((await invoke(startEmployeeLogin, state.credentials)).error.statusCode, 403);
  state.settings.emailSmtpVerifiedAt = new Date();
  state.employee.loginAccess = false;
  assert.equal((await invoke(startEmployeeLogin, state.credentials)).error.statusCode, 401);
  assert.equal(state.mails.length, 0);
});

test('SMTP failure invalidates the unsent OTP and does not expose provider credentials', async () => {
  const state = fixture();
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('private SMTP credentials'); } }));
  const result = await invoke(startEmployeeLogin, state.credentials);
  assert.equal(result.error.statusCode, 503);
  assert.doesNotMatch(result.error.message, /private SMTP credentials/);
  assert.equal(state.pending.otpHash, undefined);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('five wrong guesses exhaust the challenge, and an expired challenge cannot authenticate', async () => {
  const state = fixture();
  const proof = await start(state);
  const wrong = proof.otp === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++) assert.equal((await invoke(verifyEmployeeLoginOtp, { ...proof, otp: wrong })).error.statusCode, 400);
  assert.equal(state.pending.otpAttempts, 5);
  assert.equal((await invoke(verifyEmployeeLoginOtp, proof)).error.statusCode, 400);
  state.pending.otpAttempts = 0;
  state.pending.otpExpiresAt = new Date(0);
  assert.equal((await invoke(verifyEmployeeLoginOtp, proof)).error.statusCode, 400);
  assert.equal(state.sessions.mock.callCount(), 0);
});

test('resend enforces cooldown, rotates the challenge and rejects the old proof', async () => {
  const state = fixture();
  const proof = await start(state);
  assert.equal((await invoke(resendEmployeeLoginOtp, proof)).error.statusCode, 429);
  assert.equal(state.mails.length, 1);
  state.pending.sentAt = new Date(Date.now() - 61000);
  const result = await invoke(resendEmployeeLoginOtp, proof);
  assert.ifError(result.error);
  assert.notEqual(result.data.challengeId, proof.challengeId);
  assert.equal(state.mails.length, 2);
  assert.equal((await invoke(verifyEmployeeLoginOtp, proof)).error.statusCode, 400);
});

for (const change of ['password', 'email', 'qr', 'sender', 'disabled']) {
  test(`pending OTP cannot authenticate after ${change} changes`, async () => {
    const state = fixture();
    const proof = await start(state);
    if (change === 'password') state.login.passwordHash = 'replacement-hash';
    if (change === 'email') state.employee.email = 'replacement@example.test';
    if (change === 'qr') state.employee.portalVersion++;
    if (change === 'sender') state.settings.emailSmtpPass = 'replacement-password';
    if (change === 'disabled') state.login.loginEnabled = false;
    assert.ok((await invoke(verifyEmployeeLoginOtp, proof)).error);
    assert.equal(state.sessions.mock.callCount(), 0);
  });
}

test('business email setup verifies credentials before saving and returns no app password', async () => {
  let verified = false;
  mock.method(nodemailer, 'createTransport', () => ({ verify: async () => { verified = true; } }));
  mock.method(BusinessSettings, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(verified, true);
    assert.deepEqual(filter, { userId: ownerId });
    assert.equal(update.$set.emailSmtpPass, 'abcdefghijklmnop');
    assert.ok(update.$set.emailSmtpVerifiedAt instanceof Date);
    return { emailSmtpUser: 'owner@gmail.com', emailSmtpVerifiedAt: update.$set.emailSmtpVerifiedAt };
  });
  const result = await invoke(saveEmailSettings, { email: 'OWNER@gmail.com', appPassword: 'abcd efgh ijkl mnop' }, { user: { id: ownerId } });
  assert.ifError(result.error);
  assert.equal(result.data.configured, true);
  assert.equal(result.data.emailSmtpPass, undefined);
  assert.equal(result.data.appPassword, undefined);
});

test('failed email verification never saves credentials', async () => {
  mock.method(nodemailer, 'createTransport', () => ({ verify: async () => { throw new Error('provider failure'); } }));
  const save = mock.method(BusinessSettings, 'findOneAndUpdate', async () => { throw new Error('Must not save'); });
  assert.equal((await invoke(saveEmailSettings, { email: 'owner@gmail.com', appPassword: 'abcdefghijklmnop' }, { user: { id: ownerId } })).error.statusCode, 400);
  assert.equal(save.mock.callCount(), 0);
});

test('general settings cannot forge SMTP verification or leak the saved app password', async () => {
  const settings = { userId: ownerId, emailSmtpUser: 'old@gmail.com', emailSmtpPass: 'saved-secret', emailSmtpVerifiedAt: new Date(), save: async () => {}, toObject() { return { ...this }; } };
  mock.method(BusinessSettings, 'findOne', () => query(settings));
  const result = await invoke(updateSettings, { emailSmtpUser: 'new@gmail.com', emailSmtpVerifiedAt: new Date(), userId: 'another-owner' }, { user: { id: ownerId }, query: {} });
  assert.ifError(result.error);
  assert.equal(settings.userId, ownerId);
  assert.equal(settings.emailSmtpVerifiedAt, undefined);
  assert.equal(result.data.emailSmtpPass, undefined);
});

test('saving an unrelated preference preserves existing SMTP verification and the hidden password', async () => {
  const verifiedAt = new Date();
  const settings = { userId: ownerId, emailSmtpUser: 'owner@gmail.com', emailSmtpPass: 'saved-secret', emailSmtpVerifiedAt: verifiedAt, save: async () => {}, toObject() { return { ...this }; } };
  mock.method(BusinessSettings, 'findOne', () => query(settings));
  const result = await invoke(updateSettings, { emailNotifications: true, emailSmtpUser: 'owner@gmail.com', emailSmtpPass: '', emailSmtpVerifiedAt: 'forged' }, { user: { id: ownerId }, query: {} });
  assert.ifError(result.error);
  assert.equal(settings.emailSmtpVerifiedAt, verifiedAt);
  assert.equal(settings.emailSmtpPass, 'saved-secret');
  assert.equal(result.data.emailSmtpPass, undefined);
});
