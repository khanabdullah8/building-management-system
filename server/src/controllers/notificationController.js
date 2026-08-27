const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, paginationMeta } = require('../utils/pagination');

const notificationPopulation = {
  path: 'building',
  select: 'name code',
};

const NOTIFICATION_DEFAULT_LIMIT = 100;

const getNotifications = asyncHandler(async (req, res) => {
  // Notifications are user-owned data: always scoped to req.user.id.
  const { page, limit, skip } = getPagination(req.query, {
    defaultLimit: NOTIFICATION_DEFAULT_LIMIT,
  });

  const filter = { user: req.user.id };
  const total = await Notification.countDocuments(filter);
  const notifications = await Notification.find(filter)
    .populate(notificationPopulation)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  return sendSuccess(res, notifications, null, paginationMeta(page, limit, total));
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Notification not found');
  }

  const notification = await Notification.findOne({ _id: id, user: req.user.id });
  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  // Idempotent: already-read notifications are returned unchanged.
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }

  return sendSuccess(res, notification, 'Notification marked as read');
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user.id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return sendSuccess(res, { updated: result.modifiedCount }, 'All notifications marked as read');
});

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
