import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Pagination from '../../components/ui/Pagination'
import http from '../../api/http'
import { formatDateTime } from '../../utils/formatters'
import { buildListParams } from '../../utils/queryParams'

const MODULES = [
  'building',
  'unit',
  'resident',
  'user',
  'maintenance',
  'complaint',
  'notice',
  'visitor',
  'parking',
  'expense',
  'bill',
  'payment',
]

const ACTIONS = ['created', 'updated', 'deleted']

const ACTION_TONES = {
  created: 'success',
  updated: 'warning',
  deleted: 'danger',
}

const columns = [
  {
    key: 'createdAt',
    header: 'Timestamp',
    render: (value) => <span className="audit-timestamp">{formatDateTime(value)}</span>,
  },
  {
    key: 'action',
    header: 'Action',
    render: (value) => <Badge tone={ACTION_TONES[value] || 'gray'}>{value}</Badge>,
  },
  { key: 'module', header: 'Module' },
  {
    key: 'actorName',
    header: 'Actor',
    render: (value, row) => (
      <span className="audit-actor">
        {value || row.actorId}
        {row.actorRole ? <span className="audit-actor-role"> · {row.actorRole}</span> : null}
      </span>
    ),
  },
  {
    key: 'resourceLabel',
    header: 'Resource',
    render: (value, row) => value || <span className="audit-empty-cell">{row.resourceId || '—'}</span>,
  },
  {
    key: 'buildingName',
    header: 'Building',
    render: (value) => value || <span className="audit-empty-cell">—</span>,
  },
]

function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestId = useRef(0)
  const PAGE_SIZE = 500

  const fetchLogs = useCallback(async (moduleValue = moduleFilter, actionValue = actionFilter) => {
    const currentRequest = ++requestId.current
    const qs = buildListParams({
      page: 1,
      limit: PAGE_SIZE,
      filters: { module: moduleValue, action: actionValue },
    })
    const url = `/v1/audit-logs${qs ? `?${qs}` : ''}`

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setLogs(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch audit logs.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [moduleFilter, actionFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchLogs(moduleFilter, actionFilter)
    }, 0)

    return () => clearTimeout(timer)
  }, [moduleFilter, actionFilter, fetchLogs])

  const filtered = logs.filter((log) => {
    if (!query.trim()) return true
    const haystack = [log.actorName, log.module, log.action, log.resourceLabel, log.buildingName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  const filteredTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, filteredTotalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > filteredTotalPages) return
    setPage(nextPage)
  }

  const hasFilters = query.trim() || moduleFilter || actionFilter

  const renderBody = () => {
    if (loading) return <Spinner label="Loading audit logs…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchLogs(moduleFilter, actionFilter)} />
    if (filtered.length === 0) {
      return (
        <EmptyState
          title={hasFilters ? 'No matching audit logs' : 'No audit activity yet'}
          description={
            hasFilters
              ? 'No audit records match the current search and filters.'
              : 'Administrative actions will appear here as they happen.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={pageItems} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Audit Logs"
        description="Review a read-only trail of administrative actions."
      />

      <div className="module-toolbar">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value)
            setPage(1)
          }}
          placeholder="Search audit logs…"
        />
        <select
          aria-label="Filter by module"
          className="form-input module-filter-select"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="">All modules</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by action"
          className="form-input module-filter-select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      <Pagination
        page={safePage}
        totalPages={filteredTotalPages}
        total={filtered.length}
        limit={PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  )
}

export default AuditLogsPage
