import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import { formatCurrency } from '../../utils/formatters'
import './PaymentModal.css'

function getId(value) {
  if (typeof value === 'object' && value !== null) return value.id || value._id || ''
  return value || ''
}

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
]

function PaymentModal({ isOpen, payment, onClose, onSuccess }) {
  const isEdit = Boolean(payment?.id)
  const [bills, setBills] = useState([])
  const [loadingBills, setLoadingBills] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    bill: getId(payment?.bill),
    amount: payment?.amount ?? '',
    method: payment?.method || '',
    status: payment?.status || 'completed',
    reference: payment?.reference || '',
    notes: payment?.notes || '',
  })

  useEffect(() => {
    let isMounted = true

    const fetchBills = async () => {
      try {
        const [pendingRes, overdueRes] = await Promise.all([
          http.get('/v1/billing?status=pending'),
          http.get('/v1/billing?status=overdue'),
        ])
        if (!isMounted) return
        const pendingBills = pendingRes.data?.data || []
        const overdueBills = overdueRes.data?.data || []
        const seen = new Set()
        const merged = []
        for (const bill of [...overdueBills, ...pendingBills]) {
          const billId = bill.id || bill._id
          if (!seen.has(billId)) {
            seen.add(billId)
            merged.push(bill)
          }
        }
        setBills(merged)
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load bills.')
      } finally {
        if (isMounted) setLoadingBills(false)
      }
    }

    fetchBills()
    return () => { isMounted = false }
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

  const getBillLabel = (bill) => {
    if (!bill) return ''
    const unit = bill.unit
    const unitStr = unit
      ? `${unit.unitNumber}${unit.building ? ` (${unit.building.name})` : ''}`
      : ''
    return `${bill.billNo} — ${unitStr} — ${formatCurrency(bill.amount)}`
  }

  const selectedBill = bills.find((b) => (b.id || b._id) === formData.bill)
  const billUnit = isEdit ? payment?.bill?.unit : selectedBill?.unit

  const validate = () => {
    const errors = {}
    if (!formData.bill) errors.bill = 'Please select a bill'
    if (!formData.method) errors.method = 'Please select a payment method'
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
      amount: Number(formData.amount),
      method: formData.method,
      reference: formData.reference.trim(),
      notes: formData.notes.trim(),
    }

    if (isEdit) {
      payload.status = formData.status
    } else {
      payload.bill = formData.bill
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/payments/${payment.id}`, payload)
        await onSuccess?.('Payment updated successfully.')
      } else {
        await http.post('/v1/payments', payload)
        await onSuccess?.('Payment recorded successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save payment.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Payment' : 'Record Payment'}>
      <form className="payment-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="payment-form-alert payment-form-alert-error" role="alert">{error}</div>}

        {isEdit && (
          <div className="form-group">
            <label htmlFor="payment-no" className="form-label">Payment No</label>
            <input
              id="payment-no"
              className="form-input"
              value={payment?.paymentNo || ''}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="payment-bill" className="form-label">Bill <span className="required">*</span></label>
          {isEdit ? (
            <input
              id="payment-bill"
              className="form-input"
              value={getBillLabel(payment?.bill)}
              disabled
              readOnly
            />
          ) : (
            <select id="payment-bill" name="bill" value={formData.bill} onChange={handleChange} disabled={loadingBills || bills.length === 0 || submitting} className={`form-input ${fieldErrors.bill ? 'input-error' : ''}`} required>
              {loadingBills ? <option value="">Loading bills…</option> : null}
              {!loadingBills && bills.length === 0 ? <option value="">No pending/overdue bills</option> : null}
              {!loadingBills && bills.map((bill) => {
                const billId = bill.id || bill._id
                return <option key={billId} value={billId}>{getBillLabel(bill)}</option>
              })}
            </select>
          )}
          {fieldErrors.bill && <span className="field-error-msg">{fieldErrors.bill}</span>}
        </div>

        {isEdit && billUnit && (
          <div className="form-group">
            <label className="form-label">Unit</label>
            <input
              className="form-input"
              value={billUnit.unitNumber || ''}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="payment-amount" className="form-label">Amount <span className="required">*</span></label>
            <input
              id="payment-amount"
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
            <label htmlFor="payment-method" className="form-label">Method <span className="required">*</span></label>
            <select id="payment-method" name="method" value={formData.method} onChange={handleChange} disabled={submitting} className={`form-input ${fieldErrors.method ? 'input-error' : ''}`} required>
              <option value="">Select method</option>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {fieldErrors.method && <span className="field-error-msg">{fieldErrors.method}</span>}
          </div>
        </div>

        {isEdit && (
          <div className="form-group">
            <label htmlFor="payment-status" className="form-label">Status <span className="required">*</span></label>
            <select id="payment-status" name="status" value={formData.status} onChange={handleChange} disabled={submitting} className="form-input">
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        )}

        {isEdit && payment?.paidAt && (
          <div className="form-group">
            <label className="form-label">Paid At</label>
            <input
              className="form-input"
              value={new Date(payment.paidAt).toLocaleDateString()}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="payment-reference" className="form-label">Reference</label>
          <input
            id="payment-reference"
            name="reference"
            type="text"
            value={formData.reference}
            onChange={handleChange}
            className="form-input"
            placeholder="Transaction / cheque number"
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="payment-notes" className="form-label">Notes</label>
          <textarea id="payment-notes" name="notes" value={formData.notes} onChange={handleChange} className="form-input" disabled={submitting} rows={3} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || loadingBills || (!isEdit && bills.length === 0)}>
            {submitting ? (isEdit ? 'Saving…' : 'Recording…') : (isEdit ? 'Save Changes' : 'Record Payment')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default PaymentModal
