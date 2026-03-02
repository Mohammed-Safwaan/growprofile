'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Instagram, Zap, CheckCircle2, Play, Pause,
  Sparkles, MessageSquare, Send, Plus, Trash2,
  Eye, Loader2, Image as ImageIcon,
  Mail, MessageCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CampaignWizard } from '@/components/autodm/CampaignWizard'

// ─── Types ────────────────────────────────────────────────

interface CampaignMedia {
  id: string
  igMediaId: string
  mediaUrl?: string | null
  mediaType?: string | null
  caption?: string | null
  permalink?: string | null
}

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  triggerKeywords: string[]
  replyMessage?: string | null
  dmMessages: Array<{ text: string; delayMinutes?: number }>
  requireFollow: boolean
  followUpEnabled: boolean
  followUpDelayMinutes: number
  maxFollowUps: number
  createdAt: string
  media: CampaignMedia[]
  igAccount?: { igUsername: string; igUserId: string }
  _count: { interactions: number; leads: number }
}

type ViewMode = 'campaigns' | 'create' | 'edit'

// ─── Main Component ───────────────────────────────────────

export default function AutoDMPage() {
  const { user, authFetch } = useAuth()
  const router = useRouter()

  // State
  const [view, setView] = useState<ViewMode>('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)

  // Connected account
  const igAccount = user?.instagramAccounts?.[0]

  // ─── Fetch campaigns ────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    if (!igAccount) return
    try {
      setLoading(true)
      const res = await authFetch(`/api/campaigns?igAccountId=${igAccount.id}`)
      const data = await res.json()
      if (data.success) setCampaigns(data.campaigns)
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }, [igAccount, authFetch])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // ─── Toggle campaign status ─────────────────────────────

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    try {
      const res = await authFetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.success) fetchCampaigns()
    } catch (err) {
      console.error('Toggle error:', err)
    }
  }

  // ─── Delete campaign ────────────────────────────────────

  const deleteCampaign = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return
    try {
      const res = await authFetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchCampaigns()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  // ─── Edit campaign ──────────────────────────────────────

  const startEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign)
    setView('edit')
  }

  // ─── Start creating ─────────────────────────────────────

  const startCreate = () => {
    setEditingCampaign(null)
    setView('create')
  }

  // ─── Not connected ──────────────────────────────────────

  if (!igAccount) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 flex items-center justify-center mx-auto mb-6 shadow-xl">
          <Instagram className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-3">Connect Your Instagram</h1>
        <p className="text-muted-foreground mb-8 text-lg">
          Connect your Instagram Business account to start creating AutoDM campaigns.
        </p>
        <Button
          size="lg"
          className="bg-gradient-to-r from-pink-500 via-rose-500 to-orange-500 hover:opacity-90 gap-2 shadow-xl"
          onClick={() => router.push('/dashboard/account')}
        >
          <Instagram className="w-5 h-5" />
          Connect Instagram
        </Button>
      </div>
    )
  }

  // ─── CAMPAIGNS LIST VIEW ────────────────────────────────

  if (view === 'campaigns') {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">AutoDM</h1>
              <p className="text-muted-foreground">Automate DM responses from comments or incoming DMs</p>
            </div>
          </div>
          <Button
            onClick={startCreate}
            className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2 shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </div>

        {/* Connected Account Banner */}
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-pink-50 via-rose-50 to-orange-50 dark:from-pink-950/30 dark:via-rose-950/30 dark:to-orange-950/30 border border-pink-200 dark:border-pink-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 flex items-center justify-center shadow-lg">
                <Instagram className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-foreground text-lg">@{igAccount.igUsername}</p>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                    Connected
                  </Badge>
                </div>
                <div className="flex items-center gap-1 text-green-600 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Active via Meta OAuth</span>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => router.push('/dashboard/account')}>
              Manage
            </Button>
          </div>
        </div>

        {/* Campaigns List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : campaigns.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 px-6 rounded-2xl bg-card border border-border">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Create your first AutoDM campaign to automatically respond when users comment keywords on your posts or DM you a keyword.
            </p>
            <Button onClick={startCreate} className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Campaign
            </Button>

            {/* How it works */}
            <div className="mt-12 p-6 rounded-2xl bg-gradient-to-r from-primary/5 via-secondary/5 to-accent/5 border border-primary/20 text-left">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-foreground">How AutoDM Works</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">User Comments or DMs</p>
                    <p className="text-xs text-muted-foreground">Someone comments your keyword or DMs it to you</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-secondary">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">GrowProfile Detects</p>
                    <p className="text-xs text-muted-foreground">Our webhook engine catches the comment instantly</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-accent">3</span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">DM Sent Automatically</p>
                    <p className="text-xs text-muted-foreground">User receives your DM with the info/link</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Campaign Cards */
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
                      <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {campaign.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1">
                          {campaign.type === 'DM_KEYWORD' ? (
                            <><Mail className="w-3 h-3" />DM Keyword</>
                          ) : (
                            <><MessageCircle className="w-3 h-3" />Comment DM</>
                          )}
                        </Badge>
                        {campaign.triggerKeywords.map((kw) => (
                          <Badge key={kw} variant="secondary" className="bg-primary/10 text-primary text-xs">
                            #{kw}
                          </Badge>
                        ))}
                        {campaign.type !== 'DM_KEYWORD' && (
                          <span className="text-xs text-muted-foreground">
                            · {campaign.media.length > 0 ? `${campaign.media.length} post(s)` : 'All posts'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Interactions</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{campaign._count.interactions}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Send className="w-4 h-4 text-secondary" />
                      <span className="text-xs font-medium text-muted-foreground">Leads</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{campaign._count.leads}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <ImageIcon className="w-4 h-4 text-accent" />
                      <span className="text-xs font-medium text-muted-foreground">Posts</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {campaign.media.length || 'All'}
                    </p>
                  </div>
                </div>

                {/* Media Thumbnails */}
                {campaign.media.length > 0 && (
                  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {campaign.media.slice(0, 5).map((m) => (
                      <div key={m.id} className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                        {m.mediaUrl ? (
                          <img
                            src={m.mediaUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget
                              el.style.display = 'none'
                              el.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full bg-muted flex items-center justify-center ${m.mediaUrl ? 'hidden' : ''}`}>
                          {m.mediaType === 'VIDEO'
                            ? <span className="text-lg">🎬</span>
                            : <ImageIcon className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                    ))}
                    {campaign.media.length > 5 && (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border border-border">
                        <span className="text-xs font-medium text-muted-foreground">+{campaign.media.length - 5}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant={campaign.status === 'ACTIVE' ? 'outline' : 'default'}
                    className="gap-1.5 rounded-lg"
                    onClick={() => toggleCampaignStatus(campaign)}
                  >
                    {campaign.status === 'ACTIVE' ? (
                      <><Pause className="w-3.5 h-3.5" /> Pause</>
                    ) : (
                      <><Play className="w-3.5 h-3.5" /> Activate</>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={() => startEdit(campaign)}>
                    <Eye className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 rounded-lg text-destructive hover:text-destructive ml-auto"
                    onClick={() => deleteCampaign(campaign.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── CREATE / EDIT VIEW (Wizard) ──────────────────────────

  return (
    <CampaignWizard
      igAccount={igAccount}
      editingCampaign={editingCampaign}
      onSuccess={() => {
        setEditingCampaign(null)
        setView('campaigns')
        fetchCampaigns()
      }}
      onCancel={() => {
        setEditingCampaign(null)
        setView('campaigns')
      }}
    />
  )
}
