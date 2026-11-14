import { CATEGORIES, COMMON_CATEGORY_MODULES, EXCLUSIVE_MODULES_BY_CATEGORY } from '../constants/categories.js';
import { httpError } from '../utils/httpError.js';

// Shared billing remains subject to authentication, subscription, module permissions,
// and tenant scoping. Specialty modules retain their category boundaries.
export function requireCategoryModule(moduleKey) {
  return function (req, _res, next) {
    if (CATEGORIES.includes(req.user?.category) && COMMON_CATEGORY_MODULES.includes(moduleKey)) return next();
    const allowed = EXCLUSIVE_MODULES_BY_CATEGORY[req.user?.category] || [];
    if (!allowed.includes(moduleKey)) {
      return next(httpError(404, 'Not found'));
    }
    next();
  };
}
