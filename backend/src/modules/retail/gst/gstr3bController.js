import { Gstr3b } from '../../../models/Gstr3b.js';
import { postGstr3bAccounting } from '../../../services/gstAccounting.js';
import { gstr3bAdjustments, loadGstr3bData, recordedGstr3bFiling, validateGstr3bEdits } from '../../../services/gstr3bData.js';
import { httpError } from '../../../utils/httpError.js';

export async function getGstr3b(req, res, next) {
  try { res.json((await loadGstr3bData(req, req.query.period)).result); } catch (error) { next(error); }
}
export async function saveGstr3b(req, res, next) {
  try {
    const body = req.body || {};
    const allowed = ['period', 'status', 'outwardRows', 'itcAvailable', 'itcReversed', 'lateFeeCgst', 'lateFeeSgst', 'expectedSourceHash'];
    if (Object.keys(body).some(key => !allowed.includes(key)) || (body.status && body.status !== 'draft')) throw httpError(400, 'Only draft ITC entries and late fees can be saved here.');
    validateGstr3bEdits(body);
    const loaded = await loadGstr3bData(req, body.period);
    if (recordedGstr3bFiling(loaded.saved)) throw httpError(409, 'This filed return snapshot is locked.');
    if (body.expectedSourceHash && body.expectedSourceHash !== loaded.sourceHash) throw httpError(409, 'Billing data changed. Refresh the return and review your changes again.');
    const { generated, result, key } = loaded;
    const rows = (base, edited) => base.map(row => ({ ...row, ...Object.fromEntries(['cgst', 'sgst', 'igst', 'cess'].map(head => [head, Number(edited?.find(item => item.key === row.key)?.[head] ?? row[head]) || 0])) }));
    const available = rows(generated.itcAvailable, body.itcAvailable || result.itcAvailable);
    const reversed = rows(generated.itcReversed, body.itcReversed || result.itcReversed);
    for (const head of ['cgst', 'sgst', 'igst', 'cess']) if (reversed.reduce((sum, row) => sum + row[head], 0) > available.reduce((sum, row) => sum + row[head], 0)) throw httpError(400, `${head.toUpperCase()} reversals exceed available ITC.`);
    await Gstr3b.findOneAndUpdate(key, { $set: {
      ...key, status: 'draft', outwardRows: generated.outwardRows, itcAvailable: available,
      itcReversed: reversed, itcAdjustments: gstr3bAdjustments(available, generated.itcAvailable), itcSourceMode: 'adjustments', sourceHash: loaded.sourceHash,
      lateFeeCgst: Number(body.lateFeeCgst ?? result.lateFeeCgst) || 0, lateFeeSgst: Number(body.lateFeeSgst ?? result.lateFeeSgst) || 0,
    } }, { new: true, upsert: true, runValidators: true });
    res.json((await loadGstr3bData(req, key.period)).result);
  } catch (error) { next(error); }
}
export async function fileGstr3b(req, res, next) {
  // A local save is not a portal submission. Never manufacture an acknowledgement.
  next(httpError(503, 'GST portal submission is not connected. Export and review the return, then file it on the GST portal.'));
}
export async function postGstr3bAccountingAdjustment(req, res, next) {
  try {
    if (Object.keys(req.body || {}).some(key => !['period', 'expectedSourceHash'].includes(key))) throw httpError(400, 'Choose a return period for accounting posting.');
    const loaded = await loadGstr3bData(req, req.body?.period);
    if (!loaded.key.gstin || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(loaded.key.gstin)) throw httpError(400, 'Configure your business GSTIN before posting GST accounting.');
    if (req.body.expectedSourceHash && req.body.expectedSourceHash !== loaded.sourceHash) throw httpError(409, 'Billing data changed. Refresh the return before posting.');
    validateGstr3bEdits(loaded.result);
    const posted = await postGstr3bAccounting({ user: req.user, period: loaded.key.period, gstin: loaded.key.gstin, invoiceScope: loaded.context.invoiceScope, ownerId: loaded.context.ownerId });
    res.status(201).json({ ...posted, record: (await loadGstr3bData(req, loaded.key.period)).result });
  } catch (error) { next(error); }
}
