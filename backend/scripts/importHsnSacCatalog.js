import ExcelJS from 'exceljs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cellValue } from '../src/utils/excelImport.js';
import { hsnSacCatalogUrl, normalizeCatalogCode } from '../src/services/hsnSacCatalog.js';

export function extractHsnSacCatalog(workbook) {
  const entries = new Map();
  let duplicateRows = 0;
  for (const type of ['HSN', 'SAC']) {
    const sheet = workbook.getWorksheet(`${type}_MSTR`);
    if (!sheet) throw new Error(`Missing ${type}_MSTR worksheet`);
    if (sheet.getRow(1).getCell(1).text.trim() !== `${type}_CD`
      || sheet.getRow(1).getCell(2).text.trim() !== `${type}_Description`) throw new Error(`Unexpected ${type} columns`);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = normalizeCatalogCode(cellValue(row.getCell(1).value));
      const description = String(cellValue(row.getCell(2).value)).replace(/\s+/g, ' ').trim();
      if (!code && !description) return;
      if (!/^\d{2,8}$/.test(code) || !description) throw new Error(`Invalid ${type} record at row ${rowNumber}`);
      const key = `${type}:${code}`;
      const existing = entries.get(key);
      if (existing) {
        if (existing.description !== description) {
          const descriptions = [...new Set([existing.description, ...(existing.alternateDescriptions || []), description])];
          descriptions.sort((left, right) => left.length - right.length || left.localeCompare(right));
          [existing.description, ...existing.alternateDescriptions] = descriptions;
        }
        duplicateRows += 1;
        return;
      }
      entries.set(key, {
        type, code, description,
        ...(![2, 4, 6, 8].includes(code.length) ? { needsReview: true } : {}),
      });
    });
  }
  const rows = [...entries.values()].sort((left, right) => left.code.localeCompare(right.code) || left.type.localeCompare(right.type));
  const counts = { HSN: 0, SAC: 0, total: rows.length, needsReview: 0, duplicateRows };
  for (const row of rows) {
    counts[row.type] += 1;
    if (row.needsReview) counts.needsReview += 1;
  }
  return { counts, entries: rows };
}

export async function importHsnSacCatalog(filename) {
  const buffer = await readFile(filename);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const catalog = {
    source: 'HSN/SAC workbook supplied by the business',
    sha256: createHash('sha256').update(buffer).digest('hex'),
    ...extractHsnSacCatalog(workbook),
  };
  const destination = fileURLToPath(hsnSacCatalogUrl);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(catalog)}\n`, 'utf8');
  await rename(temporary, destination);
  return catalog.counts;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/importHsnSacCatalog.js <workbook.xlsx>');
    process.exitCode = 1;
  } else {
    importHsnSacCatalog(process.argv[2]).then((counts) => console.log(JSON.stringify(counts))).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
