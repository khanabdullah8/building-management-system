const rateLimit = require('express-rate-limit');

function createRateLimiter(overrides = {}) {
  const windowMs = Number(overrides.windowMs) || Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
  const max = Number(overrides.max) || Number(process.env.RATE_LIMIT_MAX) || 100;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
    },
  });
}

function createLoginLimiter(overrides = {}) {
  const windowMs = Number(overrides.windowMs) || Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
  const max = Number(overrides.max) || Number(process.env.LOGIN_RATE_LIMIT_MAX) || 7;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many login attempts, please try again later.',
    },
  });
}

module.exports = { createRateLimiter, createLoginLimiter };
