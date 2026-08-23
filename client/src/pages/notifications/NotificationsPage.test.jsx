import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import NotificationsPage from './NotificationsPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const notifications = [
  {
    id: 'n-1',
    type: 'notice',
    title: 'Water maintenance on Friday',
    building: { id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights' },
    entityType: 'notice',
    entityId: 'notice-1',
    readAt: '2026-08-12T09:30:00',
    createdAt: '2026-08-12T09:24:00',
  },
  {
    id: 'n-2',
    type: 'maintenance',
    title: 'Request completed: Leaky faucet',
    building: null,
    entityType: 'maintenance',
    entityId: 'mnt-9',
    readAt: null,
    createdAt: '2026-08-13T10:00:00',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  )
}

function mockList(data = notifications) {
  http.get.mockResolvedValue({ data: { success: true, data } })
}

function rowFor(title) {
  return screen.getByText(title).closest('tr')
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so unconsumed once-queued responses
    // can never leak from a failing test into the next one.
    vi.resetAllMocks()
    mockList()
  })

  it('renders fetched notifications with type and status badges', async () => {
    renderPage()

    expect(await screen.findByText('Water maintenance on Friday')).toBeInTheDocument()
    expect(screen.getByText(/Leaky faucet/)).toBeInTheDocument()
    expect(screen.getAllByText('notice').length).toBeGreaterThan(0)
    expect(screen.getByText('unread')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()
  })

  it('bolds the titles of unread rows only', async () => {
    renderPage()

    const unreadTitle = await screen.findByText('Request completed: Leaky faucet')
    expect(unreadTitle).toHaveClass('notifications-title-unread')

    const readRow = rowFor('Water maintenance on Friday')
    const readTitle = within(readRow).getByText('Water maintenance on Friday')
    expect(readTitle).not.toHaveClass('notifications-title-unread')
  })

  it('formats the date column', async () => {
    renderPage()

    const row = await screen.findByText('Water maintenance on Friday').then((el) => el.closest('tr'))
    expect(within(row).getByText(/Aug 12, 2026/)).toBeInTheDocument()
  })

  it('shows a loading state while fetching', () => {
    http.get.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading notifications')
  })

  it('shows an API error state with retry', async () => {
    http.get.mockRejectedValue(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('retries after an error', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Temporary error'))
    renderPage()

    await screen.findByRole('button', { name: 'Try again' })
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Water maintenance on Friday')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/notifications')
  })

  it('shows an empty state when there are no notifications', async () => {
    mockList([])
    renderPage()

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })

  it('filters the list client-side by title or type', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Water maintenance on Friday')
    await user.type(screen.getByRole('searchbox'), 'faucet')

    expect(await screen.findByText('Request completed: Leaky faucet')).toBeInTheDocument()
    expect(screen.queryByText('Water maintenance on Friday')).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'maintenance')

    expect(await screen.findByText('Water maintenance on Friday')).toBeInTheDocument()
    expect(await screen.findByText('Request completed: Leaky faucet')).toBeInTheDocument()
  })

  it('shows the no-results state for a search with no matches', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Water maintenance on Friday')
    await user.type(screen.getByRole('searchbox'), 'zzz-no-match')

    expect(await screen.findByText('No matching notifications')).toBeInTheDocument()
  })

  it('marks a single notification as read and updates the row in place', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({
      data: { success: true, data: { id: 'n-2', readAt: '2026-08-14T08:00:00' } },
    })
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    const row = rowFor('Request completed: Leaky faucet')
    await user.click(within(row).getByRole('button', { name: 'Mark read' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/notifications/n-2/read')
    })
    await waitFor(() => {
      expect(within(rowFor('Request completed: Leaky faucet')).getByText('read')).toBeInTheDocument()
    })
    expect(
      within(rowFor('Request completed: Leaky faucet')).queryByRole('button', { name: 'Mark read' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('unread')).not.toBeInTheDocument()
  })

  it('keeps the row unread and shows an alert when marking fails', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({
      response: { data: { message: 'Notification not found' } },
    })
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    const row = rowFor('Request completed: Leaky faucet')
    await user.click(within(row).getByRole('button', { name: 'Mark read' }))

    expect(await screen.findByText('Notification not found')).toBeInTheDocument()
    expect(within(rowFor('Request completed: Leaky faucet')).getByText('unread')).toBeInTheDocument()
    expect(
      within(rowFor('Request completed: Leaky faucet')).getByRole('button', { name: 'Mark read' })
    ).toBeEnabled()
  })

  it('prevents double submissions while a mark-read request is pending', async () => {
    const user = userEvent.setup()
    let resolvePatch
    http.patch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = resolve
      })
    )
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    const row = rowFor('Request completed: Leaky faucet')
    const button = within(row).getByRole('button', { name: 'Mark read' })
    await user.click(button)

    expect(within(row).getByRole('button', { name: /Marking/ })).toBeDisabled()
    expect(http.patch).toHaveBeenCalledTimes(1)

    const otherRow = rowFor('Water maintenance on Friday')
    expect(within(otherRow).queryByRole('button', { name: 'Mark read' })).not.toBeInTheDocument()

    resolvePatch({ data: { success: true, data: { id: 'n-2', readAt: '2026-08-14T08:00:00' } } })
    expect(await within(rowFor('Request completed: Leaky faucet')).findByText('read')).toBeInTheDocument()
  })

  it('marks all notifications as read with one request and updates every row', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { updated: 1 } } })
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/notifications/read-all')
    })
    await waitFor(() => {
      expect(screen.queryByText('unread')).not.toBeInTheDocument()
    })
    expect(http.patch).not.toHaveBeenCalled()
  })

  it('disables mark-all when everything is already read', async () => {
    mockList([
      { ...notifications[0] },
      { ...notifications[1], readAt: '2026-08-13T11:00:00' },
    ])
    renderPage()

    expect(await screen.findByText('Water maintenance on Friday')).toBeInTheDocument()
    expect(screen.queryByText('unread')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })

  it('shows a pending label and disables mark-all while the request is in flight', async () => {
    const user = userEvent.setup()
    let resolvePost
    http.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve
      })
    )
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))

    expect(screen.getByRole('button', { name: /Marking/ })).toBeDisabled()
    resolvePost({ data: { success: true, data: { updated: 1 } } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
    })
    expect(screen.queryByText('unread')).not.toBeInTheDocument()
  })

  it('shows an alert when mark-all fails and keeps unread badges', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce(new Error('Network hiccup'))
    renderPage()

    await screen.findByText('Request completed: Leaky faucet')
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))

    expect(await screen.findByText('Network hiccup')).toBeInTheDocument()
    expect(screen.getByText('unread')).toBeInTheDocument()
  })
})
