import { httpError } from '../utils/httpError.js';

export function timeMinutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw httpError(400, 'Enter a valid attendance time');
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
export function breakSummary(breaks = [], until) {
  let previousEnd = -1;
  let total = 0;
  const rows = breaks.map((row, index) => {
    const start = timeMinutes(row.start);
    const end = row.end ? timeMinutes(row.end) : until ? timeMinutes(until) : start;
    if (start < previousEnd || end < start || (!row.end && index !== breaks.length - 1)) throw httpError(400, 'Break times must be in order');
    total += end - start;
    previousEnd = end;
    return { start: row.start, end: row.end || until || '' };
  });
  return { breaks: rows, breakMinutes: total };
}
export function netAttendanceHours(checkIn, checkOut, breaks = []) {
  const start = timeMinutes(checkIn);
  const end = timeMinutes(checkOut);
  const summary = breakSummary(breaks, checkOut);
  if (end < start || summary.breaks.some((row) => timeMinutes(row.start) < start || timeMinutes(row.end) > end)) throw httpError(400, 'Breaks and check out must be within attendance times');
  const minutes = end - start - summary.breakMinutes;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
