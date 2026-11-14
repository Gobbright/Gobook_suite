import { NavLink } from 'react-router-dom';
import { ArrowUpRight, Award, Bell, Building2, Clock, FileText, Mail, QrCode } from 'lucide-react';
import { getSidebarSections } from '../../../../constants/navigation.js';
import { useCurrentUser } from '../../../../hooks/useCurrentUser.js';
import './EmployeeTeamTools.css';

const icons = { Award, Bell, Building2, Clock, FileText, Mail, QrCode };

export function EmployeeTeamTools() {
  const user = useCurrentUser();
  const section = getSidebarSections(user?.category || 'other', user || {}).find(item => item.title === 'Employee Management');
  const tools = section?.items.filter(item => item.secondary) || [];
  if (section?.locked || !tools.length) return null;
  return <nav className="employee-team-tools" aria-label="Employee team tools">
    {tools.map(item => {
      const Icon = icons[item.icon] || FileText;
      return <NavLink key={item.href} to={item.href} className="employee-team-tool"><span className="employee-team-tool-icon"><Icon size={20} aria-hidden="true" /></span><span className="employee-team-tool-label">{item.label}</span><ArrowUpRight className="employee-team-tool-arrow" size={15} aria-hidden="true" /></NavLink>;
    })}
  </nav>;
}
