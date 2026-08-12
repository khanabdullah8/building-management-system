import './LoginPage.css'

function LoginPage() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">B</span>
          <span className="login-brand-name">BMMS</span>
        </div>
        <h1>Sign in</h1>
        <p className="login-note">
          Authentication will be implemented in Phase 2.
        </p>
        <button type="button" className="btn btn-primary" disabled>
          Sign in
        </button>
      </div>
    </div>
  )
}

export default LoginPage
