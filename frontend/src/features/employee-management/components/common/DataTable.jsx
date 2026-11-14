import { Inbox } from 'lucide-react';
import { formatTime12 } from '../../../../utils/timeFormat.js';

const CLOCK_FIELDS = new Set(['checkIn', 'checkOut', 'fromTime', 'toTime', 'startTime', 'endTime']);

export function DataTable({ columns, rows, empty = 'No data found', actions, showCount = true, showSerial = true }) {
  const safeRows = rows || [];
  const countLabel = `${safeRows.length} ${safeRows.length === 1 ? 'record' : 'records'}`;

  if (!safeRows.length) {
    return (
      <div className="card table-empty-wrap">
        {showCount && <div className="table-count-badge">Total: 0 records</div>}
        <div className="empty employee-empty-state"><span className="employee-empty-icon" aria-hidden="true"><Inbox size={25} /></span><strong>{empty}</strong></div>
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      {showCount && <div className="table-count-badge">Total: {countLabel}</div>}
      <table className="employee-data-table">
        <thead>
          <tr>
            {showSerial && <th scope="col" className="serial-column">#</th>}
            {columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}
            {actions && <th scope="col">Action</th>}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, index) => (
            <tr key={row._id || row.id || JSON.stringify(row)}>
              {showSerial && <td className="serial-column" data-label="#">{index + 1}</td>}
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {column.render ? column.render(row, index) : row[column.key] === '' ? '—' : CLOCK_FIELDS.has(column.key) ? formatTime12(row[column.key]) : row[column.key] ?? '—'}
                </td>
              ))}
              {actions && <td data-label="Action">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
