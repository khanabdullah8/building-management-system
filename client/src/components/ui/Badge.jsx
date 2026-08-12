import './Badge.css'

function Badge({ tone = 'gray', children }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export default Badge
