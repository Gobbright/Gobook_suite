import { Types } from 'mongoose';
import { Leave } from '../../models/Leave.js';
import { EmployeePermission } from '../../models/EmployeePermission.js';
import { Attendance } from '../../models/Attendance.js';
import { AttendanceCorrection } from '../../models/AttendanceCorrection.js';
import { EmployeeWork } from '../../models/EmployeeWork.js';
import { EmployeeNotification } from '../../models/EmployeeNotification.js';
import { httpError } from '../../utils/httpError.js';

const sources = [
  { kind: 'leave', model: Leave, owner: 'userId', fields: 'empId name type from to days reason status', label: 'Leave request', path: 'leave', date: 'from', describe: r => `${r.type}: ${r.from} to ${r.to} (${r.days} days). ${r.reason}` },
  { kind: 'permission', model: EmployeePermission, owner: 'ownerUserId', fields: 'employeeId name date fromTime toTime reason status', label: 'Permission request', path: 'leave/permissions', date: 'date', describe: r => `${r.date}, ${r.fromTime} to ${r.toTime}. ${r.reason}` },
  { kind: 'attendance', model: Attendance, owner: 'userId', fields: 'employeeId name date checkIn checkOut hours breaks breakMinutes status', label: 'Attendance updated', path: 'attendance/monthly', date: 'date', describe: r => `${r.date}: check in ${r.checkIn}, check out ${r.checkOut}. ${r.hours} worked; ${r.breakMinutes || 0} break minutes.` },
  { kind: 'correction', model: AttendanceCorrection, owner: 'ownerUserId', fields: 'employeeId name date checkIn checkOut reason status', label: 'Attendance correction', path: 'attendance/corrections', date: 'date', describe: r => `${r.date}: ${r.checkIn || '--'} to ${r.checkOut || '--'}. ${r.reason}` },
  { kind: 'work', model: EmployeeWork, owner: 'ownerUserId', fields: 'employeeId employeeName title note status', label: 'Work updated', path: 'work', describe: r => `${r.title}${r.note ? `. ${r.note}` : ''}` },
  { kind: 'receipt', model: EmployeeNotification, owner: 'ownerUserId', time: 'readAt', fields: 'employeeId employeeName title readAt', label: 'Notification viewed', path: 'notifications', describe: r => r.title },
];

function parseCursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 300) throw httpError(400, 'Invalid updates cursor');
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (!sources.some(s => s.kind === c.kind) || typeof c.at !== 'string' || !Number.isFinite(Date.parse(c.at)) || typeof c.id !== 'string' || !/^[a-f\d]{24}$/i.test(c.id)) throw new Error();
    return { ...c, at: new Date(c.at) };
  } catch { throw httpError(400, 'Invalid updates cursor'); }
}

export async function employeeUpdates(req, res, next) {
  try {
    const kind = req.query.kind || '';
    if (typeof kind !== 'string' || kind && !sources.some(s => s.kind === kind)) throw httpError(400, 'Choose a valid update type');
    const cursor = parseCursor(req.query.before);
    const limit = 50;
    const results = await Promise.all(sources.filter(s => !kind || s.kind === kind).map(async source => {
      const time = source.time || 'updatedAt';
      const filter = { [source.owner]: req.employeeUser.ownerUserId };
      if (source.kind === 'receipt') filter.readAt = { $ne: null };
      if (cursor) {
        const equal = source.kind < cursor.kind ? { [time]: cursor.at } : source.kind === cursor.kind ? { [time]: cursor.at, _id: { $lt: new Types.ObjectId(cursor.id) } } : null;
        filter.$or = [{ [time]: { $lt: cursor.at } }, ...(equal ? [equal] : [])];
      }
      const rows = await source.model.find(filter).select(`${source.fields} ${time} createdAt`).sort({ [time]: -1, _id: -1 }).limit(limit + 1).lean();
      return rows.map(row => ({
        id: `${source.kind}:${row._id}`, recordId: String(row._id), kind: source.kind,
        employeeId: row.employeeId || row.empId, employeeName: row.employeeName || row.name,
        title: source.label, message: source.describe(row), status: row.status || 'Viewed',
        at: row[time] || row.createdAt,
        href: `/employee-management/${source.path}${source.date ? `?month=${String(row[source.date]).slice(0, 7)}` : ''}`,
      }));
    }));
    const rows = results.flat().sort((a, b) => new Date(b.at) - new Date(a.at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    const nextCursor = rows.length > limit && last ? Buffer.from(JSON.stringify({ kind: last.kind, id: last.recordId, at: new Date(last.at).toISOString() })).toString('base64url') : null;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data, nextCursor });
  } catch (error) { next(error); }
}
