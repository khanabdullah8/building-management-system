import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/buildings', label: 'Buildings' },
  { to: '/units', label: 'Units' },
  { to: '/residents', label: 'Residents' },
  { to: '/maintenance', label: 'Maintenance' },
  { to: '/complaints', label: 'Complaints' },
  { to: '/notices', label: 'Notices' },
  { to: '/visitors', label: 'Visitors' },
  { to: '/parking', label: 'Parking' },
  { to: '/billing', label: 'Billing' },
  { to: '/payments', label: 'Payments' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/users', label: 'Users' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/audit-logs', label: 'Audit Logs' },
]

function Sidebar({ open, onClose }) {
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
          {NAV_ITEMS.map((item) => (
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
