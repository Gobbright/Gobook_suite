import { Types } from 'mongoose';
import { EmployeeNotification } from '../../models/EmployeeNotification.js';
import { httpError } from '../../utils/httpError.js';

export async function employeeNavigationCounts(req, res, next) {
  try {
    const unread = await EmployeeNotification.countDocuments({ ownerUserId: req.employeeUser.ownerUserId, ownerReadAt: null, kind: { $ne: 'login-otp' } });
    res.set('Cache-Control', 'no-store');
    res.json({ unread });
  } catch (error) { next(error); }
}

export async function readOwnerNotification(req, res, next) {
  try {
    if (!Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Notification not found');
    const own = { _id: req.params.id, ownerUserId: req.employeeUser.ownerUserId };
    // Owner viewing never changes the employee's independent read receipt.
    await EmployeeNotification.updateOne({ ...own, ownerReadAt: null }, { $set: { ownerReadAt: new Date() } });
    const data = await EmployeeNotification.findOne(own).select('-requestKey -__v').lean();
    if (!data) throw httpError(404, 'Notification not found');
    res.json(data);
  } catch (error) { next(error); }
}

export async function readAllOwnerNotifications(req, res, next) {
  try {
    const now = new Date();
    await EmployeeNotification.updateMany({ ownerUserId: req.employeeUser.ownerUserId, ownerReadAt: null, createdAt: { $lte: now } }, { $set: { ownerReadAt: now } });
    res.json({ message: 'All employee notifications marked as read.' });
  } catch (error) { next(error); }
}
