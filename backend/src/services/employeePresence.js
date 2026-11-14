export const PORTAL_PRESENCE_TTL_MS = 60_000;

// Authentication alone does not mean the employee has the application open.
export function latestPortalPresence(tabs = [], now = Date.now()) {
  let latest = null;
  for (const tab of tabs || []) {
    const seenAt = new Date(tab.seenAt).getTime();
    if (Number.isFinite(seenAt) && seenAt <= now && now - seenAt < PORTAL_PRESENCE_TTL_MS && (!latest || seenAt > latest.getTime())) latest = new Date(seenAt);
  }
  return latest;
}
