const mongoose = require('mongoose');
const Parking = require('../models/Parking');
const Building = require('../models/Building');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed } = require('../utils/scope');
const { record: recordAudit } = require('../services/auditService');
const { getPagination, paginationMeta } = require('../utils/pagination');

const buildingPopulation = { path: 'building', select: 'name code' };

const parkingPopulation = {
  path: 'unit',
  select: 'unitNumber building',
  populate: {
    path: 'building',
    select: 'name code',
  },
};

const validateBuilding = async (buildingId) => {
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new ApiError(400, 'Invalid building ID format', { building: 'Invalid building ID format' });
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    throw new ApiError(400, 'Referenced building does not exist', { building: 'Referenced building does not exist' });
  }
  return building;
};

const validateUnitBelongsToBuilding = async (unitId, buildingId) => {
  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new ApiError(400, 'Invalid unit ID format', { unit: 'Invalid unit ID format' });
  }

  const unit = await Unit.findById(unitId);
  if (!unit) {
    throw new ApiError(400, 'Referenced unit does not exist', { unit: 'Referenced unit does not exist' });
  }

  if (unit.building.toString() !== buildingId.toString()) {
    throw new ApiError(400, 'Unit does not belong to the selected building', {
      unit: 'Unit does not belong to the selected building',
    });
  }
};

const getParkingSlots = asyncHandler(async (req, res) => {
  const { search, building, unit } = req.query;
  const { buildingIds } = req.scope;
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};

  if (buildingIds !== null) {
    if (!buildingIds || buildingIds.length === 0) {
      return sendSuccess(res, [], null, paginationMeta(page, limit, 0));
    }
    filter.building = { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return sendSuccess(res, [], null, paginationMeta(page, limit, 0));
    }
    if (buildingIds !== null && !isBuildingAllowed(buildingIds, building)) {
      return sendSuccess(res, [], null, paginationMeta(page, limit, 0));
    }
    filter.building = building;
  }

  if (unit) {
    if (!mongoose.Types.ObjectId.isValid(unit)) {
      return sendSuccess(res, [], null, paginationMeta(page, limit, 0));
    }
    filter.unit = unit;
  }

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');

    const matchingUnitIds = await Unit.find({ unitNumber: searchRegex }).distinct('_id');

    filter.$or = [
      { slotCode: searchRegex },
      { vehicleType: searchRegex },
      { unit: { $in: matchingUnitIds.length > 0 ? matchingUnitIds : [] } },
    ];
  }

  const total = await Parking.countDocuments(filter);
  const slots = await Parking.find(filter)
    .populate(buildingPopulation)
    .populate(parkingPopulation)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);

  return sendSuccess(res, slots, null, paginationMeta(page, limit, total));
});

const getParkingSlotById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Parking slot not found');
  }

  const slot = await Parking.findById(id)
    .populate(buildingPopulation)
    .populate(parkingPopulation);

  if (!slot) {
    throw new ApiError(404, 'Parking slot not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, slot.building._id || slot.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  return sendSuccess(res, slot);
});

