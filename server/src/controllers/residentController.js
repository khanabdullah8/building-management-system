const mongoose = require('mongoose');
const Resident = require('../models/Resident');
const Unit = require('../models/Unit');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed, unitScopeFilter } = require('../utils/scope');
const { record: recordAudit } = require('../services/auditService');
const { getPagination, paginationMeta } = require('../utils/pagination');

const residentPopulation = {
  path: 'unit',
  select: 'unitNumber building',
  populate: {
    path: 'building',
    select: 'name code',
  },
};

/**
 * Attaches additive login-account info to resident responses:
 *   { account: { linked: boolean, userEmail: string|null } }
 *
 * Uses a single batched User.find() over all resident ids (no N+1).
 * Returns plain objects so the extra field survives toJSON transforms.
 */
async function attachAccountInfo(residents) {
  const list = Array.isArray(residents) ? residents : [residents];

  const accountMap = {};
  if (list.length > 0) {
    const accounts = await User.find({ resident: { $in: list.map((r) => r._id) } })
      .select('email resident')
      .lean();
    for (const account of accounts) {
      const key = account.resident.toString();
      if (!accountMap[key]) {
        accountMap[key] = account.email;
      }
    }
  }

  return list.map((resident) => {
    const obj = resident.toObject();
    const userEmail = accountMap[resident._id.toString()];
    obj.account = userEmail
      ? { linked: true, userEmail }
      : { linked: false, userEmail: null };
    return obj;
  });
}

const getResidents = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { buildingIds, unitId } = req.scope;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (req.user.role === 'resident') {
    if (unitId) {
      filter.unit = new mongoose.Types.ObjectId(unitId);
    } else {
      filter._id = { $in: [] };
    }
  } else if (buildingIds !== null) {
    const unitFilter = await unitScopeFilter(buildingIds);
    if (unitFilter.unit && unitFilter.unit.$in && unitFilter.unit.$in.length === 0) {
      filter._id = { $in: [] };
    } else {
      Object.assign(filter, unitFilter);
    }
  }

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    filter.$or = [
      { name: searchRegex },
      { phone: searchRegex },
    ];
  }

  const total = await Resident.countDocuments(filter);
  const residents = await Resident.find(filter)
    .populate(residentPopulation)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  return sendSuccess(res, await attachAccountInfo(residents), null, paginationMeta(page, limit, total));
});

const getResidentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Resident not found');
  }

  const resident = await Resident.findById(id).populate(residentPopulation);
  if (!resident) {
    throw new ApiError(404, 'Resident not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId && resident.unit && resident.unit._id.toString() === unitId) {
      return sendSuccess(res, (await attachAccountInfo(resident))[0]);
    }
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  } else if (buildingIds !== null) {
    if (resident.unit && resident.unit.building) {
      const buildingRef = resident.unit.building._id || resident.unit.building;
      if (!isBuildingAllowed(buildingIds, buildingRef.toString())) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  return sendSuccess(res, (await attachAccountInfo(resident))[0]);
});

const validateUnit = async (unitId) => {
  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new ApiError(400, 'Invalid unit ID format', { unit: 'Invalid unit ID format' });
  }

  const unit = await Unit.findById(unitId);
  if (!unit) {
    throw new ApiError(400, 'Referenced unit does not exist', { unit: 'Referenced unit does not exist' });
  }
  return unit;
};

