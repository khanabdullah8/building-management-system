import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import UsersPage from './UsersPage'
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
  { id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights', status: 'active' },
  { id: 'building-2', code: 'BLD-B', name: 'Maple Residency', status: 'active' },
]

const residents = [
  {
    id: 'resident-1',
    name: 'Rita Resident',
    type: 'owner',
    status: 'active',
    unit: { id: 'unit-1', unitNumber: 'A-101', building: { id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights' } },
    account: { linked: true, userEmail: 'rita@bmms.test' },
  },
  {
    id: 'resident-2',
    name: 'Omar Occupant',
    type: 'tenant',
    status: 'active',
    unit: { id: 'unit-2', unitNumber: 'A-102', building: { id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights' } },
    account: { linked: false, userEmail: null },
  },
]

const users = [
  {
    id: 'user-admin',
    name: 'Ada Admin',
    email: 'ada@bmms.test',
    role: 'admin',
    status: 'active',
    buildings: [],
  },
  {
    id: 'user-staff',
    name: 'Sam Staffman',
    email: 'sam@bmms.test',
    role: 'staff',
    status: 'active',
    buildings: [{ id: 'building-1', code: 'BLD-A', name: 'Greenwood Heights' }],
  },
  {
    id: 'user-resident',
    name: 'Rita Resident',
    email: 'rita@bmms.test',
    role: 'resident',
    status: 'inactive',
    buildings: [],
    resident: {
      id: 'resident-1',
      name: 'Rita Resident',
      unit: { id: 'unit-1', unitNumber: 'A-101' },
    },
  },
  {
    id: 'user-unlinked',
    name: 'Ulla Unlinked',
    email: 'ulla@bmms.test',
    role: 'resident',
    status: 'active',
    buildings: [],
  },
  {
    id: 'user-unassigned',
    name: 'Ulla Unassigned',
    email: 'ullas@bmms.test',
    role: 'staff',
    status: 'active',
    buildings: [],
  },
]

function renderPage() {
  return render(<MemoryRouter><UsersPage /></MemoryRouter>)
}

function mockList(data = users) {
  http.get.mockImplementation((url) => {
    if (String(url).startsWith('/v1/buildings')) {
      return Promise.resolve({ data: { success: true, data: buildings } })
    }
    if (String(url).startsWith('/v1/residents')) {
      return Promise.resolve({ data: { success: true, data: residents } })
    }
    return Promise.resolve({ data: { success: true, data } })
  })
}

async function openEditFor(user, name) {
  await screen.findByText(name)
  const row = screen.getByText(name).closest('tr')
  await user.click(within(row).getByRole('button', { name: 'Edit' }))
}

describe('UsersPage admin user management', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) so unconsumed once-queued responses
    // can never leak from a failing test into the next one.
    vi.resetAllMocks()
    mockList()
  })

  it('renders users with roles and building names', async () => {
    renderPage()

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('Sam Staffman')).toBeInTheDocument()
    expect(screen.getByText('Rita Resident')).toBeInTheDocument()
    expect(screen.getByText('Greenwood Heights')).toBeInTheDocument()
    expect(screen.getByText('None assigned')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5)
  })

  it('shows linked-resident info in the buildings column for resident rows', async () => {
    renderPage()

    await screen.findByText('Ada Admin')
    const linkedRow = screen.getByText('Rita Resident').closest('tr')
    expect(within(linkedRow).getByText('Linked · A-101')).toBeInTheDocument()

    const unlinkedRow = screen.getByText('Ulla Unlinked').closest('tr')
    expect(within(unlinkedRow).getByText('No resident linked')).toBeInTheDocument()
  })

  it('shows a loading state while users are loading', () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/buildings')) return Promise.resolve({ data: { data: buildings } })
      return new Promise(() => {})
    })
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading users')
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

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/users?page=1&limit=20')
  })

  it('sends a search request and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.type(screen.getByRole('searchbox'), 'Sam')

    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/users?page=1&limit=20&search=Sam')
    })

    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => {
      expect(http.get).toHaveBeenLastCalledWith('/v1/users?page=1&limit=20')
    })
  })

  it('applies a role filter', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.selectOptions(screen.getByLabelText('Filter by role'), 'staff')

    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/users?page=1&limit=20&role=staff')
    })
  })

  it('applies a status filter combined with search', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.type(screen.getByRole('searchbox'), 'Rita')
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'inactive')

    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/users?page=1&limit=20&search=Rita&status=inactive')
    })
  })

  it('shows an empty state when no users exist', async () => {
    mockList([])
    renderPage()

    expect(await screen.findByText('No users yet')).toBeInTheDocument()
  })

  it('opens the New User modal with password field', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))

    expect(screen.getByRole('dialog', { name: 'New User' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument()
  })

  it('shows client-side validation errors before submitting', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('rejects a too-short password on create', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.type(screen.getByLabelText(/^Name/), 'Shorty')
    await user.type(screen.getByLabelText(/^Email/), 'short@bmms.test')
    await user.type(screen.getByLabelText(/^Password/), 'short')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('opens Edit for an existing user with prefilled values and no password field', async () => {
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Sam Staffman')

    expect(screen.getByRole('dialog', { name: 'Edit User' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Sam Staffman')
    expect(screen.getByLabelText(/^Email/)).toHaveValue('sam@bmms.test')
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument()
  })

  it('shows assigned buildings for staff in edit modal with current selections', async () => {
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Sam Staffman')

    expect(screen.getByText('Assigned Buildings')).toBeInTheDocument()
    const checked = screen.getByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ })
    expect(checked).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /BLD-B.{0,3}Maple Residency/ })).not.toBeChecked()
  })

  it('hides building assignment for admin and resident roles', async () => {
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Ada Admin')
    expect(screen.queryByText('Assigned Buildings')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await openEditFor(user, 'Rita Resident')
    expect(screen.queryByText('Assigned Buildings')).not.toBeInTheDocument()
  })

  it('shows building assignment when role changes to staff in create modal', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    expect(screen.queryByText('Assigned Buildings')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/^Role/), 'staff')
    expect(screen.getByText('Assigned Buildings')).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ })).toBeInTheDocument()
  })

  it('creates a staff user with building assignments and refreshes the list', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'user-new' } } })
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.type(screen.getByLabelText(/^Name/), 'Nina Newstaff')
    await user.type(screen.getByLabelText(/^Email/), 'nina@bmms.test')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    await user.selectOptions(screen.getByLabelText(/^Role/), 'staff')
    await screen.findByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ })
    await user.click(screen.getByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ }))
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/users', {
        name: 'Nina Newstaff',
        email: 'nina@bmms.test',
        password: 'password123',
        role: 'staff',
        status: 'active',
        buildings: ['building-1'],
      })
    })
    expect(await screen.findByText('User created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('omits building assignments from the payload for non-staff roles', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'user-new' } } })
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.type(screen.getByLabelText(/^Name/), 'Rob Newresident')
    await user.type(screen.getByLabelText(/^Email/), 'rob@bmms.test')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/users', {
        name: 'Rob Newresident',
        email: 'rob@bmms.test',
        password: 'password123',
        role: 'resident',
        status: 'active',
      })
    })
    expect(await screen.findByText('User created successfully.')).toBeInTheDocument()
  })

  it('updates staff building assignments and refreshes the list', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: users[1] } })
    renderPage()

    await openEditFor(user, 'Sam Staffman')
    await user.click(screen.getByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ }))
    await user.click(screen.getByRole('checkbox', { name: /BLD-B.{0,3}Maple Residency/ }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/users/user-staff', {
        name: 'Sam Staffman',
        email: 'sam@bmms.test',
        role: 'staff',
        status: 'active',
        buildings: ['building-2'],
      })
    })
    expect(await screen.findByText('User updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the edit modal open and displays an API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'A user with this email already exists' })
    renderPage()

    await openEditFor(user, 'Ada Admin')
    await user.clear(screen.getByLabelText(/^Email/))
    await user.type(screen.getByLabelText(/^Email/), 'sam@bmms.test')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit User' })).toBeInTheDocument()
  })

  it('prevents duplicate submissions while saving', async () => {
    const user = userEvent.setup()
    let resolvePatch
    http.patch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = resolve
      })
    )
    renderPage()

    await openEditFor(user, 'Sam Staffman')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled()

    resolvePatch({ data: { success: true, data: users[1] } })
    expect(await screen.findByText('User updated successfully.')).toBeInTheDocument()
    expect(http.patch).toHaveBeenCalledTimes(1)
  })

  it('deletes a user after confirmation and refreshes the list', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()

    await screen.findByText('Rita Resident')
    const row = screen.getByText('Rita Resident').closest('tr')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog', { name: 'Delete User' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete User' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/users/user-resident'))
    expect(await screen.findByText('User deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open and shows API errors', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Cannot delete your own account' })
    renderPage()

    await screen.findByText('Ada Admin')
    const row = screen.getByText('Ada Admin').closest('tr')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete User' }))

    expect(await screen.findByText('Cannot delete your own account')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete User' })).toBeInTheDocument()
  })

  it('cancels delete without calling the API', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Ada Admin')
    const row = screen.getByText('Ada Admin').closest('tr')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('shows an empty state inside the modal when no buildings exist', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/buildings')) {
        return Promise.resolve({ data: { success: true, data: [] } })
      }
      return Promise.resolve({ data: { success: true, data: users } })
    })
    renderPage()

    await openEditFor(userEvent.setup(), 'Sam Staffman')

    expect(await screen.findByText('No buildings available yet.')).toBeInTheDocument()
  })

  it('shows a loading state for the building list while it fetches', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/buildings')) return new Promise(() => {})
      return Promise.resolve({ data: { success: true, data: users } })
    })
    renderPage()

    await screen.findByText('Sam Staffman')
    const row = screen.getByText('Sam Staffman').closest('tr')
    const user = userEvent.setup()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(screen.getByText('Assigned Buildings')).toBeInTheDocument()
    expect(screen.getAllByText(/Loading buildings/)).not.toHaveLength(0)
  })

  it('shows a retry option when the building list fails to load', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/buildings')) {
        return Promise.reject(new Error('Buildings unavailable'))
      }
      return Promise.resolve({ data: { success: true, data: users } })
    })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Sam Staffman')
    const row = screen.getByText('Sam Staffman').closest('tr')
    await user.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByText('Buildings unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows the linked-resident selector with the current link preselected for resident users', async () => {
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Rita Resident')

    expect(screen.getByText('Linked Resident')).toBeInTheDocument()
    const select = screen.getByLabelText('Linked Resident')
    expect(select).toHaveValue('resident-1')
  })

  it('hides the linked-resident selector for staff and admin roles', async () => {
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Ada Admin')
    expect(screen.queryByText('Linked Resident')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await openEditFor(user, 'Sam Staffman')
    expect(screen.queryByText('Linked Resident')).not.toBeInTheDocument()
  })

  it('shows a loading state for the resident list while it fetches', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/residents')) return new Promise(() => {})
      return Promise.resolve({ data: { success: true, data: users } })
    })
    renderPage()

    await screen.findByText('Rita Resident')
    const row = screen.getByText('Rita Resident').closest('tr')
    const user = userEvent.setup()
    await user.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(screen.getByText('Linked Resident')).toBeInTheDocument()
    expect(screen.getAllByText(/Loading residents/)).not.toHaveLength(0)
  })

  it('shows a retry option when the resident list fails to load', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/residents')) {
        return Promise.reject(new Error('Residents unavailable'))
      }
      return Promise.resolve({ data: { success: true, data: users } })
    })
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Rita Resident')
    const row = screen.getByText('Rita Resident').closest('tr')
    await user.click(within(row).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByText('Residents unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows an empty state when no residents exist', async () => {
    http.get.mockImplementation((url) => {
      if (String(url).startsWith('/v1/residents')) {
        return Promise.resolve({ data: { success: true, data: [] } })
      }
      return Promise.resolve({ data: { success: true, data: users } })
    })
    const user = userEvent.setup()
    renderPage()

    await openEditFor(user, 'Rita Resident')

    expect(await screen.findByText('No residents available yet.')).toBeInTheDocument()
  })

  it('saves a new resident link and refreshes the list', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: users[3] } })
    renderPage()

    await openEditFor(user, 'Ulla Unlinked')
    await screen.findByLabelText('Linked Resident')
    await user.selectOptions(screen.getByLabelText('Linked Resident'), 'resident-2')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/users/user-unlinked', {
        name: 'Ulla Unlinked',
        email: 'ulla@bmms.test',
        role: 'resident',
        status: 'active',
        resident: 'resident-2',
      })
    })
    expect(await screen.findByText('User updated successfully.')).toBeInTheDocument()
  })

  it('clears the resident link by sending null on save', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: users[2] } })
    renderPage()

    await openEditFor(user, 'Rita Resident')
    await screen.findByLabelText('Linked Resident')
    await user.selectOptions(screen.getByLabelText('Linked Resident'), '')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/users/user-resident', {
        name: 'Rita Resident',
        email: 'rita@bmms.test',
        role: 'resident',
        status: 'inactive',
        resident: null,
      })
    })
    expect(await screen.findByText('User updated successfully.')).toBeInTheDocument()
  })

  it('keeps an unchanged resident link in the update payload', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: users[2] } })
    renderPage()

    await openEditFor(user, 'Rita Resident')
    await screen.findByLabelText('Linked Resident')
    await user.clear(screen.getByLabelText(/^Name/))
    await user.type(screen.getByLabelText(/^Name/), 'Rita R.')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/users/user-resident', {
        name: 'Rita R.',
        email: 'rita@bmms.test',
        role: 'resident',
        status: 'inactive',
        resident: 'resident-1',
      })
    })
  })

  it('includes the selected resident when creating a resident-role user', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'user-new' } } })
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.type(screen.getByLabelText(/^Name/), 'Nina Newresident')
    await user.type(screen.getByLabelText(/^Email/), 'nina@bmms.test')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    const select = await screen.findByLabelText('Linked Resident')
    await user.selectOptions(select, 'resident-2')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/users', {
        name: 'Nina Newresident',
        email: 'nina@bmms.test',
        password: 'password123',
        role: 'resident',
        status: 'active',
        resident: 'resident-2',
      })
    })
    expect(await screen.findByText('User created successfully.')).toBeInTheDocument()
  })

  it('omits the resident field from staff payloads entirely', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'user-new' } } })
    renderPage()

    await screen.findByText('Ada Admin')
    await user.click(screen.getByRole('button', { name: 'New User' }))
    await user.type(screen.getByLabelText(/^Name/), 'Nina Newstaff')
    await user.type(screen.getByLabelText(/^Email/), 'nina2@bmms.test')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    await user.selectOptions(screen.getByLabelText(/^Role/), 'staff')
    await screen.findByRole('checkbox', { name: /BLD-A.{0,3}Greenwood Heights/ })
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/users', {
        name: 'Nina Newstaff',
        email: 'nina2@bmms.test',
        password: 'password123',
        role: 'staff',
        status: 'active',
        buildings: [],
      })
    })
    expect(await screen.findByText('User created successfully.')).toBeInTheDocument()
  })
})
