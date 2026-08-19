import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PaymentsPage from './PaymentsPage'
import http from '../../api/http'

vi.mock('../../api/http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const bills = [
  {
    id: 'bill-1', billNo: 'BILL-001', period: 'Jan 2026', amount: 5000, status: 'pending',
    unit: { id: 'unit-1', unitNumber: '101', building: { id: 'building-1', name: 'Greenwood Heights', code: 'BLD-A' } },
  },
  {
    id: 'bill-2', billNo: 'BILL-002', period: 'Feb 2026', amount: 3500, status: 'overdue',
    unit: { id: 'unit-2', unitNumber: '202', building: { id: 'building-2', name: 'Maple Residency', code: 'BLD-B' } },
  },
]

const payments = [
  {
    id: 'pay-1', paymentNo: 'PAY-001', amount: 5000, method: 'upi', status: 'completed',
    paidAt: '2026-01-15', reference: 'TXN-001', notes: '',
    bill: bills[0],
  },
  {
    id: 'pay-2', paymentNo: 'PAY-002', amount: 3500, method: 'cash', status: 'pending',
    paidAt: '2026-01-10', reference: '', notes: 'Partial',
    bill: bills[1],
  },
]

function renderPage() {
  return render(<MemoryRouter><PaymentsPage /></MemoryRouter>)
}

function mockList(data = payments) {
  http.get.mockImplementation(() => {
    return Promise.resolve({ data: { success: true, data } })
  })
}

function mockDropdowns() {
  http.get.mockImplementation((url) => {
    if (url.includes('/v1/billing')) return Promise.resolve({ data: { success: true, data: bills } })
    return Promise.resolve({ data: { success: true, data: payments } })
  })
}

async function waitForModal(title) {
  const dialog = await screen.findByRole('dialog', { name: title })
  return within(dialog)
}

