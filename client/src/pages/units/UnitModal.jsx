import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './UnitModal.css'

const UNIT_TYPES = ['1BHK', '2BHK', '3BHK', '4BHK', 'Studio', 'Penthouse']

function getBuildingId(building) {
  if (typeof building === 'object' && building !== null) {
    return building.id || building._id || ''
  }
  return building || ''
}

function UnitModal({ isOpen, unit, onClose, onSuccess }) {
  const isEdit = Boolean(unit?.id)
  const [buildings, setBuildings] = useState([])
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    building: getBuildingId(unit?.building),
    unitNumber: unit?.unitNumber || '',
    type: unit?.type || '2BHK',
    floor: unit?.floor ?? 1,
    status: unit?.status || 'vacant',
  })

  useEffect(() => {
    let isMounted = true

    http
      .get('/v1/buildings')
      .then((response) => {
        const list = response.data?.data || []
        if (isMounted) {
          setBuildings(list)
          if (list.length > 0) {
            setFormData((current) => ({
              ...current,
              building: current.building || list[0].id || list[0]._id || '',
            }))
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load buildings list.')
      })
      .finally(() => {
        if (isMounted) setLoadingBuildings(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleClose = () => {
    if (!submitting) onClose?.()
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: name === 'floor' ? (value === '' ? '' : Number(value)) : value,
    }))

    if (fieldErrors[name]) {
      setFieldErrors((current) => {
        const next = { ...current }
        delete next[name]
        return next
      })
    }
  }

  const validate = () => {
    const errors = {}
    if (!formData.building) errors.building = 'Please select a building'
    if (!formData.unitNumber || !formData.unitNumber.trim()) errors.unitNumber = 'Unit number is required'
    if (formData.floor === '' || Number.isNaN(formData.floor)) errors.floor = 'Floor must be a valid number'
    return errors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setFieldErrors({})
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      return
    }

    const payload = {
      building: formData.building,
      unitNumber: formData.unitNumber.trim(),
      type: formData.type.trim(),
      floor: Number(formData.floor),
      status: formData.status,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/units/${unit.id}`, payload)
        await onSuccess?.('Unit updated successfully.')
      } else {
        await http.post('/v1/units', payload)
        await onSuccess?.('Unit created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save unit.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Unit' : 'New Unit'}>
      <form onSubmit={handleSubmit} className="unit-form" noValidate>
        {error && <div className="unit-form-alert unit-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="unit-building" className="form-label">
            Building <span className="required">*</span>
          </label>
          <select
            id="unit-building"
            name="building"
            value={formData.building}
            onChange={handleChange}
            disabled={loadingBuildings || buildings.length === 0 || submitting}
            className={`form-input ${fieldErrors.building ? 'input-error' : ''}`}
            required
          >
            {loadingBuildings ? <option value="">Loading buildings…</option> : null}
            {!loadingBuildings && buildings.length === 0 ? <option value="">No buildings found (create a building first)</option> : null}
            {!loadingBuildings && buildings.map((building) => {
              const buildingId = building.id || building._id
              return <option key={buildingId} value={buildingId}>{building.name} ({building.code})</option>
            })}
          </select>
          {fieldErrors.building && <span className="field-error-msg">{fieldErrors.building}</span>}
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="unit-number" className="form-label">Unit Number <span className="required">*</span></label>
            <input id="unit-number" type="text" name="unitNumber" value={formData.unitNumber} onChange={handleChange} placeholder="e.g. A-101 or 1204" className={`form-input ${fieldErrors.unitNumber ? 'input-error' : ''}`} disabled={submitting} required />
            {fieldErrors.unitNumber && <span className="field-error-msg">{fieldErrors.unitNumber}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="unit-type" className="form-label">Type</label>
            <select id="unit-type" name="type" value={formData.type} onChange={handleChange} className="form-input" disabled={submitting}>
              {UNIT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="unit-floor" className="form-label">Floor</label>
            <input id="unit-floor" type="number" name="floor" value={formData.floor} onChange={handleChange} className={`form-input ${fieldErrors.floor ? 'input-error' : ''}`} disabled={submitting} />
            {fieldErrors.floor && <span className="field-error-msg">{fieldErrors.floor}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="unit-status" className="form-label">Status</label>
            <select id="unit-status" name="status" value={formData.status} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingBuildings || buildings.length === 0}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Unit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default UnitModal
