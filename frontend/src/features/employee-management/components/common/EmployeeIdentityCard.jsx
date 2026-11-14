import { useState } from 'react';
import { SERVER_ORIGIN } from '../../../../services/apiBase.js';

export function employeePhotoUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/api/employee/auth/link-photo?')) return '';
  return new URL(value, SERVER_ORIGIN).href;
}

export function EmployeeIdentityCard({ profile, businessName, qr, compact = false }) {
  const [failedPhoto, setFailedPhoto] = useState('');
  const photo = employeePhotoUrl(profile?.photoUrl);
  const initials = (profile?.name || 'Employee').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <section className={`employee-identity-card ${compact ? 'is-compact' : ''}`} aria-label="Employee QR identity">
    {!compact && <div className="employee-identity-business">{businessName || 'Employee access'}</div>}
    <div className="employee-identity-main">
      {photo && photo !== failedPhoto ? <img className="employee-identity-photo" src={photo} alt={profile?.name ? `${profile.name} photo` : 'Employee photo'} crossOrigin="anonymous" onError={() => setFailedPhoto(photo)} /> : profile?.name && <span className="employee-identity-initials" aria-hidden="true">{initials}</span>}
      <div>{profile?.name && <strong>{profile.name}</strong>}{profile?.role && <span>{profile.role}</span>}{profile?.employeeId && <small>{profile.employeeId}</small>}</div>
    </div>
    {(profile?.address || profile?.phone || profile?.email) && <dl className="employee-identity-details">{[['Address', profile.address], ['Phone', profile.phone], ['Email', profile.email]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {qr && <div className="employee-identity-code"><img src={qr} alt="Personal employee login QR" /><span>Scan to sign in</span><small>Username and employee ID are filled in.</small></div>}
  </section>;
}
