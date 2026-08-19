import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import './LoginPage.css'

function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const email = formData.get('email')
    const password = formData.get('password')

    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">B</span>
          <span className="login-brand-name">BMMS</span>
        </div>
        <h1>Sign in</h1>
        <p className="login-subtitle">Sign in to your building management account.</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Email</span>
            <input type="email" name="email" placeholder="you@example.com" autoComplete="username" required />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input type="password" name="password" placeholder="••••••••" autoComplete="current-password" required />
          </label>
          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default LoginPage