describe('PaymentsPage CRUD functionality', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('renders payments with populated Bill, Unit and Building data', async () => {
    renderPage()
    expect(await screen.findByText('PAY-001')).toBeInTheDocument()
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('renders bill number and unit in table', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    expect(screen.getByText('BILL-001')).toBeInTheDocument()
    expect(screen.getAllByText(/Greenwood Heights/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows loading state', async () => {
    http.get.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/Loading payments/i)).toBeInTheDocument()
  })

  it('shows error state with retry', async () => {
    http.get.mockRejectedValue(new Error('Network error'))
    renderPage()
    expect(await screen.findByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })

  it('retries fetch on retry click', async () => {
    http.get.mockRejectedValueOnce(new Error('fail'))
    http.get.mockResolvedValueOnce({ data: { success: true, data: payments } })
    renderPage()
    await screen.findByText('fail')
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }))
    await waitFor(() => {
      expect(screen.getByText('PAY-001')).toBeInTheDocument()
    })
  })

  it('shows empty state when no payments exist', async () => {
    mockList([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/No payments yet/)).toBeInTheDocument()
    })
  })

  it('shows filtered empty state', async () => {
    mockList([])
    renderPage()
    await screen.findByText(/No payments yet/)
    const searchInput = screen.getByPlaceholderText(/Search payments/i)
    await userEvent.type(searchInput, 'foo')
    await waitFor(() => {
      expect(screen.getByText(/No matching payments/)).toBeInTheDocument()
    })
  })

  it('opens create modal on button click', async () => {
    mockDropdowns()
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.click(screen.getByRole('button', { name: /Record Payment/i }))
    await waitForModal('Record Payment')
  })

  it('validates required fields in create modal', async () => {
    mockDropdowns()
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.click(screen.getByRole('button', { name: /Record Payment/i }))
    const dialog = await waitForModal('Record Payment')
    await userEvent.click(dialog.getByRole('button', { name: /Record Payment/i }))
    expect(await dialog.findByText(/Please select a bill/)).toBeInTheDocument()
  })

  it('creates payment successfully', async () => {
    mockDropdowns()
    http.post.mockResolvedValue({ data: { success: true, data: {} } })
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.click(screen.getByRole('button', { name: /Record Payment/i }))
    const dialog = await waitForModal('Record Payment')
    await userEvent.selectOptions(dialog.getByLabelText(/Bill/i), 'bill-1')
    await userEvent.clear(dialog.getByLabelText(/Amount/i))
    await userEvent.type(dialog.getByLabelText(/Amount/i), '5000')
    await userEvent.selectOptions(dialog.getByLabelText(/Method/i), 'upi')
    await userEvent.click(dialog.getByRole('button', { name: /Record Payment/i }))
    await waitFor(() => {
      expect(http.post).toHaveBeenCalledWith('/v1/payments', expect.objectContaining({ amount: 5000 }))
    })
  })

  it('shows API error on create', async () => {
    mockDropdowns()
    http.post.mockRejectedValue({ response: { data: { message: 'Bill not found' } }, message: 'Bill not found' })
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.click(screen.getByRole('button', { name: /Record Payment/i }))
    const dialog = await waitForModal('Record Payment')
    await userEvent.selectOptions(dialog.getByLabelText(/Bill/i), 'bill-1')
    await userEvent.clear(dialog.getByLabelText(/Amount/i))
    await userEvent.type(dialog.getByLabelText(/Amount/i), '5000')
    await userEvent.selectOptions(dialog.getByLabelText(/Method/i), 'upi')
    await userEvent.click(dialog.getByRole('button', { name: /Record Payment/i }))
    expect(await dialog.findByText('Bill not found')).toBeInTheDocument()
  })

  it('opens edit modal with read-only fields', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    await userEvent.click(editButtons[0])
    const dialog = await waitForModal('Edit Payment')
    expect(dialog.getByLabelText(/Payment No/)).toBeDisabled()
    expect(dialog.getByLabelText(/Bill/)).toBeDisabled()
  })

  it('updates payment successfully', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    await userEvent.click(editButtons[0])
    const dialog = await waitForModal('Edit Payment')
    http.patch.mockResolvedValue({ data: { success: true, data: {} } })
    await userEvent.click(dialog.getByRole('button', { name: /Save Changes/i }))
    await waitFor(() => {
      expect(http.patch).toHaveBeenCalledWith('/v1/payments/pay-1', expect.any(Object))
    })
  })

  it('shows API error on edit', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const editButtons = screen.getAllByRole('button', { name: /Edit/i })
    await userEvent.click(editButtons[0])
    const dialog = await waitForModal('Edit Payment')
    http.patch.mockRejectedValue({ response: { data: { message: 'Update failed' } }, message: 'Update failed' })
    await userEvent.click(dialog.getByRole('button', { name: /Save Changes/i }))
    expect(await dialog.findByText('Update failed')).toBeInTheDocument()
  })

  it('opens delete confirmation', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    await userEvent.click(deleteButtons[0])
    const dialog = await screen.findByRole('dialog', { name: /Delete Payment/ })
    expect(within(dialog).getByText(/PAY-001/)).toBeInTheDocument()
  })

  it('deletes payment successfully', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    await userEvent.click(deleteButtons[0])
    http.delete.mockResolvedValue({ data: { success: true } })
    await userEvent.click(screen.getByRole('button', { name: /Delete Payment/i }))
    await waitFor(() => {
      expect(http.delete).toHaveBeenCalledWith('/v1/payments/pay-1')
    })
  })

  it('shows API error on delete', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    await userEvent.click(deleteButtons[0])
    http.delete.mockRejectedValue({ message: 'Delete failed' })
    await userEvent.click(screen.getByRole('button', { name: /Delete Payment/i }))
    expect(await screen.findByText('Delete failed')).toBeInTheDocument()
  })

  it('searches payments', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    const searchInput = screen.getByPlaceholderText(/Search payments/i)
    await userEvent.type(searchInput, 'PAY-002')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('search=PAY-002'))
    })
  })

  it('filters by status', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.selectOptions(screen.getByLabelText(/Filter by status/i), 'completed')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('status=completed'))
    })
  })

  it('filters by method', async () => {
    renderPage()
    await screen.findByText('PAY-001')
    await userEvent.selectOptions(screen.getByLabelText(/Filter by method/i), 'upi')
    await waitFor(() => {
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('method=upi'))
    })
  })
})
