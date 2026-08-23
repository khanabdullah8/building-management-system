const mongoose = require('mongoose');
const User = require('../models/User');
const Building = require('../models/Building');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const VALID_ROLES = ['admin', 'staff', 'resident'];
const VALID_STATUSES = ['active', 'inactive'];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates a client-supplied building assignment list:
 * - must be an array
 * - every entry must be a valid ObjectId string (400 otherwise)
 * - every referenced Building must exist (400 otherwise)
 * - duplicates are removed deterministically (first occurrence wins)
 *
 * Returns the deduplicated array of building ID strings.
 */
async function validateBuildingAssignments(rawBuildings) {
  if (!Array.isArray(rawBuildings)) {
    throw new ApiError(400, 'Buildings must be an array of building IDs', {
      buildings: 'Buildings must be an array of building IDs',
    });
  }

  const seen = new Set();
  const uniqueIds = [];
  for (const entry of rawBuildings) {
    if (typeof entry !== 'string' || !mongoose.Types.ObjectId.isValid(entry.trim())) {
      throw new ApiError(400, 'One or more building IDs are invalid', {
        buildings: 'One or more building IDs are invalid',
      });
    }
    const id = entry.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }

  if (uniqueIds.length > 0) {
    const existingCount = await Building.countDocuments({ _id: { $in: uniqueIds } });
    if (existingCount !== uniqueIds.length) {
      throw new ApiError(400, 'One or more selected buildings do not exist', {
        buildings: 'One or more selected buildings do not exist',
      });
    }
  }

  return uniqueIds;
}

async function populateUserBuildings(user) {
  await user.populate({ path: 'buildings', select: 'code name' });
  return user;
}

const getUsers = asyncHandler(async (req, res) => {
  const { search, role, status } = req.query;
  const filter = {};

  if (search && search.trim()) {
    const searchRegex = new RegExp(escapeRegExp(search.trim()), 'i');
    filter.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  if (role) {
    filter.role = role;
  }

  if (status) {
    filter.status = status;
  }

  const users = await User.find(filter)
    .populate('buildings', 'code name')
    .sort({ createdAt: -1 });

  sendSuccess(res, users);
});

const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'User not found');
  }

  const user = await User.findById(id).populate('buildings', 'code name');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  sendSuccess(res, user);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, status, buildings } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new ApiError(400, 'Name is required', { name: 'Name is required' });
  }

  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new ApiError(400, 'Email is required', { email: 'Email is required' });
  }

  if (!password) {
    throw new ApiError(400, 'Password is required', { password: 'Password is required' });
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters', {
      password: 'Password must be at least 8 characters',
    });
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new ApiError(400, 'Role must be admin, staff, or resident', {
      role: 'Role must be admin, staff, or resident',
    });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ApiError(400, 'Status must be active or inactive', {
      status: 'Status must be active or inactive',
    });
  }

  const effectiveRole = role !== undefined ? role : 'resident';

  let validatedBuildings;
  if (buildings !== undefined) {
    if (effectiveRole !== 'staff') {
      throw new ApiError(400, 'Building assignments can only be applied to staff users', {
        buildings: 'Building assignments can only be applied to staff users',
      });
    }
    validatedBuildings = await validateBuildingAssignments(buildings);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ApiError(400, 'A user with this email already exists');
  }

  const userData = {
    name: name.trim(),
    email: normalizedEmail,
    password,
  };
  if (role !== undefined) userData.role = role;
  if (status !== undefined) userData.status = status;
  if (validatedBuildings !== undefined) userData.buildings = validatedBuildings;

  const user = await User.create(userData);
  await populateUserBuildings(user);
  sendSuccess(res, user, 'User created successfully', null, 201);
});

const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'User not found');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Explicit field allowlist — never spread req.body.
  const { name, email, role, status, buildings } = req.body;

  // Self-protection: an admin cannot change their own role or deactivate themselves.
  if (
    req.user.id === id &&
    ((role !== undefined && role !== user.role) || status === 'inactive')
  ) {
    throw new ApiError(400, 'You cannot change your own role or deactivate your own account');
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new ApiError(400, 'Name cannot be empty', { name: 'Name cannot be empty' });
    }
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !email.trim()) {
      throw new ApiError(400, 'Email cannot be empty', { email: 'Email cannot be empty' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        throw new ApiError(400, 'A user with this email already exists');
      }
    }
  }

  if (role !== undefined && !VALID_ROLES.includes(role)) {
    throw new ApiError(400, 'Role must be admin, staff, or resident', {
      role: 'Role must be admin, staff, or resident',
    });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    throw new ApiError(400, 'Status must be active or inactive', {
      status: 'Status must be active or inactive',
    });
  }

  const effectiveRole = role !== undefined ? role : user.role;

  let validatedBuildings;
  if (buildings !== undefined) {
    if (effectiveRole !== 'staff') {
      throw new ApiError(400, 'Building assignments can only be applied to staff users', {
        buildings: 'Building assignments can only be applied to staff users',
      });
    }
    validatedBuildings = await validateBuildingAssignments(buildings);
  } else if (role !== undefined && effectiveRole !== 'staff') {
    // Demotion: clear stale building assignments so no scope data lingers.
    validatedBuildings = [];
  }

  if (name !== undefined) user.name = name.trim();
  if (email !== undefined) user.email = email.toLowerCase().trim();
  if (role !== undefined) user.role = role;
  if (status !== undefined) user.status = status;
  if (validatedBuildings !== undefined) user.buildings = validatedBuildings;

  await user.save();
  await populateUserBuildings(user);

  sendSuccess(res, user, 'User updated successfully');
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, 'User not found');
  }

  if (req.user.id === id) {
    throw new ApiError(400, 'Cannot delete your own account');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await User.findByIdAndDelete(id);
  sendSuccess(res, null, 'User deleted successfully');
});

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
