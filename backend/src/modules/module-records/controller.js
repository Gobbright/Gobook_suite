import { ModuleRecord } from '../../models/ModuleRecord.js';
import { httpError } from '../../utils/httpError.js';
import { asNumber, asText, parseExcelRows } from '../../utils/excelImport.js';
import { inventoryTransaction } from '../../services/inventoryTransaction.js';
import { hasModuleInventory, moduleInventoryId, sameModuleInventoryRequest, sameModuleInventoryEffect, postModuleInventory, reverseModuleInventory } from '../../services/moduleRecordInventory.js';

// GET /api/module-records?moduleKey=hospital/patients
export async function listRecords(req, res, next) {
  try {
    const { moduleKey } = req.query;
    if (!moduleKey) return next(httpError(400, 'moduleKey is required'));
    const records = await ModuleRecord.find({ userId: req.user.id, moduleKey }).sort({ createdAt: -1 }).lean();
    res.json({ records });
  } catch (err) {
    next(err);
  }
}

// POST /api/module-records
export async function createRecord(req, res, next) {
  try {
    const { moduleKey, data } = req.body;
    if (!moduleKey) return next(httpError(400, 'moduleKey is required'));
    const id = moduleInventoryId(req.user.id, moduleKey, data);
    const save = async () => {
      if (id) {
        const existing = await ModuleRecord.findOne({ _id: id, userId: req.user.id, moduleKey }).lean();
        if (existing) {
          if (!sameModuleInventoryRequest(existing.data, data)) throw httpError(409, 'This stock posting reference was already used. Refresh the saved record.');
          return existing;
        }
      }
      const created = await ModuleRecord.create({ ...(id ? { _id: id } : {}), userId: req.user.id, moduleKey, data: data || {} });
      await postModuleInventory(created);
      return created;
    };
    let record;
    try { record = id ? await inventoryTransaction(save) : await save(); }
    catch (error) {
      if (error.code !== 11000 || !id) throw error;
      const existing = await ModuleRecord.findOne({ _id: id, userId: req.user.id, moduleKey }).lean();
      if (!existing || !sameModuleInventoryRequest(existing.data, data)) throw httpError(409, 'This stock posting reference was already used');
      record = existing;
    }
    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
}

// PUT /api/module-records/:id
export async function updateRecord(req, res, next) {
  try {
    const current = await ModuleRecord.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!current) throw httpError(404, 'Record not found');
    const save = async () => {
      const existing = await ModuleRecord.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!existing) throw httpError(404, 'Record not found');
      const effectChanged = !sameModuleInventoryEffect(existing, { ...existing, data: req.body.data });
      if (hasModuleInventory(existing)) {
        if (!hasModuleInventory({ ...existing, data: req.body.data })) throw httpError(409, 'Keep the stock posting reference when editing this record');
        if (req.body.data.inventoryPosting.key !== existing.data.inventoryPosting.key) throw httpError(409, 'The stock posting reference cannot be changed');
        if (effectChanged) await reverseModuleInventory(existing);
      }
      const updated = await ModuleRecord.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $set: { data: req.body.data || {} } },
        { new: true, runValidators: true },
      ).lean();
      if (updated && effectChanged) await postModuleInventory(updated);
      return updated;
    };
    const managed = hasModuleInventory(current) || hasModuleInventory({ ...current, data: req.body.data });
    if (!hasModuleInventory(current) && managed) throw httpError(409, 'Older records cannot be reposted automatically. Correct stock using Edit Product.');
    const record = managed ? await inventoryTransaction(save) : await save();
    if (!record) return next(httpError(404, 'Record not found'));
    res.json(record);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/module-records/:id
export async function deleteRecord(req, res, next) {
  try {
    const current = await ModuleRecord.findOne({ _id: req.params.id, userId: req.user.id }).lean();
    if (!current) throw httpError(404, 'Record not found');
    const remove = async () => {
      const existing = await ModuleRecord.findOne({ _id: req.params.id, userId: req.user.id }).lean();
      if (!existing) throw httpError(404, 'Record not found');
      await reverseModuleInventory(existing);
      return ModuleRecord.findOneAndDelete({ _id: req.params.id, userId: req.user.id }).lean();
    };
    const record = hasModuleInventory(current) ? await inventoryTransaction(remove) : await remove();
    if (!record) return next(httpError(404, 'Record not found'));
    res.json({ message: 'Record deleted' });
  } catch (err) {
    next(err);
  }
}

// Matches the same header-normalization rule used by the excel-import utility,
// so alias keys built here line up exactly with how column headers get normalized.
function normalizeLabel(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// POST /api/module-records/import
// Generic bulk import for any module-records-backed page: the caller sends the
// same { key, label, type, required } field metadata that already drives its
// on-screen form, so the Excel column headers are matched against that page's
// real field labels/keys instead of a hardcoded alias table.
export async function importRecords(req, res, next) {
  try {
    const { moduleKey } = req.body;
    if (!moduleKey) return next(httpError(400, 'moduleKey is required'));

    let fields;
    try {
      fields = JSON.parse(req.body.fields || '[]');
    } catch {
      return next(httpError(400, 'Invalid fields metadata'));
    }
    if (!Array.isArray(fields) || fields.length === 0) {
      return next(httpError(400, 'fields metadata is required'));
    }

    const aliases = {};
    for (const field of fields) {
      if (!field.key) continue;
      aliases[normalizeLabel(field.key)] = field.key;
      if (field.label) aliases[normalizeLabel(field.label)] = field.key;
      const spacedKey = field.key.replace(/([a-z])([A-Z])/g, '$1 $2');
      aliases[normalizeLabel(spacedKey)] = field.key;
    }

    const expectedColumns = fields.map((f) => f.label || f.key).join(', ');
    const rows = await parseExcelRows(req.file, aliases, expectedColumns);

    const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
    const numberKeys = new Set(fields.filter((f) => f.type === 'number').map((f) => f.key));

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const { rowNumber, record } of rows) {
      const missing = requiredKeys.filter((key) => !asText(record[key]));
      if (missing.length) {
        skipped++;
        errors.push(`Row ${rowNumber}: missing required field(s) ${missing.join(', ')}`);
        continue;
      }

      const data = {};
      for (const field of fields) {
        if (record[field.key] === undefined) continue;
        data[field.key] = numberKeys.has(field.key) ? asNumber(record[field.key], '') : asText(record[field.key]);
      }

      try {
        await ModuleRecord.create({ userId: req.user.id, moduleKey, data });
        imported++;
      } catch (err) {
        skipped++;
        errors.push(`Row ${rowNumber}: ${err.message}`);
      }
    }

    res.json({ imported, updated: 0, skipped, errors });
  } catch (err) {
    next(err);
  }
}
