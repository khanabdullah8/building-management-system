const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  sendSuccess(res, users);
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  sendSuccess(res, user);
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, status, resident } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email, and password are required');
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(400, 'A user with this email already exists');
  }

  const user = await User.create({ name, email, password, role, status, resident });
  sendSuccess(res, user, 'User created successfully', null, 201);
});

const updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, status } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (email && email.toLowerCase() !== user.email) {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new ApiError(400, 'A user with this email already exists');
    }
  }

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (role !== undefined) user.role = role;
  if (status !== undefined) user.status = status;

  await user.save();
  sendSuccess(res, user, 'User updated successfully');
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.user.id === req.params.id) {
    throw new ApiError(400, 'Cannot delete your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await User.findByIdAndDelete(req.params.id);
  sendSuccess(res, null, 'User deleted successfully');
});

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
