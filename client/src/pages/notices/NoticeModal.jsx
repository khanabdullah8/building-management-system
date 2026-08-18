import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import './NoticeModal.css'

function NoticeModal({ isOpen, notice, onClose, onSuccess }) {
  const isEdit = Boolean(notice?.id)
  const [buildings, setBuildings] = useState([])
  const [loadingBuildings, setLoadingBuildings] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formData, setFormData] = useState({
    title: notice?.title || '',
    category: notice?.category || 'notice',
    description: notice?.description || '',
    building: notice?.building?.id || notice?.building?._id || notice?.building || '',
    publishedAt: notice?.publishedAt ? new Date(notice.publishedAt).toISOString().slice(0, 10) : '',
    expiresAt: notice?.expiresAt ? new Date(notice.expiresAt).toISOString().slice(0, 10) : '',
  })

  useEffect(() => {
    let isMounted = true

    http
      .get('/v1/buildings')
      .then((response) => {
        const list = response.data?.data || []
        if (isMounted) setBuildings(list)
      })
      .catch(() => {})
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
    if (!formData.title.trim()) errors.title = 'Notice title is required'
    if (!formData.category) errors.category = 'Notice category is required'
    if (formData.expiresAt && formData.publishedAt && formData.expiresAt < formData.publishedAt) {
      errors.expiresAt = 'Expiry date cannot be before the published date'
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
      title: formData.title.trim(),
      category: formData.category,
      description: formData.description.trim(),
      building: formData.building || null,
      publishedAt: formData.publishedAt || undefined,
      expiresAt: formData.expiresAt || null,
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/notices/${notice.id}`, payload)
        await onSuccess?.('Notice updated successfully.')
      } else {
        await http.post('/v1/notices', payload)
        await onSuccess?.('Notice created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save notice.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Notice' : 'New Notice'}>
      <form className="notice-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="notice-form-alert notice-form-alert-error" role="alert">{error}</div>}

        <div className="form-group">
          <label htmlFor="notice-title" className="form-label">Title <span className="required">*</span></label>
          <input id="notice-title" name="title" value={formData.title} onChange={handleChange} className={`form-input ${fieldErrors.title ? 'input-error' : ''}`} disabled={submitting} required />
          {fieldErrors.title && <span className="field-error-msg">{fieldErrors.title}</span>}
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="notice-category" className="form-label">Category <span className="required">*</span></label>
            <select id="notice-category" name="category" value={formData.category} onChange={handleChange} className={`form-input ${fieldErrors.category ? 'input-error' : ''}`} disabled={submitting} required>
              <option value="notice">Notice</option>
              <option value="announcement">Announcement</option>
              <option value="event">Event</option>
            </select>
            {fieldErrors.category && <span className="field-error-msg">{fieldErrors.category}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="notice-building" className="form-label">Audience (Building)</label>
            <select id="notice-building" name="building" value={formData.building} onChange={handleChange} className="form-input" disabled={submitting}>
              <option value="">{loadingBuildings ? 'Loading buildings…' : 'All residents'}</option>
              {buildings.map((building) => {
                const id = building.id || building._id
                const label = building.code ? `${building.name} (${building.code})` : building.name
                return <option key={id} value={id}>{label}</option>
              })}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="notice-description" className="form-label">Description</label>
          <textarea id="notice-description" name="description" value={formData.description} onChange={handleChange} className="form-input" disabled={submitting} rows={4} />
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="notice-publishedAt" className="form-label">Published Date</label>
            <input id="notice-publishedAt" name="publishedAt" type="date" value={formData.publishedAt} onChange={handleChange} className="form-input" disabled={submitting} />
          </div>
          <div className="form-group flex-1">
            <label htmlFor="notice-expiresAt" className="form-label">Expiry Date</label>
            <input id="notice-expiresAt" name="expiresAt" type="date" value={formData.expiresAt} onChange={handleChange} className={`form-input ${fieldErrors.expiresAt ? 'input-error' : ''}`} disabled={submitting} />
            {fieldErrors.expiresAt && <span className="field-error-msg">{fieldErrors.expiresAt}</span>}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Notice')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default NoticeModal
