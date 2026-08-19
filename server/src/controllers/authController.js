const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { JWT_SECRET } = require('../config/env');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const userData = user.toJSON();

  sendSuccess(res, { token, user: userData }, 'Login successful', null, 200);
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  sendSuccess(res, { user: user.toJSON() }, null, null, 200);
});

const logout = asyncHandler(async (req, res) => {
  sendSuccess(res, null, 'Logged out successfully', null, 200);
});

module.exports = { login, getMe, logout };
