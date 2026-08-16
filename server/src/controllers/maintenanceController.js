const mongoose = require('mongoose');
const Maintenance = require('../models/Maintenance');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

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
  const filter = {};

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
};

const createMaintenanceRequest = asyncHandler(async (req, res) => {
  const { title, unit: unitId, description, priority, assignedTo, status } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ApiError(400, 'Maintenance title is required', { title: 'Maintenance title is required' });
  }

  if (!unitId) {
    throw new ApiError(400, 'Unit ID is required', { unit: 'Unit ID is required' });
  }

  await validateUnit(unitId);

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

  const { title, unit: unitId, description, priority, assignedTo, status } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      throw new ApiError(400, 'Maintenance title cannot be empty', { title: 'Maintenance title cannot be empty' });
    }
    maintenance.title = title.trim();
  }

  if (unitId !== undefined) {
    await validateUnit(unitId);
    maintenance.unit = unitId;
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

  const maintenance = await Maintenance.findByIdAndDelete(id);
  if (!maintenance) {
    throw new ApiError(404, 'Maintenance request not found');
  }

  return sendSuccess(res, null, 'Maintenance request deleted successfully');
});

module.exports = {
  getMaintenanceRequests,
  getMaintenanceRequestById,
  createMaintenanceRequest,
  updateMaintenanceRequest,
  deleteMaintenanceRequest,
};
