'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Filter, ChevronLeft, ChevronRight,
  ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Eye, Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

interface AbuseFlag {
  id: string
  userId: string
  userName: string
  igUsername: string | null
  type: string
  severity: string
  description: string | null
  metadata: any
  status: string
  resolvedByName: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

const severityBadgeColors: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
}

const statusBadgeColors: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-700',
  INVESTIGATING: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  DISMISSED: 'bg-slate-100 text-slate-700',
}

const typeBadgeColors: Record<string, string> = {
  SPAM: 'bg-purple-100 text-purple-700',
  RATE_LIMIT_EXCEEDED: 'bg-orange-100 text-orange-700',
  TOS_VIOLATION: 'bg-red-100 text-red-700',
  REPORTED_BY_USER: 'bg-blue-100 text-blue-700',
  SUSPICIOUS_ACTIVITY: 'bg-yellow-100 text-yellow-700',
  TOKEN_FAILURE: 'bg-slate-100 text-slate-700',
}

export default function AbuseFlagsPage() {
  const [flags, setFlags] = useState<AbuseFlag[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 50, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [severityFilter, setSeverityFilter] = useState('')
  const [selectedFlag, setSelectedFlag] = useState<AbuseFlag | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const { authFetch } = useAuth()

  const fetchFlags = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (statusFilter) params.set('status', statusFilter)
      if (severityFilter) params.set('severity', severityFilter)

      const response = await authFetch(`/api/admin/abuse-flags?${params}`)
      const data = await response.json()
      if (data.success) {
        setFlags(data.data || [])
        setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 })
      }
    } catch (error) {
      console.error('Error fetching abuse flags:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter, authFetch])

  useEffect(() => {
    fetchFlags()
  }, [fetchFlags])

  const handleAction = async (flagId: string, status: string) => {
    setActionLoading(true)
    try {
      const response = await authFetch('/api/admin/abuse-flags', {
        method: 'PATCH',
        body: JSON.stringify({ flagId, status, note: resolutionNote || undefined }),
      })
      if (response.ok) {
        setSelectedFlag(null)
        setResolutionNote('')
        fetchFlags(pagination.page)
      }
    } catch (error) {
      console.error('Error updating flag:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const openCount = flags.filter((f) => f.status === 'OPEN').length
  const criticalCount = flags.filter((f) => f.severity === 'CRITICAL' && f.status !== 'RESOLVED' && f.status !== 'DISMISSED').length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Abuse Flags</h1>
        <p className="text-slate-600">Monitor and resolve suspected abuse, rate-limit violations, and spam.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{pagination.total}</p>
              <p className="text-sm text-slate-600">Total Flags</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-sm text-slate-600">Critical Open</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Clock className="w-8 h-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{openCount}</p>
              <p className="text-sm text-slate-600">Open (this page)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-green-600">
                {flags.filter((f) => f.status === 'RESOLVED').length}
              </p>
              <p className="text-sm text-slate-600">Resolved (this page)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
              <select
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="OPEN">Open</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Severity</label>
              <select
                className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flags Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Abuse Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-slate-600">Loading abuse flags...</div>
          ) : flags.length === 0 ? (
            <div className="text-center py-12 text-slate-600">
              <ShieldAlert className="w-12 h-12 mx-auto text-slate-300 mb-4" />
              <p>No abuse flags found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">User</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Type</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Severity</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">IG Account</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Created</th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((flag) => (
                      <tr key={flag.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-medium">
                              {flag.userName[0]?.toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{flag.userName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${typeBadgeColors[flag.type] || 'bg-slate-100 text-slate-700'}`}>
                            {flag.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityBadgeColors[flag.severity] || 'bg-slate-100 text-slate-700'}`}>
                            {flag.severity}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeColors[flag.status] || 'bg-slate-100 text-slate-700'}`}>
                            {flag.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">
                          {flag.igUsername ? `@${flag.igUsername}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">
                          {formatDate(flag.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-600"
                              onClick={() => setSelectedFlag(flag)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {flag.status === 'OPEN' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-yellow-600 hover:text-yellow-700"
                                onClick={() => handleAction(flag.id, 'INVESTIGATING')}
                                disabled={actionLoading}
                              >
                                Investigate
                              </Button>
                            )}
                            {(flag.status === 'OPEN' || flag.status === 'INVESTIGATING') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => handleAction(flag.id, 'RESOLVED')}
                                  disabled={actionLoading}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-slate-500 hover:text-slate-700"
                                  onClick={() => handleAction(flag.id, 'DISMISSED')}
                                  disabled={actionLoading}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchFlags(pagination.page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchFlags(pagination.page + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedFlag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Flag Details</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFlag(null)}>
                  <XCircle className="w-5 h-5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">User</p>
                  <p className="font-medium">{selectedFlag.userName}</p>
                </div>
                <div>
                  <p className="text-slate-500">IG Account</p>
                  <p className="font-medium">{selectedFlag.igUsername ? `@${selectedFlag.igUsername}` : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Type</p>
                  <p className="font-medium">{selectedFlag.type.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-slate-500">Severity</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityBadgeColors[selectedFlag.severity]}`}>
                    {selectedFlag.severity}
                  </span>
                </div>
                <div>
                  <p className="text-slate-500">Status</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeColors[selectedFlag.status]}`}>
                    {selectedFlag.status}
                  </span>
                </div>
                <div>
                  <p className="text-slate-500">Created</p>
                  <p className="font-medium">{formatDate(selectedFlag.createdAt)}</p>
                </div>
              </div>

              {selectedFlag.description && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Description</p>
                  <p className="text-sm bg-slate-50 p-3 rounded border border-slate-200">{selectedFlag.description}</p>
                </div>
              )}

              {selectedFlag.metadata && Object.keys(selectedFlag.metadata).length > 0 && (
                <div>
                  <p className="text-sm text-slate-500 mb-1">Metadata</p>
                  <pre className="text-xs bg-slate-50 p-3 rounded border border-slate-200 overflow-auto max-h-32">
                    {JSON.stringify(selectedFlag.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {selectedFlag.resolvedByName && (
                <div className="text-sm">
                  <p className="text-slate-500">
                    Resolved by <strong>{selectedFlag.resolvedByName}</strong> on{' '}
                    {selectedFlag.resolvedAt ? formatDate(selectedFlag.resolvedAt) : 'N/A'}
                  </p>
                </div>
              )}

              {(selectedFlag.status === 'OPEN' || selectedFlag.status === 'INVESTIGATING') && (
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Resolution Note</label>
                  <Input
                    placeholder="Add a note (optional)"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                  />
                  <div className="flex gap-2 mt-3">
                    {selectedFlag.status === 'OPEN' && (
                      <Button
                        size="sm"
                        className="bg-yellow-500 hover:bg-yellow-600 text-white"
                        onClick={() => handleAction(selectedFlag.id, 'INVESTIGATING')}
                        disabled={actionLoading}
                      >
                        Investigate
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleAction(selectedFlag.id, 'RESOLVED')}
                      disabled={actionLoading}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(selectedFlag.id, 'DISMISSED')}
                      disabled={actionLoading}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
