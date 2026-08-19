import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './ExpenseModal.css'

function getId(value) {
  if (typeof value === 'object' && value !== null) return value.id || value._id || ''
  return value || ''
}

function formatDateForInput(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

const CATEGORIES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'security', label: 'Security' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'admin', label: 'Admin' },
  { value: 'other', label: 'Other' },
]

function ExpenseModal({ isOpen, expense, onClose, onSuccess }) {
  const isEdit = Boolean(expense?.id)
  const [buildings, setBuildings] = useState([])
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    category: expense?.category || '',
    building: getId(expense?.building),
    amount: expense?.amount ?? '',
    date: formatDateForInput(expense?.date),
    description: expense?.description || '',
    status: expense?.status || 'pending',
  })

  useEffect(() => {
    let isMounted = true

    http
      .get('/v1/buildings')
      .then((response) => {
        if (isMounted) setBuildings(response.data?.data || [])
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load buildings.')
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
    if (!formData.category) errors.category = 'Please select a category'
    if (!formData.building) errors.building = 'Please select a building'
    const amount = Number(formData.amount)
    if (!formData.amount && formData.amount !== 0) {
      errors.amount = 'Amount is required'
    } else if (isNaN(amount) || amount <= 0) {
      errors.amount = 'Amount must be greater than 0'
    }
    if (!formData.date) errors.date = 'Date is required'
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
      category: formData.category,
      building: formData.building,
      amount: Number(formData.amount),
      date: formData.date,
      description: formData.description.trim(),
    }

    if (isEdit) {
      payload.status = formData.status
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/expenses/${expense.id}`, payload)
        await onSuccess?.('Expense updated successfully.')
      } else {
        await http.post('/v1/expenses', payload)
        await onSuccess?.('Expense created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save expense.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Expense' : 'Add Expense'}>
      <form className="expense-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="expense-form-alert expense-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="expense-category" className="form-label">Category <span className="required">*</span></label>
          {isEdit ? (
            <select id="expense-category" name="category" value={formData.category} onChange={handleChange} disabled={submitting} className={`form-input ${fieldErrors.category ? 'input-error' : ''}`} required>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          ) : (
            <select id="expense-category" name="category" value={formData.category} onChange={handleChange} disabled={submitting} className={`form-input ${fieldErrors.category ? 'input-error' : ''}`} required>
              <option value="">Select category</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          )}
          {fieldErrors.category && <span className="field-error-msg">{fieldErrors.category}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="expense-building" className="form-label">Building <span className="required">*</span></label>
          {isEdit ? (
            <input
              id="expense-building"
              className="form-input"
              value={buildings.find((b) => (b.id || b._id) === formData.building)
                ? `${buildings.find((b) => (b.id || b._id) === formData.building).name} (${buildings.find((b) => (b.id || b._id) === formData.building).code})`
                : ''}
              disabled
              readOnly
            />
          ) : (
            <select id="expense-building" name="building" value={formData.building} onChange={handleChange} disabled={loadingBuildings || buildings.length === 0 || submitting} className={`form-input ${fieldErrors.building ? 'input-error' : ''}`} required>
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

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="expense-amount" className="form-label">Amount <span className="required">*</span></label>
            <input
              id="expense-amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={formData.amount}
              onChange={handleChange}
              className={`form-input ${fieldErrors.amount ? 'input-error' : ''}`}
              disabled={submitting}
              required
            />
            {fieldErrors.amount && <span className="field-error-msg">{fieldErrors.amount}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="expense-date" className="form-label">Date <span className="required">*</span></label>
            <input
              id="expense-date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              className={`form-input ${fieldErrors.date ? 'input-error' : ''}`}
              disabled={submitting}
              required
            />
            {fieldErrors.date && <span className="field-error-msg">{fieldErrors.date}</span>}
          </div>
        </div>

        {isEdit && (
          <div className="form-group">
            <label htmlFor="expense-status" className="form-label">Status <span className="required">*</span></label>
            <select id="expense-status" name="status" value={formData.status} onChange={handleChange} disabled={submitting} className="form-input">
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="expense-description" className="form-label">Description</label>
          <textarea id="expense-description" name="description" value={formData.description} onChange={handleChange} className="form-input" disabled={submitting} rows={3} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingBuildings || buildings.length === 0}>
            {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Expense')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ExpenseModal
