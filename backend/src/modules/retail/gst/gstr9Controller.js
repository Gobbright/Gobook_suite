import { loadAnnual, prepareAnnual } from '../../../services/gstr9Preparation.js';

export async function getGstr9(req, res, next) {
  try { res.json((await loadAnnual(req, req.query.fy)).result); } catch (error) { next(error); }
}
const action = stage => async (req, res, next) => {
  try { res.json(await prepareAnnual(req, stage)); } catch (error) { next(error); }
};
export const saveGstr9 = action('draft');
export const validateGstr9 = action('validate');
export const summarizeGstr9 = action('summary');
export const recordGstr9Filing = action('filed');
