import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './Header.css'

function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="app-header">
      <button
        type="button"
        className="menu-toggle"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        ☰
      </button>
      <div className="app-header-title">BMMS</div>
      <div className="app-header-actions">
        <span className="app-header-user">{user?.name ?? 'User'}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm header-logout"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </header>
  )
}

export default Header
