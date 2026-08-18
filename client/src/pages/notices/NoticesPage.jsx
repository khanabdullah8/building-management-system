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
import { formatDate } from '../../utils/formatters'
import { statusTone } from '../../utils/status'
import NoticeModal from './NoticeModal'
import './NoticesPage.css'

function NoticesPage() {
  const [notices, setNotices] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingNotice, setEditingNotice] = useState(null)
  const [noticeToDelete, setNoticeToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [buildingFilter, setBuildingFilter] = useState('')
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

  const fetchNotices = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (buildingFilter) params.set('building', buildingFilter)
    const qs = params.toString()
    const url = qs ? `/v1/notices?${qs}` : '/v1/notices'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setNotices(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch notices.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, buildingFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNotices(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchNotices])

  const handleModalSuccess = async (message) => {
    setEditingNotice(null)
    setNotice({ type: 'success', message })
    await fetchNotices(query)
  }

  const handleDelete = async () => {
    if (!noticeToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/notices/${noticeToDelete.id}`)
      setNoticeToDelete(null)
      setNotice({ type: 'success', message: 'Notice deleted successfully.' })
      await fetchNotices(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete notice. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'title', header: 'Title' },
    {
      key: 'category',
      header: 'Category',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'building',
      header: 'Audience',
      render: (value) => {
        if (!value) return 'All residents'
        return value.code ? `${value.name} (${value.code})` : value.name
      },
    },
    { key: 'publishedAt', header: 'Published', render: (value) => formatDate(value) },
    { key: 'expiresAt', header: 'Expires', render: (value) => formatDate(value) },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, row) => (
        <div className="notice-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingNotice(row)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setNoticeToDelete(row)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading notices…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchNotices(query)} />
    if (notices.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching notices' : 'No notices yet'}
          description={
            query.trim()
              ? `No notices match "${query.trim()}".`
              : 'Create a notice to announce events or updates.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={notices} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Notices"
        description="Publish notices and announcements to residents."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingNotice({})}>
            New Notice
          </button>
        }
      />

      {notice && (
        <div className={`notice-page-alert notice-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search notices…" />
        <select
          className="form-input notice-building-filter"
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          aria-label="Filter by building"
        >
          <option value="">All buildings</option>
          {buildings.map((building) => {
            const id = building.id || building._id
            return (
              <option key={id} value={id}>
                {building.code ? `${building.name} (${building.code})` : building.name}
              </option>
            )
          })}
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingNotice && (
        <NoticeModal
          isOpen
          notice={editingNotice.id ? editingNotice : null}
          onClose={() => setEditingNotice(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {noticeToDelete && (
        <Modal
          isOpen
          title="Delete Notice"
          onClose={() => {
            if (!deleting) setNoticeToDelete(null)
          }}
        >
          <div className="delete-notice-content">
            <p>
              Delete notice &lsquo;<strong>{noticeToDelete.title}</strong>&rsquo;?
            </p>
            <p className="delete-notice-warning">
              This removes only the Notice. The Building will not be changed.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setNoticeToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Notice'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default NoticesPage
