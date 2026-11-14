import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppUser } from '../../models/AppUser.js';
import { Employee } from '../../models/Employee.js';
import { EmployeeLogin } from '../../models/EmployeeLogin.js';
import { PendingEmployeeLogin } from '../../models/PendingEmployeeLogin.js';
import { EmployeeNotification } from '../../models/EmployeeNotification.js';
import { BusinessSettings } from '../../models/BusinessSettings.js';
import { employeeMailBranding } from '../../services/employeeMailBranding.js';
import { EMPLOYEE_ACTIVE_STATUSES, employeeCredential, rememberEmployeeAccess, resolveEmployeeLink } from '../../services/employeeAccess.js';
import { employeeLoginEmailSettings } from '../../services/employeeLoginEmail.js';
import { safePortalUser, signPortalToken } from '../../services/employeePortalSession.js';
import { createSecuritySession, credentialHash } from '../../services/securitySessions.js';
import { buildBrandedEmail, sendMail } from '../../utils/mailer.js';
import { httpError } from '../../utils/httpError.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalidCredentials = () => httpError(401, 'Invalid business name, employee ID/email or password.');
const invalidOtp = () => httpError(400, 'Invalid, expired or already used OTP. Request a new code.');

async function employeeSession(owner, employee, login, businessLogoUrl = '') {
  const access = await rememberEmployeeAccess(employee, owner);
  const user = safePortalUser({ id: login._id, ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, name: employee.name, email: employee.email, role: 'employee', category: employee.category || login.category, businessName: owner.businessName || owner.name, businessLogoUrl, loginPath: '/employee-login', portalBasePath: access.portalBasePath });
  const sid = await createSecuritySession(user.id, 'employee-portal', employeeCredential(login.passwordHash, employee), env.jwtExpiresIn);
  return { token: signPortalToken(user, sid), user };
}

function assertAccess(owner, employee, login) {
  if (!owner || owner.status !== 'Active' || !employee || !login || login.role !== 'employee' || !login.loginEnabled || login.status !== 'Active' || !employee.loginAccess || !EMPLOYEE_ACTIVE_STATUSES.includes(employee.status)) throw invalidCredentials();
}
function challengeId(body) {
  if (typeof body?.challengeId !== 'string' || !/^[a-f\d]{64}$/i.test(body.challengeId)) throw invalidOtp();
  return body.challengeId;
}
function maskedEmail(email) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}
async function currentIdentity(pending) {
  const [owner, employee, login] = await Promise.all([
    AppUser.findById(pending.ownerUserId).select('name businessName status email').lean(),
    Employee.findOne({ _id: pending.employeeObjectId, userId: pending.ownerUserId, employeeId: pending.employeeId }).lean(),
    EmployeeLogin.findById(pending.employeeLoginId).select('+passwordHash').lean(),
  ]);
  assertAccess(owner, employee, login);
  if (String(login.ownerUserId) !== String(pending.ownerUserId) || String(login.employeeObjectId) !== String(pending.employeeObjectId) || login.employeeId !== pending.employeeId || credentialHash(employeeCredential(login.passwordHash, employee)) !== pending.credentialHash || normalizeEmail(employee.email) !== pending.recipientEmail) throw invalidOtp();
  const sender = await employeeLoginEmailSettings(pending.ownerUserId);
  if (sender.fingerprint !== pending.senderFingerprint) throw invalidOtp();
  return { owner, employee, login, sender };
}

