import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { demoNotifications } from '../../data/demoData'

const columns = [
  { key: 'title', header: 'Title' },
  {
    key: 'type',
    header: 'Type',
    render: (value) => <Badge tone="info">{value}</Badge>,
  },
  {
    key: 'read',
    header: 'Read',
    render: (value) => <Badge tone={value ? 'gray' : 'warning'}>{value ? 'read' : 'unread'}</Badge>,
  },
  { key: 'date', header: 'Date' },
]

function NotificationsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoNotifications)

  return (
    <ModulePage
      title="Notifications"
      description="View system and activity notifications."
      actionLabel="Mark all read"
      searchPlaceholder="Search notifications…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default NotificationsPage
