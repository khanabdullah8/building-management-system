import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { demoAuditLogs } from '../../data/demoData'

const columns = [
  {
    key: 'action',
    header: 'Action',
    render: (value) => <Badge tone="gray">{value}</Badge>,
  },
  { key: 'module', header: 'Module' },
  { key: 'actor', header: 'Actor' },
  { key: 'timestamp', header: 'Timestamp' },
]

function AuditLogsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoAuditLogs)

  return (
    <ModulePage
      title="Audit Logs"
      description="Review a trail of administrative actions."
      searchPlaceholder="Search audit logs…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default AuditLogsPage
