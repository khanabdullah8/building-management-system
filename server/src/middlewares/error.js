const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors !== undefined ? { errors: err.errors } : {}),
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Internal server error' : err.message || 'Something went wrong',
  });
}

module.exports = errorHandler;
