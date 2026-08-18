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
import ParkingModal from './ParkingModal'
import './ParkingPage.css'

function ParkingPage() {
  const [slots, setSlots] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingSlot, setEditingSlot] = useState(null)
  const [slotToDelete, setSlotToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [buildings, setBuildings] = useState([])
  const [buildingFilter, setBuildingFilter] = useState('')
  const [units, setUnits] = useState([])
  const [unitFilter, setUnitFilter] = useState('')
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

  const fetchSlots = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (buildingFilter) params.set('building', buildingFilter)
    if (unitFilter) params.set('unit', unitFilter)
    const qs = params.toString()
    const url = qs ? `/v1/parking?${qs}` : '/v1/parking'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setSlots(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch parking slots.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, buildingFilter, unitFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSlots(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchSlots])

  const handleModalSuccess = async (message) => {
    setEditingSlot(null)
    setNotice({ type: 'success', message })
    await fetchSlots(query)
  }

  const handleDelete = async () => {
    if (!slotToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/parking/${slotToDelete.id}`)
      setSlotToDelete(null)
      setNotice({ type: 'success', message: 'Parking slot deleted successfully.' })
      await fetchSlots(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete parking slot. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    { key: 'slotCode', header: 'Slot' },
    {
      key: 'building',
      header: 'Building',
      render: (_, slot) => {
        const building = slot.building
        if (!building) return '—'
        return building.code ? `${building.name} (${building.code})` : building.name
      },
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (_, slot) => {
        const unit = slot.unit
        if (!unit) return '—'
        const building = unit.building
        const buildingLabel = building
          ? (building.code ? `${building.name} (${building.code})` : building.name)
          : ''
        return buildingLabel ? `${buildingLabel} — ${unit.unitNumber}` : unit.unitNumber
      },
    },
    { key: 'vehicleType', header: 'Vehicle Type', render: (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '—' },
    { key: 'vehicleNumber', header: 'Vehicle No.', render: (value) => value || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (_, slot) => {
        const isAllocated = slot.unit != null
        return <Badge tone={isAllocated ? 'success' : 'info'}>{isAllocated ? 'Allocated' : 'Available'}</Badge>
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, slot) => (
        <div className="parking-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingSlot(slot)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setSlotToDelete(slot)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading parking slots…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchSlots(query)} />
    if (slots.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching parking slots' : 'No parking slots yet'}
          description={
            query.trim()
              ? `No parking slots match "${query.trim()}".`
              : 'Add a parking slot after adding buildings.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={slots} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Parking"
        description="Manage parking slots and their unit allocations."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingSlot({})}>
            Add Slot
          </button>
        }
      />

      {notice && (
        <div className={`parking-page-alert parking-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search parking…" />
        <select
          className="form-input parking-building-filter"
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
          className="form-input parking-unit-filter"
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

      {editingSlot && (
        <ParkingModal
          isOpen
          slot={editingSlot.id ? editingSlot : null}
          onClose={() => setEditingSlot(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {slotToDelete && (
        <Modal
          isOpen
          title="Delete Parking Slot"
          onClose={() => {
            if (!deleting) setSlotToDelete(null)
          }}
        >
          <div className="delete-parking-content">
            <p>
              Delete parking slot &lsquo;<strong>{slotToDelete.slotCode}</strong>&rsquo;
              {slotToDelete.building ? ` in ${slotToDelete.building.name}` : ''}?
            </p>
            <p className="delete-parking-warning">
              This will permanently remove the parking slot. The Building and any
              associated Unit will not be affected.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSlotToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Slot'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default ParkingPage
