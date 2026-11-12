import { httpError } from '../utils/httpError.js';

export function currentEmployeeMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function employeeMonth(value = currentEmployeeMonth()) {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) throw httpError(400, 'Choose a valid month (YYYY-MM)');
  const [year, month] = value.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${value}-01`;
  const end = `${value}-${lastDay}`;
  return { month: value, start, end, dates: { $gte: start, $lte: end }, leaves: { from: { $lte: end }, to: { $gte: start } } };
}

export function leaveDaysInRange(row, start, end) {
  const from = row.from > start ? row.from : start;
  const to = (row.to || row.from) < end ? (row.to || row.from) : end;
  if (!from || !to || from > to) return 0;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return Number.isFinite(days) ? Math.min(days, Math.max(0, Number(row.days) || days)) : 0;
}
