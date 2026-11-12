import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable } from '../../../components/common/DataTable.jsx';
import { PageHeader } from '../../../components/common/PageHeader.jsx';
import { useLoad } from '../../../hooks/useLoad.js';
import { holidayService } from '../../../services/holidayService.js';
import { currentEmployeeMonth } from '../../../services/monthScope.js';
import { MonthFilter } from '../../../components/common/MonthFilter.jsx';

export default function HolidayList() {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error } = useLoad(() => holidayService.adminList(month), [month]);
  const columns = [{ key: 'date', label: 'Date' }, { key: 'name', label: 'Holiday' }, { key: 'type', label: 'Type' }, { key: 'description', label: 'Description' }];
  return <><PageHeader title="Holiday List" subtitle="Company holidays for the selected month" action={<><MonthFilter month={month} onChange={setMonth} /><Link className="btn primary" to="/employee-management/holidays/add"><Plus size={15} />Add Holiday</Link></>} />{error && <p className="error">{error}</p>}{loading ? <div className="card">Loading...</div> : <DataTable columns={columns} rows={data?.data || []} />}</>;
}
