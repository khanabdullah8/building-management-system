import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import http from '../../api/http'
import { statusTone } from '../../utils/status'
import { buildListParams } from '../../utils/queryParams'
import ComplaintModal from './ComplaintModal'
import './ComplaintsPage.css'

const PAGE_SIZE = 20

function ComplaintsPage() {
  const [complaints, setComplaints] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingComplaint, setEditingComplaint] = useState(null)
  const [complaintToDelete, setComplaintToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchComplaints = useCallback(async (searchTerm, pageNumber) => {
    const currentRequest = ++requestId.current
    const qs = buildListParams({ page: pageNumber, limit: PAGE_SIZE, search: searchTerm })
    const url = `/v1/complaints${qs ? `?${qs}` : ''}`

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setComplaints(response.data?.data || [])
        setTotalPages(response.data?.meta?.totalPages || 0)
        setTotal(response.data?.meta?.total || 0)
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch complaints.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchComplaints(query, 1)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchComplaints])

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return
    setPage(nextPage)
    fetchComplaints(query, nextPage)
  }

  const handleModalSuccess = async (message) => {
    setEditingComplaint(null)
    setNotice({ type: 'success', message })
    await fetchComplaints(query, page)
  }

  const handleDelete = async () => {
    if (!complaintToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/complaints/${complaintToDelete.id}`)
      setComplaintToDelete(null)
      setNotice({ type: 'success', message: 'Complaint deleted successfully.' })
      await fetchComplaints(query, page)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete complaint. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'subject', header: 'Subject' },
    {
      key: 'unit',
      header: 'Unit / Location',
      render: (_, complaint) => {
        if (complaint.unit) {
          const building = complaint.unit.building
          const buildingLabel = building
            ? (building.code ? `${building.name} (${building.code})` : building.name)
            : ''
          return buildingLabel ? `${buildingLabel} — ${complaint.unit.unitNumber}` : complaint.unit.unitNumber
        }
        return complaint.location ? `Common area / ${complaint.location}` : '—'
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, complaint) => (
        <div className="complaint-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingComplaint(complaint)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setComplaintToDelete(complaint)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading complaints…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchComplaints(query, page)} />
    if (complaints.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching complaints' : 'No complaints yet'}
          description={
            query.trim()
              ? `No complaints match "${query.trim()}".`
              : 'Create a complaint after adding units.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={complaints} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Complaints"
        description="Manage resident complaints and their resolution."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingComplaint({})}>
            New Complaint
          </button>
        }
      />

      {notice && (
        <div className={`complaint-page-alert complaint-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search complaints…" />
      </div>
      <div className="module-body">{renderBody()}</div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPageChange={handlePageChange}
      />

      {editingComplaint && (
        <ComplaintModal
          isOpen
          complaint={editingComplaint.id ? editingComplaint : null}
          onClose={() => setEditingComplaint(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {complaintToDelete && (
        <Modal
          isOpen
          title="Delete Complaint"
          onClose={() => {
            if (!deleting) setComplaintToDelete(null)
          }}
        >
          <div className="delete-complaint-content">
            <p>
              Delete complaint &lsquo;<strong>{complaintToDelete.subject}</strong>&rsquo;
              {complaintToDelete.unit?.unitNumber
                ? ` for unit ${complaintToDelete.unit.unitNumber}`
                : complaintToDelete.location
                  ? ` from ${complaintToDelete.location}`
                  : ''}
              ?
            </p>
            <p className="delete-complaint-warning">
              This removes only the Complaint record. The Unit and Building will not be changed.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setComplaintToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Complaint'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default ComplaintsPage
