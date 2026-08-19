import { useCallback, useEffect, useRef, useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import SearchInput from '../../components/ui/SearchInput'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import DataTable from '../../components/ui/DataTable'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import http from '../../api/http'
import { statusTone } from '../../utils/status'
import { formatCurrency, formatDate } from '../../utils/formatters'
import PaymentModal from './PaymentModal'
import './PaymentsPage.css'

const METHOD_LABELS = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  upi: 'UPI',
  card: 'Card',
  cheque: 'Cheque',
}

function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editingPayment, setEditingPayment] = useState(null)
  const [paymentToDelete, setPaymentToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const requestId = useRef(0)

  const fetchPayments = useCallback(async (searchTerm = query) => {
    const currentRequest = ++requestId.current
    const trimmedSearch = searchTerm.trim()
    const params = new URLSearchParams()
    if (trimmedSearch) params.set('search', trimmedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (methodFilter) params.set('method', methodFilter)
    const qs = params.toString()
    const url = qs ? `/v1/payments?${qs}` : '/v1/payments'

    setLoading(true)
    setError(null)
    try {
      const response = await http.get(url)
      if (currentRequest === requestId.current) {
        setPayments(response.data?.data || [])
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setError(err.message || 'Failed to fetch payments.')
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [query, statusFilter, methodFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments(query)
    }, query.trim() ? 300 : 0)

    return () => clearTimeout(timer)
  }, [query, fetchPayments])

  const handleModalSuccess = async (message) => {
    setEditingPayment(null)
    setNotice({ type: 'success', message })
    await fetchPayments(query)
  }

  const handleDelete = async () => {
    if (!paymentToDelete || deleting) return

    setDeleting(true)
    setNotice(null)
    try {
      await http.delete(`/v1/payments/${paymentToDelete.id}`)
      setPaymentToDelete(null)
      setNotice({ type: 'success', message: 'Payment deleted successfully.' })
      await fetchPayments(query)
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Failed to delete payment. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      key: 'paymentNo',
      header: 'Payment No',
    },
    {
      key: 'bill',
      header: 'Bill No',
      render: (value) => value?.billNo || '—',
    },
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
    {
      key: 'amount',
      header: 'Amount',
      render: (value) => formatCurrency(value),
    },
    {
      key: 'method',
      header: 'Method',
      render: (value) => METHOD_LABELS[value] || value,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge tone={statusTone(value)}>{value}</Badge>,
    },
    {
      key: 'paidAt',
      header: 'Date',
      render: (value) => formatDate(value),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_, payment) => (
        <div className="payment-row-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setEditingPayment(payment)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setPaymentToDelete(payment)}>
            Delete
          </button>
        </div>
      ),
    },
  ]

  const renderBody = () => {
    if (loading) return <Spinner label="Loading payments…" />
    if (error) return <ErrorState message={error} onRetry={() => fetchPayments(query)} />
    if (payments.length === 0) {
      return (
        <EmptyState
          title={query.trim() || statusFilter || methodFilter ? 'No matching payments' : 'No payments yet'}
          description={
            query.trim() || statusFilter || methodFilter
              ? 'No payments match the current filters.'
              : 'Record a payment against a bill to get started.'
          }
        />
      )
    }
    return <DataTable columns={columns} rows={payments} />
  }

  return (
    <div className="module-page">
      <PageHeader
        title="Payments"
        description="View payment history and receipts."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setEditingPayment({})}>
            Record Payment
          </button>
        }
      />

      {notice && (
        <div className={`payment-page-alert payment-page-alert-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.message}
        </div>
      )}

      <div className="module-toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Search payments…" />
        <select
          className="form-input payment-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select
          className="form-input payment-method-filter"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          aria-label="Filter by method"
        >
          <option value="">All methods</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
          <option value="cheque">Cheque</option>
        </select>
      </div>
      <div className="module-body">{renderBody()}</div>

      {editingPayment && (
        <PaymentModal
          isOpen
          payment={editingPayment.id ? editingPayment : null}
          onClose={() => setEditingPayment(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {paymentToDelete && (
        <Modal
          isOpen
          title="Delete Payment"
          onClose={() => {
            if (!deleting) setPaymentToDelete(null)
          }}
        >
          <div className="delete-payment-content">
            <p>
              Delete payment &lsquo;<strong>{paymentToDelete.paymentNo}</strong>&rsquo;
              {paymentToDelete.bill?.unit ? ` for ${paymentToDelete.bill.unit.unitNumber}` : ''}?
            </p>
            <p className="delete-payment-warning">
              This will permanently remove the payment record. The associated bill status will be recalculated.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPaymentToDelete(null)} disabled={deleting}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default PaymentsPage
