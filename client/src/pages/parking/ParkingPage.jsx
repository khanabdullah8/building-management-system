import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoParking } from '../../data/demoData'

const columns = [
  { key: 'slot', header: 'Slot' },
  { key: 'level', header: 'Level' },
  { key: 'type', header: 'Type' },
  { key: 'allocatedTo', header: 'Allocated To' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function ParkingPage() {
  const { loading, error, data, retry } = useDemoData(() => demoParking)

  return (
    <ModulePage
      title="Parking"
      description="Manage parking slots and allocations."
      actionLabel="New Slot"
      searchPlaceholder="Search parking…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default ParkingPage
