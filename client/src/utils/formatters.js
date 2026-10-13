import { format } from 'date-fns'

export const CURRENCY_SYMBOL = '₹'

export function formatDate(date, pattern = 'MMM d, yyyy') {
  if (!date) return '—'
  return format(new Date(date), pattern)
}

export function formatDateTime(date) {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

export function formatCurrency(amount) {
  const value = Number(amount || 0)
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}