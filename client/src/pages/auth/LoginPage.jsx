import { useState } from 'react'
import './LoginPage.css'

// Phase 2: authentication entry point. JWT-backed sign-in will be
// wired in a later phase — submitting the form currently only shows
// a notice and does not authenticate.
function LoginPage() {
  const [notice, setNotice] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    setNotice(true)
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
          <button type="submit" className="btn btn-primary login-submit">
            Sign in
          </button>
        </form>
        {notice ? (
          <p className="login-note" role="status">
            Authentication is not implemented yet (Phase 2).
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default LoginPage
