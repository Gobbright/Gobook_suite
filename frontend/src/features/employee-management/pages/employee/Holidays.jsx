import { DataTable } from '../../components/common/DataTable.jsx';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { holidayService } from '../../services/holidayService.js';
import { currentEmployeeMonth } from '../../services/monthScope.js';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';

export default function Holidays() {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error } = useLoad(() => holidayService.list(month), [month]);
  const columns = [{ key: 'date', label: 'Date' }, { key: 'name', label: 'Holiday' }, { key: 'type', label: 'Type' }];
  return <><PageHeader title="Holidays" subtitle="Company holidays for the selected month" action={<MonthFilter month={month} onChange={setMonth} />} />{error && <p className="error">{error}</p>}{loading ? <div className="card">Loading...</div> : <DataTable columns={columns} rows={data?.data || []} />}</>;
}
