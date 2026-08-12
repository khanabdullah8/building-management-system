import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoResidents } from '../../data/demoData'

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'unit', header: 'Unit' },
  { key: 'phone', header: 'Phone' },
  {
    key: 'type',
    header: 'Ownership',
    render: (value) => <Badge tone={value === 'owner' ? 'info' : 'purple'}>{value}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function ResidentsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoResidents)

  return (
    <ModulePage
      title="Residents"
      description="Manage resident profiles, family members and occupancy."
      actionLabel="Add Resident"
      searchPlaceholder="Search residents…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default ResidentsPage
