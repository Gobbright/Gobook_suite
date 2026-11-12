import { Types } from 'mongoose';
import { Attendance } from '../../models/Attendance.js';
import { Leave } from '../../models/Leave.js';
import { Payroll } from '../../models/Payroll.js';
import { httpError } from '../../utils/httpError.js';

function deleteOwnedRecord(Model, label) {
  return async (req, res, next) => {
    try {
      const ownerUserId = req.employeeUser?.ownerUserId;
      if (!ownerUserId) return next(httpError(403, 'An employee management administrator is required'));
      if (!Types.ObjectId.isValid(req.params.id)) return next(httpError(400, 'A valid record ID is required'));
      const record = await Model.findOneAndDelete({ _id: req.params.id, userId: ownerUserId }).lean();
      if (!record) return next(httpError(404, `${label} record not found`));
      res.json({ message: `${label} record deleted` });
    } catch (error) { next(error); }
  };
}

export const deletePortalAttendance = deleteOwnedRecord(Attendance, 'Attendance');
export const deletePortalLeave = deleteOwnedRecord(Leave, 'Leave');
export const deletePortalPayroll = deleteOwnedRecord(Payroll, 'Payroll');
