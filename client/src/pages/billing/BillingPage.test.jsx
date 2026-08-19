import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BillingPage from './BillingPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const units = [
  { id: 'unit-1', unitNumber: '101', building: { id: 'building-1', name: 'Greenwood Heights', code: 'BLD-A' } },
  { id: 'unit-2', unitNumber: '202', building: { id: 'building-2', name: 'Maple Residency', code: 'BLD-B' } },
]

const buildings = [
  { id: 'building-1', name: 'Greenwood Heights', code: 'BLD-A' },
  { id: 'building-2', name: 'Maple Residency', code: 'BLD-B' },
]

const bills = [
  {
    id: 'bill-1', billNo: 'BILL-001', unit: units[0], period: 'Jan 2026',
    amount: 5000, status: 'pending', dueDate: '2026-01-31', description: 'Monthly maintenance',
  },
  {
    id: 'bill-2', billNo: 'BILL-002', unit: units[0], period: 'Feb 2026',
    amount: 3500, status: 'paid', dueDate: '2026-02-28', description: '', paidAt: '2026-02-15',
  },
  {
    id: 'bill-3', billNo: 'BILL-003', unit: units[1], period: 'Mar 2026',
    amount: 7500, status: 'overdue', dueDate: '2026-03-31', description: 'Special assessment',
  },
]

function renderPage() {
  return render(<MemoryRouter><BillingPage /></MemoryRouter>)
}

function mockList(data = bills) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockDropdowns() {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data: bills } })
  })
}

async function waitForModal(name) {
  const dialog = await screen.findByRole('dialog', { name })
  return within(dialog)
}

describe('BillingPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders bills with populated Unit and Building data', async () => {
    renderPage()

    expect(await screen.findByText('BILL-001')).toBeInTheDocument()
    expect(screen.getByText('Jan 2026')).toBeInTheDocument()
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
  })

  it('renders unit with building name in table', async () => {
    renderPage()
    await screen.findByText('BILL-001')
    expect(screen.getAllByText(/Greenwood Heights/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders status badges with correct tones', async () => {
    renderPage()
    await screen.findByText('BILL-001')
    expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('paid').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('overdue').length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading bills')
  })

  it('shows an API error and retries', async () => {
    const user = userEvent.setup()
    http.get
      .mockRejectedValueOnce(new Error('Buildings fetch failed'))
      .mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('BILL-001')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/billing')
  })

  it('uses server-side search', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('BILL-001')
    await user.type(screen.getByRole('searchbox'), 'BILL-001')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/billing?search=BILL-001'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/billing'))
  })

  it('shows empty state when no bills exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No bills yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a bill to start tracking dues/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('BILL-001')
    http.get.mockImplementation((url) => {
      if (url === '/v1/billing?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      return Promise.resolve({ data: { success: true, data: bills } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching bills')).toBeInTheDocument()
  })

  it('filters by building', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('BILL-001')
    await user.selectOptions(screen.getByLabelText('Filter by building'), 'building-1')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/billing?building=building-1'))
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('BILL-001')
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'paid')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/billing?status=paid'))
  })

  it('opens Create Bill modal and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/units')
    })
    expect(await dialog.findByRole('option', { name: /101 - Greenwood Heights/ })).toBeInTheDocument()
  })

  it('does not show Status or BillNo fields on create modal', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    expect(dialog.queryByLabelText(/^Status/)).not.toBeInTheDocument()
    expect(dialog.queryByLabelText(/^Bill No/)).not.toBeInTheDocument()
  })

  it('validates required Unit, Period, and Amount before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    await dialog.findByRole('option', { name: /101 - Greenwood Heights/ })
    await user.click(dialog.getByRole('button', { name: 'Create Bill' }))

    expect(await dialog.findByText('Please select a unit')).toBeInTheDocument()
    expect(dialog.getByText('Billing period is required')).toBeInTheDocument()
    expect(dialog.getByText('Amount is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('validates amount must be greater than 0', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    await dialog.findByRole('option', { name: /101 - Greenwood Heights/ })
    await user.selectOptions(dialog.getByLabelText(/^Unit/), 'unit-1')
    await user.type(dialog.getByLabelText(/^Period/), 'Jan 2026')
    await user.type(dialog.getByLabelText(/^Amount/), '0')
    await user.click(dialog.getByRole('button', { name: 'Create Bill' }))

    expect(await dialog.findByText('Amount must be greater than 0')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a bill and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'bill-4' } } })
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    await dialog.findByRole('option', { name: /101 - Greenwood Heights/ })
    await user.selectOptions(dialog.getByLabelText(/^Unit/), 'unit-1')
    await user.type(dialog.getByLabelText(/^Period/), 'Apr 2026')
    await user.type(dialog.getByLabelText(/^Amount/), '4500')
    await user.type(dialog.getByLabelText(/^Description/), 'New bill')
    await user.click(dialog.getByRole('button', { name: 'Create Bill' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/billing', expect.objectContaining({
      unit: 'unit-1', period: 'Apr 2026', amount: 4500,
    })))
    expect(await screen.findByText('Bill created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Create Bill' }))

    const dialog = await waitForModal('Create Bill')
    await dialog.findByRole('option', { name: /101 - Greenwood Heights/ })
    await user.selectOptions(dialog.getByLabelText(/^Unit/), 'unit-1')
    await user.type(dialog.getByLabelText(/^Period/), 'Apr 2026')
    await user.type(dialog.getByLabelText(/^Amount/), '4500')
    await user.click(dialog.getByRole('button', { name: 'Create Bill' }))

    expect(await dialog.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create Bill' })).toBeInTheDocument()
  })

  it('opens edit with existing bill values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Bill')
    expect(dialog.getByLabelText(/^Bill No/)).toHaveValue('BILL-001')
    expect(dialog.getByLabelText(/^Period/)).toHaveValue('Jan 2026')
    expect(dialog.getByLabelText(/^Amount/)).toHaveValue(5000)
    expect(dialog.getByLabelText(/^Description/)).toHaveValue('Monthly maintenance')
    expect(dialog.getByLabelText(/^Status/)).toHaveValue('pending')
  })

  it('shows billNo and unit as read-only in edit modal', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Bill')
    const billNoInput = dialog.getByLabelText(/^Bill No/)
    expect(billNoInput).toBeDisabled()
    const unitInput = dialog.getByLabelText(/^Unit/)
    expect(unitInput).toBeDisabled()
  })

  it('updates a bill and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: bills[0] } })
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Bill')
    await user.selectOptions(dialog.getByLabelText(/^Status/), 'paid')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/billing/bill-1', expect.objectContaining({ status: 'paid' })))
    expect(await screen.findByText('Bill updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Bill not found' })
    renderPage()
    mockDropdowns()

    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Bill')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await dialog.findByText('Bill not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Bill' })).toBeInTheDocument()
  })

  it('shows delete confirmation with bill number', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Bill' })).toHaveTextContent('BILL-001')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a bill and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Bill' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/billing/bill-1'))
    expect(await screen.findByText('Bill deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Bill not found' })
    renderPage()
    await screen.findByText('BILL-001')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Bill' }))

    expect(await screen.findByText('Bill not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Bill' })).toBeInTheDocument()
  })
})
