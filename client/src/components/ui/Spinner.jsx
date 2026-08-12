import './Spinner.css'

function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner" role="status">
      <span className="spinner-ring" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export default Spinner
