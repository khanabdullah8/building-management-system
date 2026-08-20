const mongoose = require('mongoose');
const User = require('../models/User');
const Unit = require('../models/Unit');

/**
 * Resolves the allowed building IDs for the authenticated user.
 *
 * admin  → null (unrestricted)
 * staff  → string[] from User.buildings
 * resident → [Unit.building] derived from User → Resident → Unit chain
 *
 * Returns { buildingIds, unitId? }
 */
async function resolveBuildingScope(user) {
  if (user.role === 'admin') {
    return { buildingIds: null };
  }

  if (user.role === 'staff') {
    const fullUser = await User.findById(user.id).select('buildings').lean();
    const ids = (fullUser?.buildings || []).map((b) => b.toString());
    return { buildingIds: ids };
  }

  if (user.role === 'resident') {
    const fullUser = await User.findById(user.id)
      .populate({
        path: 'resident',
        populate: { path: 'unit', select: 'building' },
      })
      .lean();

    if (!fullUser?.resident?.unit) {
      return { buildingIds: [], unitId: null };
    }

    const buildingId = fullUser.resident.unit.building._id
      ? fullUser.resident.unit.building._id.toString()
      : fullUser.resident.unit.building.toString();
    const unitId = fullUser.resident.unit._id
      ? fullUser.resident.unit._id.toString()
      : fullUser.resident.unit.toString();

    return { buildingIds: [buildingId], unitId };
  }

  return { buildingIds: [] };
}

/**
 * Returns true when the user has global access (admin).
 */
function hasGlobalAccess(buildingIds) {
  return buildingIds === null;
}

/**
 * Returns true when the given buildingId is in the allowed list.
 * null buildingIds means global access.
 */
function isBuildingAllowed(buildingIds, buildingId) {
  if (buildingIds === null) return true;
  if (!buildingId) return false;
  const bid = buildingId.toString();
  return buildingIds.some((id) => id.toString() === bid);
}

/**
 * Builds a MongoDB filter that restricts results to the allowed buildings.
 * When field is 'building' the filter targets documents with a direct building ref.
 * Pass an alternative field name for resources whose building is resolved through
 * a populate (e.g. unit → building). In that case, the caller should resolve
 * unit IDs beforehand and use { unit: { $in: unitIds } }.
 *
 * Returns {} for admin (no restriction), or { building: { $in: [...] } }.
 * Returns { _id: { $in: [] } } (matches nothing) when the user has no buildings.
 */
function buildingScopeFilter(buildingIds) {
  if (buildingIds === null) return {};
  if (!buildingIds || buildingIds.length === 0) {
    return { _id: { $in: [] } };
  }
  return { building: { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) } };
}

/**
 * For resources accessed via Unit (Maintenance, Complaint, Visitor, Bill, Payment),
 * returns a filter restricting to units whose building is in the allowed list.
 * Pass allowedBuildingIds.
 */
async function unitScopeFilter(buildingIds) {
  if (buildingIds === null) return {};
  if (!buildingIds || buildingIds.length === 0) {
    return { unit: { $in: [] } };
  }
  const unitIds = await Unit.find({
    building: { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) },
  }).select('_id').lean();
  return { unit: { $in: unitIds.map((u) => u._id) } };
}

module.exports = {
  resolveBuildingScope,
  hasGlobalAccess,
  isBuildingAllowed,
  buildingScopeFilter,
  unitScopeFilter,
};
