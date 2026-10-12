const rateLimit = require('express-rate-limit');

// NOTE: express-rate-limit uses its default in-memory store. This is correct
// for a single-instance deployment, but counters are per-process and reset on
// restart. Before scaling the backend to multiple instances (or behind a load
// balancer), configure a shared store (e.g. Redis) so limits apply globally.

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
