import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { formatCurrency } from '../../utils/formatters'
import { statusTone } from '../../utils/status'
import { demoPayments } from '../../data/demoData'

const columns = [
  { key: 'paymentId', header: 'Payment' },
  { key: 'unit', header: 'Unit' },
  { key: 'method', header: 'Method' },
  {
    key: 'amount',
    header: 'Amount',
    render: (value) => formatCurrency(value),
  },
  { key: 'date', header: 'Date' },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function PaymentsPage() {
  const { loading, error, data, retry } = useDemoData(() => demoPayments)

  return (
    <ModulePage
      title="Payments"
      description="View payment history and receipts."
      actionLabel="Record Payment"
      searchPlaceholder="Search payments…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default PaymentsPage
