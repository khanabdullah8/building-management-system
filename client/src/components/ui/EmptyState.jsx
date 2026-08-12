import './EmptyState.css'

function EmptyState({ title = 'Nothing here yet', description }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  )
}

export default EmptyState
