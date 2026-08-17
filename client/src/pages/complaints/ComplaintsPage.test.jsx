import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ComplaintsPage from './ComplaintsPage'
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

const complaints = [
  { id: 'comp-1', subject: 'Water leakage in kitchen', unit: units[0], location: '', description: 'Leakage from ceiling', priority: 'high', status: 'open' },
  { id: 'comp-2', subject: 'Stray dog near gate', unit: null, location: 'Main gate entrance', description: '', priority: 'low', status: 'resolved' },
]

function renderPage() {
  return render(<MemoryRouter><ComplaintsPage /></MemoryRouter>)
}

function mockList(data = complaints) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockUnits(unitData = units) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: unitData } })
    return Promise.resolve({ data: { success: true, data: complaints } })
  })
}

async function openNewComplaint(user) {
  await screen.findByText('Water leakage in kitchen')
  await user.click(screen.getByRole('button', { name: 'New Complaint' }))
}

describe('ComplaintsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders Unit complaints with populated Unit and Building data', async () => {
    renderPage()

    expect(await screen.findByText('Water leakage in kitchen')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Heights (BLD-A) — A-1101')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('open')).toBeInTheDocument()
  })

  it('renders common-area complaints with location', async () => {
    renderPage()

    expect(await screen.findByText('Stray dog near gate')).toBeInTheDocument()
    expect(screen.getByText('Common area / Main gate entrance')).toBeInTheDocument()
    expect(screen.getByText('low')).toBeInTheDocument()
    expect(screen.getByText('resolved')).toBeInTheDocument()
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading complaints')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Water leakage in kitchen')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/complaints')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Water leakage in kitchen')
    await user.type(screen.getByRole('searchbox'), 'water')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/complaints?search=water'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/complaints'))
  })

  it('shows empty state when no complaints exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No complaints yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a complaint after adding units/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Water leakage in kitchen')
    http.get.mockImplementation((url) => {
      if (url === '/v1/complaints?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
      return Promise.resolve({ data: { success: true, data: complaints } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching complaints')).toBeInTheDocument()
    expect(screen.getByText('No complaints match "unknown".')).toBeInTheDocument()
  })

  it('opens New Complaint modal and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewComplaint(user)

    expect(screen.getByRole('dialog', { name: 'New Complaint' })).toBeInTheDocument()
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/units'))
    expect(await screen.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Common area / Other location' })).toBeInTheDocument()
  })

  it('validates required Subject and Unit/Location before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewComplaint(user)
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    expect(await screen.findByText('Complaint subject is required')).toBeInTheDocument()
    expect(screen.getByText('Please select a unit or choose Common area')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('validates Location required in common-area mode', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewComplaint(user)
    await screen.findByRole('option', { name: 'Common area / Other location' })
    await user.selectOptions(screen.getByLabelText(/^Unit/), '__common__')
    await user.type(screen.getByLabelText(/^Subject/), 'Lobby issue')
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    expect(await screen.findByText('Location is required for common-area complaints')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a Unit complaint and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'comp-3' } } })
    renderPage()
    mockUnits()

    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getByRole('button', { name: 'New Complaint' }))
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.type(screen.getByLabelText(/^Subject/), ' Broken window ')
    await user.selectOptions(screen.getByLabelText(/^Unit/), 'unit-1')
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/complaints', expect.objectContaining({
      subject: 'Broken window', unit: 'unit-1', location: '',
    })))
    expect(await screen.findByText('Complaint created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('creates a common-area complaint', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'comp-3' } } })
    renderPage()
    mockUnits()

    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getByRole('button', { name: 'New Complaint' }))
    await screen.findByRole('option', { name: 'Common area / Other location' })
    await user.type(screen.getByLabelText(/^Subject/), 'Lobby light broken')
    await user.selectOptions(screen.getByLabelText(/^Unit/), '__common__')
    expect(screen.getByLabelText(/Location/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Location/), 'Ground floor lobby')
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/complaints', expect.objectContaining({
      subject: 'Lobby light broken', unit: null, location: 'Ground floor lobby',
    })))
    expect(await screen.findByText('Complaint created successfully.')).toBeInTheDocument()
  })

  it('creates a common-area complaint when ZERO Units exist', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'comp-3' } } })
    mockUnits([])
    renderPage()

    await screen.findByText('Stray dog near gate')
    await user.click(screen.getByRole('button', { name: 'New Complaint' }))
    await screen.findByRole('option', { name: 'Common area / Other location' })
    await user.type(screen.getByLabelText(/^Subject/), 'Fallen tree')
    await user.selectOptions(screen.getByLabelText(/^Unit/), '__common__')
    await user.type(screen.getByLabelText(/^Location/), 'Parking lot')
    expect(screen.getByRole('button', { name: 'Create Complaint' })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/complaints', expect.objectContaining({
      subject: 'Fallen tree', unit: null, location: 'Parking lot',
    })))
    expect(await screen.findByText('Complaint created successfully.')).toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()
    await openNewComplaint(user)
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.type(screen.getByLabelText(/^Subject/), 'AC issue')
    await user.selectOptions(screen.getByLabelText(/^Unit/), 'unit-1')
    await user.click(screen.getByRole('button', { name: 'Create Complaint' }))

    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Complaint' })).toBeInTheDocument()
  })

  it('opens edit with existing Unit complaint values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Complaint' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Subject/)).toHaveValue('Water leakage in kitchen')
    expect(screen.getByLabelText(/^Description/)).toHaveValue('Leakage from ceiling')
    expect(screen.getByLabelText(/^Priority/)).toHaveValue('high')
    expect(screen.getByLabelText(/^Status/)).toHaveValue('open')
    expect(await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })).toBeInTheDocument()
  })

  it('opens edit with existing common-area complaint values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await screen.findByText('Stray dog near gate')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])

    expect(screen.getByRole('dialog', { name: 'Edit Complaint' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Subject/)).toHaveValue('Stray dog near gate')
    expect(screen.getByLabelText(/^Location/)).toHaveValue('Main gate entrance')
    expect(screen.getByLabelText(/^Priority/)).toHaveValue('low')
    expect(screen.getByLabelText(/^Status/)).toHaveValue('resolved')
  })

  it('updates a complaint and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: complaints[0] } })
    renderPage()
    mockUnits()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.selectOptions(screen.getByLabelText(/^Status/), 'resolved')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/complaints/comp-1', expect.objectContaining({ status: 'resolved' })))
    expect(await screen.findByText('Complaint updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Complaint not found' })
    renderPage()
    mockUnits()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Complaint not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Complaint' })).toBeInTheDocument()
  })

  it('shows delete confirmation for Unit complaint', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Complaint' })).toHaveTextContent('Water leakage in kitchen')
    expect(screen.getByRole('dialog', { name: 'Delete Complaint' })).toHaveTextContent('A-1101')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('shows delete confirmation for common-area complaint', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Stray dog near gate')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[1])

    expect(screen.getByRole('dialog', { name: 'Delete Complaint' })).toHaveTextContent('Stray dog near gate')
    expect(screen.getByRole('dialog', { name: 'Delete Complaint' })).toHaveTextContent('Main gate entrance')
  })

  it('deletes a complaint and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Complaint' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/complaints/comp-1'))
    expect(await screen.findByText('Complaint deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Complaint not found' })
    renderPage()
    await screen.findByText('Water leakage in kitchen')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Complaint' }))

    expect(await screen.findByText('Complaint not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Complaint' })).toBeInTheDocument()
  })
})
