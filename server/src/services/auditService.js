const AuditLog = require('../models/AuditLog');
const Building = require('../models/Building');

const VALID_ACTIONS = ['created', 'updated', 'deleted'];

/**
 * Resolves the building snapshot stored on an audit record.
 * When the caller already has the building name (e.g. captured before a
 * delete), it is used as-is; otherwise the name is looked up so records
 * stay readable even after the building is later removed.
 */
async function resolveBuildingSnapshot(buildingId, providedName) {
  if (!buildingId) {
    return { buildingId: null, buildingName: '' };
  }

  const idString = buildingId.toString();
  let name = providedName || '';

  if (!name) {
    const doc = await Building.findById(idString).select('name code').lean();
    name = doc ? doc.name || doc.code || '' : '';
  }

  return { buildingId: idString, buildingName: name };
}

/**
 * Records one audit event for a successful mutation.
 *
 * Callers wrap this in try/catch: an audit failure must never fail the
 * primary operation (this codebase does not use transactions).
 *
 * `actor` is req.user ({ id, name, email, role }) — snapshots are stored
 * as plain strings so events survive actor deletion.
 */
async function record({
  actor,
  action,
  module,
  resourceId = '',
  resourceLabel = '',
  buildingId = null,
  buildingName = '',
}) {
  if (!actor || !actor.id) {
    throw new Error('Audit record requires an authenticated actor');
  }

  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(`Invalid audit action: ${action}`);
  }

  if (!module) {
    throw new Error('Audit record requires a module');
  }

  const snapshot = await resolveBuildingSnapshot(buildingId, buildingName);

  return AuditLog.create({
    actorId: actor.id.toString(),
    actorName: actor.name || '',
    actorRole: actor.role,
    action,
    module,
    resourceId: resourceId ? String(resourceId) : '',
    resourceLabel: resourceLabel || '',
    ...snapshot,
  });
}

module.exports = { record };
