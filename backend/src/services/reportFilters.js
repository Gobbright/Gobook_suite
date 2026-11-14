import { httpError } from '../utils/httpError.js';
import { REPORT_FILTER_CONFIGS } from './reportFilterConfig.js';

const fail = message => { throw httpError(400, message); };
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
export function validReportDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function scalar(value, field) {
  if (field.type === 'number' || field.numeric) {
    if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) fail(`${field.label} must be a finite number.`);
    return Number(value);
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') fail(`${field.label} must be true or false.`);
    return value;
  }
  if (field.type === 'date') {
    if (!validReportDate(value)) fail('Select a valid report date.');
    return value;
  }
  if (typeof value !== 'string' || !value.trim() || value.length > 200) fail(`${field.label} requires a value of up to 200 characters.`);
  return value.trim();
}
function predicate(condition, definition) {
  const { operator } = condition;
  const path = definition.path;
  if (!definition.operators.includes(operator)) fail(`Unsupported operator for ${definition.label}.`);
  if (operator === 'isEmpty') return { $or: [{ [path]: { $exists: false } }, { [path]: { $in: [null, ''] } }, { [path]: { $size: 0 } }] };
  if (operator === 'isNotEmpty') return { [path]: { $exists: true, $nin: [null, ''], $not: { $size: 0 } } };
  if (operator === 'between') {
    const min = scalar(condition.min, definition);
    const max = scalar(condition.max, definition);
    if (min > max) fail(`${definition.label}: minimum must not exceed maximum.`);
    return { [path]: { $gte: min, $lte: max } };
  }
  const raw = condition.values ?? [condition.value];
  if (!Array.isArray(raw) || !raw.length || raw.length > 100) fail('Select between 1 and 100 filter values.');
  const values = raw.map(value => scalar(value, definition));
  if (definition.values && values.some(value => !definition.values.some(option => option.value === value))) fail(`Invalid ${definition.label} value.`);
  if (['greaterThan', 'lessThan', 'contains'].includes(operator) && values.length !== 1) fail('This operator requires one value.');
  if (operator === 'contains') return { [path]: new RegExp(escape(String(values[0])), 'i') };
  if (operator === 'greaterThan' || operator === 'lessThan') return { [path]: { [operator === 'greaterThan' ? '$gt' : '$lt']: values[0] } };
  const normalized = values.map(value => typeof value === 'string' && definition.type !== 'date' ? new RegExp(`^${escape(value)}$`, 'i') : value);
  return { [path]: { [operator === 'notEquals' ? '$nin' : '$in']: normalized } };
}

export function compileReportFilters(report, input, { unwound = false } = {}) {
  const definitions = REPORT_FILTER_CONFIGS[report];
  if (!definitions) fail('Unsupported report.');
  let tree = input;
  if (typeof tree === 'string') {
    if (tree.length > 16000) fail('Too many report filters.');
    try { tree = JSON.parse(tree); } catch { fail('Report filters must be valid JSON.'); }
  }
  if (tree == null) tree = { logic: 'and', conditions: [] };
  let count = 0;
  const lineConditions = [];
  function visit(group, depth = 0) {
    if (!plain(group) || !['and', 'or'].includes(group.logic) || !Array.isArray(group.conditions) || (depth > 0 && !group.conditions.length) || depth > 3) fail('Invalid report filter group.');
    const clauses = [];
    const sameLine = [];
    for (const condition of group.conditions) {
      if (++count > 30) fail('Use at most 30 report filter conditions.');
      if (plain(condition) && Object.hasOwn(condition, 'logic')) { clauses.push(visit(condition, depth + 1)); continue; }
      if (!plain(condition)) fail('Invalid report filter condition.');
      const definition = definitions.find(field => field.key === condition.field);
      if (!definition) fail(`Unsupported report field: ${String(condition.field).slice(0, 60)}`);
      const clause = predicate(condition, unwound && definition.item ? { ...definition, path: `_reportItems.${definition.path}` } : definition);
      if (definition.item) {
        // AND fields such as product + brand must match the same invoice line.
        if (unwound) clauses.push(clause);
        else if (group.logic === 'and') sameLine.push(clause);
        else clauses.push({ _reportItems: { $elemMatch: clause } });
        lineConditions.push({ condition, definition });
      } else clauses.push(clause);
    }
    if (sameLine.length) clauses.push({ _reportItems: { $elemMatch: { $and: sameLine } } });
    return clauses.length ? { [group.logic === 'and' ? '$and' : '$or']: clauses } : {};
  }
  const match = visit(tree);
  return { match, tree, lineConditions };
}
