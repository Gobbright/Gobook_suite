import { EmployeeReportButtons } from '../../components/common/EmployeeReportButtons.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { useLoad } from '../../hooks/useLoad.js';
import { payrollService } from '../../services/payrollService.js';
import { currentEmployeeMonth } from '../../services/monthScope.js';
import { MonthFilter } from '../../components/common/MonthFilter.jsx';

export default function Payslips() {
  const [month, setMonth] = useState(currentEmployeeMonth);
  const { data, loading, error } = useLoad(() => payrollService.payslips(month), [month]);
  const columns = [{ key: 'month', label: 'Month' }, { key: 'basic', label: 'Basic' }, { key: 'allowances', label: 'Allowances' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net' }, { key: 'status', label: 'Status' }];
  return <><PageHeader title="Payslips" subtitle="Your payslip for the selected month" action={<MonthFilter month={month} onChange={setMonth} />} /><EmployeeReportButtons kind="payroll" month={month} employee />{error && <p className="error">{error}</p>}{loading ? <div className="card">Loading...</div> : <DataTable columns={columns} rows={data?.data || []} />}</>;
}
