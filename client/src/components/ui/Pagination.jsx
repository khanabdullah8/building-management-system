import './Pagination.css'

function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (!total || totalPages <= 0) return null

  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-info">
        Showing {from}–{to} of {total}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="btn btn-secondary pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
        >
          Previous
        </button>
        <span className="pagination-pages">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

export default Pagination
