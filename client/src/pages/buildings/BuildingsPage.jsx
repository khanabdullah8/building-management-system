import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoBuildings } from '../../data/demoData'

const columns = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Name' },
  { key: 'address', header: 'Address' },
  { key: 'units', header: 'Units' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function BuildingsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoBuildings)

  return (
    <ModulePage
      title="Buildings"
      description="Manage building properties, blocks and floors."
      actionLabel="New Building"
      searchPlaceholder="Search buildings…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default BuildingsPage
