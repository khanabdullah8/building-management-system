import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BuildingsPage from './BuildingsPage'
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
  { id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights', address: '12 Palm Avenue', units: 72, status: 'active' },
  { id: 'building-2', code: 'BLD-B', name: 'Maple Residency', address: '88 Maple Street', units: 64, status: 'inactive' },
]

function renderPage() {
  return render(<MemoryRouter><BuildingsPage /></MemoryRouter>)
}

function mockList(data = buildings) {
  http.get.mockResolvedValue({ data: { success: true, data } })
}

async function openNewBuilding(user) {
  await screen.findByText('Greenwood Heights')
  await user.click(screen.getByRole('button', { name: 'New Building' }))
}

describe('BuildingsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList()
  })

  it('renders buildings from the API', async () => {
    renderPage()

    expect(await screen.findByText('Greenwood Heights')).toBeInTheDocument()
    expect(screen.getByText('Maple Residency')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
  })

  it('shows a loading state while buildings are loading', () => {
    http.get.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading buildings')
  })

  it('shows an API error state', async () => {
    http.get.mockRejectedValue(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('retries the current list request after an error', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Temporary error'))
    renderPage()

    await screen.findByText('Temporary error')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Greenwood Heights')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/buildings')
  })

  it('sends a server-side search request and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.type(screen.getByRole('searchbox'), 'Greenwood')

    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/buildings?search=Greenwood')
    })

    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => {
      expect(http.get).toHaveBeenLastCalledWith('/v1/buildings')
    })
  })

  it('shows an empty state when no buildings exist', async () => {
    mockList([])
    renderPage()

    expect(await screen.findByText('No buildings yet')).toBeInTheDocument()
    expect(screen.getByText(/Create your first building/i)).toBeInTheDocument()
  })

  it('opens the New Building modal', async () => {
    const user = userEvent.setup()
    renderPage()

    await openNewBuilding(user)
    expect(screen.getByRole('dialog', { name: 'New Building' })).toBeInTheDocument()
  })

  it('shows required Code validation before creating', async () => {
    const user = userEvent.setup()
    renderPage()

    await openNewBuilding(user)
    await user.type(screen.getByLabelText(/^Name/), 'New Building')
    await user.click(screen.getByRole('button', { name: 'Create Building' }))

    expect(await screen.findByText('Building code is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('shows required Name validation before creating', async () => {
    const user = userEvent.setup()
    renderPage()

    await openNewBuilding(user)
    await user.type(screen.getByLabelText(/^Code/), 'BLD-C')
    await user.click(screen.getByRole('button', { name: 'Create Building' }))

    expect(await screen.findByText('Building name is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a building, refreshes the list, and shows success feedback', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'building-3' } } })
    renderPage()

    await openNewBuilding(user)
    await user.type(screen.getByLabelText(/^Code/), ' BLD-C ')
    await user.type(screen.getByLabelText(/^Name/), ' Sunset Towers ')
    await user.type(screen.getByLabelText(/^Address/), ' 5 Harbour Road ')
    await user.type(screen.getByLabelText(/^Units/), '48')
    await user.click(screen.getByRole('button', { name: 'Create Building' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/buildings', {
        code: 'BLD-C', name: 'Sunset Towers', address: '5 Harbour Road', units: 48, status: 'active',
      })
    })
    expect(await screen.findByText('Building created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open and displays an API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: "Building with code 'BLD-A' already exists" })
    renderPage()

    await openNewBuilding(user)
    await user.type(screen.getByLabelText(/^Code/), 'BLD-A')
    await user.type(screen.getByLabelText(/^Name/), 'Duplicate')
    await user.click(screen.getByRole('button', { name: 'Create Building' }))

    expect(await screen.findByText("Building with code 'BLD-A' already exists")).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Building' })).toBeInTheDocument()
  })

  it('loads existing building values into the edit modal', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Building' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Code/)).toHaveValue('BLD-A')
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Greenwood Heights')
    expect(screen.getByLabelText(/^Units/)).toHaveValue(72)
  })

  it('updates a building and shows success feedback', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: buildings[0] } })
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.clear(screen.getByLabelText(/^Name/))
    await user.type(screen.getByLabelText(/^Name/), 'Greenwood Residences')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/buildings/building-1', {
        code: 'BLD-A', name: 'Greenwood Residences', address: '12 Palm Avenue', units: 72, status: 'active',
      })
    })
    expect(await screen.findByText('Building updated successfully.')).toBeInTheDocument()
  })

  it('keeps the edit modal open and displays an API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Building code must be unique' })
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Building code must be unique')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Building' })).toBeInTheDocument()
  })

  it('shows a delete confirmation and can cancel it', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(screen.getByRole('dialog', { name: 'Delete Building' })).toHaveTextContent('Greenwood Heights')
    expect(screen.getByText(/Units reference Buildings/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a building, refreshes the list, and shows success feedback', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Building' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/buildings/building-1'))
    expect(await screen.findByText('Building deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open and displays an API error', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Building not found' })
    renderPage()

    await screen.findByText('Greenwood Heights')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Building' }))

    expect(await screen.findByText('Building not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Building' })).toBeInTheDocument()
  })
})