const createResident = asyncHandler(async (req, res) => {
  const { name, unit: unitId, phone, type, status } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'Resident name is required', { name: 'Resident name is required' });
  }

  if (!unitId) {
    throw new ApiError(400, 'Unit ID is required', { unit: 'Unit ID is required' });
  }

  const unit = await validateUnit(unitId);

  if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
    throw new ApiError(403, 'Forbidden: cannot access resources outside your unit');
  }

  if (phone !== undefined && typeof phone !== 'string') {
    throw new ApiError(400, 'Phone must be a string', { phone: 'Phone must be a string' });
  }

  if (!['owner', 'tenant'].includes(type)) {
    throw new ApiError(400, 'Type must be owner or tenant', { type: 'Type must be owner or tenant' });
  }

  if (!['active', 'inactive'].includes(status)) {
    throw new ApiError(400, 'Status must be active or inactive', { status: 'Status must be active or inactive' });
  }

  const resident = await Resident.create({
    name: name.trim(),
    unit: unitId,
    phone: phone !== undefined ? phone.trim() : '',
    type,
    status,
  });

  try {
    await recordAudit({
      actor: req.user,
      action: 'created',
      module: 'resident',
      resourceId: resident._id,
      resourceLabel: resident.name,
      buildingId: unit.building,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

  await resident.populate(residentPopulation);
  return sendSuccess(res, resident, 'Resident created successfully', null, 201);
});

const updateResident = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Resident not found');
  }

  const resident = await Resident.findById(id);
  if (!resident) {
    throw new ApiError(404, 'Resident not found');
  }

  const existingUnit = await Unit.findById(resident.unit).select('building').lean();
  if (existingUnit && !isBuildingAllowed(req.scope.buildingIds, existingUnit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  // Residents may only update residents that live in their own unit.
  if (req.user.role === 'resident') {
    if (!req.scope.unitId || !existingUnit || existingUnit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot access resources outside your unit');
    }
  }

  const { name, unit: unitId, phone, type, status } = req.body;

  // Building snapshot for the audit record — reflects a reassignment
  // when the unit changes during this update.
  let auditBuildingId = existingUnit ? existingUnit.building : null;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Resident name cannot be empty', { name: 'Resident name cannot be empty' });
    }
    resident.name = name.trim();
  }

  if (unitId !== undefined) {
    const unit = await validateUnit(unitId);
    if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your scope');
    }
    if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your unit');
    }
    resident.unit = unitId;
    auditBuildingId = unit.building;
  }

  if (phone !== undefined) {
    if (typeof phone !== 'string') {
      throw new ApiError(400, 'Phone must be a string', { phone: 'Phone must be a string' });
    }
    resident.phone = phone.trim();
  }

  if (type !== undefined) {
    if (!['owner', 'tenant'].includes(type)) {
      throw new ApiError(400, 'Type must be owner or tenant', { type: 'Type must be owner or tenant' });
    }
    resident.type = type;
  }

  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) {
      throw new ApiError(400, 'Status must be active or inactive', { status: 'Status must be active or inactive' });
    }
    resident.status = status;
  }

  const updatedResident = await resident.save();

  try {
    await recordAudit({
      actor: req.user,
      action: 'updated',
      module: 'resident',
      resourceId: updatedResident._id,
      resourceLabel: updatedResident.name,
      buildingId: auditBuildingId,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

  await updatedResident.populate(residentPopulation);
  return sendSuccess(res, updatedResident, 'Resident updated successfully');
});

const deleteResident = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Resident not found');
  }

  const resident = await Resident.findById(id);
  if (!resident) {
    throw new ApiError(404, 'Resident not found');
  }

  const existingUnit = await Unit.findById(resident.unit).select('building').lean();
  if (existingUnit && !isBuildingAllowed(req.scope.buildingIds, existingUnit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  // Residents may only delete residents that live in their own unit.
  if (req.user.role === 'resident') {
    if (!req.scope.unitId || !existingUnit || existingUnit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot access resources outside your unit');
    }
  }

  await Resident.findByIdAndDelete(id);

  try {
    await recordAudit({
      actor: req.user,
      action: 'deleted',
      module: 'resident',
      resourceId: id,
      resourceLabel: resident.name,
      buildingId: existingUnit ? existingUnit.building : null,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

  return sendSuccess(res, null, 'Resident deleted successfully');
});

module.exports = {
  getResidents,
  getResidentById,
  createResident,
  updateResident,
  deleteResident,
};
