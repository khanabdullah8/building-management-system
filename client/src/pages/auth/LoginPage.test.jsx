import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'
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

const mockLogin = vi.fn()

function renderLogin(overrides = {}) {
  const authValue = {
    user: null,
    loading: false,
    isAuthenticated: false,
    login: mockLogin,
    logout: vi.fn(),
    ...overrides,
  }

  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={authValue}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the sign in form', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('calls login with email and password on submit', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce({ name: 'Admin' })
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'admin@test.local')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mockLogin).toHaveBeenCalledWith('admin@test.local', 'password123')
  })

  it('displays error message on failed login', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValueOnce({ message: 'Invalid credentials' })
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'admin@test.local')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
    })
  })

  it('shows loading state while submitting', async () => {
    const user = userEvent.setup()
    let resolveLogin
    mockLogin.mockReturnValueOnce(new Promise((r) => { resolveLogin = r }))
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'admin@test.local')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    })

    resolveLogin({ name: 'Admin' })
  })

  it('passes credentials to login without exposing password in DOM text', async () => {
    const user = userEvent.setup()
    mockLogin.mockResolvedValueOnce({ name: 'Admin' })
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'admin@test.local')
    await user.type(screen.getByLabelText('Password'), 'secret123')

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mockLogin).toHaveBeenCalledWith('admin@test.local', 'secret123')
  })
})
