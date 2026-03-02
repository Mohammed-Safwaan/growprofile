'use client'

import Link from 'next/link'
import { Plus, Play, Pause, MessageSquare, Send, ArrowRight, Loader2, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'

interface Campaign {
  id: string
  name: string
  status: string
  triggerKeywords: string[]
  createdAt: string
  media: Array<{ id: string; igMediaId: string; mediaUrl?: string | null; mediaType?: string | null }>
  _count: { interactions: number; leads: number }
}

export function CampaignsList() {
  const { authFetch, user } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  const igAccount = user?.instagramAccounts?.[0]

  useEffect(() => {
    async function fetchCampaigns() {
      if (!igAccount) { setLoading(false); return }
      try {
        const res = await authFetch(`/api/campaigns?igAccountId=${igAccount.id}&limit=5`)
        const data = await res.json()
        if (data.success) setCampaigns(data.campaigns)
      } catch (err) {
        console.error('Failed to fetch campaigns:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCampaigns()
  }, [authFetch, igAccount])

  return (
    <div className="lg:col-span-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Your Campaigns</h2>
          <p className="text-sm text-muted-foreground">Manage your AutoDM automation</p>
        </div>
        <Button asChild className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2 shadow-lg shadow-primary/20">
          <Link href="/dashboard/apps/autodm">
            <Plus className="w-4 h-4" />
            New Campaign
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="p-6 rounded-2xl bg-card border border-border animate-pulse">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-muted" />
                <div className="flex-1">
                  <div className="h-5 w-40 bg-muted rounded mb-2" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="p-3 rounded-xl bg-muted/50 h-16" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-border text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            {igAccount ? 'No campaigns yet. Create your first AutoDM!' : 'Connect Instagram to create campaigns.'}
          </p>
          <Button asChild className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2">
            <Link href={igAccount ? '/dashboard/apps/autodm' : '/dashboard/account'}>
              <Plus className="w-4 h-4" />
              {igAccount ? 'Create Campaign' : 'Connect Instagram'}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    campaign.status === 'ACTIVE'
                      ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                      : campaign.status === 'PAUSED'
                        ? 'bg-gradient-to-br from-amber-500 to-orange-500'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500'
                  }`}>
                    {campaign.status === 'ACTIVE' ? (
                      <Play className="w-4 h-4 text-white" />
                    ) : (
                      <Pause className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{campaign.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {campaign.triggerKeywords.slice(0, 3).map((kw) => (
                        <Badge key={kw} variant="secondary" className="bg-primary/10 text-primary text-xs">
                          #{kw}
                        </Badge>
                      ))}
                      {campaign.triggerKeywords.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{campaign.triggerKeywords.length - 3} more</span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge className={
                  campaign.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : campaign.status === 'PAUSED'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600'
                }>
                  {campaign.status}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <p className="text-xs text-muted-foreground">Interactions</p>
                  </div>
                  <p className="text-xl font-bold text-foreground">{campaign._count.interactions.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <Send className="w-4 h-4 text-secondary" />
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <p className="text-xl font-bold text-foreground">{campaign._count.leads.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-2 mb-1">
                    <ImageIcon className="w-4 h-4 text-accent" />
                    <p className="text-xs text-muted-foreground">Posts</p>
                  </div>
                  <p className="text-xl font-bold text-foreground">{campaign.media.length || 'All'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="mt-6 text-center">
          <Button variant="ghost" asChild className="text-muted-foreground hover:text-primary">
            <Link href="/dashboard/apps/autodm" className="gap-2">
              View All Campaigns <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
