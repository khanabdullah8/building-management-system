const mongoose = require('mongoose');
const Notice = require('../models/Notice');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const noticePopulation = {
  path: 'building',
  select: 'name code',
};

const validateBuilding = async (buildingId) => {
  if (!mongoose.Types.ObjectId.isValid(buildingId)) {
    throw new ApiError(400, 'Invalid building ID format', { building: 'Invalid building ID format' });
  }

  const building = await Building.findById(buildingId);
  if (!building) {
    throw new ApiError(400, 'Referenced building does not exist', { building: 'Referenced building does not exist' });
  }
};

const getNotices = asyncHandler(async (req, res) => {
  const { search, building } = req.query;
  const filter = {};

  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
    ];
  }

  if (building) {
    if (!mongoose.Types.ObjectId.isValid(building)) {
      return sendSuccess(res, []);
    }
    filter.building = building;
  }

  const notices = await Notice.find(filter)
    .populate(noticePopulation)
    .sort({ publishedAt: -1 });

  return sendSuccess(res, notices);
});

const getNoticeById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Notice not found');
  }

  const notice = await Notice.findById(id).populate(noticePopulation);
  if (!notice) {
    throw new ApiError(404, 'Notice not found');
  }

  return sendSuccess(res, notice);
});

const createNotice = asyncHandler(async (req, res) => {
  const { title, category, description, building: buildingId, expiresAt } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new ApiError(400, 'Notice title is required', { title: 'Notice title is required' });
  }

  if (!['notice', 'announcement', 'event'].includes(category)) {
    throw new ApiError(400, 'Category must be notice, announcement, or event', {
      category: 'Category must be notice, announcement, or event',
    });
  }

  if (description !== undefined && typeof description !== 'string') {
    throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
  }

  if (buildingId !== undefined && buildingId !== null) {
    await validateBuilding(buildingId);
  }

  if (expiresAt !== undefined && expiresAt !== null) {
    const expiryDate = new Date(expiresAt);
    if (isNaN(expiryDate.getTime())) {
      throw new ApiError(400, 'Invalid expiry date', { expiresAt: 'Invalid expiry date' });
    }
  }

  const noticeData = {
    title: title.trim(),
    category,
    description: description !== undefined ? description.trim() : '',
    building: buildingId !== undefined ? buildingId : null,
    expiresAt: expiresAt !== undefined ? expiresAt : null,
  };

  const notice = await Notice.create(noticeData);
  await notice.populate(noticePopulation);
  return sendSuccess(res, notice, 'Notice created successfully', null, 201);
});

const updateNotice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Notice not found');
  }

  const notice = await Notice.findById(id);
  if (!notice) {
    throw new ApiError(404, 'Notice not found');
  }

  const { title, category, description, building: buildingId, expiresAt } = req.body;

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      throw new ApiError(400, 'Notice title cannot be empty', { title: 'Notice title cannot be empty' });
    }
    notice.title = title.trim();
  }

  if (category !== undefined) {
    if (!['notice', 'announcement', 'event'].includes(category)) {
      throw new ApiError(400, 'Category must be notice, announcement, or event', {
        category: 'Category must be notice, announcement, or event',
      });
    }
    notice.category = category;
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new ApiError(400, 'Description must be a string', { description: 'Description must be a string' });
    }
    notice.description = description.trim();
  }

  if (buildingId !== undefined) {
    if (buildingId === null) {
      notice.building = null;
    } else {
      await validateBuilding(buildingId);
      notice.building = buildingId;
    }
  }

  if (expiresAt !== undefined) {
    if (expiresAt === null) {
      notice.expiresAt = null;
    } else {
      const expiryDate = new Date(expiresAt);
      if (isNaN(expiryDate.getTime())) {
        throw new ApiError(400, 'Invalid expiry date', { expiresAt: 'Invalid expiry date' });
      }
      notice.expiresAt = expiryDate;
    }
  }

  const updatedNotice = await notice.save();
  await updatedNotice.populate(noticePopulation);
  return sendSuccess(res, updatedNotice, 'Notice updated successfully');
});

const deleteNotice = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'Notice not found');
  }

  const notice = await Notice.findByIdAndDelete(id);
  if (!notice) {
    throw new ApiError(404, 'Notice not found');
  }

  return sendSuccess(res, null, 'Notice deleted successfully');
});

module.exports = {
  getNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
};
