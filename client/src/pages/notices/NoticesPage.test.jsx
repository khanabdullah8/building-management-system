import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import NoticesPage from './NoticesPage'
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

const notices = [
  {
    id: 'notice-1',
    title: 'Water supply maintenance',
    category: 'notice',
    description: 'Water supply will be suspended on Saturday.',
    building: buildings[0],
    publishedAt: '2026-08-10T00:00:00.000Z',
    expiresAt: '2026-08-20T00:00:00.000Z',
  },
  {
    id: 'notice-2',
    title: 'Annual day celebration',
    category: 'event',
    description: 'Join us for the annual day celebration.',
    building: null,
    publishedAt: '2026-08-12T00:00:00.000Z',
    expiresAt: null,
  },
]

function renderPage() {
  return render(<MemoryRouter><NoticesPage /></MemoryRouter>)
}

function mockList(data = notices) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockBuildings(buildingData = buildings) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildingData } })
    return Promise.resolve({ data: { success: true, data: notices } })
  })
}

async function openNewNotice(user) {
  await screen.findByText('Water supply maintenance')
  await user.click(screen.getByRole('button', { name: 'New Notice' }))
}

describe('NoticesPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders notices with building and date data', async () => {
    renderPage()

    expect(await screen.findByText('Water supply maintenance')).toBeInTheDocument()
    expect(screen.getAllByText('Greenwood Heights (BLD-A)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('notice')).toBeInTheDocument()
    expect(screen.getByText('event')).toBeInTheDocument()
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading notices')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get.mockImplementation((url) => {
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      return Promise.reject(new Error('Unable to reach the server'))
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    http.get.mockImplementation((url) => {
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      return Promise.resolve({ data: { success: true, data: notices } })
    })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Water supply maintenance')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/notices')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Water supply maintenance')
    await user.type(screen.getByRole('searchbox'), 'water')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/notices?search=water'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/notices'))
  })

  it('filters by building', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Water supply maintenance')
    await user.selectOptions(screen.getByLabelText('Filter by building'), 'building-2')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/notices?building=building-2'))
  })

  it('shows empty state when no notices exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No notices yet')).toBeInTheDocument()
    expect(screen.getByText('Create a notice to announce events or updates.')).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Water supply maintenance')
    http.get.mockImplementation((url) => {
      if (url === '/v1/notices?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      return Promise.resolve({ data: { success: true, data: notices } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching notices')).toBeInTheDocument()
    expect(screen.getByText('No notices match "unknown".')).toBeInTheDocument()
  })

  it('opens New Notice modal and loads Building options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockBuildings()
    await openNewNotice(user)

    expect(screen.getByRole('dialog', { name: 'New Notice' })).toBeInTheDocument()
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/buildings'))
    const dialog = screen.getByRole('dialog', { name: 'New Notice' })
    expect(await within(dialog).findByRole('option', { name: 'Maple Residency (BLD-B)' })).toBeInTheDocument()
  })

  it('validates required Title and Category before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockBuildings()
    await openNewNotice(user)
    await user.click(screen.getByRole('button', { name: 'Create Notice' }))

    expect(await screen.findByText('Notice title is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates a notice and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'notice-3' } } })
    renderPage()
    mockBuildings()

    await screen.findByText('Water supply maintenance')
    await user.click(screen.getByRole('button', { name: 'New Notice' }))
    await user.type(screen.getByLabelText(/^Title/), 'New parking rules')
    await user.selectOptions(screen.getByLabelText(/^Category/), 'announcement')
    await user.click(screen.getByRole('button', { name: 'Create Notice' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/notices', expect.objectContaining({
      title: 'New parking rules', category: 'announcement',
    })))
    expect(await screen.findByText('Notice created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Invalid notice data' })
    renderPage()
    mockBuildings()
    await openNewNotice(user)
    await user.type(screen.getByLabelText(/^Title/), 'AC issue')
    await user.click(screen.getByRole('button', { name: 'Create Notice' }))

    expect(await screen.findByText('Invalid notice data')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New Notice' })).toBeInTheDocument()
  })

  it('opens edit with existing notice values', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    expect(screen.getByRole('dialog', { name: 'Edit Notice' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Water supply maintenance')
    expect(screen.getByLabelText(/^Category/)).toHaveValue('notice')
    expect(screen.getByLabelText(/^Description/)).toHaveValue('Water supply will be suspended on Saturday.')
    const dialog = screen.getByRole('dialog', { name: 'Edit Notice' })
    expect(await within(dialog).findByRole('option', { name: 'Greenwood Heights (BLD-A)' })).toBeInTheDocument()
  })

  it('updates a notice and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: notices[0] } })
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.selectOptions(screen.getByLabelText(/^Category/), 'announcement')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/notices/notice-1', expect.objectContaining({ category: 'announcement' })))
    expect(await screen.findByText('Notice updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Notice not found' })
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Notice not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Notice' })).toBeInTheDocument()
  })

  it('shows delete confirmation for a notice', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Notice' })).toHaveTextContent('Water supply maintenance')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes a notice and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Notice' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/notices/notice-1'))
    expect(await screen.findByText('Notice deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Notice not found' })
    renderPage()
    await screen.findByText('Water supply maintenance')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Notice' }))

    expect(await screen.findByText('Notice not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Notice' })).toBeInTheDocument()
  })

  it('validates expiry date cannot be before published date', async () => {
    const user = userEvent.setup()
    renderPage()
    mockBuildings()
    await openNewNotice(user)
    await user.type(screen.getByLabelText(/^Title/), 'Test notice')
    await user.type(screen.getByLabelText(/Published Date/), '2026-08-15')
    await user.type(screen.getByLabelText(/Expiry Date/), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Create Notice' }))

    expect(await screen.findByText('Expiry date cannot be before the published date')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })
})
