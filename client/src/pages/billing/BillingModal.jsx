import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './BillingModal.css'

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

function BillingModal({ isOpen, bill, onClose, onSuccess }) {
  const isEdit = Boolean(bill?.id)
  const [units, setUnits] = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    unit: getId(bill?.unit),
    period: bill?.period || '',
    amount: bill?.amount ?? '',
    dueDate: formatDateForInput(bill?.dueDate),
    description: bill?.description || '',
    status: bill?.status || 'pending',
    billNo: bill?.billNo || '',
  })

  useEffect(() => {
    let isMounted = true

    http
      .get('/v1/units')
      .then((response) => {
        if (isMounted) setUnits(response.data?.data || [])
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load units.')
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

  const getUnitLabel = (unit) => {
    if (!unit) return ''
    const unitNum = unit.unitNumber || ''
    const building = unit.building
    if (building) {
      return `${unitNum} - ${building.name || ''} (${building.code || ''})`
    }
    return unitNum
  }

  const validate = () => {
    const errors = {}
    if (!formData.unit) errors.unit = 'Please select a unit'
    if (!formData.period) errors.period = 'Billing period is required'
    const amount = Number(formData.amount)
    if (!formData.amount && formData.amount !== 0) {
      errors.amount = 'Amount is required'
    } else if (isNaN(amount) || amount <= 0) {
      errors.amount = 'Amount must be greater than 0'
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
      unit: formData.unit,
      period: formData.period.trim(),
      amount: Number(formData.amount),
      dueDate: formData.dueDate || null,
      description: formData.description.trim(),
    }

    if (isEdit) {
      payload.status = formData.status
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/billing/${bill.id}`, payload)
        await onSuccess?.('Bill updated successfully.')
      } else {
        await http.post('/v1/billing', payload)
        await onSuccess?.('Bill created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save bill.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Bill' : 'Create Bill'}>
      <form className="billing-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="billing-form-alert billing-form-alert-error" role="alert">{error}</div>}

        {isEdit && (
          <div className="form-group">
            <label htmlFor="bill-no" className="form-label">Bill No</label>
            <input
              id="bill-no"
              className="form-input"
              value={formData.billNo}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="billing-unit" className="form-label">Unit <span className="required">*</span></label>
          {isEdit ? (
            <input
              id="billing-unit"
              className="form-input"
              value={getUnitLabel(units.find((u) => (u.id || u._id) === formData.unit) || bill?.unit)}
              disabled
              readOnly
            />
          ) : (
            <select id="billing-unit" name="unit" value={formData.unit} onChange={handleChange} disabled={loadingUnits || units.length === 0 || submitting} className={`form-input ${fieldErrors.unit ? 'input-error' : ''}`} required>
              {loadingUnits ? <option value="">Loading units…</option> : null}
              {!loadingUnits && units.length === 0 ? <option value="">No units found</option> : null}
              {!loadingUnits && units.map((unit) => {
                const unitId = unit.id || unit._id
                return <option key={unitId} value={unitId}>{getUnitLabel(unit)}</option>
              })}
            </select>
          )}
          {fieldErrors.unit && <span className="field-error-msg">{fieldErrors.unit}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="billing-period" className="form-label">Period <span className="required">*</span></label>
          <input
            id="billing-period"
            name="period"
            type="text"
            value={formData.period}
            onChange={handleChange}
            className={`form-input ${fieldErrors.period ? 'input-error' : ''}`}
            placeholder="e.g. Jan 2026"
            disabled={submitting}
            required
          />
          {fieldErrors.period && <span className="field-error-msg">{fieldErrors.period}</span>}
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="billing-amount" className="form-label">Amount <span className="required">*</span></label>
            <input
              id="billing-amount"
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
            <label htmlFor="billing-due-date" className="form-label">Due Date</label>
            <input
              id="billing-due-date"
              name="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={handleChange}
              className="form-input"
              disabled={submitting}
            />
          </div>
        </div>

        {isEdit && (
          <div className="form-group">
            <label htmlFor="billing-status" className="form-label">Status <span className="required">*</span></label>
            <select id="billing-status" name="status" value={formData.status} onChange={handleChange} disabled={submitting} className="form-input">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        )}

        {isEdit && bill?.paidAt && (
          <div className="form-group">
            <label className="form-label">Paid At</label>
            <input
              className="form-input"
              value={new Date(bill.paidAt).toLocaleDateString()}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="billing-description" className="form-label">Description</label>
          <textarea id="billing-description" name="description" value={formData.description} onChange={handleChange} className="form-input" disabled={submitting} rows={3} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingUnits || (!isEdit && units.length === 0)}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Bill')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default BillingModal
