import { useState } from 'react';
import { clockMinutes, clockInputValue } from '../../utils/timeFormat.js';
import './timeInput12.css';

export function TimeInput12({ value = '', onChange, label = 'Time', required = false, disabled = false, id, name }) {
  const [emptyPeriod, setEmptyPeriod] = useState('AM');
  const [emptyMinute, setEmptyMinute] = useState('00');
  const minutes = clockMinutes(value);
  const hour = minutes == null ? '' : String(Math.floor(minutes / 60) % 12 || 12);
  const minute = minutes == null ? emptyMinute : String(minutes % 60).padStart(2, '0');
  const period = minutes == null ? emptyPeriod : minutes >= 720 ? 'PM' : 'AM';
  function change(nextHour, nextMinute, nextPeriod) {
    setEmptyPeriod(nextPeriod);
    setEmptyMinute(nextMinute);
    onChange?.({ target: { value: clockInputValue(nextHour, nextMinute, nextPeriod), name } });
  }
  return <span className="time-input-12" role="group" aria-label={label}>
    <select id={id} aria-label={`${label} hour`} required={required} disabled={disabled} value={hour} onChange={(event) => change(event.target.value, minute, period)}><option value="">HH</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{String(index + 1).padStart(2, '0')}</option>)}</select>
    <span aria-hidden="true">:</span>
    <select aria-label={`${label} minute`} disabled={disabled} value={minute} onChange={(event) => change(hour, event.target.value, period)}>{Array.from({ length: 60 }, (_, index) => <option key={index} value={String(index).padStart(2, '0')}>{String(index).padStart(2, '0')}</option>)}</select>
    <select aria-label={`${label} AM or PM`} disabled={disabled} value={period} onChange={(event) => change(hour, minute, event.target.value)}><option>AM</option><option>PM</option></select>
    {name && <input type="hidden" name={name} value={value} />}
  </span>;
}
