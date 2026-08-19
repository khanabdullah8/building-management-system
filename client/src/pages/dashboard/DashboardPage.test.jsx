import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from './DashboardPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
  },
}))

const dashboardData = {
  buildings: 4,
  units: 236,
  occupied: 198,
  vacant: 38,
  pendingMaintenance: 12,
  openComplaints: 7,
  pendingPayments: 21,
  monthlyCollection: 184500,
  recentComplaints: [
    { id: 'c1', subject: 'Water leakage', unit: { unitNumber: 'A-1204', building: { name: 'Greenwood Heights' } }, status: 'open' },
  ],
  recentMaintenance: [
    { id: 'm1', title: 'AC not cooling', unit: { unitNumber: 'A-1103', building: { name: 'Greenwood Heights' } }, priority: 'high', status: 'open' },
  ],
  recentPayments: [
    { id: 'p1', amount: 4500, method: 'UPI', status: 'completed', bill: { unit: { unitNumber: 'A-1103', building: { name: 'Greenwood Heights' } } } },
  ],
}

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>)
}

function mockSuccess(data = dashboardData) {
  http.get.mockResolvedValue({ data: { success: true, data } })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows loading state', () => {
    http.get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument()
  })

  it('shows error state with retry', async () => {
    http.get.mockRejectedValue(new Error('Network error'))
    renderPage()
    expect(await screen.findByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })

  it('retries fetch on retry click', async () => {
    http.get.mockRejectedValueOnce(new Error('fail'))
    http.get.mockResolvedValueOnce({ data: { success: true, data: dashboardData } })
    renderPage()
    await screen.findByText('fail')
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }))
    await waitFor(() => {
      expect(screen.getByText('Total Buildings')).toBeInTheDocument()
    })
  })

  it('renders KPI cards with data', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Total Buildings')).toBeInTheDocument()
    })
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('236')).toBeInTheDocument()
    expect(screen.getByText('198')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
  })

  it('renders monthly collection as formatted currency', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('$184,500.00')).toBeInTheDocument()
    })
  })

  it('renders recent complaints table', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Water leakage')).toBeInTheDocument()
    })
    expect(screen.getByText('A-1204 (Greenwood Heights)')).toBeInTheDocument()
  })

  it('renders recent maintenance table', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('AC not cooling')).toBeInTheDocument()
    })
    expect(screen.getAllByText('A-1103 (Greenwood Heights)').length).toBeGreaterThanOrEqual(1)
  })

  it('renders recent payments table', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('$4,500.00')).toBeInTheDocument()
    })
  })

  it('renders quick action links', async () => {
    mockSuccess()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Raise a maintenance request')).toBeInTheDocument()
    })
    expect(screen.getByText('View notices')).toBeInTheDocument()
    expect(screen.getByText('Visitors today')).toBeInTheDocument()
    expect(screen.getByText('Review bills')).toBeInTheDocument()
  })

  it('renders "—" for null unit in complaint', async () => {
    mockSuccess({
      ...dashboardData,
      recentComplaints: [
        { id: 'c1', subject: 'Building-wide issue', unit: null, status: 'open' },
      ],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Building-wide issue')).toBeInTheDocument()
    })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders "—" for null unit in payment bill', async () => {
    mockSuccess({
      ...dashboardData,
      recentPayments: [
        { id: 'p1', amount: 1000, method: 'cash', status: 'completed', bill: { unit: null } },
      ],
    })
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    })
  })
})
