import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Header from './Header'
import { AuthContext } from '../../context/auth-context'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const mockLogout = vi.fn()

function renderHeader(authOverrides = {}) {
  const authValue = {
    user: { id: 'u1', name: 'Test User', email: 'test@test.local', role: 'admin' },
    loading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: mockLogout,
    ...authOverrides,
  }

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Header onMenuClick={vi.fn()} />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays user name', () => {
    renderHeader()

    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('displays "User" when no user loaded', () => {
    renderHeader({ user: null })

    expect(screen.getByText('User')).toBeInTheDocument()
  })

  it('shows logout button', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })

  it('calls logout and navigates to /login on logout click', async () => {
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Logout' }))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('shows menu toggle button', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })
})
