const TONES = {
  active: 'success',
  allocated: 'success',
  approved: 'success',
  completed: 'success',
  occupied: 'success',
  paid: 'success',
  resolved: 'success',
  'in-progress': 'warning',
  pending: 'warning',
  overdue: 'danger',
  open: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'info',
  vacant: 'warning',
  inactive: 'gray',
  available: 'info',
  unassigned: 'gray',
}

export function statusTone(status) {
  return TONES[status?.toLowerCase()] || 'gray'
}
