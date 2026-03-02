'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Search, Filter, TrendingUp, ChevronLeft, ChevronRight,
  Users, XCircle, CheckCircle2, CreditCard, BarChart3, Clock,
  AlertCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/contexts/AuthContext'

interface SubRow {
  id: string
  status: string
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelledAt: string | null
  createdAt: string
  user: { id: string; email: string; name: string | null }
  plan: { id: string; name: string; displayName: string; price: number }
}

interface PlanOption {
  id: string
  name: string
  displayName: string
  price: number
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 border-green-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  PAST_DUE: 'bg-orange-100 text-orange-700 border-orange-200',
  TRIALING: 'bg-blue-100 text-blue-700 border-blue-200',
}

export default function SubscriptionsPage() {
  const { authFetch } = useAuth()

  const [subs, setSubs] = useState<SubRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, active: 0, cancelled: 0, starter: 0, creator: 0 })

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')

  // Plans
  const [plans, setPlans] = useState<PlanOption[]>([])

  // Detail sheet
  const [selected, setSelected] = useState<SubRow | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [newPlanId, setNewPlanId] = useState('')
  const [showPlanChange, setShowPlanChange] = useState(false)

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/plans')
      const data = await res.json()
      if (data.success) setPlans(data.plans)
    } catch {}
  }, [])

  const fetchSubs = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (planFilter !== 'all') params.set('planId', planFilter)

      const res = await authFetch(`/api/admin/subscriptions?${params}`)
      const data = await res.json()
      if (data.success) {
        setSubs(data.data || [])
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
        setStats(data.stats || stats)
      }
    } catch (err) {
      console.error('fetchSubs error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, planFilter, authFetch])

  useEffect(() => { fetchPlans() }, [fetchPlans])
  useEffect(() => { fetchSubs(page) }, [page, statusFilter, planFilter]) // eslint-disable-line

  const doAction = async (payload: { subscriptionId: string; status?: string; planId?: string }) => {
    setActionLoading(true)
    setActionError('')
    try {
      const res = await authFetch('/api/admin/subscriptions', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      // Refresh the row in-place
      await fetchSubs(page)
      // Also refresh the selected sub from the refreshed list
      setSheetOpen(false)
      setShowPlanChange(false)
      setNewPlanId('')
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Subscriptions</h1>
          <p className="text-muted-foreground mt-1">Monitor and manage all user subscriptions and billing.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchSubs(page)}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: stats.active, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Cancelled', value: stats.cancelled, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Starter', value: stats.starter, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Creator', value: stats.creator, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.bg}`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="PAST_DUE">Past Due</SelectItem>
                <SelectItem value="TRIALING">Trialing</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(statusFilter !== 'all' || planFilter !== 'all') && (
              <Button variant="ghost" onClick={() => { setStatusFilter('all'); setPlanFilter('all'); setPage(1) }} className="text-muted-foreground">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {loading ? 'Loading...' : `${total} subscription${total !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : subs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No subscriptions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['User', 'Plan', 'Price', 'Status', 'Period End', 'Started', ''].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subs.map((sub) => (
                    <tr key={sub.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => { setSelected(sub); setSheetOpen(true); setActionError(''); setShowPlanChange(false) }}>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-foreground">{sub.user.name || '—'}</p>
                          <p className="text-muted-foreground text-xs">{sub.user.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                          {sub.plan.displayName}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">${Number(sub.plan.price)}/mo</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${statusColors[sub.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground text-xs">
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
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

      {/* Manage Sheet */}
      <Sheet open={sheetOpen} onOpenChange={(o) => { setSheetOpen(o); if (!o) { setShowPlanChange(false); setActionError('') } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected ? (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle>Manage Subscription</SheetTitle>
                <SheetDescription>{selected.user.email}</SheetDescription>
              </SheetHeader>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{actionError}</div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Plan', value: selected.plan.displayName },
                  { label: 'Price', value: `$${Number(selected.plan.price)}/mo` },
                  { label: 'Status', value: selected.status },
                  { label: 'Started', value: new Date(selected.createdAt).toLocaleDateString() },
                  { label: 'Period End', value: selected.currentPeriodEnd ? new Date(selected.currentPeriodEnd).toLocaleDateString() : '—' },
                  { label: 'Cancelled', value: selected.cancelledAt ? new Date(selected.cancelledAt).toLocaleDateString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-2.5">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Actions</h3>

                {selected.status !== 'CANCELLED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50"
                    disabled={actionLoading}
                    onClick={() => doAction({ subscriptionId: selected.id, status: 'CANCELLED' })}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Cancel Subscription
                  </Button>
                )}
                {selected.status === 'CANCELLED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-green-300 text-green-700 hover:bg-green-50"
                    disabled={actionLoading}
                    onClick={() => doAction({ subscriptionId: selected.id, status: 'ACTIVE' })}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Reactivate
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setShowPlanChange(!showPlanChange)}
                >
                  <CreditCard className="w-4 h-4 mr-2" /> Change Plan
                </Button>

                {showPlanChange && (
                  <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                    <Select value={newPlanId} onValueChange={setNewPlanId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select new plan..." />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.displayName} — ${Number(p.price)}/mo
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/90"
                      disabled={!newPlanId || actionLoading}
                      onClick={() => doAction({ subscriptionId: selected.id, planId: newPlanId })}
                    >
                      {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirm Change
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
