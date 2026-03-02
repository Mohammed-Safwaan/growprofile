'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Filter, ChevronLeft, ChevronRight, Users,
  UserCheck, UserX, Shield, Trash2, RefreshCw, Eye,
  Instagram, BarChart3, AlertTriangle, CheckCircle2,
  XCircle, Clock, Crown, ChevronDown, MoreHorizontal,
  Ban, UserCog, CreditCard, Activity
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/contexts/AuthContext'

// ─── Types ────────────────────────────────────────────

interface UserRow {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  role: string
  status: string
  plan: { name: string; displayName: string } | null
  subscription: { id: string; status: string; currentPeriodEnd: string | null } | null
  stats: { instagramAccounts: number; campaigns: number; leads: number }
  createdAt: string
}

interface UserDetail extends UserRow {
  instagramAccounts: any[]
  campaigns: any[]
  payments: any[]
  subscriptions: any[]
  abuseFlags: any[]
  recentActivity: any[]
  _count: Record<string, number>
}

interface PlanOption {
  id: string
  name: string
  displayName: string
  price: number
}

// ─── Helpers ──────────────────────────────────────────

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 border-green-200',
  SUSPENDED: 'bg-orange-100 text-orange-700 border-orange-200',
  BANNED: 'bg-red-100 text-red-700 border-red-200',
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

const roleColors: Record<string, string> = {
  USER: 'bg-slate-100 text-slate-700',
  ADMIN: 'bg-purple-100 text-purple-700',
  SUPER_ADMIN: 'bg-red-100 text-red-700',
}

