import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { env } from '../src/config/env.js';
import { AppUser } from '../src/models/AppUser.js';
import { Employee } from '../src/models/Employee.js';
import { EmployeeWork } from '../src/models/EmployeeWork.js';
import { listWork } from '../src/modules/employee-portal/workController.js';

assert.equal(env.nodeEnv, 'development', 'Demo work is restricted to local development');
assert.ok(/^mongodb:\/\/(?:localhost|127\.0\.0\.1):\d+\//i.test(env.mongodbUri), 'A local database is required');
const ownerId = process.argv.find((arg) => arg.startsWith('--owner='))?.slice(8);
assert.ok(/^[a-f\d]{24}$/i.test(ownerId || ''), 'Pass the intended business owner with --owner=<id>');
const asOfArg = process.argv.find((arg) => arg.startsWith('--as-of='))?.slice(8);
const asOf = asOfArg ? DateTime.fromISO(asOfArg, { zone: 'Asia/Kolkata' }).set({ hour: 12 }) : DateTime.now().setZone('Asia/Kolkata');
assert.ok(asOf.isValid, 'Choose a valid --as-of=YYYY-MM-DD date');
const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');
const marker = 'demo-work-30-v1-';
const templates = {
  Sales: ['Follow up on customer enquiries', 'Prepare the weekly sales summary', 'Update the customer follow-up register', 'Review pending quotations', 'Prepare tomorrow’s customer call list', 'Check sales order confirmations'],
  Billing: ['Review today’s billing entries', 'Prepare the daily invoice summary', 'Verify payment receipts', 'Check pending customer invoices', 'Review invoice tax calculations', 'Organize completed billing records'],
  Inventory: ['Count stock in the assigned section', 'Prepare the low-stock item list', 'Verify goods received against delivery notes', 'Update product shelf labels', 'Review stock transfer entries', 'Prepare the weekly stock reconciliation'],
  Accounts: ['Reconcile cash and payment entries', 'Review outstanding supplier payments', 'Prepare the expense summary', 'Check customer account balances', 'Review bank reconciliation entries', 'Organize supporting expense documents'],
  HR: ['Review employee attendance entries', 'Prepare the staff shift roster', 'Update the employee document checklist', 'Review pending leave requests', 'Prepare the onboarding checklist', 'Compile the weekly attendance summary'],
};
const fallback = ['Review assigned daily work', 'Prepare a progress summary', 'Complete the quality checklist', 'Update the team handover notes', 'Review outstanding requests', 'Organize completed work records'];
async function listing(query = {}, employeeObjectId) {
  let response;
  await listWork({ employeeUser: { ownerUserId: ownerId, role: employeeObjectId ? 'employee' : 'admin', ...(employeeObjectId ? { employeeObjectId: String(employeeObjectId) } : {}) }, query }, { setHeader() {}, json(value) { response = value; } }, (error) => { throw error; });
  return response;
}

try {
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName, serverSelectionTimeoutMS: 5000 });
  const owner = await AppUser.findOne({ _id: ownerId, status: 'Active', $or: [{ accountType: 'owner' }, { role: 'Super Admin' }] }).select('name businessName').lean();
  assert.ok(owner, 'The selected active business owner was not found');
  const employees = await Employee.find({ userId: ownerId, status: { $in: ['Active', 'Probation', 'On Leave'] } }).select('employeeId name dept').sort({ employeeId: 1, _id: 1 }).lean();
  assert.ok(employees.length, 'Add an active employee before creating demo work');
  const planned = Array.from({ length: 30 }, (_, index) => {
    const employeeIndex = index % employees.length;
    const employee = employees[employeeIndex];
    const round = Math.floor(index / employees.length);
    const peer = employees.slice(0, employeeIndex).filter((row) => row.dept === employee.dept).length;
    const title = (templates[employee.dept] || fallback)[(peer * 3 + round) % 6];
    const status = ['Assigned', 'In Progress', 'Completed'][Math.floor(index / 10)];
    const completed = status === 'Completed';
    const completedAt = completed ? asOf.minus({ days: index % 5 + 1 }).set({ hour: 17, minute: 30 }).toJSDate() : null;
    const createdAt = asOf.minus({ days: 10 + index % 8 }).set({ hour: 9, minute: 30 }).toJSDate();
    const requestId = marker + String(index + 1).padStart(2, '0');
    return {
      _id: new mongoose.Types.ObjectId(createHash('sha256').update(`${ownerId}:${requestId}`).digest('hex').slice(0, 24)),
      ownerUserId: ownerId, employeeObjectId: employee._id, employeeId: employee.employeeId, employeeName: employee.name,
      requestId, title: `[DEMO] ${title}`,
      description: `Sample ${employee.dept || 'team'} assignment for ${employee.name}. ${title}. Review the relevant records, resolve any differences and add a short progress or completion note. This is dummy work for trying the Work Management page.`,
      dueDate: completed ? DateTime.fromJSDate(completedAt, { zone: 'Asia/Kolkata' }).toISODate() : asOf.plus({ days: index % 7 - 2 }).toISODate(),
      priority: ['Normal', 'High', 'Low', 'Urgent'][index % 4], status,
      note: completed ? 'Sample completion: records reviewed and the work checklist completed.' : status === 'In Progress' ? 'Sample progress: initial checks completed; final review is underway.' : '',
      assignedBy: 'Demo setup', completedAt, createdAt, updatedAt: completedAt || asOf.toJSDate(), __v: 0,
    };
  });
  const filter = { ownerUserId: ownerId, requestId: { $in: planned.map((task) => task.requestId) } };
  const existingDemo = await EmployeeWork.countDocuments(filter);
  console.log(JSON.stringify({ business: owner.businessName || owner.name, database: mongoose.connection.name, activeEmployees: employees.length, planned: 30, existingDemo, apply, verify }));
  if (apply) {
    // Stable IDs plus insert-only upserts preserve existing work and any later
    // employee edits if this command is run again.
    const result = await EmployeeWork.bulkWrite(planned.map((task) => ({ updateOne: { filter: { _id: task._id, ownerUserId: ownerId }, update: { $setOnInsert: task }, upsert: true, timestamps: false } })));
    console.log(JSON.stringify({ added: result.upsertedCount, alreadyPresent: 30 - result.upsertedCount }));
  }
  if (apply || verify) {
    const records = await EmployeeWork.find(filter).lean();
    assert.equal(records.length, 30, 'Expected exactly 30 demo work records');
    const statusCounts = Object.fromEntries(['Assigned', 'In Progress', 'Completed'].map((status) => [status, records.filter((row) => row.status === status).length]));
    const seen = new Set();
    const first = await listing({ page: '1' });
    const pages = Math.ceil(first.total / first.limit);
    for (let page = 1; page <= pages; page++) for (const row of (page === 1 ? first : await listing({ page: String(page) })).data) seen.add(String(row._id));
    assert.ok(records.every((row) => seen.has(String(row._id))), 'All demo records must be visible through work pagination');
    for (const employee of employees) {
      const mine = await listing({ page: '1' }, employee._id);
      assert.ok(mine.data.every((row) => String(row.employeeObjectId) === String(employee._id)), 'Employee work must remain scoped');
    }
    console.log(JSON.stringify({ verified: true, demoRecords: records.length, statusCounts, totalWork: first.total, pages, perEmployee: employees.map((employee) => ({ employeeId: employee.employeeId, demoWork: records.filter((row) => String(row.employeeObjectId) === String(employee._id)).length })) }, null, 2));
  }
} finally { await mongoose.disconnect(); }
