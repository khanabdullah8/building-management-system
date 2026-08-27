const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { getPagination, paginationMeta } = require('../utils/pagination');

const VALID_ACTIONS = ['created', 'updated', 'deleted'];
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

// GET /api/v1/audit-logs — admin-only, read-only.
// Filters: module, action; page/limit (default 200, max 500). Newest first.
const getAuditLogs = asyncHandler(async (req, res) => {
  const query = {};

  if (req.query.module !== undefined && req.query.module !== '') {
    query.module = req.query.module;
  }

  if (req.query.action !== undefined && req.query.action !== '') {
    if (!VALID_ACTIONS.includes(req.query.action)) {
      throw new ApiError(400, 'Invalid action filter. Must be created, updated, or deleted', {
        action: 'Invalid action filter',
      });
    }
    query.action = req.query.action;
  }

  const { page, limit, skip } = getPagination(req.query, {
    defaultLimit: DEFAULT_LIMIT,
    maxLimit: MAX_LIMIT,
  });

  const total = await AuditLog.countDocuments(query);
  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip);

  sendSuccess(res, logs, 'Audit logs fetched successfully', paginationMeta(page, limit, total));
});

module.exports = { getAuditLogs };
