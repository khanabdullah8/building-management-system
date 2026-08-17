const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const Unit = require('../models/Unit');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

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
};

const getComplaints = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    filter.$or = [
      { subject: searchRegex },
    ];
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

  return sendSuccess(res, complaint);
});

const createComplaint = asyncHandler(async (req, res) => {
  const { subject, unit: unitId, location, description, priority, status } = req.body;

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

  if (hasUnit) {
    await validateUnit(unitId);
  } else if (!hasLocation) {
    throw new ApiError(400, 'At least one of unit or location is required', {
      unit: 'Either a unit or a location is required',
      location: 'Either a unit or a location is required',
    });
  }

  const complaint = await Complaint.create({
    subject: subject.trim(),
    unit: hasUnit ? unitId : null,
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

  const { subject, unit: unitId, location, description, priority, status } = req.body;

  if (subject !== undefined) {
    if (typeof subject !== 'string' || !subject.trim()) {
      throw new ApiError(400, 'Complaint subject cannot be empty', { subject: 'Complaint subject cannot be empty' });
    }
    complaint.subject = subject.trim();
  }

  if (unitId !== undefined) {
    if (unitId === null) {
      complaint.unit = null;
    } else {
      await validateUnit(unitId);
      complaint.unit = unitId;
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

  const complaint = await Complaint.findByIdAndDelete(id);
  if (!complaint) {
    throw new ApiError(404, 'Complaint not found');
  }

  return sendSuccess(res, null, 'Complaint deleted successfully');
});

module.exports = {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  deleteComplaint,
};
