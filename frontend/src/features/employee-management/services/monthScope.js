export function currentEmployeeDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function currentEmployeeMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function monthQuery(month = currentEmployeeMonth()) {
  if (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month');
  return `?month=${encodeURIComponent(month)}`;
}

export function leaveDaysInMonth(row, month) {
  const [year, number] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
  const from = row.from > start ? row.from : start;
  const to = (row.to || row.from) < end ? (row.to || row.from) : end;
  if (!from || !to || from > to) return 0;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return Number.isFinite(days) ? Math.min(days, Math.max(0, Number(row.days) || days)) : 0;
}
