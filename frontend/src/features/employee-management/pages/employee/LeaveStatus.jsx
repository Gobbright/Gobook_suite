import { DataTable } from '../../components/common/DataTable.jsx';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { leaveService } from '../../services/leaveService.js';
import { currentEmployeeMonth } from '../../services/monthScope.js';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';

export default function LeaveStatus({ history = false }) {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error } = useLoad(() => history ? leaveService.history(month) : leaveService.status(month), [month, history]);
  const columns = [
    { key: 'leaveId', label: 'Leave ID' },
    { key: 'applied', label: 'Applied Date' },
    { key: 'type', label: 'Type' },
    { key: 'from', label: 'From' },
    { key: 'to', label: 'To' },
    { key: 'days', label: 'Days' },
    { key: 'reason', label: 'Reason' },
    { key: 'status', label: 'Status' },
  ];
  return <><PageHeader title={history ? 'Leave History' : 'Leave Status'} subtitle={history ? 'Your leave history for the selected month' : 'Leave requests for the selected month'} action={<MonthFilter month={month} onChange={setMonth} />} />{error && <p className="error">{error}</p>}{loading ? <div className="card">Loading...</div> : <DataTable columns={columns} rows={data?.data || []} />}</>;
}
