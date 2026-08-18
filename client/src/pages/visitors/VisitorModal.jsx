import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './VisitorModal.css'

function getUnitId(unit) {
  if (typeof unit === 'object' && unit !== null) return unit.id || unit._id || ''
  return unit || ''
}

function VisitorModal({ isOpen, visitor, onClose, onSuccess }) {
  const isEdit = Boolean(visitor?.id)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    name: visitor?.name || '',
    unit: getUnitId(visitor?.unit),
    phone: visitor?.phone || '',
    purpose: visitor?.purpose || '',
    checkInAt: visitor?.checkInAt ? new Date(visitor.checkInAt).toISOString().slice(0, 16) : '',
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
    if (!formData.name.trim()) errors.name = 'Visitor name is required'
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
      purpose: formData.purpose.trim(),
    }

    if (formData.checkInAt) {
      payload.checkInAt = new Date(formData.checkInAt).toISOString()
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/visitors/${visitor.id}`, payload)
        await onSuccess?.('Visitor updated successfully.')
      } else {
        await http.post('/v1/visitors', payload)
        await onSuccess?.('Visitor registered successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save visitor.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Visitor' : 'Register Visitor'}>
      <form className="visitor-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="visitor-form-alert visitor-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="visitor-name" className="form-label">Name <span className="required">*</span></label>
          <input id="visitor-name" name="name" value={formData.name} onChange={handleChange} className={`form-input ${fieldErrors.name ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.name && <span className="field-error-msg">{fieldErrors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="visitor-unit" className="form-label">Unit <span className="required">*</span></label>
          <select id="visitor-unit" name="unit" value={formData.unit} onChange={handleChange} disabled={loadingUnits || units.length === 0 || submitting} className={`form-input ${fieldErrors.unit ? 'input-error' : ''}`} required>
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
          <label htmlFor="visitor-phone" className="form-label">Phone</label>
          <input id="visitor-phone" name="phone" value={formData.phone} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-group">
          <label htmlFor="visitor-purpose" className="form-label">Purpose</label>
          <input id="visitor-purpose" name="purpose" value={formData.purpose} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-group">
          <label htmlFor="visitor-checkInAt" className="form-label">Check In Date</label>
          <input id="visitor-checkInAt" name="checkInAt" type="datetime-local" value={formData.checkInAt} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingUnits || units.length === 0}>
            {submitting ? (isEdit ? 'Saving…' : 'Registering…') : (isEdit ? 'Save Changes' : 'Register Visitor')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default VisitorModal
