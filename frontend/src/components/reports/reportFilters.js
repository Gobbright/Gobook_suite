export const operatorLabels = { equals: 'Equals', notEquals: 'Not Equals', contains: 'Contains', greaterThan: 'Greater Than', lessThan: 'Less Than', between: 'Between', isEmpty: 'Is Empty', isNotEmpty: 'Is Not Empty' };
export const datePresets = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This Week'], ['month', 'This Month'], ['quarter', 'This Quarter'], ['year', 'This Year'], ['custom', 'Custom Range']];
export const emptyFilters = () => ({ logic: 'and', conditions: [] });
export function formatReportDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function presetDateRange(preset, now = new Date()) {
  const start = new Date(now), end = new Date(now);
  if (preset === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  if (preset === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (['month', 'quarter', 'year'].includes(preset)) start.setDate(1);
  if (preset === 'quarter') start.setMonth(Math.floor(start.getMonth() / 3) * 3);
  if (preset === 'year') start.setMonth(0);
  return { min: dateString(start), max: dateString(end) };
}
export function describeCondition(condition, fields = []) {
  const field = fields.find(item => item.key === condition.field);
  const label = field?.label || condition.field;
  if (['isEmpty', 'isNotEmpty'].includes(condition.operator)) return `${label}: ${operatorLabels[condition.operator]}`;
  if (condition.operator === 'between') return `${label}: ${field?.type === 'date' || condition.field === 'date' ? formatReportDate(condition.min) : condition.min ?? ''} – ${field?.type === 'date' || condition.field === 'date' ? formatReportDate(condition.max) : condition.max ?? ''}`;
  const values = condition.values ?? [condition.value];
  const display = values.map((value, index) => condition.labels?.[index] || field?.values?.find(option => String(option.value) === String(value))?.label || (typeof value === 'boolean' ? value ? 'Yes' : 'No' : value));
  return `${label}${condition.operator === 'equals' ? '' : ` ${operatorLabels[condition.operator]}`}: ${display.join(', ')}`;
}
export function validateCondition(condition, field) {
  if (!field) return 'Select a filter field.';
  if (!field.operators.includes(condition.operator)) return 'Choose an operator for this field.';
  if (['isEmpty', 'isNotEmpty'].includes(condition.operator)) return '';
  const values = condition.operator === 'between' ? [condition.min, condition.max] : condition.values ?? [condition.value];
  if (!values.length || values.some(value => value === '' || value == null)) return 'Enter or select a filter value.';
  if ((field.type === 'number') && values.some(value => !Number.isFinite(Number(value)))) return 'Enter valid numbers.';
  if (condition.operator === 'between' && (field.type === 'number' ? Number(condition.min) > Number(condition.max) : condition.min > condition.max)) return 'The minimum must not exceed the maximum.';
  return '';
}
export function reportStorageKey(user, report, kind) {
  return `gobook.report.${user?.businessId || 'business'}.${user?.id || user?._id || 'user'}.${report}.${kind}`;
}
export function readReportStorage(key, fallback, storage) {
  try { return JSON.parse((storage || globalThis.localStorage).getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeReportStorage(key, value, storage) {
  try { (storage || globalThis.localStorage).setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
