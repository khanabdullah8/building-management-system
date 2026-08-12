import './Header.css'

function Header({ onMenuClick }) {
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
        <span className="app-header-user">Admin</span>
      </div>
    </header>
  )
}

export default Header
