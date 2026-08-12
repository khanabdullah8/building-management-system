// ============================================================
// DEMO DATA (Phase 2)
// Static placeholder records used to build and style the UI before
// backend endpoints exist. These MUST be replaced by real API
// responses in later phases — never treat them as production data.
// ============================================================

export const demoDashboard = {
  buildings: 4,
  units: 236,
  occupied: 198,
  vacant: 38,
  pendingMaintenance: 12,
  openComplaints: 7,
  pendingPayments: 21,
  monthlyCollection: 184500,
  recentComplaints: [
    { id: 1, subject: 'Water leakage in kitchen', unit: 'A-1204', status: 'open' },
    { id: 2, subject: 'Lift noise on floor 9', unit: 'B-0902', status: 'in-progress' },
    { id: 3, subject: 'Stray dog near gate 2', unit: 'Common area', status: 'resolved' },
  ],
  recentMaintenance: [
    { id: 1, title: 'AC not cooling', unit: 'A-1103', priority: 'high', status: 'pending' },
    { id: 2, title: 'Water heater repair', unit: 'C-0501', priority: 'medium', status: 'in-progress' },
    { id: 3, title: 'Intercom not working', unit: 'B-1204', priority: 'low', status: 'completed' },
  ],
  recentPayments: [
    { id: 1, unit: 'A-1103', amount: 4500, method: 'UPI', status: 'completed' },
    { id: 2, unit: 'B-0902', amount: 4500, method: 'Card', status: 'completed' },
    { id: 3, unit: 'C-0501', amount: 3200, method: 'Cash', status: 'pending' },
  ],
}

export const demoBuildings = [
  { id: 1, code: 'BLD-A', name: 'Greenwood Heights', address: '12 Palm Avenue', units: 72, status: 'active' },
  { id: 2, code: 'BLD-B', name: 'Maple Residency', address: '88 Maple Street', units: 64, status: 'active' },
  { id: 3, code: 'BLD-C', name: 'Sunset Towers', address: '5 Harbour Road', units: 48, status: 'active' },
  { id: 4, code: 'BLD-D', name: 'Cedar Courts', address: '221 Cedar Lane', units: 52, status: 'inactive' },
]

export const demoUnits = [
  { id: 1, unitNumber: 'A-1101', building: 'Greenwood Heights', type: '3BHK', floor: 11, status: 'occupied' },
  { id: 2, unitNumber: 'A-1102', building: 'Greenwood Heights', type: '2BHK', floor: 11, status: 'vacant' },
  { id: 3, unitNumber: 'B-0901', building: 'Maple Residency', type: '2BHK', floor: 9, status: 'occupied' },
  { id: 4, unitNumber: 'C-0501', building: 'Sunset Towers', type: '1BHK', floor: 5, status: 'occupied' },
]

export const demoResidents = [
  { id: 1, name: 'Rahul Sharma', unit: 'A-1101', phone: '+91 98123 45670', type: 'owner', status: 'active' },
  { id: 2, name: 'Priya Menon', unit: 'B-0901', phone: '+91 98123 45671', type: 'tenant', status: 'active' },
  { id: 3, name: 'Arjun Nair', unit: 'C-0501', phone: '+91 98123 45672', type: 'tenant', status: 'active' },
  { id: 4, name: 'Sneha Kapoor', unit: 'A-1102', phone: '+91 98123 45673', type: 'owner', status: 'inactive' },
]

export const demoMaintenance = [
  { id: 1, title: 'AC not cooling', unit: 'A-1103', priority: 'high', assignedTo: 'Ramesh Kumar', status: 'pending' },
  { id: 2, title: 'Water heater repair', unit: 'C-0501', priority: 'medium', assignedTo: 'Joseph Mathew', status: 'in-progress' },
  { id: 3, title: 'Intercom not working', unit: 'B-1204', priority: 'low', assignedTo: 'Unassigned', status: 'completed' },
  { id: 4, title: 'Window lock broken', unit: 'A-1101', priority: 'low', assignedTo: 'Ramesh Kumar', status: 'open' },
]

export const demoComplaints = [
  { id: 1, subject: 'Water leakage in kitchen', unit: 'A-1204', priority: 'high', status: 'open' },
  { id: 2, subject: 'Lift noise on floor 9', unit: 'B-0902', priority: 'medium', status: 'in-progress' },
  { id: 3, subject: 'Stray dog near gate 2', unit: 'Common area', priority: 'low', status: 'resolved' },
]

