// Display clock times in AM/PM while keeping API values in HH:mm.
export function clockMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::([0-5]\d))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]), period = match[4]?.toUpperCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = hour % 12 + (period === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}

export function formatTime12(value) {
  const minutes = clockMinutes(value);
  if (minutes == null) return value ?? '—';
  const hour = Math.floor(minutes / 60);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function clockInputValue(hour, minute, period) {
  if (!hour) return '';
  const hours = Number(hour), minutes = Number(minute);
  if (!Number.isInteger(hours) || hours < 1 || hours > 12 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || !['AM', 'PM'].includes(period)) return '';
  return `${String(hours % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
