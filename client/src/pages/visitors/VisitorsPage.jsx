import ModulePage from '../../components/common/ModulePage'
import { useDemoData } from '../../hooks/useDemoData'
import { demoVisitors } from '../../data/demoData'

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'unit', header: 'Visiting' },
  { key: 'purpose', header: 'Purpose' },
  { key: 'checkInAt', header: 'Check In' },
  { key: 'checkOutAt', header: 'Check Out' },
]

function VisitorsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoVisitors)

  return (
    <ModulePage
      title="Visitors"
      description="Track visitor check-ins, check-outs and purpose of visits."
      actionLabel="Register Visitor"
      searchPlaceholder="Search visitors…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default VisitorsPage
