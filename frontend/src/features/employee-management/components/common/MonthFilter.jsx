import './MonthFilter.css';

export function MonthFilter({ month, onChange }) {
  return <label className="hr-month-filter"><span>Month</span><input aria-label="Month" className="attendance-select" type="month" required value={month} onChange={(event) => { if (event.target.value) onChange(event.target.value); }} /></label>;
}
