export function marketingCampaignTotals(campaigns) {
  return campaigns.reduce((sum, row) => Object.fromEntries(['sent', 'delivered', 'read', 'replied', 'failed'].map((key) => [key, sum[key] + (Number(row[key]) || 0)])), { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
}
export function marketingCampaignStatuses(campaigns) {
  const counts = new Map(); campaigns.forEach((row) => { const status = row.status || 'Draft'; counts.set(status, (counts.get(status) || 0) + 1); });
  return [...counts].map(([label, value]) => ({ label, value }));
}
export function marketingDailyUsage(usage) {
  const days = new Map();
  usage.forEach((row) => { const date = new Date(row.date); if (!Number.isFinite(date.getTime())) return; const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); const previous = days.get(key) || { day: key, sent: 0, delivered: 0, read: 0 }; ['sent', 'delivered', 'read'].forEach((field) => { previous[field] += Number(row[field]) || 0; }); days.set(key, previous); });
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14);
}
export function marketingConversations(messages) {
  const latest = new Map();
  [...messages].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).forEach((row) => { if (row.phone && !latest.has(`${row.businessId || ''}:${row.phone}`)) latest.set(`${row.businessId || ''}:${row.phone}`, row); });
  return [...latest.values()];
}
