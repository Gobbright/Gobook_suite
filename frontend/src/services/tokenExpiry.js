const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// This is a UI expiry check only. Signature, session and access checks run on
// the server for every authenticated request.
export function tokenIsCurrent(token, now = Date.now()) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    return Number.isInteger(payload.exp) && Number.isInteger(payload.iat)
      && payload.iat * 1000 <= now + 5000 && payload.exp * 1000 > now
      && now - payload.iat * 1000 < WEEK_MS && (payload.exp - payload.iat) * 1000 <= WEEK_MS;
  } catch { return false; }
}
