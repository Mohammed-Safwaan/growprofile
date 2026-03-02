'use client'

import { TrendingUp, Users, Send, MessageSquare, Loader2, BarChart3, Clock } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface GrowthData {
  hasData: boolean
  summary?: {
    totalInteractions: number
    totalDms: number
    totalLeads: number
    engagementRate: string
  }
  charts?: {
    dailyDms: { date: string; count: number }[]
    interactionsByType: { type: string; count: number }[]
    topKeywords: { keyword: string; count: number }[]
  }
  topCampaigns?: { id: string; name: string; status: string; interactions: number; leads: number }[]
  recentLeads?: { id: string; igUsername: string; campaignName: string; source: string; capturedAt: string }[]
}

export default function AudiencePage() {
  const [data, setData] = useState<GrowthData | null>(null)
  const [loading, setLoading] = useState(true)
  const { authFetch } = useAuth()

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await authFetch('/api/dashboard/growth?days=30')
        const json = await res.json()
        if (json.success) setData(json)
      } catch (err) {
        console.error('Failed to fetch audience data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [authFetch])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.hasData) {
    return (
      <div className="text-center py-20">
        <Users className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">No audience data yet</h2>
        <p className="text-muted-foreground">Connect your Instagram and create campaigns to start collecting audience data.</p>
      </div>
    )
  }

  const { summary, charts, topCampaigns, recentLeads } = data!

  const metrics = [
    {
      label: 'Total Interactions',
      value: summary?.totalInteractions?.toLocaleString() ?? '0',
      icon: MessageSquare,
      color: 'from-primary to-secondary'
    },
    {
      label: 'DMs Sent',
      value: summary?.totalDms?.toLocaleString() ?? '0',
      icon: Send,
      color: 'from-secondary to-accent'
    },
    {
      label: 'Leads Captured',
      value: summary?.totalLeads?.toLocaleString() ?? '0',
      icon: Users,
      color: 'from-accent to-primary'
    },
    {
      label: 'Engagement Rate',
      value: summary?.engagementRate ?? '0%',
      icon: TrendingUp,
      color: 'from-primary to-accent'
    }
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Audience Insights</h1>
        <p className="text-muted-foreground">Detailed analytics about your interactions and audience engagement</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric, idx) => {
          const Icon = metric.icon
          return (
            <div key={idx} className="p-6 rounded-xl bg-card border border-border">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${metric.color} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{metric.label}</p>
              <p className="text-3xl font-bold text-foreground">{metric.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Interaction Types Breakdown */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">Interaction Types</h2>
          {charts?.interactionsByType && charts.interactionsByType.length > 0 ? (
            <div className="space-y-4">
              {charts.interactionsByType.map((item, idx) => {
                const maxVal = Math.max(...charts.interactionsByType.map((i) => i.count), 1)
                const typeLabels: Record<string, string> = {
                  COMMENT: 'Comments Detected',
                  DM_SENT: 'DMs Sent',
                  DM_RECEIVED: 'DMs Received',
                  FOLLOW_CHECK: 'Follow Checks',
                }
                return (
                  <div key={idx}>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium text-foreground">{typeLabels[item.type] || item.type}</span>
                      <span className="font-bold text-foreground">{item.count.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-3 bg-secondary/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                        style={{ width: `${(item.count / maxVal) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No interaction data yet</p>
          )}
        </div>

        {/* DM Activity Over Time */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">DM Activity (Last 30 Days)</h2>
          {charts?.dailyDms && charts.dailyDms.some((d) => d.count > 0) ? (
            <div className="space-y-2">
              {charts.dailyDms.slice(-10).map((day, idx) => {
                const maxDm = Math.max(...charts.dailyDms.map((d) => d.count), 1)
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 text-right font-mono">
                      {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-secondary to-accent rounded-full"
                        style={{ width: `${Math.max((day.count / maxDm) * 100, day.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground w-8">{day.count}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No DM activity yet</p>
          )}
        </div>
      </div>

      {/* Recent Leads Table */}
      {recentLeads && recentLeads.length > 0 && (
        <div className="mt-8 p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">Recent Leads</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">User</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Source</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border/50">
                    <td className="py-3 text-sm font-medium text-foreground">@{lead.igUsername}</td>
                    <td className="py-3 text-sm text-muted-foreground">{lead.campaignName}</td>
                    <td className="py-3 text-sm text-muted-foreground capitalize">{lead.source}</td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {new Date(lead.capturedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
