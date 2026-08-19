const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { JWT_SECRET } = require('../config/env');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Not authorized, invalid token');
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new ApiError(401, 'Not authorized, user not found');
  }

  if (user.status !== 'active') {
    throw new ApiError(401, 'Not authorized, user inactive');
  }

  req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  next();
});

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, 'Forbidden: insufficient permissions');
    }
    next();
  };
}

module.exports = { protect, authorize };
