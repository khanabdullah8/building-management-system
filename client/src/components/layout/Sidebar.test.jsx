import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { AuthContext } from '../../context/auth-context'

function renderSidebar(role = 'admin', props = {}) {
  const authValue = {
    user: role ? { id: 'u1', name: 'Test', email: 'test@test.local', role } : null,
    loading: false,
    isAuthenticated: Boolean(role),
    login: vi.fn(),
    logout: vi.fn(),
  }

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Sidebar open={false} onClose={vi.fn()} {...props} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function getNavLinks() {
  return screen.getAllByRole('link').map((el) => el.textContent)
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows all nav items for admin', () => {
    renderSidebar('admin')
    const links = getNavLinks()

    expect(links).toContain('Dashboard')
    expect(links).toContain('Buildings')
    expect(links).toContain('Units')
    expect(links).toContain('Residents')
    expect(links).toContain('Maintenance')
    expect(links).toContain('Users')
    expect(links).toContain('Audit Logs')
  })

  it('hides admin-only items for staff', () => {
    renderSidebar('staff')
    const links = getNavLinks()

    expect(links).toContain('Dashboard')
    expect(links).toContain('Buildings')
    expect(links).toContain('Maintenance')
    expect(links).not.toContain('Users')
    expect(links).not.toContain('Audit Logs')
  })

  it('shows only resident-appropriate items for resident role', () => {
    renderSidebar('resident')
    const links = getNavLinks()

    expect(links).toContain('Dashboard')
    expect(links).toContain('Maintenance')
    expect(links).toContain('Complaints')
    expect(links).toContain('Notices')
    expect(links).toContain('Billing')
    expect(links).toContain('Payments')
    expect(links).toContain('Notifications')
    expect(links).not.toContain('Buildings')
    expect(links).not.toContain('Units')
    expect(links).not.toContain('Residents')
    expect(links).not.toContain('Visitors')
    expect(links).not.toContain('Parking')
    expect(links).not.toContain('Expenses')
    expect(links).not.toContain('Users')
    expect(links).not.toContain('Audit Logs')
  })

  it('renders brand', () => {
    renderSidebar('admin')

    expect(screen.getByText('BMMS')).toBeInTheDocument()
  })
})
