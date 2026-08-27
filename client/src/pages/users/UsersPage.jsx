import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import http from '../../api/http'
import { statusTone } from '../../utils/status'
import { buildListParams } from '../../utils/queryParams'
import UserModal from './UserModal'
import './UserModal.css'

const PAGE_SIZE = 20

function UsersPage() {
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const requestId = useRef(0)

  const fetchUsers = useCallback(
    async (searchTerm, pageNumber) => {
      const currentRequest = ++requestId.current
      const qs = buildListParams({
        page: pageNumber,
        limit: PAGE_SIZE,
        search: searchTerm,
        filters: { role: roleFilter, status: statusFilter },
      })
      const url = `/v1/users${qs ? `?${qs}` : ''}`

      setLoading(true)
      setError(null)
      try {
        const response = await http.get(url)
        if (currentRequest === requestId.current) {
          setUsers(response.data?.data || [])
          setTotalPages(response.data?.meta?.totalPages || 0)
          setTotal(response.data?.meta?.total || 0)
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
    },
    [roleFilter, statusFilter]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchUsers(query, 1)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, roleFilter, statusFilter, fetchUsers])

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return
    setPage(nextPage)
    fetchUsers(query, nextPage)
  }

  const handleModalSuccess = async (message) => {
    setEditingUser(null)
    setNotice({ type: 'success', message })
    await fetchUsers(query, page)
  }

  const handleDelete = async () => {
    if (!userToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/users/${userToDelete.id}`)
      setUserToDelete(null)
      setNotice({ type: 'success', message: 'User deleted successfully.' })
      await fetchUsers(query, page)
    } catch (err) {
      setNotice({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Failed to delete user. Please try again.',
      })
    } finally {
      setDeleting(false)
    }
  }

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
        if (row.role === 'resident') {
          if (row.resident) {
            const unitNumber = row.resident.unit?.unitNumber ? ` · ${row.resident.unit.unitNumber}` : ''
            return (
              <span className="users-scope-label">
                {`Linked${unitNumber}`}
              </span>
            )
          }
          return <span className="users-scope-empty">No resident linked</span>
        }
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
    {
      key: 'actions',
      header: 'Actions',
      render: (_, user) => (
        <div className="user-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingUser(user)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setUserToDelete(user)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const hasFilters = query.trim() || roleFilter || statusFilter

  const renderBody = () => {
    if (loading) return <Spinner label="Loading users…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchUsers(query, page)} />
    if (users.length === 0) {
      return (
        <EmptyState
          title={hasFilters ? 'No matching users' : 'No users yet'}
          description={
            hasFilters
              ? 'No users match the current search and filters.'
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
        description="Manage user accounts, roles and building assignments."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingUser({})}>
            New User
          </button>
        }
      />

      {notice && (
        <div className={`user-page-alert user-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search users…" />
        <select
          aria-label="Filter by role"
          className="form-input module-filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="staff">Staff</option>
          <option value="resident">Residents</option>
        </select>
        <select
          aria-label="Filter by status"
          className="form-input module-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={PAGE_SIZE}
        onPageChange={handlePageChange}
      />

      {editingUser && (
        <UserModal
          isOpen
          user={editingUser.id ? editingUser : null}
          onClose={() => setEditingUser(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {userToDelete && (
        <Modal
          isOpen
          title="Delete User"
          onClose={() => {
            if (!deleting) setUserToDelete(null)
          }}
        >
          <div className="delete-user-content">
            <p>
              Delete <strong>{userToDelete.name}</strong> ({userToDelete.email})?
            </p>
            <p className="delete-user-warning">
              This permanently removes the account. Consider deactivating the user instead.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setUserToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default UsersPage
