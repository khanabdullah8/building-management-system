import { useEffect, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import http from '../../api/http'
import './UserModal.css'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'resident', label: 'Resident' },
]

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function buildingId(building) {
  return building?.id || building?._id || building
}

function UserModal({ isOpen, user, onClose, onSuccess }) {
  const isEdit = Boolean(user?.id)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    role: user?.role || 'resident',
    status: user?.status || 'active',
  })
  const [selectedBuildingIds, setSelectedBuildingIds] = useState(
    Array.isArray(user?.buildings) ? user.buildings.map(buildingId).filter(Boolean) : []
  )
  const [buildings, setBuildings] = useState([])
  const [buildingsLoading, setBuildingsLoading] = useState(true)
  const [buildingsError, setBuildingsError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    let cancelled = false

    const loadBuildings = async () => {
      setBuildingsLoading(true)
      setBuildingsError(null)
      try {
        const response = await http.get('/v1/buildings')
        if (!cancelled) {
          setBuildings(response.data?.data || [])
        }
      } catch (err) {
        if (!cancelled) {
          setBuildingsError(err.message || 'Failed to load buildings.')
        }
      } finally {
        if (!cancelled) {
          setBuildingsLoading(false)
        }
      }
    }

    loadBuildings()
    return () => {
      cancelled = true
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

  const toggleBuilding = (id) => {
    setSelectedBuildingIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const validate = () => {
    const errors = {}
    if (!formData.name.trim()) errors.name = 'Name is required'
    if (!formData.email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^\S+@\S+\.\S+$/.test(formData.email.trim())) {
      errors.email = 'Email must be a valid email address'
    }
    if (!isEdit && !formData.password) {
      errors.password = 'Password is required'
    } else if (!isEdit && formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
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

    // Explicit payload — never send building assignments for non-staff roles.
    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      role: formData.role,
      status: formData.status,
    }
    if (!isEdit) {
      payload.password = formData.password
    }
    if (formData.role === 'staff') {
      payload.buildings = selectedBuildingIds
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await http.patch(`/v1/users/${user.id}`, payload)
        await onSuccess?.('User updated successfully.')
      } else {
        await http.post('/v1/users', payload)
        await onSuccess?.('User created successfully.')
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save user.')
      if (err.response?.data?.errors && typeof err.response.data.errors === 'object') {
        setFieldErrors(err.response.data.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const showBuildings = formData.role === 'staff'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit User' : 'New User'}>
      <form className="user-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="user-form-alert user-form-alert-error" role="alert">{error}</div>}
        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="user-name" className="form-label">Name <span className="required">*</span></label>
            <input id="user-name" name="name" value={formData.name} onChange={handleChange} className={`form-input ${fieldErrors.name ? 'input-error' : ''}`} required />
            {fieldErrors.name && <span className="field-error-msg">{fieldErrors.name}</span>}
          </div>
          <div className="form-group flex-1">
            <label htmlFor="user-email" className="form-label">Email <span className="required">*</span></label>
            <input id="user-email" type="email" name="email" value={formData.email} onChange={handleChange} className={`form-input ${fieldErrors.email ? 'input-error' : ''}`} required />
            {fieldErrors.email && <span className="field-error-msg">{fieldErrors.email}</span>}
          </div>
        </div>

        {!isEdit && (
          <div className="form-group">
            <label htmlFor="user-password" className="form-label">Password <span className="required">*</span></label>
            <input id="user-password" type="password" name="password" value={formData.password} onChange={handleChange} className={`form-input ${fieldErrors.password ? 'input-error' : ''}`} minLength={8} required />
            {fieldErrors.password && <span className="field-error-msg">{fieldErrors.password}</span>}
          </div>
        )}

        <div className="form-row">
          <div className="form-group flex-1">
            <label htmlFor="user-role" className="form-label">Role</label>
            <select id="user-role" name="role" value={formData.role} onChange={handleChange} className="form-input">
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group flex-1">
            <label htmlFor="user-status" className="form-label">Status</label>
            <select id="user-status" name="status" value={formData.status} onChange={handleChange} className={`form-input ${fieldErrors.status ? 'input-error' : ''}`}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            {fieldErrors.status && <span className="field-error-msg">{fieldErrors.status}</span>}
          </div>
        </div>

        {showBuildings && (
          <fieldset className="user-buildings-fieldset">
            <legend className="form-label">Assigned Buildings</legend>
            {buildingsLoading && <Spinner label="Loading buildings…" />}
            {!buildingsLoading && buildingsError && (
              <div className="user-buildings-state">
                <p>{buildingsError}</p>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  const retry = async () => {
                    setBuildingsLoading(true)
                    setBuildingsError(null)
                    try {
                      const response = await http.get('/v1/buildings')
                      setBuildings(response.data?.data || [])
                    } catch (err) {
                      setBuildingsError(err.message || 'Failed to load buildings.')
                    } finally {
                      setBuildingsLoading(false)
                    }
                  }
                  retry()
                }}>
                  Retry
                </button>
              </div>
            )}
            {!buildingsLoading && !buildingsError && buildings.length === 0 && (
              <p className="user-buildings-empty">No buildings available yet.</p>
            )}
            {!buildingsLoading && !buildingsError && buildings.length > 0 && (
              <div className="user-buildings-list" data-testid="building-checkbox-list">
                {buildings.map((building) => {
                  const id = buildingId(building)
                  const label = `${building.code} — ${building.name}`
                  return (
                    <label key={id} className="user-building-option">
                      <input
                        type="checkbox"
                        checked={selectedBuildingIds.includes(id)}
                        onChange={() => toggleBuilding(id)}
                      />
                      <span>{label}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={submitting}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || (showBuildings && buildingsLoading)}
          >
            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create User')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default UserModal
