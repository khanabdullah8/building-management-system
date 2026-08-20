const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Unit = require('../models/Unit');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { isBuildingAllowed, unitScopeFilter } = require('../utils/scope');

const complaintPopulation = {
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

const getComplaints = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};
  const { buildingIds, unitId } = req.scope;

  let scopeCondition = null;

  if (req.user.role === 'resident') {
    if (unitId) {
      scopeCondition = {
        $or: [
          { unit: new mongoose.Types.ObjectId(unitId) },
          { unit: null, building: new mongoose.Types.ObjectId(buildingIds[0]) },
        ],
      };
    } else {
      filter._id = { $in: [] };
    }
  } else if (buildingIds !== null) {
    const unitFilter = await unitScopeFilter(buildingIds);
    if (unitFilter.unit && unitFilter.unit.$in && unitFilter.unit.$in.length === 0) {
      filter._id = { $in: [] };
    } else {
      const unitIds = unitFilter.unit?.$in || [];
      scopeCondition = {
        $or: [
          { unit: { $in: unitIds } },
          { building: { $in: buildingIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        ],
      };
    }
  }

  let searchCondition = null;
  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    searchCondition = {
      $or: [
        { subject: searchRegex },
      ],
    };
  }

  if (scopeCondition && searchCondition) {
    filter.$and = [scopeCondition, searchCondition];
  } else if (scopeCondition) {
    Object.assign(filter, scopeCondition);
  } else if (searchCondition) {
    Object.assign(filter, searchCondition);
  }

  const complaints = await Complaint.find(filter)
    .populate(complaintPopulation)
    .sort({ createdAt: -1 });

  return sendSuccess(res, complaints);
});

const getComplaintById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Complaint not found');
  }

  const complaint = await Complaint.findById(id).populate(complaintPopulation);
  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId) {
      const complaintUnitId = complaint.unit ? complaint.unit._id.toString() : null;
      const complaintBuildingId = complaint.building ? complaint.building.toString() : null;
      if (complaintUnitId !== unitId && complaintBuildingId !== buildingIds[0]) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    } else {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    if (complaint.unit) {
      const complaintBuildingId = complaint.unit.building
        ? complaint.unit.building._id.toString()
        : null;
      if (complaintBuildingId && !isBuildingAllowed(buildingIds, complaintBuildingId)) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    } else if (complaint.building) {
      if (!isBuildingAllowed(buildingIds, complaint.building.toString())) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    }
  }

  return sendSuccess(res, complaint);
});

const createComplaint = asyncHandler(async (req, res) => {
  const { subject, unit: unitId, location, description, priority, status, building: buildingIdFromBody } = req.body;

  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    throw new ApiError(400, 'Complaint subject is required', { subject: 'Complaint subject is required' });
  }

  if (!['low', 'medium', 'high'].includes(priority)) {
    throw new ApiError(400, 'Priority must be low, medium, or high', { priority: 'Priority must be low, medium, or high' });
  }

  if (!['open', 'in-progress', 'resolved'].includes(status)) {
    throw new ApiError(400, 'Status must be open, in-progress, or resolved', { status: 'Status must be open, in-progress, or resolved' });
  }

  if (description !== undefined && typeof description !== 'string') {
    throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
  }

  if (location !== undefined && typeof location !== 'string') {
    throw new ApiError(400, 'Location must be a string', { location: 'Location must be a string' });
  }

  const hasUnit = unitId !== undefined && unitId !== null;
  const hasLocation = typeof location === 'string' && location.trim();

  let resolvedBuildingId = null;

  if (hasUnit) {
    const unit = await validateUnit(unitId);
    resolvedBuildingId = unit.building;

    const { buildingIds } = req.scope;
    if (buildingIds !== null && !isBuildingAllowed(buildingIds, resolvedBuildingId)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }

    if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
      throw new ApiError(403, 'Forbidden: cannot access resources outside your unit');
    }
  } else if (!hasLocation) {
    throw new ApiError(400, 'At least one of unit or location is required', {
      unit: 'Either a unit or a location is required',
      location: 'Either a unit or a location is required',
    });
  }

  if (!hasUnit) {
    if (!buildingIdFromBody) {
      throw new ApiError(400, 'Building ID is required for common-area complaints', {
        building: 'Building ID is required for common-area complaints',
      });
    }
    const buildingDoc = await validateBuilding(buildingIdFromBody);
    resolvedBuildingId = buildingDoc._id;

    const { buildingIds } = req.scope;
    if (buildingIds !== null && !isBuildingAllowed(buildingIds, resolvedBuildingId)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  const complaint = await Complaint.create({
    subject: subject.trim(),
    unit: hasUnit ? unitId : null,
    building: resolvedBuildingId,
    location: hasUnit ? '' : location.trim(),
    description: description !== undefined ? description.trim() : '',
    priority,
    status,
  });

  await complaint.populate(complaintPopulation);
  return sendSuccess(res, complaint, 'Complaint created successfully', null, 201);
});

