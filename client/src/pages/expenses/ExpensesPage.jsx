import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import { statusTone } from '../../utils/status'
import { formatCurrency, formatDate } from '../../utils/formatters'
import ExpenseModal from './ExpenseModal'
import './ExpensesPage.css'

function ExpensesPage() {
  const [expenses, setExpenses] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingExpense, setEditingExpense] = useState(null)
  const [expenseToDelete, setExpenseToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [buildingFilter, setBuildingFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    let isMounted = true
    http
      .get('/v1/buildings')
      .then((response) => {
        if (isMounted) setBuildings(response.data?.data || [])
      })
      .catch(() => {})
      .finally(() => {})
    return () => { isMounted = false }
  }, [])

  const fetchExpenses = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (buildingFilter) params.set('building', buildingFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (categoryFilter) params.set('category', categoryFilter)
    const qs = params.toString()
    const url = qs ? `/v1/expenses?${qs}` : '/v1/expenses'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setExpenses(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch expenses.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, buildingFilter, statusFilter, categoryFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchExpenses(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchExpenses])

  const handleModalSuccess = async (message) => {
    setEditingExpense(null)
    setNotice({ type: 'success', message })
    await fetchExpenses(query)
  }

  const handleDelete = async () => {
    if (!expenseToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/expenses/${expenseToDelete.id}`)
      setExpenseToDelete(null)
      setNotice({ type: 'success', message: 'Expense deleted successfully.' })
      await fetchExpenses(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete expense. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (value) => formatDate(value),
    },
    {
      key: 'category',
      header: 'Category',
      render: (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '—',
    },
    { key: 'description', header: 'Description', render: (value) => value || '—' },
    {
      key: 'amount',
      header: 'Amount',
      render: (value) => formatCurrency(value),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, expense) => (
        <div className="expense-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingExpense(expense)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setExpenseToDelete(expense)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading expenses…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchExpenses(query)} />
    if (expenses.length === 0) {
      return (
        <EmptyState
          title={query.trim() || buildingFilter || statusFilter || categoryFilter ? 'No matching expenses' : 'No expenses yet'}
          description={
            query.trim() || buildingFilter || statusFilter || categoryFilter
              ? 'No expenses match the current filters.'
              : 'Add an expense after adding buildings.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={expenses} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Expenses"
        description="Record and review building expenses."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingExpense({})}>
            Add Expense
          </button>
        }
      />

      {notice && (
        <div className={`expense-page-alert expense-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search expenses…" />
        <select
          className="form-input expense-building-filter"
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          aria-label="Filter by building"
        >
          <option value="">All buildings</option>
          {buildings.map((building) => {
            const id = building.id || building._id
            return (
              <option key={id} value={id}>
                {building.name} ({building.code})
              </option>
            )
          })}
        </select>
        <select
          className="form-input expense-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          className="form-input expense-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          <option value="maintenance">Maintenance</option>
          <option value="utilities">Utilities</option>
          <option value="housekeeping">Housekeeping</option>
          <option value="security">Security</option>
          <option value="landscaping">Landscaping</option>
          <option value="admin">Admin</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingExpense && (
        <ExpenseModal
          isOpen
          expense={editingExpense.id ? editingExpense : null}
          onClose={() => setEditingExpense(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {expenseToDelete && (
        <Modal
          isOpen
          title="Delete Expense"
          onClose={() => {
            if (!deleting) setExpenseToDelete(null)
          }}
        >
          <div className="delete-expense-content">
            <p>
              Delete expense &lsquo;<strong>{expenseToDelete.description || expenseToDelete.category}</strong>&rsquo;
              {expenseToDelete.building ? ` in ${expenseToDelete.building.name}` : ''}?
            </p>
            <p className="delete-expense-warning">
              This will permanently remove the expense record. The Building will not be affected.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setExpenseToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Expense'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default ExpensesPage