const createParkingSlot = asyncHandler(async (req, res) => {
  const { slotCode, building: buildingId, unit: unitId, vehicleType, vehicleNumber } = req.body;

  if (!slotCode || typeof slotCode !== 'string' || !slotCode.trim()) {
    throw new ApiError(400, 'Slot code is required', { slotCode: 'Slot code is required' });
  }

  if (!buildingId) {
    throw new ApiError(400, 'Building ID is required', { building: 'Building ID is required' });
  }

  const buildingDoc = await validateBuilding(buildingId);

  if (!isBuildingAllowed(req.scope.buildingIds, buildingId)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  if (unitId !== undefined && unitId !== null) {
    await validateUnitBelongsToBuilding(unitId, buildingId);
  }

  if (vehicleType !== undefined) {
    const validVehicleTypes = ['car', 'bike'];
    if (!validVehicleTypes.includes(vehicleType)) {
      throw new ApiError(400, 'Vehicle type must be car or bike', { vehicleType: 'Vehicle type must be car or bike' });
    }
  }

  if (vehicleNumber !== undefined && typeof vehicleNumber !== 'string') {
    throw new ApiError(400, 'Vehicle number must be a string', { vehicleNumber: 'Vehicle number must be a string' });
  }

  const trimmedCode = slotCode.trim().toUpperCase();
  const existing = await Parking.findOne({ building: buildingId, slotCode: trimmedCode });
  if (existing) {
    throw new ApiError(409, `Slot '${trimmedCode}' already exists in this building`, {
      slotCode: 'Slot code already exists in this building',
    });
  }

  const slot = await Parking.create({
    slotCode: trimmedCode,
    building: buildingId,
    unit: unitId || null,
    vehicleType: vehicleType || 'car',
    vehicleNumber: unitId ? (vehicleNumber !== undefined ? vehicleNumber.trim() : '') : '',
  });

  try {
    await recordAudit({
      actor: req.user,
      action: 'created',
      module: 'parking',
      resourceId: slot._id,
      resourceLabel: slot.slotCode,
      buildingId: slot.building,
      buildingName: buildingDoc.name || buildingDoc.code,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

  await slot.populate(buildingPopulation);
  await slot.populate(parkingPopulation);

  return sendSuccess(res, slot, 'Parking slot created successfully', null, 201);
});

const updateParkingSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Parking slot not found');
  }

  const slot = await Parking.findById(id);
  if (!slot) {
    throw new ApiError(404, 'Parking slot not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, slot.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }

  const { slotCode, unit: unitId, vehicleType, vehicleNumber } = req.body;

  if (slotCode !== undefined) {
    if (typeof slotCode !== 'string' || !slotCode.trim()) {
      throw new ApiError(400, 'Slot code cannot be empty', { slotCode: 'Slot code cannot be empty' });
    }
    const trimmedCode = slotCode.trim().toUpperCase();
    const duplicate = await Parking.findOne({
      building: slot.building,
      slotCode: trimmedCode,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw new ApiError(409, `Slot '${trimmedCode}' already exists in this building`, {
        slotCode: 'Slot code already exists in this building',
      });
    }
    slot.slotCode = trimmedCode;
  }

  if (unitId !== undefined) {
    if (unitId === null) {
      slot.unit = null;
      slot.vehicleNumber = '';
    } else {
      await validateUnitBelongsToBuilding(unitId, slot.building);
      slot.unit = unitId;
    }
  }

  if (vehicleType !== undefined) {
    const validVehicleTypes = ['car', 'bike'];
    if (!validVehicleTypes.includes(vehicleType)) {
      throw new ApiError(400, 'Vehicle type must be car or bike', { vehicleType: 'Vehicle type must be car or bike' });
    }
    slot.vehicleType = vehicleType;
  }

  if (vehicleNumber !== undefined && slot.unit !== null) {
    if (typeof vehicleNumber !== 'string') {
      throw new ApiError(400, 'Vehicle number must be a string', { vehicleNumber: 'Vehicle number must be a string' });
    }
    slot.vehicleNumber = vehicleNumber.trim();
  }

  const updatedSlot = await slot.save();

  try {
    await recordAudit({
      actor: req.user,
      action: 'updated',
      module: 'parking',
      resourceId: updatedSlot._id,
      resourceLabel: updatedSlot.slotCode,
      buildingId: updatedSlot.building,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }


  await updatedSlot.populate(buildingPopulation);
  await updatedSlot.populate(parkingPopulation);

  return sendSuccess(res, updatedSlot, 'Parking slot updated successfully');
});

const deleteParkingSlot = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Parking slot not found');
  }

  const slot = await Parking.findById(id);
  if (!slot) {
    throw new ApiError(404, 'Parking slot not found');
  }

  if (!isBuildingAllowed(req.scope.buildingIds, slot.building)) {
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  }
  await Parking.findByIdAndDelete(id);

  try {
    await recordAudit({
      actor: req.user,
      action: 'deleted',
      module: 'parking',
      resourceId: id,
      resourceLabel: slot.slotCode,
      buildingId: slot.building,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }

  return sendSuccess(res, null, 'Parking slot deleted successfully');
});

module.exports = {
  getParkingSlots,
  getParkingSlotById,
  createParkingSlot,
  updateParkingSlot,
  deleteParkingSlot,
};
