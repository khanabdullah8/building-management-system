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
import UnitModal from './UnitModal'
import '../../components/common/ModulePage.css'

function UnitsPage() {
  const [units, setUnits] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingUnit, setEditingUnit] = useState(null)
  const [unitToDelete, setUnitToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchUnits = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const url = trimmedSearch
      ? `/v1/units?search=${encodeURIComponent(trimmedSearch)}`
      : '/v1/units'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setUnits(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch units.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUnits(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchUnits])

  const handleModalSuccess = async (message) => {
    setEditingUnit(null)
    setNotice({ type: 'success', message })
    await fetchUnits(query)
  }

  const handleDelete = async () => {
    if (!unitToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/units/${unitToDelete.id}`)
      setUnitToDelete(null)
      setNotice({ type: 'success', message: 'Unit deleted successfully.' })
      await fetchUnits(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete unit. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'unitNumber', header: 'Unit' },
    {
      key: 'building',
      header: 'Building',
      render: (value) =>
        typeof value === 'object' && value !== null
          ? value.name || value.code || '—'
          : value || '—',
    },
    { key: 'type', header: 'Type' },
    { key: 'floor', header: 'Floor' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, unit) => (
        <div className="unit-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingUnit(unit)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setUnitToDelete(unit)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading units…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchUnits(query)} />
    if (units.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching units' : 'No units yet'}
          description={
            query.trim()
              ? `No units match "${query.trim()}".`
              : 'Create a unit after adding a building.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={units} />
  }

  const deleteBuildingName =
    typeof unitToDelete?.building === 'object'
      ? unitToDelete.building?.name || unitToDelete.building?.code
      : unitToDelete?.building

  return (
    <div className="module-page">
      <PageHeader
        title="Units"
        description="View apartments and units across all buildings."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingUnit({})}>
            New Unit
          </button>
        }
      />

      {notice && (
        <div className={`unit-page-alert unit-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search units…" />
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingUnit && (
        <UnitModal
          isOpen
          unit={editingUnit.id ? editingUnit : null}
          onClose={() => setEditingUnit(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {unitToDelete && (
        <Modal
          isOpen
          title="Delete Unit"
          onClose={() => {
            if (!deleting) setUnitToDelete(null)
          }}
        >
          <div className="delete-unit-content">
            <p>
              Delete unit <strong>{unitToDelete.unitNumber}</strong>
              {deleteBuildingName ? ` from ${deleteBuildingName}` : ''}?
            </p>
            <p className="delete-unit-warning">
              Deleting this unit will remove it from the building and may change the building&apos;s unit count.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setUnitToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Unit'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default UnitsPage
