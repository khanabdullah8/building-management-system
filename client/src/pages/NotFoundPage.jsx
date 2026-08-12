import { Link } from 'react-router-dom'
import './NotFoundPage.css'

function NotFoundPage() {
  return (
    <div className="not-found">
      <h1>404</h1>
      <p>The page you are looking for does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Back to Dashboard
      </Link>
    </div>
  )
}

export default NotFoundPage
