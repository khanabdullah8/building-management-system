import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './ComplaintModal.css'

const COMMON_AREA = '__common__'

function getUnitId(unit) {
  if (typeof unit === 'object' && unit !== null) return unit.id || unit._id || ''
  return unit || ''
}

function ComplaintModal({ isOpen, complaint, onClose, onSuccess }) {
  const isEdit = Boolean(complaint?.id)
  const isCommonArea = complaint?.unit === null && Boolean(complaint?.location)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    subject: complaint?.subject || '',
    unitValue: isEdit ? (isCommonArea ? COMMON_AREA : getUnitId(complaint?.unit)) : '',
    location: complaint?.location || '',
    description: complaint?.description || '',
    priority: complaint?.priority || 'medium',
    status: complaint?.status || 'open',
  })

  const isCommonAreaMode = formData.unitValue === COMMON_AREA

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

    if (name === 'unitValue') {
      setFormData((current) => ({
        ...current,
        unitValue: value,
        location: value === COMMON_AREA ? current.location : '',
      }))
    } else {
      setFormData((current) => ({ ...current, [name]: value }))
    }

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
    if (!formData.subject.trim()) errors.subject = 'Complaint subject is required'
    if (!formData.unitValue) errors.unitValue = 'Please select a unit or choose Common area'
    if (formData.unitValue === COMMON_AREA && !formData.location.trim()) {
      errors.location = 'Location is required for common-area complaints'
    }
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

    const isCommon = formData.unitValue === COMMON_AREA
    const payload = {
      subject: formData.subject.trim(),
      unit: isCommon ? null : formData.unitValue,
      location: isCommon ? formData.location.trim() : '',
      description: formData.description.trim(),
      priority: formData.priority,
      status: formData.status,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/complaints/${complaint.id}`, payload)
        await onSuccess?.('Complaint updated successfully.')
      } else {
        await http.post('/v1/complaints', payload)
        await onSuccess?.('Complaint created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save complaint.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Complaint' : 'New Complaint'}>
      <form className="complaint-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="complaint-form-alert complaint-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="complaint-subject" className="form-label">Subject <span className="required">*</span></label>
          <input id="complaint-subject" name="subject" value={formData.subject} onChange={handleChange} className={`form-input ${fieldErrors.subject ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.subject && <span className="field-error-msg">{fieldErrors.subject}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="complaint-unitValue" className="form-label">Unit <span className="required">*</span></label>
          <select id="complaint-unitValue" name="unitValue" value={formData.unitValue} onChange={handleChange} disabled={submitting} className={`form-input ${fieldErrors.unitValue ? 'input-error' : ''}`} required>
            <option value="">{loadingUnits ? 'Loading units…' : 'Select a unit…'}</option>
            {units.map((unit) => {
              const unitId = unit.id || unit._id
              const building = unit.building
              const label = building ? `${building.name} (${building.code}) — ${unit.unitNumber}` : unit.unitNumber
              return <option key={unitId} value={unitId}>{label}</option>
            })}
            <option value={COMMON_AREA}>Common area / Other location</option>
          </select>
          {fieldErrors.unitValue && <span className="field-error-msg">{fieldErrors.unitValue}</span>}
        </div>

        {isCommonAreaMode && (
          <div className="form-group">
            <label htmlFor="complaint-location" className="form-label">Location <span className="required">*</span></label>
            <input id="complaint-location" name="location" value={formData.location} onChange={handleChange} className={`form-input ${fieldErrors.location ? 'input-error' : ''}`} placeholder="e.g. Ground floor lobby, Rooftop terrace" disabled={submitting} />
            {fieldErrors.location && <span className="field-error-msg">{fieldErrors.location}</span>}
          </div>
        )}

        <div className="form-group">
          <label htmlFor="complaint-description" className="form-label">Description</label>
          <textarea id="complaint-description" name="description" value={formData.description} onChange={handleChange} className="form-input" disabled={submitting} rows={3} />
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="complaint-priority" className="form-label">Priority <span className="required">*</span></label>
            <select id="complaint-priority" name="priority" value={formData.priority} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group flex-1">
            <label htmlFor="complaint-status" className="form-label">Status <span className="required">*</span></label>
            <select id="complaint-status" name="status" value={formData.status} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Complaint')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ComplaintModal
