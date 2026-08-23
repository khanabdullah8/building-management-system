import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import http from '../../api/http'
import { formatDateTime } from '../../utils/formatters'
import './NotificationsPage.css'

function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mutationError, setMutationError] = useState(null)
  const [markingId, setMarkingId] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)
  const requestId = useRef(0)

  const fetchNotifications = useCallback(async () => {
    const currentRequest = ++requestId.current

    setLoading(true)
    setError(null)
    try {
      const response = await http.get('/v1/notifications')
      if (currentRequest === requestId.current) {
        setNotifications(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch notifications.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNotifications()
    }, 0)

    return () => clearTimeout(timer)
  }, [fetchNotifications])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  )

  const filteredNotifications = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notifications
    return notifications.filter(
      (n) =>
        String(n.title ?? '').toLowerCase().includes(q) ||
        String(n.type ?? '').toLowerCase().includes(q)
    )
  }, [notifications, query])

  const handleMarkRead = async (notification) => {
    if (markingId || notification.readAt) return

    setMarkingId(notification.id)
    setMutationError(null)
    try {
      const response = await http.patch(`/v1/notifications/${notification.id}/read`)
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, readAt: response.data?.data?.readAt || new Date().toISOString() }
            : n
        )
      )
    } catch (err) {
      setMutationError(
        err.response?.data?.message ||
          err.message ||
          'Failed to mark the notification as read. Please try again.'
      )
    } finally {
      setMarkingId(null)
    }
  }

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return

    setMarkingAll(true)
    setMutationError(null)
    try {
      await http.post('/v1/notifications/read-all')
      const now = new Date().toISOString()
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })))
    } catch (err) {
      setMutationError(
        err.response?.data?.message ||
          err.message ||
          'Failed to mark all notifications as read. Please try again.'
      )
    } finally {
      setMarkingAll(false)
    }
  }

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (value, row) => (
        <span className={row.readAt ? undefined : 'notifications-title-unread'}>{value}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (value) => <Badge tone="info">{value}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (_, row) =>
        row.readAt ? <Badge tone="gray">read</Badge> : <Badge tone="warning">unread</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (value) => formatDateTime(value),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, row) => (
        <div className="notifications-row-actions">
          {row.readAt ? (
            <span className="notifications-read-label">—</span>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleMarkRead(row)}
              disabled={markingId !== null}
            >
              {markingId === row.id ? 'Marking…' : 'Mark read'}
            </button>
          )}
        </div>
      ),
    },
  ]

  const hasFilters = query.trim().length > 0

  const renderBody = () => {
    if (loading) return <Spinner label="Loading notifications…" />
    if (error) return <ErrorState message={error} onRetry={fetchNotifications} />
    if (filteredNotifications.length === 0) {
      return (
        <EmptyState
          title={hasFilters ? 'No matching notifications' : 'No notifications yet'}
          description={
            hasFilters
              ? 'No notifications match the current search.'
              : 'You are all caught up — nothing to show here.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={filteredNotifications} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Notifications"
        description="View system and activity notifications."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleMarkAllRead}
            disabled={markingAll || unreadCount === 0}
          >
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        }
      />

      {mutationError && (
        <div className="notifications-page-alert notifications-page-alert-error" role="alert">
          {mutationError}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search notifications…" />
      </div>
      <div className="module-body">{renderBody()}</div>
    </div>
  )
}

export default NotificationsPage
