import './Card.css'

function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {title || actions ? (
        <header className="card-header">
          {title ? <h2 className="card-title">{title}</h2> : null}
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  )
}

export default Card
