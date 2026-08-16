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
import MaintenanceModal from './MaintenanceModal'
import '../../components/common/ModulePage.css'

function MaintenancePage() {
  const [requests, setRequests] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingRequest, setEditingRequest] = useState(null)
  const [requestToDelete, setRequestToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchRequests = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const url = trimmedSearch
      ? `/v1/maintenance?search=${encodeURIComponent(trimmedSearch)}`
      : '/v1/maintenance'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setRequests(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch maintenance requests.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchRequests])

  const handleModalSuccess = async (message) => {
    setEditingRequest(null)
    setNotice({ type: 'success', message })
    await fetchRequests(query)
  }

  const handleDelete = async () => {
    if (!requestToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/maintenance/${requestToDelete.id}`)
      setRequestToDelete(null)
      setNotice({ type: 'success', message: 'Maintenance request deleted successfully.' })
      await fetchRequests(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete maintenance request. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'title', header: 'Title' },
    { key: 'unit', header: 'Unit', render: (value) => value?.unitNumber || '—' },
    {
      key: 'building',
      header: 'Building',
      render: (_, request) => {
        const building = request.unit?.building
        if (!building) return '—'
        return building.code ? `${building.name} (${building.code})` : building.name
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    { key: 'assignedTo', header: 'Assigned To', render: (value) => value || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, request) => (
        <div className="maintenance-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingRequest(request)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setRequestToDelete(request)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading maintenance requests…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchRequests(query)} />
    if (requests.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching requests' : 'No maintenance requests yet'}
          description={
            query.trim()
              ? `No requests match "${query.trim()}".`
              : 'Create a request after adding units.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={requests} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Maintenance"
        description="Track maintenance requests, priorities and assignments."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingRequest({})}>
            New Request
          </button>
        }
      />

      {notice && (
        <div className={`maintenance-page-alert maintenance-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search maintenance…" />
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingRequest && (
        <MaintenanceModal
          isOpen
          request={editingRequest.id ? editingRequest : null}
          onClose={() => setEditingRequest(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {requestToDelete && (
        <Modal
          isOpen
          title="Delete Request"
          onClose={() => {
            if (!deleting) setRequestToDelete(null)
          }}
        >
          <div className="delete-maintenance-content">
            <p>
              Delete maintenance request &lsquo;<strong>{requestToDelete.title}</strong>&rsquo;
              {requestToDelete.unit?.unitNumber ? ` for unit ${requestToDelete.unit.unitNumber}` : ''}?
            </p>
            <p className="delete-maintenance-warning">
              This removes only the Maintenance request. The Unit and Building will not be changed.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRequestToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Request'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default MaintenancePage
