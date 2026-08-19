import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import http from './api/http'

vi.mock('./api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App shell', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    http.get.mockImplementation((url) => {
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
  })

  it('renders the layout with the dashboard at /', async () => {
    renderApp()

    expect(screen.getByRole('link', { name: 'Buildings' })).toBeInTheDocument()
    expect(await screen.findByText('Total Buildings')).toBeInTheDocument()
  })

  it('navigates to the buildings page', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('link', { name: 'Buildings' }))

    expect(await screen.findByRole('heading', { name: 'Buildings' })).toBeInTheDocument()
    expect(
      await screen.findByPlaceholderText('Search buildings…'),
    ).toBeInTheDocument()
  })

  it('renders the login page at /login', () => {
    renderApp('/login')

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('renders a 404 page for unknown routes', () => {
    renderApp('/does-not-exist')

    expect(screen.getByText('404')).toBeInTheDocument()
  })
})
