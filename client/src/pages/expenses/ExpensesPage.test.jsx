import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ExpensesPage from './ExpensesPage'
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

const expenses = [
  {
    id: 'exp-1', category: 'utilities', description: 'Electricity bill', amount: 18400,
    date: '2026-08-10', status: 'pending', building: buildings[0],
  },
  {
    id: 'exp-2', category: 'maintenance', description: 'Lift AMC renewal', amount: 25000,
    date: '2026-08-08', status: 'approved', building: buildings[0],
  },
  {
    id: 'exp-3', category: 'housekeeping', description: 'Cleaning supplies', amount: 6400,
    date: '2026-08-05', status: 'rejected', building: buildings[1],
  },
]

function renderPage() {
  return render(<MemoryRouter><ExpensesPage /></MemoryRouter>)
}

function mockList(data = expenses) {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockDropdowns() {
  http.get.mockImplementation((url) => {
    if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
    return Promise.resolve({ data: { success: true, data: expenses } })
  })
}

async function waitForModal(name) {
  const dialog = await screen.findByRole('dialog', { name })
  return within(dialog)
}

describe('ExpensesPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders expenses with populated Building data', async () => {
    renderPage()

    expect(await screen.findByText('Electricity bill')).toBeInTheDocument()
    expect(screen.getAllByText('Greenwood Heights (BLD-A)').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('$18,400.00')).toBeInTheDocument()
  })

  it('renders category with first letter capitalized', async () => {
    renderPage()
    await screen.findByText('Electricity bill')
    expect(screen.getByText('Utilities', { selector: 'td' })).toBeInTheDocument()
  })

  it('renders "—" for empty description', async () => {
    mockList([{ ...expenses[0], description: '' }])
    renderPage()
    await screen.findByText('Utilities', { selector: 'td' })
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('renders status badges with correct tones', async () => {
    renderPage()
    await screen.findByText('Electricity bill')
    expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('approved').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('rejected').length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading state', async () => {
    http.get.mockReturnValueOnce(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading expenses')
  })

  it('shows an API error and retries the current request', async () => {
    const user = userEvent.setup()
    http.get
      .mockRejectedValueOnce(new Error('Buildings fetch failed'))
      .mockRejectedValueOnce(new Error('Unable to reach the server'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Electricity bill')).toBeInTheDocument()
    expect(http.get).toHaveBeenCalledWith('/v1/expenses')
  })

  it('uses server-side search and restores the full list when cleared', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Electricity bill')
    await user.type(screen.getByRole('searchbox'), 'electricity')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/expenses?search=electricity'))
    await user.clear(screen.getByRole('searchbox'))
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/v1/expenses'))
  })

  it('shows empty state when no expenses exist', async () => {
    mockList([])
    renderPage()
    expect(await screen.findByText('No expenses yet')).toBeInTheDocument()
    expect(screen.getByText(/Add an expense after adding buildings/i)).toBeInTheDocument()
  })

  it('shows a no-search-results state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Electricity bill')
    http.get.mockImplementation((url) => {
      if (url === '/v1/expenses?search=unknown') return Promise.resolve({ data: { success: true, data: [] } })
      if (url === '/v1/buildings') return Promise.resolve({ data: { success: true, data: buildings } })
      return Promise.resolve({ data: { success: true, data: expenses } })
    })
    await user.type(screen.getByRole('searchbox'), 'unknown')
    expect(await screen.findByText('No matching expenses')).toBeInTheDocument()
  })

  it('filters by building using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Electricity bill')
    await user.selectOptions(screen.getByLabelText('Filter by building'), 'building-1')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/expenses?building=building-1'))
  })

  it('filters by status using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Electricity bill')
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'pending')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/expenses?status=pending'))
  })

  it('filters by category using the toolbar dropdown', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Electricity bill')
    await user.selectOptions(screen.getByLabelText('Filter by category'), 'utilities')
    await waitFor(() => expect(http.get).toHaveBeenCalledWith('/v1/expenses?category=utilities'))
  })

  it('opens Add Expense modal and loads Building options', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith('/v1/buildings')
    })
    expect(await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })).toBeInTheDocument()
    expect(await dialog.findByRole('option', { name: 'Maple Residency (BLD-B)' })).toBeInTheDocument()
  })

  it('does not show Status field on create modal', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    expect(dialog.queryByLabelText(/^Status/)).not.toBeInTheDocument()
  })

  it('validates required Category, Building, Amount, and Date before creating', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.click(dialog.getByRole('button', { name: 'Add Expense' }))

    expect(await dialog.findByText('Please select a category')).toBeInTheDocument()
    expect(dialog.getByText('Please select a building')).toBeInTheDocument()
    expect(dialog.getByText('Amount is required')).toBeInTheDocument()
    expect(dialog.getByText('Date is required')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('validates amount must be greater than 0', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.selectOptions(dialog.getByLabelText(/^Category/), 'utilities')
    await user.selectOptions(dialog.getByLabelText(/^Building/), 'building-1')
    await user.type(dialog.getByLabelText(/^Amount/), '0')
    await user.type(dialog.getByLabelText(/^Date/), '2026-08-10')
    await user.click(dialog.getByRole('button', { name: 'Add Expense' }))

    expect(await dialog.findByText('Amount must be greater than 0')).toBeInTheDocument()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('creates an expense and refreshes', async () => {
    const user = userEvent.setup()
    http.post.mockResolvedValueOnce({ data: { success: true, data: { id: 'exp-4' } } })
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.selectOptions(dialog.getByLabelText(/^Category/), 'utilities')
    await user.selectOptions(dialog.getByLabelText(/^Building/), 'building-1')
    await user.type(dialog.getByLabelText(/^Amount/), '5000')
    await user.type(dialog.getByLabelText(/^Date/), '2026-08-15')
    await user.type(dialog.getByLabelText(/^Description/), 'Water bill')
    await user.click(dialog.getByRole('button', { name: 'Add Expense' }))

    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/v1/expenses', expect.objectContaining({
      category: 'utilities', building: 'building-1', amount: 5000,
    })))
    expect(await screen.findByText('Expense created successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the create modal open on API error', async () => {
    const user = userEvent.setup()
    http.post.mockRejectedValueOnce({ message: 'Referenced building does not exist' })
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getByRole('button', { name: 'Add Expense' }))

    const dialog = await waitForModal('Add Expense')
    await dialog.findByRole('option', { name: 'Greenwood Heights (BLD-A)' })
    await user.selectOptions(dialog.getByLabelText(/^Category/), 'utilities')
    await user.selectOptions(dialog.getByLabelText(/^Building/), 'building-1')
    await user.type(dialog.getByLabelText(/^Amount/), '5000')
    await user.type(dialog.getByLabelText(/^Date/), '2026-08-10')
    await user.click(dialog.getByRole('button', { name: 'Add Expense' }))

    expect(await screen.findByText('Referenced building does not exist')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Add Expense' })).toBeInTheDocument()
  })

  it('opens edit with existing expense values', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Expense')
    expect(dialog.getByLabelText(/^Category/)).toHaveValue('utilities')
    expect(dialog.getByLabelText(/^Amount/)).toHaveValue(18400)
    expect(dialog.getByLabelText(/^Description/)).toHaveValue('Electricity bill')
    expect(dialog.getByLabelText(/^Status/)).toHaveValue('pending')
    expect(dialog.getByLabelText(/^Building/)).toHaveValue('Greenwood Heights (BLD-A)')
  })

  it('shows building as read-only in edit modal', async () => {
    const user = userEvent.setup()
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Expense')
    const buildingInput = dialog.getByLabelText(/^Building/)
    expect(buildingInput).toBeDisabled()
    expect(buildingInput.value).toContain('Greenwood Heights')
  })

  it('updates an expense and refreshes', async () => {
    const user = userEvent.setup()
    http.patch.mockResolvedValueOnce({ data: { success: true, data: expenses[0] } })
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Expense')
    expect(dialog.getByLabelText(/^Building/)).toHaveValue('Greenwood Heights (BLD-A)')
    await user.selectOptions(dialog.getByLabelText(/^Status/), 'approved')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(http.patch).toHaveBeenCalledWith('/v1/expenses/exp-1', expect.objectContaining({ status: 'approved' })))
    expect(await screen.findByText('Expense updated successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps edit modal open on API error', async () => {
    const user = userEvent.setup()
    http.patch.mockRejectedValueOnce({ message: 'Expense not found' })
    renderPage()
    mockDropdowns()

    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])

    const dialog = await waitForModal('Edit Expense')
    expect(dialog.getByLabelText(/^Building/)).toHaveValue('Greenwood Heights (BLD-A)')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Expense not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit Expense' })).toBeInTheDocument()
  })

  it('shows delete confirmation with description and building name', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(screen.getByRole('dialog', { name: 'Delete Expense' })).toHaveTextContent('Electricity bill')
    expect(screen.getByRole('dialog', { name: 'Delete Expense' })).toHaveTextContent('Greenwood Heights')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(http.delete).not.toHaveBeenCalled()
  })

  it('deletes an expense and refreshes', async () => {
    const user = userEvent.setup()
    http.delete.mockResolvedValueOnce({ data: { success: true } })
    renderPage()
    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Expense' }))

    await waitFor(() => expect(http.delete).toHaveBeenCalledWith('/v1/expenses/exp-1'))
    expect(await screen.findByText('Expense deleted successfully.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps delete confirmation open on API failure', async () => {
    const user = userEvent.setup()
    http.delete.mockRejectedValueOnce({ message: 'Expense not found' })
    renderPage()
    await screen.findByText('Electricity bill')
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Delete Expense' }))

    expect(await screen.findByText('Expense not found')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete Expense' })).toBeInTheDocument()
  })
})
