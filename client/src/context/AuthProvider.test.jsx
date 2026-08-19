import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { useAuth } from '../hooks/useAuth'
import http from '../api/http'

vi.mock('../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const testUser = { id: 'u1', name: 'Test User', email: 'test@test.local', role: 'admin' }

function TestConsumer() {
  const { user, loading, isAuthenticated, login, logout } = useAuth()

  const handleLogin = () => {
    login('test@test.local', 'pass').catch(() => {})
  }

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isAuthenticated">{String(isAuthenticated)}</span>
      <span data-testid="userName">{user?.name ?? 'none'}</span>
      <button onClick={handleLogin}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('starts with loading=false and unauthenticated when no token', () => {
    renderWithAuth()

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('userName')).toHaveTextContent('none')
  })

  it('fetches user on mount when token exists', async () => {
    localStorage.setItem('token', 'valid-token')
    http.get.mockResolvedValueOnce({ data: { success: true, data: { user: testUser } } })

    renderWithAuth()

    expect(screen.getByTestId('loading')).toHaveTextContent('true')

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('userName')).toHaveTextContent('Test User')
  })

  it('clears token when /auth/me returns error', async () => {
    localStorage.setItem('token', 'expired-token')
    http.get.mockRejectedValueOnce({ response: { status: 401 } })

    renderWithAuth()

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('successful login sets user and token', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({
      data: { success: true, data: { token: 'new-token', user: testUser } },
    })

    renderWithAuth()

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')

    await user.click(screen.getByText('Login'))

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    })

    expect(screen.getByTestId('userName')).toHaveTextContent('Test User')
    expect(localStorage.getItem('token')).toBe('new-token')
  })

  it('failed login throws error without setting user', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid credentials' } },
      message: 'Invalid credentials',
    })

    renderWithAuth()

    await user.click(screen.getByText('Login'))

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
    })

    expect(screen.getByTestId('userName')).toHaveTextContent('none')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('logout clears user and token', async () => {
    const user = userEvent.setup()
    localStorage.setItem('token', 'valid-token')
    http.get.mockResolvedValueOnce({ data: { success: true, data: { user: testUser } } })

    renderWithAuth()

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    })

    await user.click(screen.getByText('Logout'))

    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('userName')).toHaveTextContent('none')
    expect(localStorage.getItem('token')).toBeNull()
  })
})
