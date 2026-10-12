const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const isProduction = () => process.env.NODE_ENV === 'production';

const MAX_METHOD_LENGTH = 10;
const MAX_PATH_LENGTH = 200;
const MAX_NAME_LENGTH = 80;
const MAX_CODE_LENGTH = 40;

/**
 * Neutralizes an arbitrary value for structured logging.
 *
 * Only strings are accepted. Control characters (which could otherwise forge
 * additional log records) and Unicode line separators are replaced, whitespace
 * runs are collapsed to single spaces, and the result is length-bounded. The
 * return value is either a safe bounded string or undefined.
 */
function sanitizeField(value, maxLength) {
  if (typeof value !== 'string') return undefined;

  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength);
}

function safeErrorName(err) {
  return sanitizeField(err?.name, MAX_NAME_LENGTH) || 'Error';
}

/**
 * Returns a safe, bounded error code only for validated string/number codes.
 * Arbitrary objects, arrays, booleans, etc. are refused.
 */
function safeErrorCode(code) {
  if (typeof code === 'number' && Number.isFinite(code)) {
    return String(code).slice(0, MAX_CODE_LENGTH);
  }
  return sanitizeField(code, MAX_CODE_LENGTH);
}

/**
 * Records an error server-side.
 *
 * Development keeps the existing behavior: unexpected (non-ApiError) errors are
 * printed in full, while expected ApiError responses are not logged.
 *
 * Production records 5xx errors as a single structured JSON line built from an
 * explicit allowlist of bounded, sanitized fields. Raw err.message, err.stack,
 * request bodies, headers, cookies, query values, and response payloads are
 * never logged, so credentials, JWTs, database connection details, and personal
 * data cannot leak through the error log.
 */
function logError(err, req, statusCode, requestId) {
  if (!isProduction()) {
    if (!(err instanceof ApiError)) {
      console.error(err);
    }
    return;
  }

  if (statusCode < 500) return;

  const record = {
    timestamp: new Date().toISOString(),
    level: 'error',
    requestId,
    method: sanitizeField(req?.method, MAX_METHOD_LENGTH) || 'UNKNOWN',
    path: sanitizeField(req?.path, MAX_PATH_LENGTH) || 'unknown',
    status: statusCode,
    error: safeErrorName(err),
  };

  const code = safeErrorCode(err?.code);
  if (code !== undefined) {
    record.code = code;
  }

  // Every field above is already allowlisted, validated, bounded, and free of
  // control characters, so this serialization is guaranteed to be one record.
  console.error(JSON.stringify(record));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err instanceof ApiError
    ? err.statusCode
    : err.statusCode || err.status || 500;

  const requestId = crypto.randomUUID();
  if (req && typeof req === 'object') {
    req.requestId = requestId;
  }

  // Only 5xx responses carry the correlation header; 4xx responses are left
  // byte-for-byte unchanged.
  if (statusCode >= 500 && typeof res.setHeader === 'function' && !res.headersSent) {
    res.setHeader('X-Request-Id', requestId);
  }

  logError(err, req, statusCode, requestId);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors !== undefined ? { errors: err.errors } : {}),
    });
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Internal server error' : err.message || 'Something went wrong',
  });
}

module.exports = errorHandler;
