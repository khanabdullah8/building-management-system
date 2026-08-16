import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './BuildingModal.css'

const initialFormData = {
  code: '',
  name: '',
  address: '',
  units: '',
  status: 'active',
}

function BuildingModal({ isOpen, building, onClose, onSuccess }) {
  const isEdit = Boolean(building?.id)
  const [formData, setFormData] = useState({
    code: building?.code || initialFormData.code,
    name: building?.name || initialFormData.name,
    address: building?.address || initialFormData.address,
    units: building?.units ?? initialFormData.units,
    status: building?.status || initialFormData.status,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

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
    if (!formData.code.trim()) errors.code = 'Building code is required'
    if (!formData.name.trim()) errors.name = 'Building name is required'
    if (formData.units !== '') {
      const units = Number(formData.units)
      if (!Number.isFinite(units) || units < 0 || !Number.isInteger(units)) {
        errors.units = 'Units must be a non-negative whole number'
      }
    }
    if (!['active', 'inactive'].includes(formData.status)) {
      errors.status = 'Status must be active or inactive'
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

    const payload = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      address: formData.address.trim(),
      ...(formData.units !== '' ? { units: Number(formData.units) } : {}),
      status: formData.status,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/buildings/${building.id}`, payload)
        await onSuccess?.('Building updated successfully.')
      } else {
        await http.post('/v1/buildings', payload)
        await onSuccess?.('Building created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save building.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Building' : 'New Building'}>
      <form className="building-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="building-form-alert building-form-alert-error" role="alert">{error}</div>}
        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="building-code" className="form-label">Code <span className="required">*</span></label>
            <input id="building-code" name="code" value={formData.code} onChange={handleChange} className={`form-input ${fieldErrors.code ? 'input-error' : ''}`} required />
            {fieldErrors.code && <span className="field-error-msg">{fieldErrors.code}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="building-name" className="form-label">Name <span className="required">*</span></label>
            <input id="building-name" name="name" value={formData.name} onChange={handleChange} className={`form-input ${fieldErrors.name ? 'input-error' : ''}`} required />
            {fieldErrors.name && <span className="field-error-msg">{fieldErrors.name}</span>}
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="building-address" className="form-label">Address</label>
          <input id="building-address" name="address" value={formData.address} onChange={handleChange} className="form-input" />
        </div>
        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="building-units" className="form-label">Units</label>
            <input id="building-units" type="number" min="0" step="1" name="units" value={formData.units} onChange={handleChange} className={`form-input ${fieldErrors.units ? 'input-error' : ''}`} />
            {fieldErrors.units && <span className="field-error-msg">{fieldErrors.units}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="building-status" className="form-label">Status</label>
            <select id="building-status" name="status" value={formData.status} onChange={handleChange} className={`form-input ${fieldErrors.status ? 'input-error' : ''}`}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {fieldErrors.status && <span className="field-error-msg">{fieldErrors.status}</span>}
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Building')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default BuildingModal
