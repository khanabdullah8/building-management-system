import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoNotices } from '../../data/demoData'

const columns = [
  { key: 'title', header: 'Title' },
  {
    key: 'category',
    header: 'Category',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
  { key: 'audience', header: 'Audience' },
  { key: 'publishedAt', header: 'Published' },
  { key: 'expiresAt', header: 'Expires' },
]

function NoticesPage() {
  const { loading, error, data, retry } = useDemoData(() => demoNotices)

  return (
    <ModulePage
      title="Notices"
      description="Publish notices and announcements to residents."
      actionLabel="New Notice"
      searchPlaceholder="Search notices…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default NoticesPage
