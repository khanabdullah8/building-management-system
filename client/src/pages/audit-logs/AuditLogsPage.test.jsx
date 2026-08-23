import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AuditLogsPage from './AuditLogsPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const logs = [
  {
    id: 'a-1',
    actorId: 'user-1',
    actorName: 'Alice Admin',
    actorRole: 'admin',
    action: 'created',
    module: 'building',
    resourceId: 'b-1',
    resourceLabel: 'BLD-C',
    buildingId: 'b-1',
    buildingName: 'Cedar Court',
    createdAt: '2026-08-20T10:15:00',
  },
  {
    id: 'a-2',
    actorId: 'user-2',
    actorName: 'Sam Staff',
    actorRole: 'staff',
    action: 'updated',
    module: 'maintenance',
    resourceId: 'm-7',
    resourceLabel: 'Leaky faucet',
    buildingId: 'b-1',
    buildingName: 'Cedar Court',
    createdAt: '2026-08-21T08:00:00',
  },
  {
    id: 'a-3',
    actorId: 'user-1',
    actorName: 'Alice Admin',
    actorRole: 'admin',
    action: 'deleted',
    module: 'notice',
    resourceId: 'n-3',
    resourceLabel: 'Pool closed',
    buildingId: null,
    buildingName: '',
    createdAt: '2026-08-22T16:45:00',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditLogsPage />
    </MemoryRouter>
  )
}

function mockList(data = logs) {
  http.get.mockResolvedValue({ data: { success: true, data } })
}

function rowFor(text) {
  return screen.getByText(text).closest('tr')
}

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders fetched audit events with actor and resource columns', async () => {
    renderPage()

    expect(await screen.findByText('BLD-C')).toBeInTheDocument()
    expect(screen.getByText('Leaky faucet')).toBeInTheDocument()
    expect(screen.getByText('Pool closed')).toBeInTheDocument()
    expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0)
  })

  it('renders action badges for created, updated, and deleted', async () => {
    renderPage()

    const createdRow = await screen.findByText('BLD-C').then((el) => el.closest('tr'))
    expect(within(createdRow).getByText('created')).toHaveClass('tone-success')

    const updatedRow = rowFor('Leaky faucet')
    expect(within(updatedRow).getByText('updated')).toHaveClass('tone-warning')

    const deletedRow = rowFor('Pool closed')
    expect(within(deletedRow).getByText('deleted')).toHaveClass('tone-danger')
  })

  it('formats the timestamp column', async () => {
    renderPage()

    const row = await screen.findByText('BLD-C').then((el) => el.closest('tr'))
    expect(row.textContent).toMatch(/Aug 20, 2026/)
  })

  it('shows a dash for events without a building', async () => {
    renderPage()

    const globalRow = await screen.findByText('Pool closed').then((el) => el.closest('tr'))
    expect(globalRow.textContent).toContain('—')
  })

  it('shows a loading state while fetching', () => {
    http.get.mockImplementation(() => new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading audit logs')
  })

  it('shows an API error state with retry', async () => {
    http.get.mockRejectedValue(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('retries after an error', async () => {
    const user = userEvent.setup()
    http.get.mockRejectedValueOnce(new Error('Temporary error'))
    renderPage()

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('BLD-C')).toBeInTheDocument()
  })

  it('shows an empty state when there is no audit activity', async () => {
    mockList([])
    renderPage()

    expect(await screen.findByText('No audit activity yet')).toBeInTheDocument()
  })

  it('filters rows client-side via the search box', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('Leaky faucet')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/search/i), 'Leaky')

    await waitFor(() => {
      expect(screen.queryByText('BLD-C')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Leaky faucet')).toBeInTheDocument()
  })

  it('shows a filtered empty state when search matches nothing', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('BLD-C')
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz-no-match')

    expect(await screen.findByText('No matching audit logs')).toBeInTheDocument()
  })

  it('requests the selected module as a query param', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('BLD-C')
    await user.selectOptions(screen.getByLabelText('Filter by module'), 'maintenance')

    await waitFor(() => {
      const lastCall = http.get.mock.calls[http.get.mock.calls.length - 1][0]
      expect(lastCall).toContain('module=maintenance')
    })
  })

  it('requests the selected action as a query param', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('BLD-C')
    await user.selectOptions(screen.getByLabelText('Filter by action'), 'deleted')

    await waitFor(() => {
      const lastCall = http.get.mock.calls[http.get.mock.calls.length - 1][0]
      expect(lastCall).toContain('action=deleted')
    })
  })
})
