export function EmployeePresenceBadge({ employee, presence }) {
  const online = Boolean(employee.loginAccess && ['Active', 'Probation', 'On Leave'].includes(employee.status || 'Active') && presence?.online === true);
  return <span className={`employee-presence employee-presence-badge${online ? ' is-online' : ''}`} title="Live portal presence, refreshed every 15 seconds. Lost connections expire within 60 seconds."><i aria-hidden="true" />{online ? 'Online' : 'Offline'}</span>;
}
