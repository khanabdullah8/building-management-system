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
import BillingModal from './BillingModal'
import './BillingPage.css'

function BillingPage() {
  const [bills, setBills] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingBill, setEditingBill] = useState(null)
  const [billToDelete, setBillToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [buildingFilter, setBuildingFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    let isMounted = true
    http
      .get('/v1/buildings')
      .then((response) => {
        if (isMounted) setBuildings(response.data?.data || [])
      })
      .catch(() => {})
    return () => { isMounted = false }
  }, [])

  const fetchBills = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (buildingFilter) params.set('building', buildingFilter)
    if (statusFilter) params.set('status', statusFilter)
    const qs = params.toString()
    const url = qs ? `/v1/billing?${qs}` : '/v1/billing'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setBills(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch bills.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, buildingFilter, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBills(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchBills])

  const handleModalSuccess = async (message) => {
    setEditingBill(null)
    setNotice({ type: 'success', message })
    await fetchBills(query)
  }

  const handleDelete = async () => {
    if (!billToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/billing/${billToDelete.id}`)
      setBillToDelete(null)
      setNotice({ type: 'success', message: 'Bill deleted successfully.' })
      await fetchBills(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete bill. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'billNo',
      header: 'Bill No',
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (_, bill) => {
        const unit = bill.unit
        if (!unit) return '—'
        const building = unit.building
        return building ? `${unit.unitNumber} (${building.name})` : unit.unitNumber
      },
    },
    {
      key: 'period',
      header: 'Period',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value) => formatCurrency(value),
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (value) => formatDate(value),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, bill) => (
        <div className="billing-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingBill(bill)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setBillToDelete(bill)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading bills…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchBills(query)} />
    if (bills.length === 0) {
      return (
        <EmptyState
          title={query.trim() || buildingFilter || statusFilter ? 'No matching bills' : 'No bills yet'}
          description={
            query.trim() || buildingFilter || statusFilter
              ? 'No bills match the current filters.'
              : 'Create a bill to start tracking dues.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={bills} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Billing"
        description="Generate maintenance bills and manage dues."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingBill({})}>
            Create Bill
          </button>
        }
      />

      {notice && (
        <div className={`billing-page-alert billing-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search bills…" />
        <select
          className="form-input billing-building-filter"
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
          className="form-input billing-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingBill && (
        <BillingModal
          isOpen
          bill={editingBill.id ? editingBill : null}
          onClose={() => setEditingBill(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {billToDelete && (
        <Modal
          isOpen
          title="Delete Bill"
          onClose={() => {
            if (!deleting) setBillToDelete(null)
          }}
        >
          <div className="delete-billing-content">
            <p>
              Delete bill &lsquo;<strong>{billToDelete.billNo}</strong>&rsquo;
              {billToDelete.unit?.building ? ` for ${billToDelete.unit.unitNumber} (${billToDelete.unit.building.name})` : ''}?
            </p>
            <p className="delete-billing-warning">
              This will permanently remove the bill record.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBillToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Bill'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default BillingPage
