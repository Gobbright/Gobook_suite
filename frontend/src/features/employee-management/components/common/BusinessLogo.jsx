import { useState } from 'react';
import { SERVER_ORIGIN } from '../../../../services/apiBase.js';

export function BusinessLogo({ user }) {
  const [failedUrl, setFailedUrl] = useState('');
  const name = user?.businessName || 'Business';
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const value = user?.businessLogoUrl || '';
  let src = '';
  try {
    const url = new URL(value, SERVER_ORIGIN);
    if (value && ['http:', 'https:'].includes(url.protocol)) src = url.href;
  } catch { /* Use the business initials if its saved logo URL is invalid. */ }
  return src && src !== failedUrl
    ? <img className="employee-business-logo" src={src} alt={`${name} logo`} onError={() => setFailedUrl(src)} />
    : <span className="employee-business-monogram" role="img" aria-label={`${name} logo`}>{initials || 'B'}</span>;
}
