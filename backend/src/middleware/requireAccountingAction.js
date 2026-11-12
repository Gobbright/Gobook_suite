import { httpError } from '../utils/httpError.js';
import { isBusinessSuperAdmin } from '../utils/tenantScope.js';

export function requireAccountingAction(action) {
  return (req, _res, next) => {
    if (isBusinessSuperAdmin(req.user) || req.user?.permissions?.modules?.includes('accounting') && req.user.permissions?.actions?.[action] === true) return next();
    return next(httpError(403, `You do not have permission to ${action} accounting records`));
  };
}
