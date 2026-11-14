import { AppUser } from '../models/AppUser.js';
import { BusinessSettings } from '../models/BusinessSettings.js';

export function canManageBusinessEmail(user = {}) {
  return user.isSuperAdmin === true || user.accountType === 'owner' || user.role === 'Super Admin';
}

export async function businessEmailOwnerId(user) {
  if (!user.businessId || canManageBusinessEmail(user)) return user.id;
  const owner = await AppUser.findOne({ businessId: user.businessId, accountType: 'owner' }).select('_id').lean();
  // Never fall back to a member's mailbox when a business owner is missing.
  return owner?._id || null;
}

export function isBusinessEmailVerified(settings) {
  return Boolean(settings?.emailSmtpHost && settings?.emailSmtpUser && settings?.emailSmtpPass && settings?.emailSmtpVerifiedAt);
}

export async function businessEmailSettings(user) {
  const ownerId = await businessEmailOwnerId(user);
  return ownerId ? BusinessSettings.findOne({ userId: ownerId }).select('+emailSmtpPass').lean() : null;
}
