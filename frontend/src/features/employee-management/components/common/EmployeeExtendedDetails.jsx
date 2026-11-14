import { BANK_FIELDS, STATUTORY_FIELDS } from '../../services/employeeDetails.js';

export function EmployeeExtendedDetails({ employee }) {
  const sections = [
    ['Additional personal details', [['Marital Status', employee.maritalStatus], ['Nationality', employee.nationality], ['Qualification', employee.qualification], ['Permanent Address', employee.permanentAddress]]],
    ['PF & ESI Details', STATUTORY_FIELDS.map(([key, label]) => [label, employee.statutoryDetails?.[key]])],
    ['Salary Bank Account', BANK_FIELDS.map(([key, label]) => [label, employee.bankDetails?.[key]])],
  ];
  return <div className="employee-extended-details">
    {sections.map(([title, fields]) => <section className="card hr-card" key={title}><h2>{title}</h2><div className="profile-grid">{fields.map(([label, value]) => <div className="profile-field" key={label}><strong>{label}</strong><p>{value || '—'}</p></div>)}</div></section>)}
    <section className="card hr-card"><h2>Family &amp; Emergency Contacts</h2>{employee.familyMembers?.length ? employee.familyMembers.map((member, index) => <div className="employee-family-view" key={index}><h3>{member.name}{member.isEmergencyContact && <span className="hr-pill green">Emergency contact</span>}</h3><div className="profile-grid">{[['Relationship', member.relationship], ['Mobile', member.phone], ['Date of Birth', member.dateOfBirth], ['Occupation', member.occupation]].map(([label, value]) => <div className="profile-field" key={label}><strong>{label}</strong><p>{value || '—'}</p></div>)}</div></div>) : <p>No family members added yet.</p>}</section>
  </div>;
}
