import ModulePage from '../../components/common/ModulePage'
import Badge from '../../components/ui/Badge'
import { useDemoData } from '../../hooks/useDemoData'
import { statusTone } from '../../utils/status'
import { demoUsers } from '../../data/demoData'

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email' },
  {
    key: 'role',
    header: 'Role',
    render: (value) => <Badge tone={value === 'admin' ? 'danger' : value === 'staff' ? 'info' : 'purple'}>{value}</Badge>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

function UsersPage() {
  const { loading, error, data, retry } = useDemoData(() => demoUsers)

  return (
    <ModulePage
      title="Users"
      description="Manage user accounts and roles."
      actionLabel="New User"
      searchPlaceholder="Search users…"
      columns={columns}
      rows={data ?? []}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}

export default UsersPage
