import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MaintenancePage from './MaintenancePage'
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

const maintenanceRequests = [
  { id: 'req-1', title: 'AC not cooling', unit: units[0], description: 'Living room AC', priority: 'high', assignedTo: 'Ramesh Kumar', status: 'open' },
  { id: 'req-2', title: 'Water heater repair', unit: units[1], description: '', priority: 'medium', assignedTo: '', status: 'in-progress' },
]

function renderPage() {
  return render(<MemoryRouter><MaintenancePage /></MemoryRouter>)
}

function mockList(data = maintenanceRequests) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockUnits() {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data: maintenanceRequests } })
  })
}

async function openNewRequest(user) {
  await screen.findByText('AC not cooling')
  await user.click(screen.getByRole('button', { name: 'New Request' }))
}

async function selectUnit(user, unitId = 'unit-1') {
  await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
  await user.selectOptions(screen.getByLabelText(/^Unit/), unitId)
}

describe('MaintenancePage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders requests with populated Unit and Building data', async () => {
    renderPage()

    expect(await screen.findByText('AC not cooling')).toBeInTheDocument()
    expect(screen.getByText('A-1101')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Heights (BLD-A)')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('Ramesh Kumar')).toBeInTheDocument()
    expect(screen.getByText('open')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading maintenance')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('AC not cooling')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/maintenance')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('AC not cooling')
    await user.type(screen.getByRole('searchbox'), 'AC')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/maintenance?search=AC'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/maintenance'))
  })

  it('shows empty state when no requests exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No maintenance requests yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a request after adding units/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('AC not cooling')
    http.get.mockImplementation((url) => {
      if (url === '/v1/maintenance?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
      return Promise.resolve({ data: { success: true, data: maintenanceRequests } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching requests')).toBeInTheDocument()
    expect(screen.getByText('No requests match "unknown".')).toBeInTheDocument()
  })

  it('opens New Request modal and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewRequest(user)

    expect(screen.getByRole('dialog', { name: 'New Request' })).toBeInTheDocument()
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/units'))
    expect(await screen.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })).toBeInTheDocument()
  })

  it('validates required Title and Unit before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewRequest(user)
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Create Request' }))

    expect(await screen.findByText('Maintenance title is required')).toBeInTheDocument()
    expect(screen.getByText('Please select a unit')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a request, refreshes the current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'req-3' } } })
    renderPage()
    mockUnits()

    await screen.findByText('AC not cooling')
    await user.type(screen.getByRole('searchbox'), 'AC')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/maintenance?search=AC'))
    await user.click(screen.getByRole('button', { name: 'New Request' }))
    await selectUnit(user)
    await user.type(screen.getByLabelText(/^Title/), ' Leaking pipe ')
    await user.type(screen.getByLabelText(/^Description/), 'Kitchen sink')
    await user.type(screen.getByLabelText(/^Assigned To/), ' Joseph ')
    await user.click(screen.getByRole('button', { name: 'Create Request' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/maintenance', {
      title: 'Leaking pipe', unit: 'unit-1', description: 'Kitchen sink', priority: 'medium', assignedTo: 'Joseph', status: 'open',
    }))
    expect(await screen.findByText('Maintenance request created successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/maintenance?search=AC')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()
    await openNewRequest(user)
    await selectUnit(user)
    await user.type(screen.getByLabelText(/^Title/), 'AC not cooling')
    await user.click(screen.getByRole('button', { name: 'Create Request' }))

    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Request' })).toBeInTheDocument()
  })

  it('opens edit with existing values and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await screen.findByText('AC not cooling')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Request' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Title/)).toHaveValue('AC not cooling')
    expect(screen.getByLabelText(/^Description/)).toHaveValue('Living room AC')
    expect(screen.getByLabelText(/^Priority/)).toHaveValue('high')
    expect(screen.getByLabelText(/^Status/)).toHaveValue('open')
    expect(screen.getByLabelText(/^Assigned To/)).toHaveValue('Ramesh Kumar')
    expect(await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })).toBeInTheDocument()
  })

  it('updates a request, refreshes current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: maintenanceRequests[0] } })
    renderPage()
    mockUnits()
    await screen.findByText('AC not cooling')
    await user.type(screen.getByRole('searchbox'), 'AC')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/maintenance?search=AC'))
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.selectOptions(screen.getByLabelText(/^Status/), 'completed')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/maintenance/req-1', {
      title: 'AC not cooling', unit: 'unit-1', description: 'Living room AC', priority: 'high', assignedTo: 'Ramesh Kumar', status: 'completed',
    }))
    expect(await screen.findByText('Maintenance request updated successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/maintenance?search=AC')
  })

  it('keeps edit modal open on API error and supports Unit reassignment', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()
    await screen.findByText('AC not cooling')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })
    await user.selectOptions(screen.getByLabelText(/^Unit/), 'unit-2')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/maintenance/req-1', expect.objectContaining({ unit: 'unit-2' })))
    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Request' })).toBeInTheDocument()
  })

  it('shows a delete confirmation identifying the request and unit, and can cancel', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('AC not cooling')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Request' })).toHaveTextContent('AC not cooling')
    expect(screen.getByRole('dialog', { name: 'Delete Request' })).toHaveTextContent('A-1101')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a request, refreshes current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('AC not cooling')
    await user.type(screen.getByRole('searchbox'), 'AC')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/maintenance?search=AC'))
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Request' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/maintenance/req-1'))
    expect(await screen.findByText('Maintenance request deleted successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/maintenance?search=AC')
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Maintenance request not found' })
    renderPage()
    await screen.findByText('AC not cooling')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Request' }))

    expect(await screen.findByText('Maintenance request not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Request' })).toBeInTheDocument()
  })
})