async function sendChallenge({ owner, employee, login, sender }, res) {
  const email = normalizeEmail(employee.email);
  if (!EMAIL.test(email)) throw httpError(403, 'Ask your administrator to add a valid employee email before signing in.');
  const rawChallenge = randomBytes(32).toString('hex');
  const otp = String(randomInt(100000, 1000000));
  const now = new Date();
  // A unique per-login row and an atomic cooldown claim prevent concurrent sends.
  await PendingEmployeeLogin.updateOne({ employeeLoginId: login._id }, { $setOnInsert: { _id: login._id, ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, recipientEmail: email, otpExpiresAt: new Date(Date.now() + 600000), sentAt: new Date(0) } }, { upsert: true });
  const pending = await PendingEmployeeLogin.findOneAndUpdate({ employeeLoginId: login._id, sentAt: { $lte: new Date(now.getTime() - 60000) } }, { $set: {
    ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, recipientEmail: email,
    challengeHash: hash(rawChallenge), credentialHash: credentialHash(employeeCredential(login.passwordHash, employee)), senderFingerprint: sender.fingerprint,
    otpHash: await bcrypt.hash(otp, 12), otpAttempts: 0, otpExpiresAt: new Date(now.getTime() + 600000), sentAt: now, consumedAt: null,
  } }, { new: true });
  if (!pending) throw httpError(429, 'Please wait 60 seconds before requesting another OTP.');
  let notification;
  try {
    const brand = await employeeMailBranding(owner._id, sender.settings, owner.businessName || owner.name);
    notification = await EmployeeNotification.create({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name, recipientEmail: email, senderEmail: sender.smtp.user, requestKey: hash(rawChallenge), kind: 'login-otp', title: 'Employee sign-in OTP', message: 'A sign-in OTP was requested for your employee account. If you did not request it, contact your administrator.', emailStatus: 'Sending', attempts: 1 });
    const info = await sendMail({ to: email, subject: `${brand.branding.name} employee login OTP`, smtp: { ...sender.smtp, from: { name: brand.branding.name, address: sender.smtp.user } }, attachments: brand.attachments, html: buildBrandedEmail({
      branding: brand.branding, footerText: `Sent securely by ${brand.branding.name}.`,
      title: 'Verify your employee login', greeting: `Hi ${employee.name || login.name},`,
      intro: `Use this code to sign in to ${owner.businessName || owner.name}. Employee ID: ${employee.employeeId}. The code expires in 10 minutes.`,
      otp, notice: 'Do not share this code. If you did not request this login, ignore this email.', badge: 'Employee sign-in',
    }) });
    if (info?.rejected?.length) throw new Error('Recipient rejected');
    await EmployeeNotification.updateOne({ _id: notification._id }, { $set: { emailStatus: 'Accepted', sentAt: new Date() } });
  } catch {
    await PendingEmployeeLogin.updateOne({ employeeLoginId: login._id, challengeHash: hash(rawChallenge) }, { $unset: { otpHash: 1 }, $set: { consumedAt: new Date(), otpExpiresAt: new Date(0) } });
    if (notification) await EmployeeNotification.updateOne({ _id: notification._id }, { $set: { emailStatus: 'Failed', lastError: 'OTP email could not be sent. Check the app password connection and employee email.' } });
    throw httpError(503, 'Unable to send your OTP. Ask your administrator to check the verified business email connection.');
  }
  res.status(202).json({ otpRequired: true, challengeId: rawChallenge, maskedEmail: maskedEmail(email), expiresInSeconds: 600, resendAfterSeconds: 60, message: 'OTP sent to your employee email.' });
}

