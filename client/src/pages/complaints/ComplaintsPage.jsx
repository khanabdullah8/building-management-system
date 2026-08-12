import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoComplaints } from '../../data/demoData'

const columns = [
  { key: 'subject', header: 'Subject' },
  { key: 'unit', header: 'Unit' },
  {
    key: 'priority',
    header: 'Priority',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function ComplaintsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoComplaints)

  return (
    <ModulePage
      title="Complaints"
      description="Manage resident complaints and their resolution."
      actionLabel="New Complaint"
      searchPlaceholder="Search complaints…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default ComplaintsPage
