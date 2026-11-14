import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { buildSmtpOverride } from '../utils/mailer.js';
import { httpError } from '../utils/httpError.js';

export async function employeeLoginEmailSettings(ownerUserId) {
  const settings = await BusinessSettings.findOne({ userId: ownerUserId }).select('+emailSmtpPass').lean();
  const smtp = buildSmtpOverride(settings);
  if (!smtp || !settings.emailSmtpVerifiedAt) {
    throw httpError(403, 'Your business administrator must verify the Google app password before employee login can send OTPs.');
  }
  const fingerprint = createHmac('sha256', env.jwtSecret).update(JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.user, smtp.pass, settings.emailSmtpVerifiedAt])).digest('hex');
  return { settings, smtp, fingerprint };
}
