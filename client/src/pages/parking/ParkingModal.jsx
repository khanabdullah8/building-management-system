import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './ParkingModal.css'

function getId(value) {
  if (typeof value === 'object' && value !== null) return value.id || value._id || ''
  return value || ''
}

function ParkingModal({ isOpen, slot, onClose, onSuccess }) {
  const isEdit = Boolean(slot?.id)
  const [buildings, setBuildings] = useState([])
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    slotCode: slot?.slotCode || '',
    building: getId(slot?.building),
    vehicleType: slot?.vehicleType || 'car',
    vehicleNumber: slot?.vehicleNumber || '',
    unit: getId(slot?.unit),
  })

  useEffect(() => {
    let isMounted = true

    Promise.all([
      http.get('/v1/buildings'),
      http.get('/v1/units'),
    ])
      .then(([buildingRes, unitRes]) => {
        if (isMounted) {
          setBuildings(buildingRes.data?.data || [])
          setUnits(unitRes.data?.data || [])
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load data.')
      })
      .finally(() => {
        if (isMounted) {
          setLoadingBuildings(false)
          setLoadingUnits(false)
        }
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
    setFormData((current) => ({ ...current, [name]: value }))
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
    if (!formData.slotCode.trim()) errors.slotCode = 'Slot code is required'
    if (!formData.building) errors.building = 'Please select a building'
    return errors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setFieldErrors({})
    const errors = validate()
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const payload = {
      slotCode: formData.slotCode.trim(),
      building: formData.building,
      vehicleType: formData.vehicleType,
      vehicleNumber: formData.vehicleNumber.trim(),
      unit: formData.unit || null,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/parking/${slot.id}`, payload)
        await onSuccess?.('Parking slot updated successfully.')
      } else {
        await http.post('/v1/parking', payload)
        await onSuccess?.('Parking slot created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save parking slot.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const optionsReady = !loadingBuildings && !loadingUnits

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Parking Slot' : 'Add Parking Slot'}>
      <form className="parking-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="parking-form-alert parking-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="parking-slotCode" className="form-label">Slot Code <span className="required">*</span></label>
          <input id="parking-slotCode" name="slotCode" value={formData.slotCode} onChange={handleChange} className={`form-input ${fieldErrors.slotCode ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.slotCode && <span className="field-error-msg">{fieldErrors.slotCode}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="parking-building" className="form-label">Building <span className="required">*</span></label>
          {isEdit ? (
            <input
              id="parking-building"
              className="form-input"
              value={buildings.find((b) => (b.id || b._id) === formData.building)
                ? `${buildings.find((b) => (b.id || b._id) === formData.building).name} (${buildings.find((b) => (b.id || b._id) === formData.building).code})`
                : ''}
              disabled
              readOnly
            />
          ) : (
            <select id="parking-building" name="building" value={formData.building} onChange={handleChange} disabled={loadingBuildings || buildings.length === 0 || submitting} className={`form-input ${fieldErrors.building ? 'input-error' : ''}`} required>
              {loadingBuildings ? <option value="">Loading buildings…</option> : null}
              {!loadingBuildings && buildings.length === 0 ? <option value="">No buildings found</option> : null}
              {!loadingBuildings && buildings.map((building) => {
                const buildingId = building.id || building._id
                return <option key={buildingId} value={buildingId}>{building.name} ({building.code})</option>
              })}
            </select>
          )}
          {fieldErrors.building && <span className="field-error-msg">{fieldErrors.building}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="parking-vehicleType" className="form-label">Vehicle Type</label>
          <select id="parking-vehicleType" name="vehicleType" value={formData.vehicleType} onChange={handleChange} disabled={submitting} className="form-input">
            <option value="car">Car</option>
            <option value="bike">Bike</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="parking-vehicleNumber" className="form-label">Vehicle Number</label>
          <input id="parking-vehicleNumber" name="vehicleNumber" value={formData.vehicleNumber} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-group">
          <label htmlFor="parking-unit" className="form-label">Unit</label>
          <select id="parking-unit" name="unit" value={formData.unit} onChange={handleChange} disabled={loadingUnits || units.length === 0 || submitting} className="form-input">
            {loadingUnits ? <option value="">Loading units…</option> : null}
            {!loadingUnits && units.length === 0 ? <option value="">No units found</option> : null}
            {!loadingUnits && <option value="">None (unallocated)</option>}
            {!loadingUnits && units.map((unit) => {
              const unitId = unit.id || unit._id
              const building = unit.building
              const label = building ? `${building.name} (${building.code}) — ${unit.unitNumber}` : unit.unitNumber
              return <option key={unitId} value={unitId}>{label}</option>
            })}
          </select>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !optionsReady}>
            {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Slot')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ParkingModal
