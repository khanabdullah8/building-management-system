import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UnitsPage from './UnitsPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockBuildings = [
  { id: 'bld-1', code: 'BLD-A', name: 'Greenwood Heights', address: '12 Palm Ave', units: 5 },
  { id: 'bld-2', code: 'BLD-B', name: 'Maple Residency', address: '88 Maple St', units: 3 },
]

const mockUnits = [
  { id: 'unit-1', unitNumber: 'A-101', building: { id: 'bld-1', name: 'Greenwood Heights', code: 'BLD-A' }, type: '2BHK', floor: 1, status: 'vacant' },
  { id: 'unit-2', unitNumber: 'B-202', building: { id: 'bld-2', name: 'Maple Residency', code: 'BLD-B' }, type: '3BHK', floor: 2, status: 'occupied' },
]

function renderPage() {
  return render(<MemoryRouter><UnitsPage /></MemoryRouter>)
}

function mockRequests(units = mockUnits) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: mockBuildings } })
    return Promise.resolve({ data: { success: true, data: units } })
  })
}

async function openNewUnit(user) {
  await screen.findByText('A-101')
  await user.click(screen.getByRole('button', { name: 'New Unit' }))
}

describe('UnitsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequests()
  })

  it('renders units list from API', async () => {
    renderPage()

    expect(await screen.findByText('A-101')).toBeInTheDocument()
    expect(screen.getByText('B-202')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Heights')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
  })

  it('shows loading state while units load', () => {
    http.get.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading units')
  })

  it('shows an API error state and retries the current list request', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('A-101')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/units')
  })

  it('sends a server-side search request and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('A-101')
    await user.type(screen.getByRole('searchbox'), 'A-101')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/units?search=A-101'))

    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/units'))
  })

  it('shows no-units and no-search-results empty states', async () => {
    mockRequests([])
    renderPage()

    expect(await screen.findByText('No units yet')).toBeInTheDocument()
    expect(screen.getByText(/Create a unit after adding a building/i)).toBeInTheDocument()
  })

  it('shows a no-search-results empty state', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('A-101')
    http.get.mockImplementation((url) => {
      if (url === '/v1/units?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: mockBuildings } })
      return Promise.resolve({ data: { success: true, data: mockUnits } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')

    expect(await screen.findByText('No matching units')).toBeInTheDocument()
    expect(screen.getByText('No units match "unknown".')).toBeInTheDocument()
  })

  it('opens the existing New Unit modal and loads Building options', async () => {
    const user = userEvent.setup()
    renderPage()

    await openNewUnit(user)
    expect(screen.getByRole('dialog', { name: 'New Unit' })).toBeInTheDocument()
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/buildings'))
    expect(await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })).toBeInTheDocument()
  })

  it('preserves required Unit Number validation', async () => {
    const user = userEvent.setup()
    renderPage()

    await openNewUnit(user)
    await user.click(screen.getByRole('button', { name: 'Create Unit' }))

    expect(await screen.findByText('Unit number is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a Unit, refreshes the list, and shows success feedback', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'unit-3' } } })
    renderPage()

    await openNewUnit(user)
    await user.type(screen.getByLabelText(/Unit Number/i), 'A-102')
    await user.selectOptions(screen.getByLabelText(/^Type/i), '3BHK')
    await user.selectOptions(screen.getByLabelText(/^Status/i), 'occupied')
    await user.click(screen.getByRole('button', { name: 'Create Unit' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/units', {
      building: 'bld-1', unitNumber: 'A-102', type: '3BHK', floor: 1, status: 'occupied',
    }))
    expect(await screen.findByText('Unit created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open when the API returns an error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: "Unit 'A-101' already exists in this building" })
    renderPage()

    await openNewUnit(user)
    await user.type(screen.getByLabelText(/Unit Number/i), 'A-101')
    await user.click(screen.getByRole('button', { name: 'Create Unit' }))

    expect(await screen.findByText("Unit 'A-101' already exists in this building")).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Unit' })).toBeInTheDocument()
  })

  it('opens edit with existing Unit values and Building options', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Unit' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Unit Number/i)).toHaveValue('A-101')
    expect(screen.getByLabelText(/^Type/i)).toHaveValue('2BHK')
    expect(screen.getByLabelText(/^Floor/i)).toHaveValue(1)
    expect(await screen.findByRole('option', { name: 'Maple Residency (BLD-B)' })).toBeInTheDocument()
  })

  it('updates a Unit, refreshes the list, and shows success feedback', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: mockUnits[0] } })
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.selectOptions(screen.getByLabelText(/^Status/i), 'occupied')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/units/unit-1', {
      building: 'bld-1', unitNumber: 'A-101', type: '2BHK', floor: 1, status: 'occupied',
    }))
    expect(await screen.findByText('Unit updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows Building reassignment during edit', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: mockUnits[0] } })
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Maple Residency (BLD-B)' })
    await user.selectOptions(screen.getByLabelText(/^Building/i), 'bld-2')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/units/unit-1', expect.objectContaining({ building: 'bld-2' })))
  })

  it('keeps the edit modal open when the API returns an error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Unit number must be unique per building' })
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await screen.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Unit number must be unique per building')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Unit' })).toBeInTheDocument()
  })

  it('shows a delete confirmation identifying the Unit and can cancel it', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(screen.getByRole('dialog', { name: 'Delete Unit' })).toHaveTextContent('A-101')
    expect(screen.getByRole('dialog', { name: 'Delete Unit' })).toHaveTextContent('Greenwood Heights')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a Unit, refreshes the list, and shows success feedback', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Unit' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/units/unit-1'))
    expect(await screen.findByText('Unit deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open when the API returns an error', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Unit not found' })
    renderPage()

    await screen.findByText('A-101')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Unit' }))

    expect(await screen.findByText('Unit not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Unit' })).toBeInTheDocument()
  })
})
