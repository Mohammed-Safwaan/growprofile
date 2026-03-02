'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Search, Filter, DollarSign, ChevronLeft, ChevronRight,
  TrendingUp, AlertCircle, CheckCircle2, XCircle, Clock, CreditCard
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'

interface PaymentRow {
  id: string
  amount: number
  currency: string
  status: string
  razorpayPaymentId: string | null
  paidAt: string | null
  createdAt: string
  user: { id: string; email: string; name: string | null }
  plan: { displayName: string } | null
}

interface Totals {
  allTime: number
  thisMonth: number
  pending: number
  failed: number
}

const statusConfig: Record<string, { label: string; cls: string; icon: any }> = {
  CAPTURED: { label: 'Paid', cls: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  CREATED:  { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  FAILED:   { label: 'Failed', cls: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  REFUNDED: { label: 'Refunded', cls: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertCircle },
}

function fmtCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(amount / 100)
}

export default function PaymentsPage() {
  const { authFetch } = useAuth()

  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState<Totals>({ allTime: 0, thisMonth: 0, pending: 0, failed: 0 })

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fetchPayments = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await authFetch(`/api/admin/payments?${params}`)
      const data = await res.json()
      if (data.success) {
        setPayments(data.data || [])
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
        setTotals(data.totals || totals)
      }
    } catch (err) {
      console.error('fetchPayments error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, fromDate, toDate, authFetch])

  useEffect(() => { fetchPayments(page) }, [page, statusFilter]) // eslint-disable-line

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchPayments(1)
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const hasFilters = search || statusFilter !== 'all' || fromDate || toDate

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payments</h1>
          <p className="text-muted-foreground mt-1">Full payment history across all users and plans.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchPayments(page)}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Revenue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'All-Time Revenue', value: fmtCurrency(totals.allTime, 'INR'), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'This Month', value: fmtCurrency(totals.thisMonth, 'INR'), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pending', value: fmtCurrency(totals.pending, 'INR'), icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Failed', value: fmtCurrency(totals.failed, 'INR'), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by user email or name..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="CAPTURED">Paid</SelectItem>
                <SelectItem value="CREATED">Pending</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              className="w-36"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              className="w-36"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To"
            />

            <Button type="submit" className="bg-primary hover:bg-primary/90">
              <Filter className="w-4 h-4 mr-2" /> Filter
            </Button>
            {hasFilters && (
              <Button type="button" variant="ghost" onClick={clearFilters} className="text-muted-foreground">
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {loading ? 'Loading...' : `${total} payment${total !== 1 ? 's' : ''} found`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No payments found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['User', 'Plan', 'Amount', 'Status', 'Razorpay ID', 'Paid At'].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((pmt) => {
                    const sc = statusConfig[pmt.status] || { label: pmt.status, cls: 'bg-slate-100 text-slate-700 border-slate-200', icon: CreditCard }
                    const Icon = sc.icon
                    return (
                      <tr key={pmt.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-foreground">{pmt.user.name || '—'}</p>
                            <p className="text-muted-foreground text-xs">{pmt.user.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                            {pmt.plan?.displayName || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          {fmtCurrency(pmt.amount, pmt.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${sc.cls}`}>
                            <Icon className="w-3 h-3" />{sc.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs font-mono">
                          {pmt.razorpayPaymentId ? (
                            <span title={pmt.razorpayPaymentId}>{pmt.razorpayPaymentId.slice(0, 18)}…</span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {pmt.paidAt
                            ? new Date(pmt.paidAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                            : new Date(pmt.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} · {total} total</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                  return <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>{p}</Button>
                })}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
