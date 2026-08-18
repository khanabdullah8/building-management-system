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
import { formatDateTime } from '../../utils/formatters'
import VisitorModal from './VisitorModal'
import './VisitorsPage.css'

function VisitorsPage() {
  const [visitors, setVisitors] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingVisitor, setEditingVisitor] = useState(null)
  const [visitorToDelete, setVisitorToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [visitorToCheckout, setVisitorToCheckout] = useState(null)
  const [checkoutError, setCheckoutError] = useState(null)
  const [checkoutting, setCheckoutting] = useState(false)
  const [units, setUnits] = useState([])
  const [unitFilter, setUnitFilter] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    let isMounted = true
    http
      .get('/v1/units')
      .then((response) => {
        if (isMounted) setUnits(response.data?.data || [])
      })
      .catch(() => {})
      .finally(() => {})
    return () => { isMounted = false }
  }, [])

  const fetchVisitors = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (unitFilter) params.set('unit', unitFilter)
    const qs = params.toString()
    const url = qs ? `/v1/visitors?${qs}` : '/v1/visitors'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setVisitors(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch visitors.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, unitFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVisitors(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchVisitors])

  const handleModalSuccess = async (message) => {
    setEditingVisitor(null)
    setNotice({ type: 'success', message })
    await fetchVisitors(query)
  }

  const handleDelete = async () => {
    if (!visitorToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/visitors/${visitorToDelete.id}`)
      setVisitorToDelete(null)
      setNotice({ type: 'success', message: 'Visitor deleted successfully.' })
      await fetchVisitors(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete visitor. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const handleCheckout = async () => {
    if (!visitorToCheckout || checkoutting) return

    setCheckoutting(true)
    setCheckoutError(null)
    try {
      await http.patch(`/v1/visitors/${visitorToCheckout.id}`, {
        checkOutAt: new Date().toISOString(),
      })
      setVisitorToCheckout(null)
      setCheckoutError(null)
      setNotice({ type: 'success', message: `${visitorToCheckout.name} checked out successfully.` })
      await fetchVisitors(query)
    } catch (err) {
      setCheckoutError(err.message || 'Failed to check out visitor. Please try again.')
    } finally {
      setCheckoutting(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'phone', header: 'Phone', render: (value) => value || '—' },
    {
      key: 'unit',
      header: 'Unit',
      render: (_, visitor) => {
        const unit = visitor.unit
        if (!unit) return '—'
        const building = unit.building
        const buildingLabel = building
          ? (building.code ? `${building.name} (${building.code})` : building.name)
          : ''
        return buildingLabel ? `${buildingLabel} — ${unit.unitNumber}` : unit.unitNumber
      },
    },
    { key: 'purpose', header: 'Purpose', render: (value) => value || '—' },
    { key: 'checkInAt', header: 'Check In', render: (value) => formatDateTime(value) },
    {
      key: 'status',
      header: 'Status',
      render: (_, visitor) => {
        const isCheckedOut = visitor.checkOutAt != null
        return <Badge tone={isCheckedOut ? 'gray' : 'success'}>{isCheckedOut ? 'Checked Out' : 'Checked In'}</Badge>
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, visitor) => {
        const isCheckedOut = visitor.checkOutAt != null
        return (
          <div className="visitor-row-actions">
            {!isCheckedOut && (
              <button type="button" className="btn btn-secondary" onClick={() => { setVisitorToCheckout(visitor); setCheckoutError(null) }}>
                Checkout
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setEditingVisitor(visitor)}>
              Edit
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setVisitorToDelete(visitor)}>
              Delete
            </button>
          </div>
        )
      },
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading visitors…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchVisitors(query)} />
    if (visitors.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching visitors' : 'No visitors yet'}
          description={
            query.trim()
              ? `No visitors match "${query.trim()}".`
              : 'Register a visitor after adding units.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={visitors} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Visitors"
        description="Track visitor check-ins, check-outs and purpose of visits."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingVisitor({})}>
            Register Visitor
          </button>
        }
      />

      {notice && (
        <div className={`visitor-page-alert visitor-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search visitors…" />
        <select
          className="form-input visitor-unit-filter"
          value={unitFilter}
          onChange={(e) => setUnitFilter(e.target.value)}
          aria-label="Filter by unit"
        >
          <option value="">All units</option>
          {units.map((unit) => {
            const id = unit.id || unit._id
            const building = unit.building
            const label = building ? `${building.name} (${building.code}) — ${unit.unitNumber}` : unit.unitNumber
            return (
              <option key={id} value={id}>
                {label}
              </option>
            )
          })}
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingVisitor && (
        <VisitorModal
          isOpen
          visitor={editingVisitor.id ? editingVisitor : null}
          onClose={() => setEditingVisitor(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {visitorToDelete && (
        <Modal
          isOpen
          title="Delete Visitor"
          onClose={() => {
            if (!deleting) setVisitorToDelete(null)
          }}
        >
          <div className="delete-visitor-content">
            <p>
              Delete visitor &lsquo;<strong>{visitorToDelete.name}</strong>&rsquo;
              {visitorToDelete.unit?.unitNumber ? ` from unit ${visitorToDelete.unit.unitNumber}` : ''}?
            </p>
            <p className="delete-visitor-warning">
              This removes only the Visitor record. The Unit and Building will not be changed.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setVisitorToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Visitor'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {visitorToCheckout && (
        <Modal
          isOpen
          title="Check Out Visitor"
          onClose={() => {
            if (!checkoutting) { setVisitorToCheckout(null); setCheckoutError(null) }
          }}
        >
          <div className="delete-visitor-content">
            {checkoutError && (
              <div className="visitor-checkout-alert" role="alert">{checkoutError}</div>
            )}
            <p>
              Check out <strong>{visitorToCheckout.name}</strong>
              {visitorToCheckout.unit?.unitNumber ? ` from unit ${visitorToCheckout.unit.unitNumber}` : ''}?
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setVisitorToCheckout(null); setCheckoutError(null) }} disabled={checkoutting}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCheckout} disabled={checkoutting}>
                {checkoutting ? 'Checking out…' : 'Check Out'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default VisitorsPage
