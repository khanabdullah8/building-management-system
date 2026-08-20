const { resolveBuildingScope } = require('../utils/scope');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Middleware that resolves the authenticated user's building scope
 * and attaches it to req.scope:
 *   req.scope.buildingIds  — null (admin) | string[] (staff/resident)
 *   req.scope.unitId       — string | null (resident's own unit only)
 *
 * Must be applied after the `protect` middleware.
 */
const loadBuildingScope = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next();
  }
  req.scope = await resolveBuildingScope(req.user);
  next();
});

module.exports = { loadBuildingScope };
