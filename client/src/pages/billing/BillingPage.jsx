import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { formatCurrency } from '../../utils/formatters'
import { statusTone } from '../../utils/status'
import { demoBills } from '../../data/demoData'

const columns = [
  { key: 'billNo', header: 'Bill No' },
  { key: 'unit', header: 'Unit' },
  { key: 'period', header: 'Period' },
  {
    key: 'amount',
    header: 'Amount',
    render: (value) => formatCurrency(value),
  },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function BillingPage() {
  const { loading, error, data, retry } = useDemoData(() => demoBills)

  return (
    <ModulePage
      title="Billing"
      description="Generate maintenance bills and manage dues."
      actionLabel="Generate Bills"
      searchPlaceholder="Search bills…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default BillingPage
