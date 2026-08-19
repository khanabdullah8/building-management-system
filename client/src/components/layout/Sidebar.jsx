import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/buildings', label: 'Buildings', roles: ['admin', 'staff'] },
  { to: '/units', label: 'Units', roles: ['admin', 'staff'] },
  { to: '/residents', label: 'Residents', roles: ['admin', 'staff'] },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/complaints', label: 'Complaints' },
  { to: '/notices', label: 'Notices' },
  { to: '/visitors', label: 'Visitors', roles: ['admin', 'staff'] },
  { to: '/parking', label: 'Parking', roles: ['admin', 'staff'] },
  { to: '/billing', label: 'Billing' },
  { to: '/payments', label: 'Payments' },
  { to: '/expenses', label: 'Expenses', roles: ['admin', 'staff'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/notifications', label: 'Notifications' },
  { to: '/audit-logs', label: 'Audit Logs', roles: ['admin'] },
]

function Sidebar({ open, onClose }) {
  const { user } = useAuth()

  const visible = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role),
  )

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">B</span>
          <span className="sidebar-brand-name">BMMS</span>
        </div>
        <nav className="sidebar-nav" aria-label="Main">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'is-active' : ''}`
              }
              onClick={onClose}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}

export default Sidebar
