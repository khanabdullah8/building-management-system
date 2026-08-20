const mongoose = require('mongoose');
const Visitor = require('../models/Visitor');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed, unitScopeFilter } = require('../utils/scope');

const visitorPopulation = {
  path: 'unit',
  select: 'unitNumber building',
  populate: {
    path: 'building',
    select: 'name code',
  },
};

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

const getVisitors = asyncHandler(async (req, res) => {
  const { search, unit } = req.query;
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
      { name: searchRegex },
      { phone: searchRegex },
      { purpose: searchRegex },
    ];
  }

  if (unit) {
    if (!mongoose.Types.ObjectId.isValid(unit)) {
      return sendSuccess(res, []);
    }
    if (filter.unit) {
      filter.unit = { $all: [filter.unit, new mongoose.Types.ObjectId(unit)] };
    } else {
      filter.unit = unit;
    }
  }

  const visitors = await Visitor.find(filter)
    .populate(visitorPopulation)
    .sort({ checkInAt: -1 });

  return sendSuccess(res, visitors);
});

const getVisitorById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Visitor not found');
  }

  const visitor = await Visitor.findById(id).populate(visitorPopulation);
  if (!visitor) {
    throw new ApiError(404, 'Visitor not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId && visitor.unit && visitor.unit._id.toString() === unitId) {
      return sendSuccess(res, visitor);
    }
    throw new ApiError(403, 'Forbidden: insufficient permissions');
  } else if (buildingIds !== null) {
    if (visitor.unit && visitor.unit.building) {
      const buildingRef = visitor.unit.building._id || visitor.unit.building;
      if (!isBuildingAllowed(buildingIds, buildingRef.toString())) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  return sendSuccess(res, visitor);
});

const createVisitor = asyncHandler(async (req, res) => {
  const { name, phone, unit: unitId, purpose, checkInAt } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'Visitor name is required', { name: 'Visitor name is required' });
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

  if (purpose !== undefined && typeof purpose !== 'string') {
    throw new ApiError(400, 'Purpose must be a string', { purpose: 'Purpose must be a string' });
  }

  if (checkInAt !== undefined && checkInAt !== null) {
    const date = new Date(checkInAt);
    if (isNaN(date.getTime())) {
      throw new ApiError(400, 'Invalid check-in date', { checkInAt: 'Invalid check-in date' });
    }
  }

  const visitorData = {
    name: name.trim(),
    unit: unitId,
    phone: phone !== undefined ? phone.trim() : '',
    purpose: purpose !== undefined ? purpose.trim() : '',
    checkInAt: checkInAt || new Date(),
    checkOutAt: null,
  };

  const visitor = await Visitor.create(visitorData);
  await visitor.populate(visitorPopulation);
  return sendSuccess(res, visitor, 'Visitor registered successfully', null, 201);
});

const updateVisitor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Visitor not found');
  }

  const visitor = await Visitor.findById(id);
  if (!visitor) {
    throw new ApiError(404, 'Visitor not found');
  }

  const { buildingIds, unitId } = req.scope;
  const existingUnit = await Unit.findById(visitor.unit).select('building').lean();
  if (req.user.role === 'resident') {
    if (!unitId || !existingUnit || existingUnit._id.toString() !== unitId) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    if (existingUnit && !isBuildingAllowed(buildingIds, existingUnit.building)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  const { name, phone, unit: unitIdBody, purpose, checkInAt, checkOutAt } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Visitor name cannot be empty', { name: 'Visitor name cannot be empty' });
    }
    visitor.name = name.trim();
  }

  if (unitIdBody !== undefined) {
    const unit = await validateUnit(unitIdBody);
    if (!isBuildingAllowed(req.scope.buildingIds, unit.building)) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your scope');
    }
    if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot assign to unit outside your unit');
    }
    visitor.unit = unitIdBody;
  }

  if (phone !== undefined) {
    if (typeof phone !== 'string') {
      throw new ApiError(400, 'Phone must be a string', { phone: 'Phone must be a string' });
    }
    visitor.phone = phone.trim();
  }

  if (purpose !== undefined) {
    if (typeof purpose !== 'string') {
      throw new ApiError(400, 'Purpose must be a string', { purpose: 'Purpose must be a string' });
    }
    visitor.purpose = purpose.trim();
  }

  if (checkInAt !== undefined) {
    if (checkInAt === null) {
      visitor.checkInAt = null;
    } else {
      const date = new Date(checkInAt);
      if (isNaN(date.getTime())) {
        throw new ApiError(400, 'Invalid check-in date', { checkInAt: 'Invalid check-in date' });
      }
      visitor.checkInAt = date;
    }
  }

  if (checkOutAt !== undefined) {
    if (checkOutAt === null) {
      visitor.checkOutAt = null;
    } else {
      const date = new Date(checkOutAt);
      if (isNaN(date.getTime())) {
        throw new ApiError(400, 'Invalid check-out date', { checkOutAt: 'Invalid check-out date' });
      }
      visitor.checkOutAt = date;
    }
  }

  const updatedVisitor = await visitor.save();
  await updatedVisitor.populate(visitorPopulation);
  return sendSuccess(res, updatedVisitor, 'Visitor updated successfully');
});

const deleteVisitor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Visitor not found');
  }

  const visitor = await Visitor.findById(id);
  if (!visitor) {
    throw new ApiError(404, 'Visitor not found');
  }

  const { buildingIds } = req.scope;
  if (buildingIds !== null) {
    const existingUnit = await Unit.findById(visitor.unit).select('building').lean();
    if (existingUnit && !isBuildingAllowed(buildingIds, existingUnit.building)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  await Visitor.findByIdAndDelete(id);
  return sendSuccess(res, null, 'Visitor deleted successfully');
});

module.exports = {
  getVisitors,
  getVisitorById,
  createVisitor,
  updateVisitor,
  deleteVisitor,
};
