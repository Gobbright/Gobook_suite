import { NavLink } from 'react-router-dom';
import { useCurrentUser } from '../../../../../hooks/useCurrentUser.js';
import { currentEmployeeMonth } from '../../../services/monthScope.js';

const PAYROLL_PAGES = [
  { label: 'Payroll Register', path: '/employee-management/payroll' },
  { label: 'Salary Structure', path: '/employee-management/payroll/salary' },
  { label: 'Payslips', path: '/employee-management/payroll/payslips' },
  { label: 'Deductions', path: '/employee-management/payroll/deductions' },
  { label: 'Payroll Reports', path: '/employee-management/payroll/reports' },
];

export function PayrollNav({ current }) {
  const automobile = useCurrentUser()?.category === 'automobile';
  const pages = automobile ? [{ label: 'Payroll', path: '/employee-management/payroll' }, ...PAYROLL_PAGES.map((page) => page.label === 'Salary Structure' ? { ...page, path: '/employee-management/payroll/salary' } : page)] : PAYROLL_PAGES;
  return (
    <nav className="hr-subsection-tabs" aria-label="Payroll subsection navigation">
      {pages.map((page) => <NavLink end className={automobile ? ({ isActive }) => isActive ? 'active' : '' : page.path === current ? 'active' : ''} key={page.path} to={page.path}>{page.label}</NavLink>)}
    </nav>
  );
}

export function payrollMonth() {
  return currentEmployeeMonth();
}

export function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}
