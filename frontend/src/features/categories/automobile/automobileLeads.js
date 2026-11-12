export const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost'];
export const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Hot'];
export const leadStage = (lead) => lead.status === 'Converted' ? 'Won' : lead.status === 'In Progress' ? 'Contacted' : lead.status || 'New';
export const leadCode = (lead) => `LD-${String(lead._id || '').slice(-6).toUpperCase()}`;
export function leadDay(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
}
export function leadFollowUps(lead, followUps, leads) {
  return followUps.filter((row) => row.leadId ? String(row.leadId) === String(lead._id) : !row.customerId && String(row.person || '').trim().toLowerCase() === lead.name.trim().toLowerCase() && leads.filter((entry) => entry.name.trim().toLowerCase() === lead.name.trim().toLowerCase()).length === 1);
}
export function enrichLeads(leads, followUps) {
  return leads.map((lead) => {
    const related = leadFollowUps(lead, followUps, leads);
    const next = related.filter((row) => row.status !== 'Done' && row.date).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`))[0];
    return { ...lead, stage: leadStage(lead), priority: lead.priority || 'Medium', followUps: related, nextFollowUp: next || (!related.length && lead.followUpDate ? { date: lead.followUpDate, time: '', person: lead.name, regarding: lead.enquiry, status: 'Pending' } : null) };
  });
}
export function filterLeads(leads, filters) {
  return leads.filter((lead) => (!filters.status || lead.stage === filters.status) && (!filters.priority || lead.priority === filters.priority) && (!filters.owner || lead.owner === filters.owner) && (!filters.interest || lead.interestedIn === filters.interest)
    && (!filters.from || (lead.nextFollowUp?.date || '') >= filters.from) && (!filters.to || Boolean(lead.nextFollowUp?.date) && lead.nextFollowUp.date <= filters.to)
    && [lead.name, lead.company, lead.phone, lead.email, lead.source, lead.interestedIn, leadCode(lead)].join(' ').toLowerCase().includes(String(filters.search || '').trim().toLowerCase()));
}
export function leadStats(leads, now = new Date()) {
  const today = leadDay(now); const month = today.slice(0, 7);
  const converted = leads.filter((lead) => Boolean(lead.convertedCustomerId) || lead.status === 'Converted');
  return { total: leads.length, new: leads.filter((lead) => leadStage(lead) === 'New').length, hot: leads.filter((lead) => lead.priority === 'Hot' && !['Won', 'Lost'].includes(leadStage(lead))).length,
    due: leads.filter((lead) => lead.nextFollowUp?.date && lead.nextFollowUp.date <= today && !['Won', 'Lost'].includes(leadStage(lead))).length,
    converted: converted.length, convertedThisMonth: converted.filter((lead) => leadDay(lead.convertedAt).startsWith(month)).length, rate: leads.length ? converted.length / leads.length * 100 : 0 };
}
export function leadTrend(leads, now = new Date()) {
  const day = leadDay(now); const [year, month] = day.split('-').map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 6 + index, 1)); const key = date.toISOString().slice(0, 7);
    const created = leads.filter((lead) => leadDay(lead.createdAt).startsWith(key)).length;
    const converted = leads.filter((lead) => lead.convertedAt && leadDay(lead.convertedAt).startsWith(key)).length;
    return { key, label: date.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), created, converted };
  });
}
