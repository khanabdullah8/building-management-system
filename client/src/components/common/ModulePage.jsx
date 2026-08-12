import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import SearchInput from '../ui/SearchInput'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import DataTable from '../ui/DataTable'
import './ModulePage.css'

// Phase 2 scaffold: every module page shares the same structure —
// header + primary action, search toolbar, and a data area with
// loading / error / empty / ready states.
function ModulePage({
  title,
  description,
  actionLabel,
  actionTo,
  searchPlaceholder = 'Search…',
  columns = [],
  rows = [],
  loading = false,
  error = null,
  onRetry,
}) {
  const [query, setQuery] = useState('')
  const [actionNotice, setActionNotice] = useState(false)

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? '').toLowerCase().includes(q),
      ),
    )
  }, [rows, query])

  const handleAction = () => {
    setActionNotice(true)
  }

  const renderBody = () => {
    if (loading) return <Spinner label="Loading data…" />
    if (error) return <ErrorState message={error} onRetry={onRetry} />
    if (filteredRows.length === 0) {
      return (
        <EmptyState
          title={query ? 'No results found' : 'Nothing here yet'}
          description={
            query
              ? `No ${title.toLowerCase()} match "${query}".`
              : `There are no ${title.toLowerCase()} to show yet.`
          }
        />
      )
    }
    return <DataTable columns={columns} rows={filteredRows} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title={title}
        description={description}
        actions={
          actionLabel ? (
            actionTo ? (
              <Link className="btn btn-primary" to={actionTo} onClick={handleAction}>
                {actionLabel}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAction}
              >
                {actionLabel}
              </button>
            )
          ) : null
        }
      />
      {actionNotice ? (
        <p className="module-action-notice" role="status">
          This action is not available yet — it will be implemented in a later phase.
        </p>
      ) : null}
      <div className="module-toolbar">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
        />
      </div>
      <div className="module-body">{renderBody()}</div>
    </div>
  )
}

export default ModulePage
