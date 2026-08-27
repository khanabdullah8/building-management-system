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
import ResidentModal from './ResidentModal'
import '../../components/common/ModulePage.css'

const PAGE_SIZE = 20

function ResidentsPage() {
  const [residents, setResidents] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingResident, setEditingResident] = useState(null)
  const [residentToDelete, setResidentToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchResidents = useCallback(async (searchTerm, pageNumber) => {
    const currentRequest = ++requestId.current
    const qs = buildListParams({ page: pageNumber, limit: PAGE_SIZE, search: searchTerm })
    const url = `/v1/residents${qs ? `?${qs}` : ''}`

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setResidents(response.data?.data || [])
        setTotalPages(response.data?.meta?.totalPages || 0)
        setTotal(response.data?.meta?.total || 0)
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch residents.')
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
      fetchResidents(query, 1)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchResidents])

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return
    setPage(nextPage)
    fetchResidents(query, nextPage)
  }

  const handleModalSuccess = async (message) => {
    setEditingResident(null)
    setNotice({ type: 'success', message })
    await fetchResidents(query, page)
  }

  const handleDelete = async () => {
    if (!residentToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/residents/${residentToDelete.id}`)
      setResidentToDelete(null)
      setNotice({ type: 'success', message: 'Resident deleted successfully.' })
      await fetchResidents(query, page)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete resident. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'unit', header: 'Unit', render: (value) => value?.unitNumber || '—' },
    {
      key: 'building',
      header: 'Building',
      render: (_, resident) => {
        const building = resident.unit?.building
        if (!building) return '—'
        return building.code ? `${building.name} (${building.code})` : building.name
      },
    },
    { key: 'phone', header: 'Phone', render: (value) => value || '—' },
    {
      key: 'type',
      header: 'Ownership',
      render: (value) => <Badge tone={value === 'owner' ? 'info' : 'purple'}>{value}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'account',
      header: 'Account',
      render: (_, resident) => {
        if (resident.account?.linked) {
          return <span className="resident-account-linked">{resident.account.userEmail}</span>
        }
        return <span className="resident-account-none">No account</span>
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, resident) => (
        <div className="resident-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingResident(resident)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setResidentToDelete(resident)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading residents…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchResidents(query, page)} />
    if (residents.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching residents' : 'No residents yet'}
          description={
            query.trim()
              ? `No residents match "${query.trim()}".`
              : 'Create a resident after adding units.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={residents} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Residents"
        description="Manage resident profiles and occupancy."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingResident({})}>
            Add Resident
          </button>
        }
      />

      {notice && (
        <div className={`resident-page-alert resident-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search residents…" />
      </div>
      <div className="module-body">{renderBody()}</div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPageChange={handlePageChange}
      />

      {editingResident && (
        <ResidentModal
          isOpen
          resident={editingResident.id ? editingResident : null}
          onClose={() => setEditingResident(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {residentToDelete && (
        <Modal
          isOpen
          title="Delete Resident"
          onClose={() => {
            if (!deleting) setResidentToDelete(null)
          }}
        >
          <div className="delete-resident-content">
            <p>
              Delete <strong>{residentToDelete.name}</strong>
              {residentToDelete.unit?.unitNumber ? ` from unit ${residentToDelete.unit.unitNumber}` : ''}?
            </p>
            <p className="delete-resident-warning">
              This removes only the Resident record. The Unit and Building will not be changed.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setResidentToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Resident'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default ResidentsPage
