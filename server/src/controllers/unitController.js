const mongoose = require('mongoose');
const Unit = require('../models/Unit');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed } = require('../utils/scope');

const getUnits = asyncHandler(async (req, res) => {
  const { search, status, building } = req.query;
  const { buildingIds } = req.scope;
  const filter = {};

  if (buildingIds !== null) {
    if (!buildingIds || buildingIds.length === 0) {
      return sendSuccess(res, []);
    }
    filter.building = { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (status) {
    filter.status = status;
  }

  if (building) {
    if (mongoose.Types.ObjectId.isValid(building)) {
      if (buildingIds !== null && !isBuildingAllowed(buildingIds, building)) {
        return sendSuccess(res, []);
      }
      filter.building = building;
    }
  }

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { unitNumber: searchRegex },
      { type: searchRegex },
    ];
  }

  const units = await Unit.find(filter)
    .populate('building', 'name code address')
    .sort({ createdAt: -1 });

  return sendSuccess(res, units);
});

const getUnitById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Unit not found');
  }

  const unit = await Unit.findById(id).populate('building', 'name code address');

  if (!unit) {
    throw new ApiError(404, 'Unit not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, unit.building._id || unit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  return sendSuccess(res, unit);
});

const createUnit = asyncHandler(async (req, res) => {
  const { unitNumber, building: buildingId, type, floor, status } = req.body;

  if (!unitNumber || typeof unitNumber !== 'string' || !unitNumber.trim()) {
    throw new ApiError(400, 'Unit number is required', { unitNumber: 'Unit number is required' });
  }

  if (!buildingId) {
    throw new ApiError(400, 'Building ID is required', { building: 'Building ID is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new ApiError(400, 'Invalid building ID format', { building: 'Invalid building ID format' });
  }

  const buildingDoc = await Building.findById(buildingId);
  if (!buildingDoc) {
    throw new ApiError(400, 'Referenced building does not exist', { building: 'Referenced building does not exist' });
  }

  if (!isBuildingAllowed(req.scope.buildingIds, buildingId)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  if (floor !== undefined && typeof floor !== 'number') {
    throw new ApiError(400, 'Floor must be a number', { floor: 'Floor must be a number' });
  }

  if (status !== undefined && !['occupied', 'vacant'].includes(status)) {
    throw new ApiError(400, 'Status must be occupied or vacant', { status: 'Status must be occupied or vacant' });
  }

  try {
    const unit = await Unit.create({
      unitNumber: unitNumber.trim(),
      building: buildingId,
      type: type ? type.trim() : '2BHK',
      floor: floor !== undefined ? floor : 1,
      status: status || 'vacant',
    });

    await Building.findByIdAndUpdate(buildingId, { $inc: { units: 1 } });
    await unit.populate('building', 'name code address');

    return sendSuccess(res, unit, 'Unit created successfully', null, 201);
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, `Unit '${unitNumber.trim().toUpperCase()}' already exists in this building`, {
        unitNumber: 'Unit number must be unique per building',
      });
    }
    throw error;
  }
});

const updateUnit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Unit not found');
  }

  const unit = await Unit.findById(id);
  if (!unit) {
    throw new ApiError(404, 'Unit not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  const { unitNumber, building: newBuildingId, type, floor, status } = req.body;
  const oldBuildingId = unit.building.toString();

  if (unitNumber !== undefined) {
    if (typeof unitNumber !== 'string' || !unitNumber.trim()) {
      throw new ApiError(400, 'Unit number cannot be empty', { unitNumber: 'Unit number cannot be empty' });
    }
    unit.unitNumber = unitNumber.trim();
  }

  if (newBuildingId !== undefined && newBuildingId !== oldBuildingId) {
    if (!mongoose.Types.ObjectId.isValid(newBuildingId)) {
      throw new ApiError(400, 'Invalid building ID format', { building: 'Invalid building ID format' });
    }
    const newBuildingDoc = await Building.findById(newBuildingId);
    if (!newBuildingDoc) {
      throw new ApiError(400, 'Referenced building does not exist', { building: 'Referenced building does not exist' });
    }
    if (!isBuildingAllowed(req.scope.buildingIds, newBuildingId)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
    unit.building = newBuildingId;
  }

  if (type !== undefined) {
    unit.type = typeof type === 'string' ? type.trim() : '2BHK';
  }

  if (floor !== undefined) {
    if (typeof floor !== 'number') {
      throw new ApiError(400, 'Floor must be a number', { floor: 'Floor must be a number' });
    }
    unit.floor = floor;
  }

  if (status !== undefined) {
    if (!['occupied', 'vacant'].includes(status)) {
      throw new ApiError(400, 'Status must be occupied or vacant', { status: 'Status must be occupied or vacant' });
    }
    unit.status = status;
  }

  try {
    const updatedUnit = await unit.save();

    if (newBuildingId && newBuildingId !== oldBuildingId) {
      await Building.findByIdAndUpdate(oldBuildingId, { $inc: { units: -1 } });
      await Building.findByIdAndUpdate(newBuildingId, { $inc: { units: 1 } });
    }

    await updatedUnit.populate('building', 'name code address');
    return sendSuccess(res, updatedUnit, 'Unit updated successfully');
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, `Unit '${unitNumber ? unitNumber.trim().toUpperCase() : ''}' already exists in this building`, {
        unitNumber: 'Unit number must be unique per building',
      });
    }
    throw error;
  }
});

const deleteUnit = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Unit not found');
  }

  const unit = await Unit.findById(id);
  if (!unit) {
    throw new ApiError(404, 'Unit not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  await Unit.findByIdAndDelete(id);

  await Building.findByIdAndUpdate(unit.building, { $inc: { units: -1 } });

  return sendSuccess(res, null, 'Unit deleted successfully');
});

module.exports = {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
};
