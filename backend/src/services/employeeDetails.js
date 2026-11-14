import { httpError } from '../utils/httpError.js';

function object(value, label) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw httpError(400, `Invalid ${label}`); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, `Invalid ${label}`);
  return value;
}
function text(value, label, max = 200) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw httpError(400, `${label} must be text of up to ${max} characters`);
  return value.trim();
}
function date(value, label) {
  const result = text(value, label, 10);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)) throw httpError(400, `Invalid ${label}`);
  return result;
}

// Explicit fields keep identity, verification and tenant ownership out of profile edits.
export function employeeDetails(input) {
  const result = {};
  for (const key of ['maritalStatus', 'nationality', 'qualification', 'permanentAddress']) {
    if (input[key] !== undefined) result[key] = text(input[key], key, key === 'permanentAddress' ? 1000 : 200);
  }
  for (const [key, fields] of Object.entries({ statutoryDetails: ['pfNumber', 'uan', 'esiNumber', 'pan'], bankDetails: ['accountName', 'bankName', 'accountNumber', 'ifsc', 'branch'] })) {
    if (input[key] === undefined) continue;
    const source = object(input[key], key);
    result[key] = Object.fromEntries(fields.map((field) => [field, text(source[field], field)]));
    if (key === 'statutoryDetails') result[key].pan = result[key].pan.toUpperCase();
    if (key === 'bankDetails') result[key].ifsc = result[key].ifsc.toUpperCase();
  }
  if (input.familyMembers !== undefined) {
    let members = input.familyMembers;
    if (typeof members === 'string') {
      try { members = JSON.parse(members); } catch { throw httpError(400, 'Invalid family members'); }
    }
    if (!Array.isArray(members) || members.length > 20) throw httpError(400, 'Add up to 20 family members');
    result.familyMembers = members.map((value) => {
      const member = object(value, 'family member');
      const name = text(member.name, 'Family member name');
      const relationship = text(member.relationship, 'Relationship');
      const phone = text(member.phone, 'Family mobile', 30);
      if (!name || !relationship) throw httpError(400, 'Each family member needs a name and relationship');
      if (member.isEmergencyContact !== undefined && typeof member.isEmergencyContact !== 'boolean') throw httpError(400, 'Emergency contact must be true or false');
      if (member.isEmergencyContact && !phone) throw httpError(400, 'Emergency family contacts need a mobile number');
      return { name, relationship, phone, dateOfBirth: date(member.dateOfBirth, 'Family date of birth'), occupation: text(member.occupation, 'Occupation'), isEmergencyContact: Boolean(member.isEmergencyContact) };
    });
  }
  return result;
}
