import { businessEmailSettings, canManageBusinessEmail, isBusinessEmailVerified } from '../services/businessEmail.js';
import { httpError } from '../utils/httpError.js';

export async function requireVerifiedBusinessEmail(req, res, next) {
  try {
    const settings = await businessEmailSettings(req.user);
    if (!isBusinessEmailVerified(settings)) {
      return res.status(403).json({
        code: 'BUSINESS_EMAIL_VERIFICATION_REQUIRED',
        message: 'Verify the Google app password for your business Gmail before adding employees, using email marketing or sending business emails.',
        setupPath: '/email-setup',
      });
    }
    req.businessEmailSettings = settings;
    next();
  } catch (error) { next(error); }
}

export function requireBusinessEmailAdmin(req, _res, next) {
  if (!canManageBusinessEmail(req.user)) return next(httpError(403, 'Only the main business user can connect the business email.'));
  next();
}
