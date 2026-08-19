import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Spinner from '../ui/Spinner'

function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth()

  if (loading) return <Spinner label="Loading…" />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

export default ProtectedRoute
