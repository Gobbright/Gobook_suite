import { leadDay } from './automobileLeads.js';
export const FOLLOW_UP_TYPES = ['Call', 'Visit', 'WhatsApp', 'Email', 'Meeting', 'Other'];
export const followUpCode = (row) => `FU-${String(row._id || '').slice(-6).toUpperCase()}`;
export function followUpStatus(row, now = new Date()) {
  if (row.status === 'Done') return 'Completed';
  return row.status === 'Overdue' || row.date && row.date < leadDay(now) ? 'Overdue' : 'Pending';
}
export function enrichFollowUps(rows, customers, leads, now = new Date()) {
  return rows.map((row) => {
    const parties = row.customerId ? customers.filter((person) => String(person._id) === String(row.customerId)) : row.leadId ? leads.filter((person) => String(person._id) === String(row.leadId)) : [...customers, ...leads].filter((person) => person.name?.trim().toLowerCase() === row.person?.trim().toLowerCase());
    const party = parties.length === 1 ? parties[0] : null;
    const next = rows.filter((entry) => String(entry.previousFollowUpId || '') === String(row._id) && entry.status !== 'Done').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    return { ...row, state: followUpStatus(row, now), followUpType: row.followUpType || 'Other', priority: row.priority || 'Medium', party, next };
  });
}
export function filterFollowUps(rows, filters) {
  return rows.filter((row) => (!filters.priority || row.priority === filters.priority) && (!filters.status || row.state === filters.status) && (!filters.owner || row.owner === filters.owner)
    && (!filters.from || row.date >= filters.from) && (!filters.to || row.date && row.date <= filters.to)
    && [row.person, row.regarding, row.owner, row.notes, row.outcome, followUpCode(row)].join(' ').toLowerCase().includes(String(filters.search || '').trim().toLowerCase()));
}
export function followUpWeek(now = new Date()) {
  const date = new Date(`${leadDay(now)}T00:00:00Z`); const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday); const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6); return { from, to: date.toISOString().slice(0, 10) };
}
export function followUpStats(rows, now = new Date()) {
  const today = leadDay(now); const week = followUpWeek(now);
  return { total: rows.length, pending: rows.filter((row) => followUpStatus(row, now) === 'Pending').length, completed: rows.filter((row) => row.status === 'Done').length, overdue: rows.filter((row) => followUpStatus(row, now) === 'Overdue').length,
    today: rows.filter((row) => row.date === today).length, upcoming: rows.filter((row) => row.status !== 'Done' && row.date >= today && row.date <= week.to).length };
}
export function followUpCalendar(month) {
  const [year, numericMonth] = month.split('-').map(Number); const first = new Date(Date.UTC(year, numericMonth - 1, 1));
  const length = new Date(Date.UTC(year, numericMonth, 0)).getUTCDate(); const count = Math.ceil((first.getUTCDay() + length) / 7) * 7;
  return Array.from({ length: count }, (_, index) => { const day = new Date(Date.UTC(year, numericMonth - 1, 1 - first.getUTCDay() + index)); const date = day.toISOString().slice(0, 10); return { date, day: day.getUTCDate(), current: date.startsWith(month) }; });
}
export function scheduleLanes(rows) {
  const laneEnds = [];
  return rows.filter((row) => row.time).map((row) => { const [hour, minute] = row.time.split(':').map(Number); return { ...row, start: hour * 60 + minute, duration: Number(row.duration) || 30 }; }).sort((a, b) => a.start - b.start).map((row) => {
    let lane = laneEnds.findIndex((end) => end <= row.start); if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = row.start + row.duration; return { ...row, lane };
  });
}
