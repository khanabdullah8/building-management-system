import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../../context/AuthProvider'
import ProtectedRoute from './ProtectedRoute'
import http from '../../api/http'

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

const testUser = { id: 'u1', name: 'Test User', email: 'test@test.local', role: 'admin' }

function renderProtected(initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('shows spinner while loading', () => {
    localStorage.setItem('token', 'valid-token')
    http.get.mockReturnValue(new Promise(() => {}))

    renderProtected()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', async () => {
    renderProtected()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
  })

  it('renders children when authenticated', async () => {
    localStorage.setItem('token', 'valid-token')
    http.get.mockResolvedValueOnce({ data: { success: true, data: { user: testUser } } })

    renderProtected()

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('redirects to /login when token is invalid', async () => {
    localStorage.setItem('token', 'bad-token')
    http.get.mockRejectedValueOnce({ response: { status: 401 } })

    renderProtected()

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
  })
})