const updateComplaint = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Complaint not found');
  }

  const complaint = await Complaint.findById(id);
  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId) {
      const complaintUnitId = complaint.unit ? complaint.unit.toString() : null;
      const complaintBuildingId = complaint.building ? complaint.building.toString() : null;
      if (complaintUnitId !== unitId && complaintBuildingId !== buildingIds[0]) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    } else {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    let resourceBuildingId = null;
    if (complaint.unit) {
      const unitDoc = await Unit.findById(complaint.unit).select('building').lean();
      resourceBuildingId = unitDoc?.building?.toString();
    } else if (complaint.building) {
      resourceBuildingId = complaint.building.toString();
    }
    if (resourceBuildingId && !isBuildingAllowed(buildingIds, resourceBuildingId)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  const { subject, unit: unitIdBody, location, description, priority, status, building: buildingIdBody } = req.body;

  if (subject !== undefined) {
    if (typeof subject !== 'string' || !subject.trim()) {
      throw new ApiError(400, 'Complaint subject cannot be empty', { subject: 'Complaint subject cannot be empty' });
    }
    complaint.subject = subject.trim();
  }

  if (unitIdBody !== undefined) {
    if (unitIdBody === null) {
      complaint.unit = null;
    } else {
      const unit = await validateUnit(unitIdBody);
      if (buildingIds !== null && !isBuildingAllowed(buildingIds, unit.building)) {
        throw new ApiError(403, 'Forbidden: cannot assign to building outside your scope');
      }
      if (req.user.role === 'resident' && req.scope.unitId && unit._id.toString() !== req.scope.unitId) {
        throw new ApiError(403, 'Forbidden: cannot assign to unit outside your unit');
      }
      complaint.unit = unitIdBody;
      complaint.building = unit.building;
    }
  }

  if (buildingIdBody !== undefined && complaint.unit === null) {
    if (buildingIdBody === null) {
      complaint.building = null;
    } else {
      const buildingDoc = await validateBuilding(buildingIdBody);
      if (buildingIds !== null && !isBuildingAllowed(buildingIds, buildingDoc._id)) {
        throw new ApiError(403, 'Forbidden: cannot assign to building outside your scope');
      }
      complaint.building = buildingDoc._id;
    }
  }

  if (location !== undefined) {
    if (typeof location !== 'string') {
      throw new ApiError(400, 'Location must be a string', { location: 'Location must be a string' });
    }
    complaint.location = location.trim();
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
    }
    complaint.description = description.trim();
  }

  if (priority !== undefined) {
    if (!['low', 'medium', 'high'].includes(priority)) {
      throw new ApiError(400, 'Priority must be low, medium, or high', { priority: 'Priority must be low, medium, or high' });
    }
    complaint.priority = priority;
  }

  if (status !== undefined) {
    if (!['open', 'in-progress', 'resolved'].includes(status)) {
      throw new ApiError(400, 'Status must be open, in-progress, or resolved', { status: 'Status must be open, in-progress, or resolved' });
    }
    complaint.status = status;
  }

  if (complaint.unit === null && (!complaint.location || !complaint.location.trim())) {
    throw new ApiError(400, 'At least one of unit or location is required', {
      unit: 'Either a unit or a location is required',
      location: 'Either a unit or a location is required',
    });
  }

  const updatedComplaint = await complaint.save();
  await updatedComplaint.populate(complaintPopulation);
  return sendSuccess(res, updatedComplaint, 'Complaint updated successfully');
});

const deleteComplaint = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Complaint not found');
  }

  const complaint = await Complaint.findById(id);
  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  const { buildingIds, unitId } = req.scope;
  if (req.user.role === 'resident') {
    if (unitId) {
      const complaintUnitId = complaint.unit ? complaint.unit.toString() : null;
      const complaintBuildingId = complaint.building ? complaint.building.toString() : null;
      if (complaintUnitId !== unitId && complaintBuildingId !== buildingIds[0]) {
        throw new ApiError(403, 'Forbidden: insufficient permissions');
      }
    } else {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  } else if (buildingIds !== null) {
    let resourceBuildingId = null;
    if (complaint.unit) {
      const unitDoc = await Unit.findById(complaint.unit).select('building').lean();
      resourceBuildingId = unitDoc?.building?.toString();
    } else if (complaint.building) {
      resourceBuildingId = complaint.building.toString();
    }
    if (resourceBuildingId && !isBuildingAllowed(buildingIds, resourceBuildingId)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
  }

  await Complaint.findByIdAndDelete(id);
  return sendSuccess(res, null, 'Complaint deleted successfully');
});

module.exports = {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  deleteComplaint,
};
