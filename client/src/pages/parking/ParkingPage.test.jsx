import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ParkingPage from './ParkingPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const buildings = [
  { id: 'building-1', name: 'Greenwood Heights', code: 'BLD-A' },
  { id: 'building-2', name: 'Maple Residency', code: 'BLD-B' },
]

const units = [
  { id: 'unit-1', unitNumber: 'A-1101', building: buildings[0] },
  { id: 'unit-2', unitNumber: 'B-0901', building: buildings[1] },
]

const parkingSlots = [
  {
    id: 'park-1', slotCode: 'P-01', building: buildings[0],
    unit: units[0], vehicleType: 'car', vehicleNumber: 'MH-12-AB-1234',
  },
  {
    id: 'park-2', slotCode: 'P-02', building: buildings[0],
    unit: null, vehicleType: 'car', vehicleNumber: '',
  },
  {
    id: 'park-3', slotCode: 'M-05', building: buildings[1],
    unit: units[1], vehicleType: 'bike', vehicleNumber: 'MH-12-CD-5678',
  },
]

function renderPage() {
  return render(<MemoryRouter><ParkingPage /></MemoryRouter>)
}

function mockList(data = parkingSlots) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockDropdowns() {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
    return Promise.resolve({ data: { success: true, data: parkingSlots } })
  })
}

async function waitForModal(name) {
  const dialog = await screen.findByRole('dialog', { name })
  return within(dialog)
}

describe('ParkingPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders parking slots with populated Building and Unit data', async () => {
    renderPage()

    expect(await screen.findByText('P-01')).toBeInTheDocument()
    expect(screen.getAllByText('Greenwood Heights (BLD-A)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('MH-12-AB-1234')).toBeInTheDocument()
  })

  it('renders "—" for unallocated unit', async () => {
    renderPage()

    await screen.findByText('P-02')
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Allocated badge for slots with a unit', async () => {
    renderPage()

    await screen.findByText('P-01')
    expect(screen.getAllByText('Allocated').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Available badge for slots without a unit', async () => {
    renderPage()

    await screen.findByText('P-02')
    expect(screen.getByText('Available')).toBeInTheDocument()
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading parking slots')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get
      .mockRejectedValueOnce(new Error('Buildings fetch failed'))
      .mockRejectedValueOnce(new Error('Units fetch failed'))
      .mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('P-01')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/parking')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('P-01')
    await user.type(screen.getByRole('searchbox'), 'P-01')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/parking?search=P-01'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/parking'))
  })

  it('shows empty state when no slots exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No parking slots yet')).toBeInTheDocument()
    expect(screen.getByText(/Add a parking slot after adding buildings/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('P-01')
    http.get.mockImplementation((url) => {
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      if (url === '/v1/units') return Promise.resolve({ data: { success: true, data: units } })
      if (url === '/v1/parking?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      return Promise.resolve({ data: { success: true, data: parkingSlots } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching parking slots')).toBeInTheDocument()
    expect(screen.getByText('No parking slots match "unknown".')).toBeInTheDocument()
  })

  it('filters by building using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('P-01')
    await user.selectOptions(screen.getByLabelText('Filter by building'), 'building-1')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/parking?building=building-1'))
  })

  it('filters by unit using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('P-01')
    await user.selectOptions(screen.getByLabelText('Filter by unit'), 'unit-1')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/parking?unit=unit-1'))
  })

  it('opens Add Parking Slot modal and loads Building + Unit options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getByRole('button', { name: 'Add Slot' }))

    const dialog = await waitForModal('Add Parking Slot')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/buildings')
      expect(http.get).toHaveBeenCalledWith('/v1/units')
    })
    expect(await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })).toBeInTheDocument()
    expect(await dialog.findByRole('option', { name: 'Maple Residency (BLD-B)' })).toBeInTheDocument()
  })

  it('validates required Slot Code and Building before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getByRole('button', { name: 'Add Slot' }))

    const dialog = await waitForModal('Add Parking Slot')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.click(dialog.getByRole('button', { name: 'Add Slot' }))

    expect(await screen.findByText('Slot code is required')).toBeInTheDocument()
    expect(screen.getByText('Please select a building')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a parking slot and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'park-4' } } })
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getByRole('button', { name: 'Add Slot' }))

    const dialog = await waitForModal('Add Parking Slot')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.type(dialog.getByLabelText(/^Slot Code/), 'P-10')
    await user.selectOptions(dialog.getByLabelText(/^Building/), 'building-1')
    await user.click(dialog.getByRole('button', { name: 'Add Slot' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/parking', expect.objectContaining({
      slotCode: 'P-10', building: 'building-1',
    })))
    expect(await screen.findByText('Parking slot created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: "Slot 'P-01' already exists in this building" })
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getByRole('button', { name: 'Add Slot' }))

    const dialog = await waitForModal('Add Parking Slot')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.type(dialog.getByLabelText(/^Slot Code/), 'P-01')
    await user.selectOptions(dialog.getByLabelText(/^Building/), 'building-1')
    await user.click(dialog.getByRole('button', { name: 'Add Slot' }))

    expect(await screen.findByText("Slot 'P-01' already exists in this building")).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Add Parking Slot' })).toBeInTheDocument()
  })

  it('opens edit with existing slot values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Parking Slot')
    expect(dialog.getByLabelText(/^Slot Code/)).toHaveValue('P-01')
    expect(dialog.getByLabelText(/^Vehicle Number/)).toHaveValue('MH-12-AB-1234')
    expect(await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })).toBeInTheDocument()
  })

  it('shows building as read-only in edit modal', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Parking Slot')
    const buildingInput = dialog.getByLabelText(/^Building/)
    expect(buildingInput).toBeDisabled()
    expect(buildingInput.value).toContain('Greenwood Heights')
  })

  it('updates a parking slot and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: parkingSlots[0] } })
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Parking Slot')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.clear(dialog.getByLabelText(/^Vehicle Number/))
    await user.type(dialog.getByLabelText(/^Vehicle Number/), 'MH-12-NEW-0000')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/parking/park-1', expect.objectContaining({ vehicleNumber: 'MH-12-NEW-0000' })))
    expect(await screen.findByText('Parking slot updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Parking slot not found' })
    renderPage()
    mockDropdowns()

    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Parking Slot')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A) — A-1101' })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Parking slot not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Parking Slot' })).toBeInTheDocument()
  })

  it('shows delete confirmation with slot code and building name', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Parking Slot' })).toHaveTextContent('P-01')
    expect(screen.getByRole('dialog', { name: 'Delete Parking Slot' })).toHaveTextContent('Greenwood Heights')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a parking slot and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Slot' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/parking/park-1'))
    expect(await screen.findByText('Parking slot deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Parking slot not found' })
    renderPage()
    await screen.findByText('P-01')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Slot' }))

    expect(await screen.findByText('Parking slot not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Parking Slot' })).toBeInTheDocument()
  })
})
