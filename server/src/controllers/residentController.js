const mongoose = require('mongoose');
const Resident = require('../models/Resident');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const residentPopulation = {
  path: 'unit',
  select: 'unitNumber building',
  populate: {
    path: 'building',
    select: 'name code',
  },
};

const getResidents = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    filter.$or = [
      { name: searchRegex },
      { phone: searchRegex },
    ];
  }

  const residents = await Resident.find(filter)
    .populate(residentPopulation)
    .sort({ createdAt: -1 });

  return sendSuccess(res, residents);
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

  return sendSuccess(res, resident);
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

const createResident = asyncHandler(async (req, res) => {
  const { name, unit: unitId, phone, type, status } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'Resident name is required', { name: 'Resident name is required' });
  }

  if (!unitId) {
    throw new ApiError(400, 'Unit ID is required', { unit: 'Unit ID is required' });
  }

  await validateUnit(unitId);

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

  const { name, unit: unitId, phone, type, status } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Resident name cannot be empty', { name: 'Resident name cannot be empty' });
    }
    resident.name = name.trim();
  }

  if (unitId !== undefined) {
    await validateUnit(unitId);
    resident.unit = unitId;
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
  await updatedResident.populate(residentPopulation);
  return sendSuccess(res, updatedResident, 'Resident updated successfully');
});

const deleteResident = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Resident not found');
  }

  const resident = await Resident.findByIdAndDelete(id);
  if (!resident) {
    throw new ApiError(404, 'Resident not found');
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