function UserAvatar({ user, size = 'sm' }: { user: { name?: string | null; email?: string; avatarUrl?: string | null }; size?: 'sm' | 'lg' }) {
  const initials = (user.name || user.email || 'U')[0].toUpperCase()
  const cls = size === 'lg' ? 'w-14 h-14 text-xl' : 'w-9 h-9 text-sm'
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.name || ''} className={`${cls} rounded-full object-cover`} />
  ) : (
    <div className={`${cls} rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {initials}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────

export default function UsersPage() {
  const { authFetch, user: adminUser } = useAuth()

  // List state
  const [users, setUsers] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')

  // Plans for dropdown
  const [plans, setPlans] = useState<PlanOption[]>([])

  // Detail sheet
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  // Action state
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showPlanChange, setShowPlanChange] = useState(false)
  const [newPlanId, setNewPlanId] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, banned: 0 })

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/plans')
      const data = await res.json()
      if (data.success) setPlans(data.plans)
    } catch {}
  }, [])

  const fetchUsers = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (roleFilter !== 'all') params.set('role', roleFilter)
      if (planFilter !== 'all') params.set('planId', planFilter)

      const res = await authFetch(`/api/admin/users?${params}`)
      const data = await res.json()
      if (data.success) {
        setUsers(data.data || [])
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, roleFilter, planFilter, authFetch])

  const fetchStats = useCallback(async () => {
    try {
      const [all, active, suspended, banned] = await Promise.all([
        authFetch('/api/admin/users?limit=1').then(r => r.json()),
        authFetch('/api/admin/users?limit=1&status=ACTIVE').then(r => r.json()),
        authFetch('/api/admin/users?limit=1&status=SUSPENDED').then(r => r.json()),
        authFetch('/api/admin/users?limit=1&status=BANNED').then(r => r.json()),
      ])
      setStats({
        total: all.pagination?.total || 0,
        active: active.pagination?.total || 0,
        suspended: suspended.pagination?.total || 0,
        banned: banned.pagination?.total || 0,
      })
    } catch {}
  }, [authFetch])

  useEffect(() => { fetchPlans(); fetchStats() }, [fetchPlans, fetchStats])
  useEffect(() => { fetchUsers(page) }, [page, statusFilter, roleFilter, planFilter]) // eslint-disable-line

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers(1)
  }

  const openDetail = async (userId: string) => {
    setSheetOpen(true)
    setDetailLoading(true)
    setActionError('')
    try {
      const res = await authFetch(`/api/admin/users/${userId}`)
      const data = await res.json()
      if (data.success) setSelectedUser(data.data)
    } catch { setActionError('Failed to load user details') }
    finally { setDetailLoading(false) }
  }

  const doAction = async (action: { status?: string; role?: string; planId?: string; note?: string }) => {
    if (!selectedUser) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await authFetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...action, note: actionNote || action.note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      await openDetail(selectedUser.id)
      fetchUsers(page)
      fetchStats()
      setShowPlanChange(false)
      setShowDeleteConfirm(false)
      setActionNote('')
      setNewPlanId('')
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const doDelete = async () => {
    if (!selectedUser) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await authFetch('/api/admin/users', {
        method: 'DELETE',
        body: JSON.stringify({ userId: selectedUser.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      setSheetOpen(false)
      setSelectedUser(null)
      setShowDeleteConfirm(false)
      fetchUsers(page)
      fetchStats()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setRoleFilter('all')
    setPlanFilter('all')
    setPage(1)
  }

  const hasFilters = search || statusFilter !== 'all' || roleFilter !== 'all' || planFilter !== 'all'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">Manage all platform users — suspend, ban, change plans, and more.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchUsers(page); fetchStats() }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Suspended', value: stats.suspended, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Banned', value: stats.banned, icon: UserX, color: 'text-red-600', bg: 'bg-red-50' },
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
          <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
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
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="BANNED">Banned</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="USER">User</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1) }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

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
            {loading ? 'Loading...' : `${total} user${total !== 1 ? 's' : ''} found`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No users match your filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['User', 'Plan', 'Status', 'Role', 'IG / Campaigns / Leads', 'Joined', ''].map((h) => (
                      <th key={h} className="text-left py-3 px-4 font-semibold text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDetail(u.id)}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={u} />
                          <div>
                            <p className="font-medium text-foreground">{u.name || '—'}</p>
                            <p className="text-muted-foreground text-xs">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                          {u.plan?.displayName || 'No Plan'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${statusColors[u.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[u.role] || 'bg-slate-100 text-slate-700'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span className="flex items-center gap-1"><Instagram className="w-3.5 h-3.5" />{u.stats.instagramAccounts}</span>
                          <span className="flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" />{u.stats.campaigns}</span>
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{u.stats.leads}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); openDetail(u.id) }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Eye className="w-4 h-4" />
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
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                  return (
                    <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  )
                })}
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── User Detail Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => {
        setSheetOpen(o)
        if (!o) { setShowPlanChange(false); setShowDeleteConfirm(false); setActionError('') }
      }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : selectedUser ? (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-4">
                  <UserAvatar user={selectedUser} size="lg" />
                  <div>
                    <SheetTitle>{selectedUser.name || 'No Name'}</SheetTitle>
                    <SheetDescription>{selectedUser.email}</SheetDescription>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusColors[selectedUser.status] || ''}`}>
                        {selectedUser.status}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[selectedUser.role] || ''}`}>
                        {selectedUser.role}
                      </span>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{actionError}</div>
              )}

              {/* Quick Actions */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedUser.status !== 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-green-300 text-green-700 hover:bg-green-50"
                      disabled={actionLoading}
                      onClick={() => doAction({ status: 'ACTIVE', note: 'Manually activated by admin' })}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Activate
                    </Button>
                  )}
                  {selectedUser.status !== 'SUSPENDED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                      disabled={actionLoading}
                      onClick={() => doAction({ status: 'SUSPENDED', note: actionNote })}
                    >
                      <Clock className="w-4 h-4 mr-2" /> Suspend
                    </Button>
                  )}
                  {selectedUser.status !== 'BANNED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                      disabled={actionLoading}
                      onClick={() => doAction({ status: 'BANNED', note: actionNote })}
                    >
                      <Ban className="w-4 h-4 mr-2" /> Ban
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary hover:bg-primary/5"
                    disabled={actionLoading}
                    onClick={() => setShowPlanChange(!showPlanChange)}
                  >
                    <CreditCard className="w-4 h-4 mr-2" /> Change Plan
                  </Button>
                  {(adminUser as any)?.role === 'SUPER_ADMIN' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-purple-300 text-purple-700 hover:bg-purple-50"
                      disabled={actionLoading}
                      onClick={() => doAction({ role: selectedUser.role === 'ADMIN' ? 'USER' : 'ADMIN' })}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      {selectedUser.role === 'ADMIN' ? 'Remove Admin' : 'Make Admin'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    disabled={actionLoading}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete User
                  </Button>
                </div>

                {/* Optional note for action */}
                <div className="mt-3">
                  <Input
                    placeholder="Optional note / reason for action..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Inline Plan Change */}
                {showPlanChange && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
                    <p className="text-sm font-medium">Current plan: <strong>{selectedUser.plan?.displayName || 'None'}</strong></p>
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
                      onClick={() => doAction({ planId: newPlanId })}
                    >
                      {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirm Plan Change
                    </Button>
                  </div>
                )}

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg space-y-3">
                    <p className="text-sm text-red-700 font-medium">⚠️ This will permanently delete the user and all their data. This cannot be undone.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={doDelete} disabled={actionLoading}>
                        {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                        Yes, Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Account Info */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Account Info</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'User ID', value: selectedUser.id.slice(0, 16) + '...' },
                    { label: 'Plan', value: selectedUser.plan?.displayName || 'None' },
                    { label: 'Sub Status', value: selectedUser.subscriptions?.[0]?.status || 'N/A' },
                    { label: 'Joined', value: new Date(selectedUser.createdAt).toLocaleDateString() },
                    { label: 'IG Accounts', value: selectedUser.stats?.instagramAccounts ?? selectedUser._count?.instagramAccounts ?? 0 },
                    { label: 'Campaigns', value: selectedUser.stats?.campaigns ?? selectedUser._count?.campaigns ?? 0 },
                    { label: 'Leads', value: selectedUser._count?.leads ?? 0 },
                    { label: 'Payments', value: selectedUser._count?.payments ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Instagram Accounts */}
              {selectedUser.instagramAccounts?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Instagram Accounts ({selectedUser.instagramAccounts.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedUser.instagramAccounts.map((acc: any) => (
                      <div key={acc.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <Instagram className="w-4 h-4 text-pink-500" />
                          <span className="font-medium">@{acc.igUsername}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${acc.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {acc.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Campaigns */}
              {selectedUser.campaigns?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Campaigns</h3>
                  <div className="space-y-2">
                    {selectedUser.campaigns.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg text-sm">
                        <span className="font-medium truncate max-w-[200px]">{c.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Abuse Flags */}
              {selectedUser.abuseFlags?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    <span className="text-red-600">⚠ Abuse Flags ({selectedUser.abuseFlags.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {selectedUser.abuseFlags.map((f: any) => (
                      <div key={f.id} className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-red-700">{f.type?.replace(/_/g, ' ')}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${f.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                            {f.severity}
                          </span>
                        </div>
                        {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {selectedUser.recentActivity?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</h3>
                  <div className="space-y-1.5">
                    {selectedUser.recentActivity.map((log: any) => (
                      <div key={log.id} className="flex items-start justify-between py-1.5 px-2 text-xs hover:bg-muted/30 rounded">
                        <span className="font-mono text-muted-foreground">{log.action}</span>
                        <span className="text-muted-foreground whitespace-nowrap ml-2">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">Failed to load user.</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