export const demoNotices = [
  { id: 1, title: 'Quarterly maintenance due', category: 'notice', audience: 'All residents', publishedAt: 'Aug 5, 2026', expiresAt: 'Sep 5, 2026' },
  { id: 2, title: 'Power shutdown on Sunday', category: 'announcement', audience: 'Building A', publishedAt: 'Aug 8, 2026', expiresAt: 'Aug 12, 2026' },
  { id: 3, title: 'Annual sports day', category: 'event', audience: 'All residents', publishedAt: 'Aug 10, 2026', expiresAt: 'Aug 30, 2026' },
]

export const demoVisitors = [
  { id: 1, name: 'Vikram Singh', phone: '+91 98111 22334', unit: 'A-1101', purpose: 'Guest', checkInAt: '10:15 AM', checkOutAt: '—' },
  { id: 2, name: 'Meera Pillai', phone: '+91 98111 22335', unit: 'B-0901', purpose: 'Courier', checkInAt: '9:40 AM', checkOutAt: '9:52 AM' },
  { id: 3, name: 'Delivery - Zomato', phone: '—', unit: 'C-0501', purpose: 'Delivery', checkInAt: '11:02 AM', checkOutAt: '11:06 AM' },
]

export const demoParking = [
  { id: 1, slot: 'P-01', level: 'B1', type: 'car', allocatedTo: 'A-1101', status: 'allocated' },
  { id: 2, slot: 'P-02', level: 'B1', type: 'car', allocatedTo: '—', status: 'available' },
  { id: 3, slot: 'M-05', level: 'B2', type: 'bike', allocatedTo: 'B-0901', status: 'allocated' },
]

export const demoBills = [
  { id: 1, billNo: 'INV-2026-08-011', unit: 'A-1101', period: 'Aug 2026', amount: 4500, status: 'paid' },
  { id: 2, billNo: 'INV-2026-08-012', unit: 'B-0901', period: 'Aug 2026', amount: 3600, status: 'pending' },
  { id: 3, billNo: 'INV-2026-08-013', unit: 'C-0501', period: 'Aug 2026', amount: 3200, status: 'overdue' },
]

export const demoPayments = [
  { id: 1, paymentId: 'PAY-00192', unit: 'A-1101', method: 'UPI', amount: 4500, date: 'Aug 9, 2026', status: 'completed' },
  { id: 2, paymentId: 'PAY-00191', unit: 'B-0901', method: 'Card', amount: 3600, date: 'Aug 8, 2026', status: 'completed' },
  { id: 3, paymentId: 'PAY-00190', unit: 'C-0501', method: 'Cash', amount: 3200, date: 'Aug 7, 2026', status: 'pending' },
]

export const demoExpenses = [
  { id: 1, date: 'Aug 10, 2026', category: 'Utilities', description: 'Common area electricity bill', amount: 18400, status: 'approved' },
  { id: 2, date: 'Aug 8, 2026', category: 'Maintenance', description: 'Lift AMC renewal', amount: 25000, status: 'pending' },
  { id: 3, date: 'Aug 5, 2026', category: 'Housekeeping', description: 'Cleaning supplies', amount: 6400, status: 'approved' },
]

export const demoUsers = [
  { id: 1, name: 'Admin BMMS', email: 'admin@bmms.local', role: 'admin', status: 'active' },
  { id: 2, name: 'Ramesh Kumar', email: 'ramesh@bmms.local', role: 'staff', status: 'active' },
  { id: 3, name: 'Rahul Sharma', email: 'rahul@example.com', role: 'resident', status: 'active' },
]

export const demoNotifications = [
  { id: 1, title: 'Maintenance assigned', type: 'maintenance', date: 'Aug 11, 2026', read: false },
  { id: 2, title: 'Payment received', type: 'payment', date: 'Aug 9, 2026', read: true },
  { id: 3, title: 'New notice published', type: 'notice', date: 'Aug 8, 2026', read: true },
]

export const demoAuditLogs = [
  { id: 1, action: 'LOGIN', module: 'auth', actor: 'admin@bmms.local', timestamp: 'Aug 11, 2026 14:02' },
  { id: 2, action: 'UPDATE', module: 'maintenance', actor: 'ramesh@bmms.local', timestamp: 'Aug 11, 2026 13:45' },
  { id: 3, action: 'CREATE', module: 'notice', actor: 'admin@bmms.local', timestamp: 'Aug 11, 2026 11:30' },
]
