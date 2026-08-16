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
import ResidentModal from './ResidentModal'
import '../../components/common/ModulePage.css'

function ResidentsPage() {
  const [residents, setResidents] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingResident, setEditingResident] = useState(null)
  const [residentToDelete, setResidentToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchResidents = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const url = trimmedSearch
      ? `/v1/residents?search=${encodeURIComponent(trimmedSearch)}`
      : '/v1/residents'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setResidents(response.data?.data || [])
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
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResidents(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchResidents])

  const handleModalSuccess = async (message) => {
    setEditingResident(null)
    setNotice({ type: 'success', message })
    await fetchResidents(query)
  }

  const handleDelete = async () => {
    if (!residentToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/residents/${residentToDelete.id}`)
      setResidentToDelete(null)
      setNotice({ type: 'success', message: 'Resident deleted successfully.' })
      await fetchResidents(query)
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
    if (error) return <ErrorState message={error} onRetry={() => fetchResidents(query)} />
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
