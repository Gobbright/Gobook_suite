import assert from 'node:assert/strict';
import test from 'node:test';
import { employeeDetails } from '../src/services/employeeDetails.js';
import { breakSummary, netAttendanceHours } from '../src/services/attendanceBreaks.js';

test('family, statutory and bank fields normalize equally for JSON and photo uploads', () => {
  const input = { statutoryDetails: { pfNumber: ' PF-123 ', uan: '001234567890', esiNumber: '00123', pan: 'abcde1234f', userId: 'forged' }, bankDetails: { accountNumber: '0012345', ifsc: 'abcd0123456' }, familyMembers: [{ name: ' Mother ', relationship: 'Parent', phone: '9000012345', isEmergencyContact: true, occupation: 'Teacher', dateOfBirth: '1970-04-01' }], userId: 'forged', emailVerifiedAt: new Date() };
  const details = employeeDetails(input);
  const multipart = employeeDetails(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])));
  assert.deepEqual(details, multipart);
  assert.equal(details.familyMembers[0].name, 'Mother');
  assert.equal(details.statutoryDetails.pan, 'ABCDE1234F');
  assert.equal(details.bankDetails.accountNumber, '0012345');
  assert.equal(details.bankDetails.ifsc, 'ABCD0123456');
  assert.equal(details.userId, undefined);
  assert.equal(details.statutoryDetails.userId, undefined);
  assert.equal(details.emailVerifiedAt, undefined);
});
test('partial employee updates preserve omitted details and allow family removal', () => {
  assert.deepEqual(employeeDetails({ name: 'Updated name' }), {});
  assert.deepEqual(employeeDetails({ familyMembers: [] }), { familyMembers: [] });
});
test('invalid family data is rejected before persistence', () => {
  for (const familyMembers of ['invalid', {}, Array(21).fill({}), [{ name: '', relationship: 'Parent' }], [{ name: 'Parent', relationship: 'Parent', isEmergencyContact: true }], [{ name: 'Parent', relationship: 'Parent', dateOfBirth: '2025-02-30' }], [{ name: 'Parent', relationship: 'Parent', isEmergencyContact: 'false' }]]) assert.throws(() => employeeDetails({ familyMembers }), { statusCode: 400 });
  assert.throws(() => employeeDetails({ statutoryDetails: { uan: { $ne: '' } } }), { statusCode: 400 });
});
test('break totals and net work hours include multiple breaks and close an active break at checkout', () => {
  const breaks = [{ start: '11:00', end: '11:15' }, { start: '13:00', end: '13:45' }, { start: '17:50', end: '' }];
  assert.equal(breakSummary(breaks).breakMinutes, 60);
  const summary = breakSummary(breaks, '18:00');
  assert.equal(summary.breakMinutes, 70);
  assert.equal(summary.breaks.at(-1).end, '18:00');
  assert.equal(netAttendanceHours('09:00', '18:00', summary.breaks), '7h 50m');
  assert.equal(breaks.at(-1).end, '');
});
test('overlapping, reversed and malformed break times are rejected', () => {
  for (const breaks of [[{ start: '25:00', end: '25:05' }], [{ start: '14:00', end: '13:00' }], [{ start: '11:00', end: '12:00' }, { start: '11:30', end: '12:30' }], [{ start: '11:00', end: '' }, { start: '13:00', end: '' }]]) assert.throws(() => breakSummary(breaks), { statusCode: 400 });
  assert.throws(() => netAttendanceHours('09:00', '08:00'), { statusCode: 400 });
  assert.throws(() => netAttendanceHours('09:00', '18:00', [{ start: '08:00', end: '08:30' }]), { statusCode: 400 });
  assert.throws(() => netAttendanceHours('09:00', '18:00', [{ start: '17:30', end: '18:30' }]), { statusCode: 400 });
});
