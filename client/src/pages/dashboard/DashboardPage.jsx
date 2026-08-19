import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import ErrorState from '../../components/ui/ErrorState'
import http from '../../api/http'
import { formatCurrency } from '../../utils/formatters'
import { statusTone } from '../../utils/status'
import './DashboardPage.css'

const complaintColumns = [
  { key: 'subject', header: 'Subject' },
  {
    key: 'unit',
    header: 'Unit',
    render: (value) => {
      if (!value) return '—'
      const building = value.building
      return building ? `${value.unitNumber} (${building.name})` : value.unitNumber
    },
  },
  {
    key: 'status',
    header: 'Status',
    render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
  },
]

const maintenanceColumns = [
  { key: 'title', header: 'Request' },
  {
    key: 'unit',
    header: 'Unit',
    render: (value) => {
      if (!value) return '—'
      const building = value.building
      return building ? `${value.unitNumber} (${building.name})` : value.unitNumber
    },
  },
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

const paymentColumns = [
  {
    key: 'bill',
    header: 'Unit',
    render: (value) => {
      const unit = value?.unit
      if (!unit) return '—'
      const building = unit.building
      return building ? `${unit.unitNumber} (${building.name})` : unit.unitNumber
    },
  },
  { key: 'method', header: 'Method' },
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

const QUICK_ACTIONS = [
  { label: 'Raise a maintenance request', to: '/maintenance' },
  { label: 'View notices', to: '/notices' },
  { label: 'Visitors today', to: '/visitors' },
  { label: 'Review bills', to: '/billing' },
]

function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await http.get('/v1/dashboard')
        if (!cancelled) setData(response.data?.data || null)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [retryCount])

  const handleRetry = () => setRetryCount((c) => c + 1)

  return (
    <div className="dashboard">
      <PageHeader
        title="Dashboard"
        description="Overview of your building community at a glance."
      />

      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : error ? (
        <ErrorState message={error} onRetry={handleRetry} />
      ) : (
        <>
          <section className="kpi-grid" aria-label="Key metrics">
            <StatCard label="Total Buildings" value={data.buildings} icon="B" />
            <StatCard label="Total Units" value={data.units} tone="purple" icon="U" />
            <StatCard label="Occupied Units" value={data.occupied} tone="success" icon="O" />
            <StatCard label="Vacant Units" value={data.vacant} tone="warning" icon="V" />
            <StatCard label="Pending Maintenance" value={data.pendingMaintenance} tone="warning" icon="M" />
            <StatCard label="Open Complaints" value={data.openComplaints} tone="danger" icon="!" />
            <StatCard label="Pending Payments" value={data.pendingPayments} tone="warning" icon="P" />
            <StatCard
              label="Monthly Collection"
              value={formatCurrency(data.monthlyCollection)}
              tone="success"
              icon="C"
            />
          </section>

          <section className="dashboard-grid">
            <Card title="Recent Complaints">
              <DataTable columns={complaintColumns} rows={data.recentComplaints} />
            </Card>

            <Card title="Recent Maintenance Requests">
              <DataTable columns={maintenanceColumns} rows={data.recentMaintenance} />
            </Card>

            <Card title="Recent Payments">
              <DataTable columns={paymentColumns} rows={data.recentPayments} />
            </Card>

            <Card title="Quick Actions">
              <div className="quick-actions">
                {QUICK_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="btn btn-secondary quick-action"
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}

export default DashboardPage
