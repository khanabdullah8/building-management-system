import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './MaintenanceModal.css'

function getUnitId(unit) {
  if (typeof unit === 'object' && unit !== null) return unit.id || unit._id || ''
  return unit || ''
}

function MaintenanceModal({ isOpen, request, onClose, onSuccess }) {
  const isEdit = Boolean(request?.id)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    title: request?.title || '',
    unit: getUnitId(request?.unit),
    description: request?.description || '',
    priority: request?.priority || 'medium',
    assignedTo: request?.assignedTo || '',
    status: request?.status || 'open',
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
    if (!formData.title.trim()) errors.title = 'Maintenance title is required'
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
      title: formData.title.trim(),
      unit: formData.unit,
      description: formData.description.trim(),
      priority: formData.priority,
      assignedTo: formData.assignedTo.trim(),
      status: formData.status,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/maintenance/${request.id}`, payload)
        await onSuccess?.('Maintenance request updated successfully.')
      } else {
        await http.post('/v1/maintenance', payload)
        await onSuccess?.('Maintenance request created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save maintenance request.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Request' : 'New Request'}>
      <form className="maintenance-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="maintenance-form-alert maintenance-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="maintenance-title" className="form-label">Title <span className="required">*</span></label>
          <input id="maintenance-title" name="title" value={formData.title} onChange={handleChange} className={`form-input ${fieldErrors.title ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.title && <span className="field-error-msg">{fieldErrors.title}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="maintenance-unit" className="form-label">Unit <span className="required">*</span></label>
          <select id="maintenance-unit" name="unit" value={formData.unit} onChange={handleChange} disabled={loadingUnits || units.length === 0 || submitting} className={`form-input ${fieldErrors.unit ? 'input-error' : ''}`} required>
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
          <label htmlFor="maintenance-description" className="form-label">Description</label>
          <textarea id="maintenance-description" name="description" value={formData.description} onChange={handleChange} className="form-input" disabled={submitting} rows={3} />
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="maintenance-priority" className="form-label">Priority <span className="required">*</span></label>
            <select id="maintenance-priority" name="priority" value={formData.priority} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="form-group flex-1">
            <label htmlFor="maintenance-status" className="form-label">Status <span className="required">*</span></label>
            <select id="maintenance-status" name="status" value={formData.status} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="maintenance-assignedTo" className="form-label">Assigned To</label>
          <input id="maintenance-assignedTo" name="assignedTo" value={formData.assignedTo} onChange={handleChange} className="form-input" disabled={submitting} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingUnits || units.length === 0}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Request')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default MaintenanceModal
