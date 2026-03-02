'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, ChevronLeft, ChevronRight, Clock, User, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'

interface AuditLog {
  id: string
  userId: string | null
  userName: string
  action: string
  entityType: string | null
  entityId: string | null
  details: any
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 50, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const { authFetch } = useAuth()

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (search) params.set('search', search)
      if (actionFilter) params.set('action', actionFilter)

      const response = await authFetch(`/api/admin/audit-logs?${params}`)
      const data = await response.json()
      if (data.success) {
        setLogs(data.data || [])
        setPagination(data.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 })
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error)
    } finally {
      setLoading(false)
    }
  }, [search, actionFilter, authFetch])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchLogs(1)
  }

  const actionColor = (action: string) => {
    if (action.includes('delete') || action.includes('suspend') || action.includes('ban'))
      return 'bg-red-100 text-red-700'
    if (action.includes('create') || action.includes('signup'))
      return 'bg-green-100 text-green-700'
    if (action.includes('update') || action.includes('resolve'))
      return 'bg-blue-100 text-blue-700'
    return 'bg-slate-100 text-slate-700'
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Audit Logs</h1>
        <p className="text-slate-600">Track all administrative and user actions across the platform.</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by action, entity, ID..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Input
              placeholder="Filter by action (e.g. campaign.create)"
              className="max-w-xs"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
            <Button type="submit" className="bg-primary hover:bg-primary/90">
              <Filter className="w-4 h-4 mr-2" /> Filter
            </Button>
            {(search || actionFilter) && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('')
                  setActionFilter('')
                  fetchLogs(1)
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Audit Trail ({pagination.total} entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-slate-600">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-600">No audit logs found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Time</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">User</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Action</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">Entity</th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-900">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                        >
                          <td className="py-3 px-4 text-sm text-slate-600 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDate(log.createdAt)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-medium">
                                {log.userName[0]?.toUpperCase() || 'S'}
                              </div>
                              <span className="text-sm text-slate-900">{log.userName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${actionColor(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {log.entityType && (
                              <span>{log.entityType}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-500 font-mono">
                            {log.ipAddress || '—'}
                          </td>
                        </tr>
                        {expandedRow === log.id && (
                          <tr key={`${log.id}-detail`} className="bg-slate-50">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-medium text-slate-700 mb-1">User ID</p>
                                  <p className="text-slate-500 font-mono text-xs">{log.userId || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-slate-700 mb-1">Entity ID</p>
                                  <p className="text-slate-500 font-mono text-xs">{log.entityId || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="font-medium text-slate-700 mb-1">User Agent</p>
                                  <p className="text-slate-500 text-xs truncate max-w-md">{log.userAgent || 'N/A'}</p>
                                </div>
                                {log.details && Object.keys(log.details).length > 0 && (
                                  <div className="col-span-2">
                                    <p className="font-medium text-slate-700 mb-1">Details</p>
                                    <pre className="text-xs bg-white p-3 rounded border border-slate-200 overflow-auto max-h-40">
                                      {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
                      onClick={() => fetchLogs(pagination.page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchLogs(pagination.page + 1)}
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
    </div>
  )
}
