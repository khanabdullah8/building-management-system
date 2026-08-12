import './ErrorState.css'

function ErrorState({ message = 'Something went wrong while loading data.', onRetry }) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state-icon" aria-hidden="true">
        !
      </div>
      <h3>Unable to load data</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState
