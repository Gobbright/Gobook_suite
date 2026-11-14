import { httpError } from '../../../utils/httpError.js';
import { exportGstr1Preparation, gstr1Response, loadGstr1Preparation, prepareGstr1, recordGstr1Filing } from '../../../services/gstr1Preparation.js';

export async function getGstr1(req, res, next) {
  try { res.json(gstr1Response(await loadGstr1Preparation(req))); } catch (error) { next(error); }
}
export async function saveGstr1(req, res, next) {
  try {
    if (Object.keys(req.body || {}).some(key => !['period', 'filingType', 'expectedSourceHash'].includes(key))) throw httpError(400, 'Return source data and filing status cannot be edited directly. Edit billing records or use the preparation actions.');
    res.json(await prepareGstr1(req, 'draft'));
  } catch (error) { next(error); }
}
export async function validateGstr1(req, res, next) {
  try { res.json(await prepareGstr1(req, 'validate')); } catch (error) { next(error); }
}
export async function generateGstr1Summary(req, res, next) {
  try { res.json(await prepareGstr1(req, 'summary')); } catch (error) { next(error); }
}
export async function exportGstr1(req, res, next) {
  try { res.json(await exportGstr1Preparation(req)); } catch (error) { next(error); }
}
// Records the acknowledgement the user received after filing externally.
// No submission or GST portal verification is claimed without a provider.
export async function fileGstr1(req, res, next) {
  try { res.json(await recordGstr1Filing(req)); } catch (error) { next(error); }
}
export const autoPopulateGstr1 = getGstr1;
