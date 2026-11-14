import { AppUser } from '../models/AppUser.js';
import { BusinessSettings } from '../models/BusinessSettings.js';
import { Branch } from '../models/Branch.js';
import { Invoice } from '../models/Invoice.js';
import { branchScopedQuery, resolveBranchScope } from '../utils/branchScope.js';

// Use the same business and branch permissions as the invoice reports.
// A missing GSTIN stays empty; the dashboard never substitutes a sample identity.
export async function gstDashboardContext(req) {
  const owner = req.user.businessId
    ? await AppUser.findOne({ businessId: req.user.businessId, accountType: 'owner' }).select('_id').lean()
    : null;
  const ownerId = owner?._id || req.user.id;
  const [settings, invoiceScope, scope] = await Promise.all([
    BusinessSettings.findOne({ userId: ownerId }).select('businessName gstin').lean(),
    branchScopedQuery(req, { model: Invoice, ownerField: 'userId' }),
    resolveBranchScope(req),
  ]);
  let gstin = String(settings?.gstin || '').trim();
  if (scope.branch) {
    const escaped = scope.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const branch = await Branch.findOne({ userId: ownerId, $or: [{ code: new RegExp(`^${escaped}$`, 'i') }, { name: new RegExp(`^${escaped}$`, 'i') }] }).select('gstin').lean();
    if (branch?.gstin) gstin = branch.gstin.trim();
  }
  // Old sample identities are not a configured business registration.
  if (gstin === '27ZZZZZ9999A1Z5') gstin = '';
  const owners = invoiceScope.userId?.$in || (invoiceScope.userId ? [invoiceScope.userId] : []);
  return { business: { name: settings?.businessName || '', gstin }, gstin, invoiceScope, owners, ownerId, branch: scope.branch };
}
