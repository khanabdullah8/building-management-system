import './StatCard.css'

function StatCard({ label, value, tone = 'default', icon, hint }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        {icon ? (
          <span className="stat-card-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <div className="stat-card-value">{value}</div>
      {hint ? <div className="stat-card-hint">{hint}</div> : null}
    </div>
  )
}

export default StatCard
