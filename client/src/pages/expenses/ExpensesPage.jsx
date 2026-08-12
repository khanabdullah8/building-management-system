import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { formatCurrency } from '../../utils/formatters'
import { statusTone } from '../../utils/status'
import { demoExpenses } from '../../data/demoData'

const columns = [
  { key: 'date', header: 'Date' },
  { key: 'category', header: 'Category' },
  { key: 'description', header: 'Description' },
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

function ExpensesPage() {
  const { loading, error, data, retry } = useDemoData(() => demoExpenses)

  return (
    <ModulePage
      title="Expenses"
      description="Record and review building expenses."
      actionLabel="Add Expense"
      searchPlaceholder="Search expenses…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default ExpensesPage
