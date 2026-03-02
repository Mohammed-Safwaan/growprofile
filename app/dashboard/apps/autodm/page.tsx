'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  Instagram, Zap, AlertCircle, CheckCircle2, Play, Pause,
  Sparkles, MessageSquare, Hash, Send, Plus, Trash2,
  RefreshCw, Eye, Loader2, Image as ImageIcon,
  ArrowLeft, Mail, MessageCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Types ────────────────────────────────────────────────

interface IgMedia {
  id: string
  caption?: string
  media_type: string
  media_url?: string
  thumbnail_url?: string
  permalink: string
  timestamp: string
  like_count?: number
  comments_count?: number
}

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

type CampaignTypeOption = 'COMMENT_DM' | 'DM_KEYWORD'
type ViewMode = 'campaigns' | 'create' | 'edit'

// ─── Main Component ───────────────────────────────────────

export default function AutoDMPage() {
  const { user, authFetch } = useAuth()
  const router = useRouter()

  // State
  const [view, setView] = useState<ViewMode>('campaigns')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [igMedia, setIgMedia] = useState<IgMedia[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)

  // Connected account
  const igAccount = user?.instagramAccounts?.[0]

  // Form state
  const [campaignType, setCampaignType] = useState<CampaignTypeOption>('COMMENT_DM')
  const [campaignName, setCampaignName] = useState('')
  const [keywords, setKeywords] = useState('')
  const [dmMessage, setDmMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [requireFollow, setRequireFollow] = useState(false)
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set())
  const [campaignStatus, setCampaignStatus] = useState<'DRAFT' | 'ACTIVE'>('ACTIVE')

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

  // ─── Fetch IG media ─────────────────────────────────────

  const fetchMedia = useCallback(async () => {
    if (!igAccount) return
    try {
      setMediaLoading(true)
      const res = await authFetch(`/api/instagram/media?accountId=${igAccount.id}&limit=25`)
      const data = await res.json()
      if (data.success) setIgMedia(data.media)
    } catch (err) {
      console.error('Failed to fetch media:', err)
    } finally {
      setMediaLoading(false)
    }
  }, [igAccount, authFetch])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  // ─── Create/Update campaign ─────────────────────────────

  const handleSaveCampaign = async () => {
    if (!igAccount) return
    const keywordArray = keywords.split(',').map(k => k.trim()).filter(Boolean)

    if (!campaignName || keywordArray.length === 0 || !dmMessage) {
      alert('Please fill in campaign name, at least one keyword, and a DM message.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        igAccountId: igAccount.id,
        name: campaignName,
        type: campaignType,
        triggerKeywords: keywordArray,
        replyMessage: campaignType === 'COMMENT_DM' ? (replyMessage || null) : null,
        dmMessages: [{ text: dmMessage }],
        requireFollow,
        status: campaignStatus,
        mediaIds: campaignType === 'COMMENT_DM'
          ? Array.from(selectedMediaIds).map(igMediaId => {
              const media = igMedia.find(m => m.id === igMediaId)
              return {
                igMediaId,
                mediaUrl: media?.media_url || media?.thumbnail_url || null,
                mediaType: media?.media_type || null,
                caption: media?.caption || null,
                permalink: media?.permalink || null,
              }
            })
          : [],
      }

      const url = editingCampaign ? `/api/campaigns/${editingCampaign.id}` : '/api/campaigns'
      const method = editingCampaign ? 'PATCH' : 'POST'

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        resetForm()
        setView('campaigns')
        await fetchCampaigns()
      } else {
        alert(data.error || 'Failed to save campaign')
      }
    } catch (err) {
      console.error('Save error:', err)
      alert('Failed to save campaign')
    } finally {
      setSaving(false)
    }
  }

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
    setCampaignType((campaign.type as CampaignTypeOption) || 'COMMENT_DM')
    setCampaignName(campaign.name)
    setKeywords(campaign.triggerKeywords.join(', '))
    setDmMessage(campaign.dmMessages?.[0]?.text || '')
    setReplyMessage(campaign.replyMessage || '')
    setRequireFollow(campaign.requireFollow)
    setCampaignStatus(campaign.status as 'DRAFT' | 'ACTIVE')
    setSelectedMediaIds(new Set(campaign.media.map(m => m.igMediaId)))
    if ((campaign.type as CampaignTypeOption) !== 'DM_KEYWORD') fetchMedia()
    setView('edit')
  }

  // ─── Start creating ─────────────────────────────────────

  const startCreate = () => {
    resetForm()
    fetchMedia()
    setView('create')
  }

  const resetForm = () => {
    setEditingCampaign(null)
    setCampaignType('COMMENT_DM')
    setCampaignName('')
    setKeywords('')
    setDmMessage('')
    setReplyMessage('')
    setRequireFollow(false)
    setSelectedMediaIds(new Set())
    setCampaignStatus('ACTIVE')
  }

  const toggleMediaSelection = (mediaId: string) => {
    setSelectedMediaIds(prev => {
      const next = new Set(prev)
      if (next.has(mediaId)) next.delete(mediaId)
      else next.add(mediaId)
      return next
    })
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
                      <div key={m.id} className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                        {m.mediaUrl ? (
                          <img src={m.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
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

  // ─── CREATE / EDIT VIEW ─────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" className="gap-2 mb-4 -ml-2" onClick={() => { resetForm(); setView('campaigns') }}>
          <ArrowLeft className="w-4 h-4" />
          Back to Campaigns
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {editingCampaign ? 'Edit Campaign' : 'New Campaign'}
            </h1>
            <p className="text-muted-foreground">
              {editingCampaign ? `Editing "${editingCampaign.name}"` : 'Set up your AutoDM automation'}
            </p>
          </div>
        </div>
      </div>

      {/* Campaign Type Selector */}
      <div className="mb-8 p-6 rounded-2xl bg-card border border-border">
        <h2 className="text-lg font-bold text-foreground mb-4">Campaign Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => { setCampaignType('COMMENT_DM'); if (igMedia.length === 0) fetchMedia() }}
            className={`p-5 rounded-xl border-2 text-left transition-all ${
              campaignType === 'COMMENT_DM'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                campaignType === 'COMMENT_DM'
                  ? 'bg-gradient-to-br from-primary to-secondary'
                  : 'bg-muted'
              }`}>
                <MessageCircle className={`w-5 h-5 ${campaignType === 'COMMENT_DM' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Comment → DM</p>
                <p className="text-xs text-muted-foreground">User comments on your post, gets a DM</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Requires Facebook Page linked to your Instagram account. Best for post engagement campaigns.
            </p>
          </button>

          <button
            onClick={() => setCampaignType('DM_KEYWORD')}
            className={`p-5 rounded-xl border-2 text-left transition-all ${
              campaignType === 'DM_KEYWORD'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                : 'border-border hover:border-primary/30'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                campaignType === 'DM_KEYWORD'
                  ? 'bg-gradient-to-br from-primary to-secondary'
                  : 'bg-muted'
              }`}>
                <Mail className={`w-5 h-5 ${campaignType === 'DM_KEYWORD' ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-semibold text-foreground">DM Keyword</p>
                <p className="text-xs text-muted-foreground">User DMs a keyword, gets an auto-reply</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              No Facebook Page required. Works with any Instagram Business/Creator account.
            </p>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${campaignType === 'COMMENT_DM' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-8`}>
        {/* Left: Post Selector (only for COMMENT_DM) */}
        {campaignType === 'COMMENT_DM' && (
        <div className="lg:col-span-2 space-y-6">
          {/* Post Selection */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Select Posts</h2>
                <p className="text-sm text-muted-foreground">
                  Choose which posts trigger AutoDM (leave empty = all posts)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedMediaIds.size > 0 && (
                  <Badge className="bg-primary/10 text-primary">{selectedMediaIds.size} selected</Badge>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={fetchMedia} disabled={mediaLoading}>
                  <RefreshCw className={`w-3.5 h-3.5 ${mediaLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {mediaLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading your posts...</span>
              </div>
            ) : igMedia.length === 0 ? (
              <div className="text-center py-12">
                <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No posts found. Make sure your Instagram account has posts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {igMedia.map((media) => {
                  const isSelected = selectedMediaIds.has(media.id)
                  const thumbUrl = media.media_type === 'VIDEO'
                    ? media.thumbnail_url
                    : media.media_url

                  return (
                    <div
                      key={media.id}
                      onClick={() => toggleMediaSelection(media.id)}
                      className={`relative rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 group ${
                        isSelected
                          ? 'border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                          : 'border-transparent hover:border-primary/30'
                      }`}
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={media.caption?.substring(0, 30) || 'Post'}
                          className="w-full h-44 object-cover"
                        />
                      ) : (
                        <div className="w-full h-44 bg-muted flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-end p-3">
                        <div className="flex justify-between text-xs text-white gap-2">
                          <span>❤️ {(media.like_count || 0).toLocaleString()}</span>
                          <span>💬 {(media.comments_count || 0).toLocaleString()}</span>
                        </div>
                        {media.caption && (
                          <p className="text-[10px] text-white/70 mt-1 truncate">{media.caption}</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-lg">
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div className={`absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSelected ? 'opacity-100' : ''
                      }`} />
                      {media.media_type === 'VIDEO' && (
                        <Badge className="absolute top-3 left-3 bg-black/60 text-white text-[10px]">VIDEO</Badge>
                      )}
                      {media.media_type === 'CAROUSEL_ALBUM' && (
                        <Badge className="absolute top-3 left-3 bg-black/60 text-white text-[10px]">CAROUSEL</Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Right: Campaign Setup */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Campaign Setup
            </h3>

            <div className="space-y-5">
              {/* Campaign Name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Campaign Name</label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Price Inquiry AutoDM"
                  className="rounded-xl"
                />
              </div>

              {/* Trigger Keywords */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  Trigger Keywords
                </label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder={campaignType === 'DM_KEYWORD' ? 'info, pricing, link' : 'price, info, link'}
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {campaignType === 'DM_KEYWORD'
                    ? 'When someone DMs one of these keywords, they get your auto-reply'
                    : 'Separate keywords with commas'}
                </p>
              </div>

              {/* DM Message */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  DM Message
                </label>
                <textarea
                  value={dmMessage}
                  onChange={(e) => setDmMessage(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-28 transition-all text-sm"
                  placeholder="Hey! 👋 Thanks for your interest! Here's the link you asked for: https://..."
                />
              </div>

              {/* Public Reply (only for COMMENT_DM) */}
              {campaignType === 'COMMENT_DM' && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Send className="w-4 h-4 text-muted-foreground" />
                  Public Comment Reply (optional)
                </label>
                <Input
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Check your DMs! 📩"
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground mt-1.5">Auto-reply visible on the comment thread</p>
              </div>
              )}

              {/* Require Follow */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">Require Follow</p>
                  <p className="text-xs text-muted-foreground">Only send DM if they follow you</p>
                </div>
                <button
                  onClick={() => setRequireFollow(!requireFollow)}
                  className={`w-11 h-6 rounded-full transition-colors ${
                    requireFollow ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                    requireFollow ? 'translate-x-[22px]' : 'translate-x-[2px]'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2 rounded-xl shadow-lg shadow-primary/25 text-base"
              onClick={handleSaveCampaign}
              disabled={saving || !campaignName || !keywords || !dmMessage}
            >
              {saving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
              ) : editingCampaign ? (
                <><CheckCircle2 className="w-5 h-5" /> Update Campaign</>
              ) : (
                <><Play className="w-5 h-5" /> Launch Campaign</>
              )}
            </Button>
            {!editingCampaign && (
              <Button
                variant="outline"
                className="w-full h-11 gap-2 rounded-xl"
                onClick={() => { setCampaignStatus('DRAFT'); handleSaveCampaign() }}
                disabled={saving}
              >
                Save as Draft
              </Button>
            )}
          </div>

          {/* Preview Card */}
          <div className="p-5 rounded-2xl bg-muted/50 border border-border">
            <p className="text-xs font-medium text-muted-foreground mb-3">DM PREVIEW</p>
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                  <Send className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    {dmMessage || 'Your message will appear here...'}
                  </p>
                </div>
              </div>
            </div>
            {replyMessage && campaignType === 'COMMENT_DM' && (
              <>
                <p className="text-xs font-medium text-muted-foreground mb-2 mt-4">PUBLIC REPLY PREVIEW</p>
                <div className="bg-card rounded-xl p-3 border border-border">
                  <p className="text-xs text-foreground">↳ {replyMessage}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
