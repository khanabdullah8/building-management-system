const mongoose = require('mongoose');
const Maintenance = require('../models/Maintenance');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed, unitScopeFilter } = require('../utils/scope');

const maintenancePopulation = {
  path: 'unit',
  select: 'unitNumber building',
  populate: {
    path: 'building',
    select: 'name code',
  },
};

const getMaintenanceRequests = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { buildingIds, unitId } = req.scope;
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
      { title: searchRegex },
    ];
  }

  const requests = await Maintenance.find(filter)
    .populate(maintenancePopulation)
    .sort({ createdAt: -1 });

  return sendSuccess(res, requests);
});

const getMaintenanceRequestById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const request = await Maintenance.findById(id).populate(maintenancePopulation);
  if (!request) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId && request.unit && request.unit._id.toString() === unitId) {
      return sendSuccess(res, request);
    }
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  } else if (buildingIds !== null) {
    if (request.unit && request.unit.building) {
      const buildingRef = request.unit.building._id || request.unit.building;
      if (!isBuildingAllowed(buildingIds, buildingRef.toString())) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  return sendSuccess(res, request);
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

const createMaintenanceRequest = asyncHandler(async (req, res) => {
  const { title, unit: unitId, description, priority, assignedTo, status } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ApiError(400, 'Maintenance title is required', { title: 'Maintenance title is required' });
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

  if (!['low', 'medium', 'high'].includes(priority)) {
    throw new ApiError(400, 'Priority must be low, medium, or high', { priority: 'Priority must be low, medium, or high' });
  }

  if (!['open', 'in-progress', 'completed'].includes(status)) {
    throw new ApiError(400, 'Status must be open, in-progress, or completed', { status: 'Status must be open, in-progress, or completed' });
  }

  if (description !== undefined && typeof description !== 'string') {
    throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
  }

  if (assignedTo !== undefined && typeof assignedTo !== 'string') {
    throw new ApiError(400, 'Assigned to must be a string', { assignedTo: 'Assigned to must be a string' });
  }

  const maintenance = await Maintenance.create({
    title: title.trim(),
    unit: unitId,
    description: description !== undefined ? description.trim() : '',
    priority,
    assignedTo: assignedTo !== undefined ? assignedTo.trim() : '',
    status,
  });

  await maintenance.populate(maintenancePopulation);
  return sendSuccess(res, maintenance, 'Maintenance request created successfully', null, 201);
});

const updateMaintenanceRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const maintenance = await Maintenance.findById(id);
  if (!maintenance) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const { buildingIds, unitId } = req.scope;
  const existingUnit = await Unit.findById(maintenance.unit).select('building').lean();
  if (req.user.role === 'resident') {
    if (!unitId || !existingUnit || existingUnit._id.toString() !== unitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    if (existingUnit && !isBuildingAllowed(buildingIds, existingUnit.building)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  const { title, unit: unitIdBody, description, priority, assignedTo, status } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      throw new ApiError(400, 'Maintenance title cannot be empty', { title: 'Maintenance title cannot be empty' });
    }
    maintenance.title = title.trim();
  }

  if (unitIdBody !== undefined) {
    const unit = await validateUnit(unitIdBody);
    if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your scope');
    }
    if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your unit');
    }
    maintenance.unit = unitIdBody;
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
    }
    maintenance.description = description.trim();
  }

  if (priority !== undefined) {
    if (!['low', 'medium', 'high'].includes(priority)) {
      throw new ApiError(400, 'Priority must be low, medium, or high', { priority: 'Priority must be low, medium, or high' });
    }
    maintenance.priority = priority;
  }

  if (assignedTo !== undefined) {
    if (typeof assignedTo !== 'string') {
      throw new ApiError(400, 'Assigned to must be a string', { assignedTo: 'Assigned to must be a string' });
    }
    maintenance.assignedTo = assignedTo.trim();
  }

  if (status !== undefined) {
    if (!['open', 'in-progress', 'completed'].includes(status)) {
      throw new ApiError(400, 'Status must be open, in-progress, or completed', { status: 'Status must be open, in-progress, or completed' });
    }
    maintenance.status = status;
  }

  const updatedMaintenance = await maintenance.save();
  await updatedMaintenance.populate(maintenancePopulation);
  return sendSuccess(res, updatedMaintenance, 'Maintenance request updated successfully');
});

const deleteMaintenanceRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const maintenance = await Maintenance.findById(id);
  if (!maintenance) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  const { buildingIds } = req.scope;
  if (buildingIds !== null) {
    const existingUnit = await Unit.findById(maintenance.unit).select('building').lean();
    if (existingUnit && !isBuildingAllowed(buildingIds, existingUnit.building)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  await Maintenance.findByIdAndDelete(id);

  return sendSuccess(res, null, 'Maintenance request deleted successfully');
});

module.exports = {
  getMaintenanceRequests,
  getMaintenanceRequestById,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
};
