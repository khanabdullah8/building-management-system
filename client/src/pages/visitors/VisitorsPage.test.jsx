import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import VisitorsPage from './VisitorsPage'
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
  { id: 'unit-1', unitNumber: 'A-1101', building: { id: 'building-1', name: 'Greenwood Heights', code: 'BLD-A' } },
  { id: 'unit-2', unitNumber: 'B-0901', building: { id: 'building-2', name: 'Maple Residency', code: 'BLD-B' } },
]

const visitors = [
  { id: 'vis-1', name: 'Vikram Singh', phone: '+91 98111 22334', unit: units[0], purpose: 'Guest', checkInAt: '2026-08-18T10:00:00Z', checkOutAt: null },
  { id: 'vis-2', name: 'Meera Pillai', phone: '+91 98111 22335', unit: units[1], purpose: 'Courier', checkInAt: '2026-08-17T09:00:00Z', checkOutAt: '2026-08-17T14:00:00Z' },
]

function renderPage() {
  return render(<MemoryRouter><VisitorsPage /></MemoryRouter>)
}

function mockList(data = visitors) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockUnits(unitData = units) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: unitData } })
    return Promise.resolve({ data: { success: true, data: visitors } })
  })
}

async function waitForModal(name) {
  const dialog = await screen.findByRole('dialog', { name })
  return within(dialog)
}

describe('VisitorsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders visitors with populated Unit and Building data', async () => {
    renderPage()

    expect(await screen.findByText('Vikram Singh')).toBeInTheDocument()
    expect(screen.getAllByText('Greenwood Heights (BLD-A) — A-1101').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Guest')).toBeInTheDocument()
  })

  it('renders phone and purpose as dash when empty', async () => {
    mockList([{ ...visitors[0], phone: '', purpose: '' }])
    renderPage()

    expect(await screen.findByText('Vikram Singh')).toBeInTheDocument()
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('shows Checked In badge for visitors with null checkOutAt', async () => {
    renderPage()

    expect(await screen.findByText('Vikram Singh')).toBeInTheDocument()
    expect(screen.getByText('Checked In')).toBeInTheDocument()
  })

  it('shows Checked Out badge for visitors with non-null checkOutAt', async () => {
    renderPage()

    expect(await screen.findByText('Meera Pillai')).toBeInTheDocument()
    expect(screen.getByText('Checked Out')).toBeInTheDocument()
  })

  it('hides Checkout button for checked-out visitors', async () => {
    renderPage()

    expect(await screen.findByText('Meera Pillai')).toBeInTheDocument()
    const checkoutButtons = screen.getAllByRole('button', { name: 'Checkout' })
    expect(checkoutButtons).toHaveLength(1)
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading visitors')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get
      .mockRejectedValueOnce(new Error('Units fetch failed'))
      .mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Vikram Singh')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/visitors')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Vikram Singh')
    await user.type(screen.getByRole('searchbox'), 'vikram')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/visitors?search=vikram'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/visitors'))
  })

  it('shows empty state when no visitors exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No visitors yet')).toBeInTheDocument()
    expect(screen.getByText(/Register a visitor after adding units/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Vikram Singh')
    http.get.mockImplementation((url) => {
      if (url === '/v1/visitors?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
      return Promise.resolve({ data: { success: true, data: visitors } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching visitors')).toBeInTheDocument()
    expect(screen.getByText('No visitors match "unknown".')).toBeInTheDocument()
  })

  it('filters by unit using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.selectOptions(screen.getByLabelText('Filter by unit'), 'unit-1')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/visitors?unit=unit-1'))
  })

  it('opens Register Visitor modal and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Register Visitor' }))

    const dialog = await waitForModal('Register Visitor')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/units'))
    expect(await dialog.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })).toBeInTheDocument()
  })

  it('validates required Name and Unit before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Register Visitor' }))

    const dialog = await waitForModal('Register Visitor')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(dialog.getByRole('button', { name: 'Register Visitor' }))

    expect(await screen.findByText('Visitor name is required')).toBeInTheDocument()
    expect(screen.getByText('Please select a unit')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a visitor and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'vis-3' } } })
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Register Visitor' }))

    const dialog = await waitForModal('Register Visitor')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.type(dialog.getByLabelText(/^Name/), ' New Guest ')
    await user.selectOptions(dialog.getByLabelText(/^Unit/), 'unit-1')
    await user.click(dialog.getByRole('button', { name: 'Register Visitor' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/visitors', expect.objectContaining({
      name: 'New Guest', unit: 'unit-1',
    })))
    expect(await screen.findByText('Visitor registered successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Register Visitor' }))

    const dialog = await waitForModal('Register Visitor')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.type(dialog.getByLabelText(/^Name/), 'Guest')
    await user.selectOptions(dialog.getByLabelText(/^Unit/), 'unit-1')
    await user.click(dialog.getByRole('button', { name: 'Register Visitor' }))

    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Register Visitor' })).toBeInTheDocument()
  })

  it('opens edit with existing visitor values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Visitor')
    expect(dialog.getByLabelText(/^Name/)).toHaveValue('Vikram Singh')
    expect(dialog.getByLabelText(/^Phone/)).toHaveValue('+91 98111 22334')
    expect(dialog.getByLabelText(/^Purpose/)).toHaveValue('Guest')
    expect(await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })).toBeInTheDocument()
  })

  it('updates a visitor and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: visitors[0] } })
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Visitor')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.clear(dialog.getByLabelText(/^Purpose/))
    await user.type(dialog.getByLabelText(/^Purpose/), 'Maintenance')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/visitors/vis-1', expect.objectContaining({ purpose: 'Maintenance' })))
    expect(await screen.findByText('Visitor updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Visitor not found' })
    renderPage()
    mockUnits()

    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Visitor')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Visitor not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Visitor' })).toBeInTheDocument()
  })

  it('shows delete confirmation with visitor name and unit', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Visitor' })).toHaveTextContent('Vikram Singh')
    expect(screen.getByRole('dialog', { name: 'Delete Visitor' })).toHaveTextContent('A-1101')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a visitor and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Visitor' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/visitors/vis-1'))
    expect(await screen.findByText('Visitor deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Visitor not found' })
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Visitor' }))

    expect(await screen.findByText('Visitor not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Visitor' })).toBeInTheDocument()
  })

  it('shows checkout confirmation with visitor name and unit', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Checkout' }))

    expect(screen.getByRole('dialog', { name: 'Check Out Visitor' })).toHaveTextContent('Vikram Singh')
    expect(screen.getByRole('dialog', { name: 'Check Out Visitor' })).toHaveTextContent('A-1101')
  })

  it('cancels checkout without making an API call', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.patch).not.toHaveBeenCalled()
  })

  it('checks out a visitor and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    await user.click(screen.getByRole('button', { name: 'Check Out' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/visitors/vis-1', expect.objectContaining({
      checkOutAt: expect.any(String),
    })))
    expect(await screen.findByText('Vikram Singh checked out successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps checkout dialog open and shows error on API failure', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Visitor not found' })
    renderPage()
    await screen.findByText('Vikram Singh')
    await user.click(screen.getByRole('button', { name: 'Checkout' }))
    await user.click(screen.getByRole('button', { name: 'Check Out' }))

    expect(await screen.findByText('Visitor not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Check Out Visitor' })).toBeInTheDocument()
  })
})
