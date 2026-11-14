import { loadWorkspace, mutateWorkspace } from '../../../services/reconciliationWorkspace.js';

function mergeEntries(generatedEntries, savedEntries = []) {
  const savedByInvoice = new Map(savedEntries.map((entry) => [`${String(entry.gstin || '').trim().toUpperCase()}|${String(entry.invoiceNo || '').trim().toLowerCase()}`, entry]));

  return generatedEntries.map((entry) => {
    const saved = savedByInvoice.get(`${String(entry.gstin || '').trim().toUpperCase()}|${String(entry.invoiceNo || '').trim().toLowerCase()}`);
    if (!saved) return entry;

    const itcGstr2b = Number(saved.itcGstr2b) || 0;
    const statementRecorded = Boolean(saved.statementRecorded) || itcGstr2b > 0;
    const diff = (Number(entry.itcBooks) || 0) - itcGstr2b;
    return {
      ...entry,
      _id: saved._id,
      itcGstr2b,
      statementRecorded,
      diff,
      status: Math.abs(diff) < 0.01 ? 'matched' : (statementRecorded ? 'mismatch' : 'not_in_2b'),
      resolution: saved.resolution || 'none',
    };
  });
}


export async function getReconciliation(req, res, next) {
  try { res.json((await loadWorkspace(req, req.query)).result); } catch (error) { next(error); }
}
export async function saveReconciliation(req, res, next) {
  try { res.json(await mutateWorkspace(req)); } catch (error) { next(error); }
}
export async function updateEntry(req, res, next) {
  try { res.json(await mutateWorkspace({ ...req, body: { ...req.body, action: 'resolve', rowIds: [req.params.entryId] } })); } catch (error) { next(error); }
}
