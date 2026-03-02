'use client'

import { TrendingUp, Calendar, Loader2, MessageSquare, Send, Users, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    dailyInteractions: { date: string; count: number }[]
    dailyDms: { date: string; count: number }[]
    interactionsByType: { type: string; count: number }[]
    topKeywords: { keyword: string; count: number }[]
  }
  topCampaigns?: { id: string; name: string; status: string; interactions: number; leads: number }[]
  recentLeads?: { id: string; igUsername: string; campaignName: string; source: string; capturedAt: string }[]
}

export default function InsightsPage() {
  const [data, setData] = useState<GrowthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const { authFetch } = useAuth()

  useEffect(() => {
    async function fetchGrowth() {
      try {
        const res = await authFetch(`/api/dashboard/growth?days=${days}`)
        const json = await res.json()
        if (json.success) setData(json)
      } catch (err) {
        console.error('Failed to fetch growth data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchGrowth()
  }, [authFetch, days])

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
        <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">No data yet</h2>
        <p className="text-muted-foreground">Connect your Instagram account and create campaigns to see insights.</p>
      </div>
    )
  }

  const { summary, charts, topCampaigns, recentLeads } = data!
  const dailyData = charts?.dailyInteractions || []
  const maxCount = Math.max(...dailyData.map((d) => d.count), 1)
  // Show last 14 data points for the bar chart
  const recentDaily = dailyData.slice(-14)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Performance Insights</h1>
        <p className="text-muted-foreground">Track your growth trends and identify what resonates with your audience</p>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-8">
        {[7, 14, 30].map((d) => (
          <Button
            key={d}
            variant={days === d ? 'default' : 'outline'}
            className="gap-2"
            onClick={() => { setDays(d); setLoading(true) }}
          >
            <Calendar className="w-4 h-4" />
            {d === 7 ? 'This Week' : d === 14 ? '2 Weeks' : '30 Days'}
          </Button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Interactions', value: summary?.totalInteractions ?? 0, icon: MessageSquare, color: 'from-primary to-secondary' },
          { label: 'DMs Sent', value: summary?.totalDms ?? 0, icon: Send, color: 'from-secondary to-accent' },
          { label: 'Leads', value: summary?.totalLeads ?? 0, icon: Users, color: 'from-accent to-primary' },
          { label: 'Engagement Rate', value: summary?.engagementRate ?? '0%', icon: TrendingUp, color: 'from-primary to-accent' },
        ].map((stat, idx) => {
          const Icon = stat.icon
          return (
            <div key={idx} className="p-6 rounded-xl bg-card border border-border">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </p>
            </div>
          )
        })}
      </div>

      {/* Interactions Chart */}
      <div className="p-6 rounded-xl bg-card border border-border mb-8">
        <h2 className="text-xl font-bold text-foreground mb-6">Daily Interactions</h2>
        {recentDaily.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No interactions in this period</p>
        ) : (
          <div className="flex items-end justify-between h-64 gap-1 px-2">
            {recentDaily.map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">{day.count}</span>
                <div
                  className="w-full bg-gradient-to-t from-primary to-secondary rounded-t-lg hover:opacity-80 transition-opacity cursor-pointer"
                  style={{ height: `${Math.max((day.count / maxCount) * 200, 4)}px` }}
                  title={`${day.date}: ${day.count} interactions`}
                ></div>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Top Campaigns */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">Top Campaigns</h2>
          {topCampaigns && topCampaigns.length > 0 ? (
            <div className="space-y-4">
              {topCampaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{c.interactions} interactions</p>
                    <p className="text-xs text-muted-foreground">{c.leads} leads</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No campaigns yet</p>
          )}
        </div>

        {/* Top Keywords */}
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">Top Keywords</h2>
          {charts?.topKeywords && charts.topKeywords.length > 0 ? (
            <div className="space-y-3">
              {charts.topKeywords.map((kw, idx) => {
                const maxKw = charts.topKeywords[0]?.count || 1
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-foreground">#{kw.keyword}</span>
                      <span className="text-muted-foreground">{kw.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                        style={{ width: `${(kw.count / maxKw) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No keyword data yet</p>
          )}
        </div>
      </div>

      {/* Recent Leads */}
      {recentLeads && recentLeads.length > 0 && (
        <div className="p-6 rounded-xl bg-card border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6">Recent Leads</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Username</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Campaign</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Source</th>
                  <th className="text-left py-2 text-sm font-medium text-muted-foreground">Captured</th>
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
