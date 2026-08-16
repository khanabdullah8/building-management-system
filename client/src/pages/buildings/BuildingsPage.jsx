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
import BuildingModal from './BuildingModal'
import '../../components/common/ModulePage.css'

function BuildingsPage() {
  const [buildings, setBuildings] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingBuilding, setEditingBuilding] = useState(null)
  const [buildingToDelete, setBuildingToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchBuildings = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const url = trimmedSearch
      ? `/v1/buildings?search=${encodeURIComponent(trimmedSearch)}`
      : '/v1/buildings'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setBuildings(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch buildings.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBuildings(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchBuildings])

  const handleModalSuccess = async (message) => {
    setEditingBuilding(null)
    setNotice({ type: 'success', message })
    await fetchBuildings(query)
  }

  const handleDelete = async () => {
    if (!buildingToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/buildings/${buildingToDelete.id}`)
      setBuildingToDelete(null)
      setNotice({ type: 'success', message: 'Building deleted successfully.' })
      await fetchBuildings(query)
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.message || 'Failed to delete building. Please try again.',
      })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Name' },
    { key: 'address', header: 'Address', render: (value) => value || '—' },
    { key: 'units', header: 'Units' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, building) => (
        <div className="building-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingBuilding(building)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setBuildingToDelete(building)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading buildings…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchBuildings(query)} />
    if (buildings.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching buildings' : 'No buildings yet'}
          description={
            query.trim()
              ? `No buildings match "${query.trim()}".`
              : 'Create your first building to start managing properties.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={buildings} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Buildings"
        description="Manage building properties, blocks and floors."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingBuilding({})}>
            New Building
          </button>
        }
      />

      {notice && (
        <div className={`building-page-alert building-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search buildings…" />
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingBuilding && (
        <BuildingModal
          isOpen
          building={editingBuilding.id ? editingBuilding : null}
          onClose={() => setEditingBuilding(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {buildingToDelete && (
        <Modal
          isOpen
          title="Delete Building"
          onClose={() => {
            if (!deleting) setBuildingToDelete(null)
          }}
        >
          <div className="delete-building-content">
            <p>
              Delete <strong>{buildingToDelete.name}</strong> ({buildingToDelete.code})?
            </p>
            <p className="delete-building-warning">
              Units reference Buildings. Deleting this building may affect related data.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBuildingToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Building'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default BuildingsPage
