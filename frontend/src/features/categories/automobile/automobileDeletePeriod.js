import { EXPORT_CATEGORIES } from './automobileExports.js';
export function deletionCollections(collections, category) {
  const keys = category === 'all' ? null : new Set(EXPORT_CATEGORIES.find((row) => row.key === category)?.collections || []);
  return collections.filter((row) => !keys || keys.has(row.key));
}
export function deletionSelection(collections, checked) { return collections.filter((row) => row.deletable !== false && (checked === null || checked.includes(row.key))); }
export function deletionPeriodLabel(year, month) {
  if (!month) return `Full Year ${year}`;
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
