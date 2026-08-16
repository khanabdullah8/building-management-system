import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './ResidentModal.css'

function getUnitId(unit) {
  if (typeof unit === 'object' && unit !== null) return unit.id || unit._id || ''
  return unit || ''
}

function ResidentModal({ isOpen, resident, onClose, onSuccess }) {
  const isEdit = Boolean(resident?.id)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    name: resident?.name || '',
    unit: getUnitId(resident?.unit),
    phone: resident?.phone || '',
    type: resident?.type || 'owner',
    status: resident?.status || 'active',
  })

  useEffect(() => {
    let isMounted = true

    http
      .get('/v1/units')
      .then((response) => {
        const list = response.data?.data || []
        if (isMounted) {
          setUnits(list)
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load units list.')
      })
      .finally(() => {
        if (isMounted) setLoadingUnits(false)
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
    if (!formData.name.trim()) errors.name = 'Resident name is required'
    if (!formData.unit) errors.unit = 'Please select a unit'
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
      name: formData.name.trim(),
      unit: formData.unit,
      phone: formData.phone.trim(),
      type: formData.type,
      status: formData.status,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/residents/${resident.id}`, payload)
        await onSuccess?.('Resident updated successfully.')
      } else {
        await http.post('/v1/residents', payload)
        await onSuccess?.('Resident created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save resident.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Resident' : 'New Resident'}>
      <form className="resident-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="resident-form-alert resident-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="resident-name" className="form-label">Name <span className="required">*</span></label>
          <input id="resident-name" name="name" value={formData.name} onChange={handleChange} className={`form-input ${fieldErrors.name ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.name && <span className="field-error-msg">{fieldErrors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="resident-unit" className="form-label">Unit <span className="required">*</span></label>
          <select id="resident-unit" name="unit" value={formData.unit} onChange={handleChange} disabled={loadingUnits || units.length === 0 || submitting} className={`form-input ${fieldErrors.unit ? 'input-error' : ''}`} required>
            {loadingUnits ? <option value="">Loading units…</option> : null}
            {!loadingUnits && units.length === 0 ? <option value="">No units found (create a unit first)</option> : null}
            {!loadingUnits && units.map((unit) => {
              const unitId = unit.id || unit._id
              const building = unit.building
              const label = building ? `${building.name} (${building.code}) — ${unit.unitNumber}` : unit.unitNumber
              return <option key={unitId} value={unitId}>{label}</option>
            })}
          </select>
          {fieldErrors.unit && <span className="field-error-msg">{fieldErrors.unit}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="resident-phone" className="form-label">Phone</label>
          <input id="resident-phone" type="tel" name="phone" value={formData.phone} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="resident-type" className="form-label">Ownership Type</label>
            <select id="resident-type" name="type" value={formData.type} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="owner">Owner</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>
          <div className="form-group flex-1">
            <label htmlFor="resident-status" className="form-label">Status</label>
            <select id="resident-status" name="status" value={formData.status} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingUnits || units.length === 0}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Resident')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ResidentModal