export async function startEmployeeLogin(req, res, next) {
  try {
    const { password } = req.body || {};
    const employeeId = req.body?.identifier ?? req.body?.employeeId;
    if (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) throw invalidCredentials();
    let owner, employee;
    if (req.body.businessSlug) {
      ({ owner, employee } = await resolveEmployeeLink(req.body));
    } else if (req.body.identifier !== undefined) {
      if (typeof req.body.businessName !== 'string' || !req.body.businessName.trim() || req.body.businessName.length > 200) throw invalidCredentials();
      const identifier = employeeId.trim();
      const candidates = await Employee.find(EMAIL.test(identifier) ? { email: normalizeEmail(identifier) } : { employeeId: identifier }).limit(20).lean();
      const matches = [];
      for (const candidate of candidates) {
        const business = await AppUser.findById(candidate.userId).select('name email businessName status').lean();
        if (business && (business.businessName || business.name || '').trim().toLowerCase() === req.body.businessName.trim().toLowerCase()) matches.push({ owner: business, employee: candidate });
      }
      if (matches.length !== 1) throw invalidCredentials();
      ({ owner, employee } = matches[0]);
    } else if (req.body.businessName !== undefined || req.body.employeeEmail !== undefined) {
      const email = normalizeEmail(req.body.employeeEmail);
      const businessName = req.body.businessName;
      if (!EMAIL.test(email) || email.length > 254 || typeof businessName !== 'string' || !businessName.trim() || businessName.length > 200) throw invalidCredentials();
      const candidates = await Employee.find({ email, employeeId: employeeId.trim() }).limit(20).lean();
      const matches = [];
      for (const candidate of candidates) {
        const business = await AppUser.findById(candidate.userId).select('name email businessName status').lean();
        if (business && (business.businessName || business.name || '').trim().toLowerCase() === businessName.trim().toLowerCase()) matches.push({ owner: business, employee: candidate });
      }
      if (matches.length !== 1) throw invalidCredentials();
      ({ owner, employee } = matches[0]);
    } else {
      const username = normalizeEmail(req.body.username);
      if (!EMAIL.test(username) || username.length > 254) throw invalidCredentials();
      owner = await AppUser.findOne({ email: username, status: 'Active', $or: [{ accountType: 'owner' }, { role: 'Super Admin' }] }).select('name email businessName status').lean();
      if (!owner) throw invalidCredentials();
      employee = await Employee.findOne({ userId: owner._id, employeeId: employeeId.trim() }).lean();
      if (!employee) throw invalidCredentials();
    }
    if (req.body.employeeEmail !== undefined && (normalizeEmail(req.body.employeeEmail) !== normalizeEmail(employee.email) || typeof req.body.username !== 'string' || req.body.username.trim().toLowerCase() !== employee.name.trim().toLowerCase() || typeof req.body.businessName !== 'string' || req.body.businessName.trim().toLowerCase() !== (owner.businessName || owner.name || '').trim().toLowerCase())) throw invalidCredentials();
    if (req.body.identifier !== undefined && (typeof req.body.businessName !== 'string' || req.body.businessName.trim().toLowerCase() !== (owner.businessName || owner.name || '').trim().toLowerCase() || ![employee.employeeId, normalizeEmail(employee.email)].includes(EMAIL.test(employeeId.trim()) ? normalizeEmail(employeeId) : employeeId.trim()))) throw invalidCredentials();
    const login = await EmployeeLogin.findOne({ ownerUserId: owner._id, employeeObjectId: employee._id, employeeId: employee.employeeId }).select('+passwordHash').lean();
    assertAccess(owner, employee, login);
    if (!(await bcrypt.compare(password, login.passwordHash))) throw invalidCredentials();
    if (env.nodeEnv === 'development' && env.employeeLoginSkipOtp) {
      const settings = await BusinessSettings.findOne({ userId: owner._id }).select('logoUrl').lean();
      return res.json({ otpRequired: false, ...await employeeSession(owner, employee, login, settings?.logoUrl || '') });
    }
    const sender = await employeeLoginEmailSettings(owner._id);
    await sendChallenge({ owner, employee, login, sender }, res);
  } catch (error) { next(error.code === 11000 ? httpError(429, 'Please wait before requesting another OTP.') : error); }
}

export async function verifyEmployeeLoginOtp(req, res, next) {
  try {
    const reference = challengeId(req.body);
    if (typeof req.body.otp !== 'string' || !/^\d{6}$/.test(req.body.otp)) throw invalidOtp();
    const pending = await PendingEmployeeLogin.findOneAndUpdate({ challengeHash: hash(reference), consumedAt: null, otpExpiresAt: { $gt: new Date() }, otpHash: { $exists: true, $ne: '' }, otpAttempts: { $lt: 5 } }, { $inc: { otpAttempts: 1 } }, { new: true }).select('+otpHash +credentialHash +senderFingerprint');
    if (!pending || !(await bcrypt.compare(req.body.otp, pending.otpHash))) throw invalidOtp();
    const { owner, employee, login, sender } = await currentIdentity(pending);
    const consumed = await PendingEmployeeLogin.updateOne({ _id: pending._id, challengeHash: pending.challengeHash, otpHash: pending.otpHash, consumedAt: null, otpExpiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() }, $unset: { otpHash: 1 } });
    if (consumed.modifiedCount !== 1) throw invalidOtp();
    const verifiedAt = new Date();
    const verified = await Employee.updateOne({ _id: employee._id, userId: owner._id, email: employee.email }, { $set: { emailVerifiedAddress: normalizeEmail(employee.email), emailVerifiedAt: verifiedAt } });
    if (verified.matchedCount === 0) throw invalidOtp();
    const session = await employeeSession(owner, employee, login, sender.settings.logoUrl || '');
    await EmployeeNotification.updateOne({ ownerUserId: owner._id, employeeObjectId: employee._id, requestKey: pending.challengeHash, kind: 'login-otp' }, { $set: { verifiedAt: new Date() } });
    res.json(session);
  } catch (error) { next(error); }
}

export async function resendEmployeeLoginOtp(req, res, next) {
  try {
    const reference = challengeId(req.body);
    const pending = await PendingEmployeeLogin.findOne({ challengeHash: hash(reference), consumedAt: null, otpExpiresAt: { $gt: new Date() } }).select('+credentialHash +senderFingerprint').lean();
    if (!pending) throw invalidOtp();
    await sendChallenge(await currentIdentity(pending), res);
  } catch (error) { next(error.code === 11000 ? httpError(429, 'Please wait before requesting another OTP.') : error); }
}
