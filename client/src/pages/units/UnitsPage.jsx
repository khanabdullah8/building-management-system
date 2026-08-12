import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoUnits } from '../../data/demoData'

const columns = [
  { key: 'unitNumber', header: 'Unit' },
  { key: 'building', header: 'Building' },
  { key: 'type', header: 'Type' },
  { key: 'floor', header: 'Floor' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function UnitsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoUnits)

  return (
    <ModulePage
      title="Units"
      description="View apartments and units across all buildings."
      actionLabel="New Unit"
      searchPlaceholder="Search units…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default UnitsPage
