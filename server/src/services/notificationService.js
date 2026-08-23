const mongoose = require('mongoose');
const User = require('../models/User');
const Unit = require('../models/Unit');
const Resident = require('../models/Resident');
const Notification = require('../models/Notification');

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

/**
 * Removes the acting user from a recipient list so nobody is notified
 * about their own action.
 */
function excludeActor(userIds, actorId) {
  if (!actorId) return userIds;
  const actorKey = String(actorId);
  return userIds.filter((id) => id.toString() !== actorKey);
}

/**
 * De-duplicates recipients (defensive; role-based queries cannot overlap
 * today) and bulk-inserts one notification document per recipient.
 * Does nothing when there are no recipients.
 */
async function deliverNotifications(recipients, payload) {
  const seen = new Set();
  const docs = [];
  for (const userId of recipients) {
    const key = userId.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ user: userId, ...payload });
  }

  if (docs.length === 0) return;
  await Notification.insertMany(docs);
}

async function findActiveStaffIds(buildingId) {
  const staff = await User.find({
    role: 'staff',
    status: 'active',
    buildings: toObjectId(buildingId),
  })
    .select('_id')
    .lean();
  return staff.map((s) => s._id);
}

async function findActiveResidentUserIdsForUnits(unitObjectIds) {
  if (!unitObjectIds || unitObjectIds.length === 0) return [];

  const residents = await Resident.find({ unit: { $in: unitObjectIds } })
    .select('_id')
    .lean();
  if (residents.length === 0) return [];

  const users = await User.find({
    role: 'resident',
    status: 'active',
    resident: { $in: residents.map((r) => r._id) },
  })
    .select('_id')
    .lean();
  return users.map((u) => u._id);
}

/**
 * NOTICE CREATED
 *
 * Uses the existing notice visibility rules as the source of truth
 * (see noticeController.getNotices):
 * - building-specific notice → staff assigned to that building plus
 *   resident users linked to residents living in that building
 * - global notice (building === null) → ALL active users
 *
 * The actor never receives their own event notification.
 */
async function notifyNoticeCreated({ noticeId, title, buildingId = null, actorId = null }) {
  let recipients;

  if (buildingId) {
    const staffIds = await findActiveStaffIds(buildingId);

    const units = await Unit.find({ building: toObjectId(buildingId) })
      .select('_id')
      .lean();
    const residentUserIds = await findActiveResidentUserIdsForUnits(units.map((u) => u._id));

    recipients = [...staffIds, ...residentUserIds];
  } else {
    const users = await User.find({ status: 'active' }).select('_id').lean();
    recipients = users.map((u) => u._id);
  }

  await deliverNotifications(excludeActor(recipients, actorId), {
    type: 'notice',
    title,
    building: buildingId ? toObjectId(buildingId) : null,
    entityType: 'notice',
    entityId: String(noticeId),
  });
}

/**
 * MAINTENANCE REQUEST CREATED
 *
 * Follows the existing maintenance authorization model: requests belong to
 * a unit and are visible to the building's staff, so the affected building's
 * active staff are notified. The actor never notifies themselves.
 */
async function notifyMaintenanceCreated({ maintenanceId, title, unitBuildingId, actorId = null }) {
  if (!unitBuildingId) return;

  const recipients = await findActiveStaffIds(unitBuildingId);
  await deliverNotifications(excludeActor(recipients, actorId), {
    type: 'maintenance',
    title,
    building: toObjectId(unitBuildingId),
    entityType: 'maintenance',
    entityId: String(maintenanceId),
  });
}

/**
 * MAINTENANCE STATUS UPDATED
 *
 * Notifies active resident users linked (via Phase 18 User.resident)
 * to residents living in the affected unit:
 *   User.resident → Resident.unit → Unit.building
 *
 * A unit with no linked resident accounts produces zero notifications.
 */
async function notifyMaintenanceStatusChanged({ maintenanceId, title, unitId, unitBuildingId = null, actorId = null }) {
  if (!unitId) return;

  const recipients = await findActiveResidentUserIdsForUnits([toObjectId(unitId)]);
  await deliverNotifications(excludeActor(recipients, actorId), {
    type: 'maintenance',
    title,
    building: unitBuildingId ? toObjectId(unitBuildingId) : null,
    entityType: 'maintenance',
    entityId: String(maintenanceId),
  });
}

module.exports = {
  notifyNoticeCreated,
  notifyMaintenanceCreated,
  notifyMaintenanceStatusChanged,
};
