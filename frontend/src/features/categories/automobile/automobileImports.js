import { EXPORT_CATEGORIES } from './automobileExports.js';
export function inspectImportBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.meta?.app !== 'GoBook' || !backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('Choose a GoBook JSON backup created from Export Data.');
  for (const [key, rows] of Object.entries(backup.data)) {
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`Invalid records in backup collection: ${key}`);
  }
  return backup;
}
export function importCollectionPreview(backup, collections, category) {
  const allowed = category === 'all' ? null : new Set(EXPORT_CATEGORIES.find((row) => row.key === category)?.collections || []);
  return collections.filter((collection) => (!allowed || allowed.has(collection.key)) && Array.isArray(backup?.data?.[collection.key])).map((collection) => ({ ...collection, incoming: backup.data[collection.key].length }));
}
export function importCompletionStatus(result) { return result.skipped > 0 || result.errors?.length > 0 ? 'Completed with issues' : 'Completed'; }
