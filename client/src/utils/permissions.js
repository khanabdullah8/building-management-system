const MANAGER_ROLES = ['admin', 'staff']

export function canManageBuildings(role) {
  return MANAGER_ROLES.includes(role)
}

export function canManageUnits(role) {
  return MANAGER_ROLES.includes(role)
}

export function canManageExpenses(role) {
  return MANAGER_ROLES.includes(role)
}

export function canCreateServiceRequest(role) {
  return ['admin', 'staff', 'resident'].includes(role)
}
