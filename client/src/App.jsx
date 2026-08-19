import { Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/common/ProtectedRoute'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import BuildingsPage from './pages/buildings/BuildingsPage'
import UnitsPage from './pages/units/UnitsPage'
import ResidentsPage from './pages/residents/ResidentsPage'
import MaintenancePage from './pages/maintenance/MaintenancePage'
import ComplaintsPage from './pages/complaints/ComplaintsPage'
import NoticesPage from './pages/notices/NoticesPage'
import VisitorsPage from './pages/visitors/VisitorsPage'
import ParkingPage from './pages/parking/ParkingPage'
import BillingPage from './pages/billing/BillingPage'
import PaymentsPage from './pages/payments/PaymentsPage'
import ExpensesPage from './pages/expenses/ExpensesPage'
import UsersPage from './pages/users/UsersPage'
import NotificationsPage from './pages/notifications/NotificationsPage'
import AuditLogsPage from './pages/audit-logs/AuditLogsPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="buildings" element={<BuildingsPage />} />
          <Route path="units" element={<UnitsPage />} />
          <Route path="residents" element={<ResidentsPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="complaints" element={<ComplaintsPage />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="visitors" element={<VisitorsPage />} />
          <Route path="parking" element={<ParkingPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
