import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import http from '../../api/http'
import { statusTone } from '../../utils/status'
import '../../components/common/ModulePage.css'

function UsersPage() {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestId = useRef(0)

  const fetchUsers = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const url = trimmedSearch
      ? `/v1/users?search=${encodeURIComponent(trimmedSearch)}`
      : '/v1/users'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setUsers(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch users.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchUsers])

  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (value) => <Badge tone={value === 'admin' ? 'danger' : value === 'staff' ? 'info' : 'purple'}>{value}</Badge>,
    },
    {
      key: 'buildings',
      header: 'Buildings',
      render: (value, row) => {
        if (row.role === 'admin') return <span className="users-scope-label">All</span>
        if (row.role === 'resident') return <span className="users-scope-label">Resident scope</span>
        if (!value || value.length === 0) return <span className="users-scope-empty">None assigned</span>
        return (
          <span className="users-buildings-list">
            {value.map((b) => b.name || b.code || b).join(', ')}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading users…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchUsers(query)} />
    if (users.length === 0) {
      return (
        <EmptyState
          title={query.trim() ? 'No matching users' : 'No users yet'}
          description={
            query.trim()
              ? `No users match "${query.trim()}".`
              : 'No user accounts have been created yet.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={users} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Users"
        description="Manage user accounts and roles."
        actions={null}
      />

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search users…" />
      </div>
      <div className="module-body">{renderBody()}</div>
    </div>
  )
}

export default UsersPage
