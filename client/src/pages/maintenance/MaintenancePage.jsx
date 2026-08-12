import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoMaintenance } from '../../data/demoData'

const columns = [
  { key: 'title', header: 'Request' },
  { key: 'unit', header: 'Unit' },
  {
    key: 'priority',
    header: 'Priority',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
  { key: 'assignedTo', header: 'Assigned To' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function MaintenancePage() {
  const { loading, error, data, retry } = useDemoData(() => demoMaintenance)

  return (
    <ModulePage
      title="Maintenance"
      description="Track maintenance requests, priorities and assignments."
      actionLabel="New Request"
      searchPlaceholder="Search maintenance…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default MaintenancePage
