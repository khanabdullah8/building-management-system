import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ResidentsPage from './ResidentsPage'
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

const residents = [
  { id: 'resident-1', name: 'Rahul Sharma', unit: units[0], phone: '+91 98123 45670', type: 'owner', status: 'active' },
  { id: 'resident-2', name: 'Priya Menon', unit: units[1], phone: '', type: 'tenant', status: 'inactive' },
]

function renderPage() {
  return render(<MemoryRouter><ResidentsPage /></MemoryRouter>)
}

function mockList(residentData = residents) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data: residentData } })
  })
}

function mockUnits() {
  http.get.mockImplementation((url) => {
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data: residents } })
  })
}

async function openNewResident(user) {
  await screen.findByText('Rahul Sharma')
  await user.click(screen.getByRole('button', { name: 'Add Resident' }))
}

async function selectUnit(user, unitId = 'unit-1') {
  await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
  await user.selectOptions(screen.getByLabelText(/^Unit/), unitId)
}

describe('ResidentsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders Residents with populated Unit and Building data', async () => {
    renderPage()

    expect(await screen.findByText('Rahul Sharma')).toBeInTheDocument()
    expect(screen.getByText('A-1101')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Heights (BLD-A)')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows loading and API error states, with retry', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading residents')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Rahul Sharma')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/residents')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Rahul Sharma')
    await user.type(screen.getByRole('searchbox'), 'Rahul')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/residents?search=Rahul'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/residents'))
  })

  it('shows empty and no-search-results states', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No residents yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a resident after adding units/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rahul Sharma')
    http.get.mockImplementation((url) => {
      if (url === '/v1/residents?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
      return Promise.resolve({ data: { success: true, data: residents } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching residents')).toBeInTheDocument()
    expect(screen.getByText('No residents match "unknown".')).toBeInTheDocument()
  })

  it('opens New Resident modal and loads Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewResident(user)

    expect(screen.getByRole('dialog', { name: 'New Resident' })).toBeInTheDocument()
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/units'))
    expect(await screen.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })).toBeInTheDocument()
  })

  it('validates required Name and Unit before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await openNewResident(user)
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Create Resident' }))

    expect(await screen.findByText('Resident name is required')).toBeInTheDocument()
    expect(screen.getByText('Please select a unit')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a Resident, refreshes the current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'resident-3' } } })
    renderPage()
    mockUnits()

    await screen.findByText('Rahul Sharma')
    await user.type(screen.getByRole('searchbox'), 'Rahul')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/residents?search=Rahul'))
    await user.click(screen.getByRole('button', { name: 'Add Resident' }))
    await selectUnit(user)
    await user.type(screen.getByLabelText(/^Name/), ' Rahul Verma ')
    await user.type(screen.getByLabelText(/^Phone/), ' 55555 ')
    await user.click(screen.getByRole('button', { name: 'Create Resident' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/residents', {
      name: 'Rahul Verma', unit: 'unit-1', phone: '55555', type: 'owner', status: 'active',
    }))
    expect(await screen.findByText('Resident created successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/residents?search=Rahul')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()
    await openNewResident(user)
    await selectUnit(user)
    await user.type(screen.getByLabelText(/^Name/), 'Rahul Sharma')
    await user.click(screen.getByRole('button', { name: 'Create Resident' }))

    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Resident' })).toBeInTheDocument()
  })

  it('opens edit with selected Resident values and Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockUnits()
    await screen.findByText('Rahul Sharma')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Resident' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Rahul Sharma')
    expect(screen.getByLabelText(/^Phone/)).toHaveValue('+91 98123 45670')
    expect(screen.getByLabelText(/^Ownership Type/)).toHaveValue('owner')
    expect(await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })).toBeInTheDocument()
  })

  it('updates a Resident, refreshes current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: residents[0] } })
    renderPage()
    mockUnits()
    await screen.findByText('Rahul Sharma')
    await user.type(screen.getByRole('searchbox'), 'Rahul')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/residents?search=Rahul'))
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.selectOptions(screen.getByLabelText(/^Status/), 'inactive')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/residents/resident-1', {
      name: 'Rahul Sharma', unit: 'unit-1', phone: '+91 98123 45670', type: 'owner', status: 'inactive',
    }))
    expect(await screen.findByText('Resident updated successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/residents?search=Rahul')
  })

  it('keeps edit modal open on API error and supports Unit reassignment', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Referenced unit does not exist' })
    renderPage()
    mockUnits()
    await screen.findByText('Rahul Sharma')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Maple Residency (BLD-B) — B-0901' })
    await user.selectOptions(screen.getByLabelText(/^Unit/), 'unit-2')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/residents/resident-1', expect.objectContaining({ unit: 'unit-2' })))
    expect(await screen.findByText('Referenced unit does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Resident' })).toBeInTheDocument()
  })

  it('shows a delete confirmation identifying the Resident and Unit, and can cancel', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rahul Sharma')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Resident' })).toHaveTextContent('Rahul Sharma')
    expect(screen.getByRole('dialog', { name: 'Delete Resident' })).toHaveTextContent('A-1101')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a Resident, refreshes current search, and shows feedback', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Rahul Sharma')
    await user.type(screen.getByRole('searchbox'), 'Rahul')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/residents?search=Rahul'))
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Resident' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/residents/resident-1'))
    expect(await screen.findByText('Resident deleted successfully.')).toBeInTheDocument()
    expect(http.get).toHaveBeenLastCalledWith('/v1/residents?search=Rahul')
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Resident not found' })
    renderPage()
    await screen.findByText('Rahul Sharma')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Resident' }))

    expect(await screen.findByText('Resident not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Resident' })).toBeInTheDocument()
  })
})
