import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import http from './api/http'
import { AuthProvider } from './context/AuthProvider'

vi.mock('./api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

const authUser = { id: 'u1', name: 'Test Admin', email: 'admin@test.local', role: 'admin' }

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

function mockAuth(user = authUser) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/auth/me') {
      if (user) {
        return Promise.resolve({ data: { success: true, data: { user } } })
      }
      return Promise.reject({ response: { status: 401 } })
    }
    if (url === '/v1/dashboard') {
      return Promise.resolve({
        data: {
          success: true,
          data: {
            buildings: 0, units: 0, occupied: 0, vacant: 0,
            pendingMaintenance: 0, openComplaints: 0, pendingPayments: 0,
            monthlyCollection: 0, recentComplaints: [], recentMaintenance: [],
            recentPayments: [],
          },
        },
      })
    }
    return Promise.resolve({ data: { success: true, data: [] } })
  })
}

describe('App shell', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    localStorage.setItem('token', 'test-jwt-token')
    mockAuth()
  })

  it('renders the layout with the dashboard at /', async () => {
    renderApp()

    expect(await screen.findByText('Total Buildings')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buildings' })).toBeInTheDocument()
  })

  it('navigates to the buildings page', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(await screen.findByText('Total Buildings')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Buildings' }))

    expect(await screen.findByRole('heading', { name: 'Buildings' })).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText('Search buildings…'),
    ).toBeInTheDocument()
  })

  it('renders the login page at /login', async () => {
    renderApp('/login')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders a 404 page for unknown routes', async () => {
    renderApp('/does-not-exist')

    expect(await screen.findByText('404')).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', async () => {
    localStorage.clear()
    mockAuth(null)

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
