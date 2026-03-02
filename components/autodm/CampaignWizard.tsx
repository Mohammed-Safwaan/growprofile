'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Instagram, Zap, CheckCircle2, Play, Pause,
  Sparkles, MessageSquare, Hash, Send, Plus,
  RefreshCw, Loader2, Image as ImageIcon,
  ArrowLeft, Mail, MessageCircle,
  X, Link2, Type, MousePointer
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
  dmMessages: Array<{ text: string; buttonLabel?: string; buttonUrl?: string; delayMinutes?: number }>
  requireFollow: boolean
  media: CampaignMedia[]
  igAccount?: { igUsername: string; igUserId: string }
}

interface WizardProps {
  igAccount: { id: string; igUsername: string; igUserId: string }
  editingCampaign: Campaign | null
  onSuccess: () => void
  onCancel: () => void
}

// ─── Constants ────────────────────────────────────────────

const STEPS = ['Setup', 'Triggers', 'Message', 'Review'] as const

// ─── Component ────────────────────────────────────────────

export function CampaignWizard({ igAccount, editingCampaign, onSuccess, onCancel }: WizardProps) {
  const { authFetch } = useAuth()

  // Wizard step
  const [step, setStep] = useState(1)

  // Form state
  const [campaignType, setCampaignType] = useState<'COMMENT_DM' | 'DM_KEYWORD'>('COMMENT_DM')
  const [campaignName, setCampaignName] = useState('')
  const [keywordTags, setKeywordTags] = useState<string[]>([])
  const [currentKeyword, setCurrentKeyword] = useState('')
  const [dmMessage, setDmMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [requireFollow, setRequireFollow] = useState(false)
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set())
  const [dmType, setDmType] = useState<'text' | 'text_button'>('text')
  const [buttonLabel, setButtonLabel] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [campaignStatus, setCampaignStatus] = useState<'DRAFT' | 'ACTIVE'>('ACTIVE')

  // Media
  const [igMedia, setIgMedia] = useState<IgMedia[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)

  // Save
  const [saving, setSaving] = useState(false)

  const dmTextareaRef = useRef<HTMLTextAreaElement>(null)

  // ─── Fetch media ──────────────────────────────────────

  const fetchMedia = useCallback(async () => {
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
  }, [igAccount.id, authFetch])

  // ─── Initialize from editing campaign ─────────────────

  useEffect(() => {
    if (editingCampaign) {
      setCampaignType((editingCampaign.type as 'COMMENT_DM' | 'DM_KEYWORD') || 'COMMENT_DM')
      setCampaignName(editingCampaign.name)
      setKeywordTags(editingCampaign.triggerKeywords)
      setDmMessage(editingCampaign.dmMessages?.[0]?.text || '')
      setReplyMessage(editingCampaign.replyMessage || '')
      setRequireFollow(editingCampaign.requireFollow)
      setCampaignStatus(editingCampaign.status as 'DRAFT' | 'ACTIVE')
      setSelectedMediaIds(new Set(editingCampaign.media.map(m => m.igMediaId)))
      const firstDm = editingCampaign.dmMessages?.[0] as any
      setDmType(firstDm?.buttonLabel ? 'text_button' : 'text')
      setButtonLabel(firstDm?.buttonLabel || '')
      setButtonUrl(firstDm?.buttonUrl || '')
    }
    fetchMedia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Keyword helpers ──────────────────────────────────

  const addKeyword = (kw: string) => {
    const trimmed = kw.trim().toLowerCase().replace(/,/g, '')
    if (trimmed && !keywordTags.includes(trimmed)) {
      setKeywordTags(prev => [...prev, trimmed])
    }
    setCurrentKeyword('')
  }

  const removeKeyword = (kw: string) => {
    setKeywordTags(prev => prev.filter(k => k !== kw))
  }

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && currentKeyword.trim()) {
      e.preventDefault()
      addKeyword(currentKeyword)
    } else if (e.key === 'Backspace' && !currentKeyword && keywordTags.length > 0) {
      removeKeyword(keywordTags[keywordTags.length - 1])
    }
  }

  // ─── DM helpers ───────────────────────────────────────

  const insertVariable = (variable: string) => {
    const ta = dmTextareaRef.current
    if (!ta) { setDmMessage(prev => prev + variable); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = dmMessage.slice(0, start) + variable + dmMessage.slice(end)
    setDmMessage(text)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  const toggleMediaSelection = (mediaId: string) => {
    setSelectedMediaIds(prev => {
      const next = new Set(prev)
      if (next.has(mediaId)) next.delete(mediaId)
      else next.add(mediaId)
      return next
    })
  }

  // ─── Validation ───────────────────────────────────────

  const canProceed = () => {
    switch (step) {
      case 1: return !!campaignName.trim()
      case 2: return keywordTags.length > 0
      case 3: return !!dmMessage.trim() && (dmType === 'text' || (!!buttonLabel.trim() && !!buttonUrl.trim()))
      default: return true
    }
  }

  // ─── Save ─────────────────────────────────────────────

  const handleSave = async (asDraft = false) => {
    setSaving(true)
    try {
      const dmEntry: Record<string, unknown> = { text: dmMessage }
      if (dmType === 'text_button' && buttonLabel && buttonUrl) {
        dmEntry.buttonLabel = buttonLabel
        dmEntry.buttonUrl = buttonUrl
      }

      const payload = {
        igAccountId: igAccount.id,
        name: campaignName,
        type: campaignType,
        triggerKeywords: keywordTags,
        replyMessage: campaignType === 'COMMENT_DM' ? (replyMessage || null) : null,
        dmMessages: [dmEntry],
        requireFollow,
        status: asDraft ? 'DRAFT' : 'ACTIVE',
        mediaIds: campaignType === 'COMMENT_DM'
          ? Array.from(selectedMediaIds).map(igMediaId => {
              const media = igMedia.find(m => m.id === igMediaId)
              return {
                igMediaId,
                mediaUrl: media?.media_type === 'VIDEO'
                  ? (media?.thumbnail_url || media?.media_url || null)
                  : (media?.media_url || media?.thumbnail_url || null),
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
        onSuccess()
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

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" className="gap-2 mb-4 -ml-2" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4" />
          Back to Campaigns
        </Button>
        <h1 className="text-3xl font-bold text-foreground">
          {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {editingCampaign ? `Editing "${editingCampaign.name}"` : 'Set up your AutoDM automation in 4 simple steps'}
        </p>
      </div>

      {/* ── Step Progress ────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEPS.map((label, idx) => {
            const num = idx + 1
            const isActive = step === num
            const isDone = step > num
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => isDone && setStep(num)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
                    isDone ? 'cursor-pointer hover:bg-primary/5' : isActive ? '' : 'cursor-default'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/30 ring-4 ring-primary/20'
                      : isDone
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : num}
                  </div>
                  <span className={`text-sm font-medium hidden sm:block ${
                    isActive ? 'text-foreground' : isDone ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${
                    isDone ? 'bg-primary' : 'bg-border'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
            style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          STEP 1: SETUP
         ══════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Campaign Name */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <label className="text-sm font-semibold text-foreground mb-2 block">Campaign Name</label>
            <Input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., Price Inquiry AutoDM"
              className="rounded-xl text-base h-12"
              autoFocus
            />
          </div>

          {/* Campaign Type */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <h2 className="text-lg font-bold text-foreground mb-1">When someone...</h2>
            <p className="text-sm text-muted-foreground mb-4">Choose how the automation is triggered</p>
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
                    campaignType === 'COMMENT_DM' ? 'bg-gradient-to-br from-primary to-secondary' : 'bg-muted'
                  }`}>
                    <MessageCircle className={`w-5 h-5 ${campaignType === 'COMMENT_DM' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Comments on your Post / Reel</p>
                    <p className="text-xs text-muted-foreground">User comments a keyword, gets a DM</p>
                  </div>
                </div>
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
                    campaignType === 'DM_KEYWORD' ? 'bg-gradient-to-br from-primary to-secondary' : 'bg-muted'
                  }`}>
                    <Mail className={`w-5 h-5 ${campaignType === 'DM_KEYWORD' ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Sends you a DM</p>
                    <p className="text-xs text-muted-foreground">User DMs a keyword, gets auto-reply</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Post Selector (COMMENT_DM only) */}
          {campaignType === 'COMMENT_DM' && (
            <div className="p-6 rounded-2xl bg-card border border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-1">Select Posts / Reels</h2>
                  <p className="text-sm text-muted-foreground">Choose which content triggers the AutoDM (leave empty = all posts)</p>
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
                </div>
              ) : igMedia.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No posts found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {igMedia.map((media) => {
                    const isSelected = selectedMediaIds.has(media.id)
                    const thumbUrl = media.media_type === 'VIDEO' ? media.thumbnail_url : media.media_url
                    return (
                      <div
                        key={media.id}
                        onClick={() => toggleMediaSelection(media.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
                          isSelected ? 'border-primary shadow-lg shadow-primary/20 scale-[1.03]' : 'border-transparent hover:border-primary/30'
                        }`}
                      >
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        {media.media_type === 'VIDEO' && (
                          <Badge className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5">▶ VIDEO</Badge>
                        )}
                        {media.media_type === 'CAROUSEL_ALBUM' && (
                          <Badge className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5">⊞ CAROUSEL</Badge>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex justify-between text-[10px]">
                            <span>❤️ {(media.like_count || 0).toLocaleString()}</span>
                            <span>💬 {(media.comments_count || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 2: TRIGGERS
         ══════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Keyword Tags */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
              <Hash className="w-4 h-4 text-primary" />
              Trigger Keywords
            </label>
            <p className="text-sm text-muted-foreground mb-3">
              {campaignType === 'DM_KEYWORD'
                ? 'When someone DMs one of these keywords, they get your auto-reply'
                : 'When a comment contains one of these keywords, the AutoDM fires'}
            </p>
            <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-input bg-background min-h-[52px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              {keywordTags.map(kw => (
                <Badge key={kw} variant="secondary" className="bg-primary/10 text-primary gap-1 px-3 py-1.5 text-sm font-medium">
                  #{kw}
                  <button onClick={() => removeKeyword(kw)} className="ml-1 hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={currentKeyword}
                onChange={(e) => setCurrentKeyword(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={() => currentKeyword.trim() && addKeyword(currentKeyword)}
                className="flex-1 min-w-[140px] bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground py-1"
                placeholder={keywordTags.length === 0 ? 'Type a keyword and press Enter...' : 'Add more...'}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Press Enter or comma to add · Backspace to remove last</p>
          </div>

          {/* Public Reply (COMMENT_DM only) */}
          {campaignType === 'COMMENT_DM' && (
            <div className="p-6 rounded-2xl bg-card border border-border">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                <Send className="w-4 h-4 text-primary" />
                Public Comment Reply
                <Badge variant="outline" className="text-[10px] ml-1 font-normal">Optional</Badge>
              </label>
              <p className="text-sm text-muted-foreground mb-3">This reply is visible on the comment thread to prompt others to comment too</p>
              <Input
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder='e.g., "Sent you the details in DM! 📩"'
                className="rounded-xl"
              />

              {/* Live preview of comment reply */}
              {replyMessage && (
                <div className="mt-4 p-4 rounded-xl bg-muted/50 border border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xs">👤</span>
                    </div>
                    <div>
                      <p className="text-sm"><span className="font-semibold">user</span> This is a comment</p>
                      <div className="ml-6 mt-2 flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                          <Instagram className="w-3 h-3 text-white" />
                        </div>
                        <p className="text-sm">
                          <span className="font-semibold">@{igAccount.igUsername}</span>{' '}
                          <span className="text-primary">@user</span> {replyMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Options */}
          <div className="p-6 rounded-2xl bg-card border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Options</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">Require Follow</p>
                  <p className="text-xs text-muted-foreground">Only send the DM if the user follows you</p>
                </div>
                <button
                  onClick={() => setRequireFollow(!requireFollow)}
                  className={`w-11 h-6 rounded-full transition-colors ${requireFollow ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform ${requireFollow ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 3: COMPOSE MESSAGE
         ══════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Editor */}
          <div className="lg:col-span-3 space-y-6">
            {/* DM Type */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <label className="text-sm font-semibold text-foreground mb-3 block">DM Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDmType('text')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    dmType === 'text' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <Type className={`w-5 h-5 mb-2 ${dmType === 'text' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-medium text-sm text-foreground">Text Only</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Simple text message</p>
                </button>
                <button
                  onClick={() => setDmType('text_button')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    dmType === 'text_button' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <MousePointer className={`w-5 h-5 mb-2 ${dmType === 'text_button' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-medium text-sm text-foreground">Text + Button</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Message with a CTA link button</p>
                </button>
              </div>
            </div>

            {/* DM Content */}
            <div className="p-6 rounded-2xl bg-card border border-border">
              <label className="text-sm font-semibold text-foreground mb-3 block">DM Content</label>
              <textarea
                ref={dmTextareaRef}
                value={dmMessage}
                onChange={(e) => setDmMessage(e.target.value.slice(0, 1000))}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none h-36 transition-all text-sm leading-relaxed"
                placeholder="Hey {{name}}! 👋 Thanks for your interest! Here's what you asked for..."
                autoFocus
              />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground mr-1">Insert:</span>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{name}}')}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    {'{{name}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{username}}')}
                    className="px-2.5 py-1 rounded-lg bg-secondary/10 text-secondary text-xs font-medium hover:bg-secondary/20 transition-colors"
                  >
                    {'{{username}}'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${dmMessage.length > 900 ? 'bg-destructive' : dmMessage.length > 700 ? 'bg-amber-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min((dmMessage.length / 1000) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium tabular-nums ${dmMessage.length > 900 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {dmMessage.length}/1000
                  </span>
                </div>
              </div>

              {/* Button fields */}
              {dmType === 'text_button' && (
                <div className="mt-6 pt-5 border-t border-border space-y-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary" />
                    <label className="text-sm font-semibold text-foreground">CTA Button</label>
                  </div>
                  <Input
                    value={buttonLabel}
                    onChange={(e) => setButtonLabel(e.target.value)}
                    placeholder='Button label, e.g. "Get the Link 🔗"'
                    className="rounded-xl"
                  />
                  <Input
                    value={buttonUrl}
                    onChange={(e) => setButtonUrl(e.target.value)}
                    placeholder="https://your-link.com"
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <div className="p-5 rounded-2xl bg-card border border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Live Preview</p>

                {/* Mock Instagram DM */}
                <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
                  {/* Chat header */}
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 flex items-center justify-center">
                      <Instagram className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">@{igAccount.igUsername}</p>
                      <p className="text-[10px] text-green-600 font-medium">Active now</p>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="p-4 min-h-[220px] space-y-3">
                    {/* Incoming message (user keyword) */}
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%]">
                        <p className="text-sm text-foreground">
                          {keywordTags.length > 0 ? keywordTags[0] : 'info'}
                        </p>
                      </div>
                    </div>

                    {/* Outgoing DM */}
                    <div className="flex justify-end">
                      <div className="max-w-[85%] space-y-2">
                        <div className="bg-gradient-to-br from-primary to-secondary rounded-2xl rounded-tr-sm px-4 py-3">
                          <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
                            {dmMessage || 'Your message will appear here...'}
                          </p>
                        </div>
                        {dmType === 'text_button' && buttonLabel && (
                          <div className="w-full px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-center hover:bg-primary/15 transition-colors cursor-default">
                            <span className="text-sm font-medium text-primary flex items-center justify-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5" />
                              {buttonLabel}
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground text-right">
                          Sent via GrowProfile
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 4: REVIEW & LAUNCH
         ══════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Ready to launch!</h2>
            <p className="text-muted-foreground mt-1">Here&apos;s how your automation will work</p>
          </div>

          {/* Visual Flow */}
          <div className="space-y-0">
            {/* Trigger */}
            <div className="p-5 rounded-2xl bg-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">When someone...</p>
              <p className="text-foreground font-medium">
                {campaignType === 'COMMENT_DM'
                  ? (selectedMediaIds.size > 0 ? 'comments on these posts' : 'comments on any of your posts')
                  : 'sends you a DM'}
              </p>
              {campaignType === 'COMMENT_DM' && selectedMediaIds.size > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {Array.from(selectedMediaIds).slice(0, 6).map(id => {
                    const m = igMedia.find(x => x.id === id)
                    const thumb = m?.media_type === 'VIDEO' ? m?.thumbnail_url : m?.media_url
                    return (
                      <div key={id} className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-border">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {selectedMediaIds.size > 6 && (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-xs text-muted-foreground font-medium">
                      +{selectedMediaIds.size - 6}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Connector */}
            <div className="flex items-center justify-center py-1">
              <div className="w-0.5 h-6 bg-border" />
            </div>

            {/* Keywords */}
            <div className="p-5 rounded-2xl bg-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                And <span className="text-foreground font-bold">includes</span> these keywords
              </p>
              <div className="flex flex-wrap gap-2">
                {keywordTags.map(kw => (
                  <Badge key={kw} className="bg-primary/10 text-primary px-3 py-1.5 text-sm">#{kw}</Badge>
                ))}
              </div>
            </div>

            {/* Connector */}
            <div className="flex items-center justify-center py-1">
              <div className="w-0.5 h-6 bg-border" />
            </div>

            {/* Comment Reply (if set) */}
            {replyMessage && campaignType === 'COMMENT_DM' && (
              <>
                <div className="p-5 rounded-2xl bg-card border border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Leave a reply on their comment</p>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-xs">👤</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground"><span className="font-semibold">User</span>  This is a comment</p>
                      <div className="ml-6 mt-2 flex items-start gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                          <Instagram className="w-3 h-3 text-white" />
                        </div>
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">You</span>{' '}
                          <span className="text-primary">@user</span> {replyMessage}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center py-1">
                  <div className="w-0.5 h-6 bg-border" />
                </div>
              </>
            )}

            {/* DM */}
            <div className="p-5 rounded-2xl bg-card border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {campaignType === 'COMMENT_DM' ? 'Then send the DM' : 'Send the auto-reply DM'}
              </p>
              <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-xl p-4 border border-primary/20">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{dmMessage}</p>
                {dmType === 'text_button' && buttonLabel && (
                  <div className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-secondary text-white rounded-xl text-sm font-medium shadow-lg shadow-primary/20">
                    <Link2 className="w-3.5 h-3.5" />
                    {buttonLabel}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="mt-8 p-5 rounded-2xl bg-muted/50 border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-4">Campaign Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-0.5">Name</p>
                <p className="font-medium text-foreground">{campaignName}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Type</p>
                <p className="font-medium text-foreground">{campaignType === 'COMMENT_DM' ? 'Comment → DM' : 'DM Keyword'}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Keywords</p>
                <p className="font-medium text-foreground">{keywordTags.join(', ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Require Follow</p>
                <p className="font-medium text-foreground">{requireFollow ? 'Yes' : 'No'}</p>
              </div>
              {campaignType === 'COMMENT_DM' && selectedMediaIds.size > 0 && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Posts Selected</p>
                  <p className="font-medium text-foreground">{selectedMediaIds.size}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-0.5">DM Type</p>
                <p className="font-medium text-foreground">{dmType === 'text_button' ? 'Text + Button' : 'Text Only'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Navigation Footer ────────────────────────────── */}
      <div className="sticky bottom-0 mt-8 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="py-4 bg-background/80 backdrop-blur-lg border-t border-border">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <span className="text-sm text-muted-foreground">
              Step {step} of {STEPS.length}
            </span>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="rounded-xl px-6"
                onClick={() => step === 1 ? onCancel() : setStep(step - 1)}
              >
                {step === 1 ? 'Cancel' : 'Back'}
              </Button>

              {step < 4 ? (
                <Button
                  className="rounded-xl px-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg shadow-primary/20"
                  disabled={!canProceed()}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </Button>
              ) : (
                <div className="flex gap-3">
                  {!editingCampaign && (
                    <Button
                      variant="outline"
                      className="rounded-xl px-6"
                      onClick={() => handleSave(true)}
                      disabled={saving}
                    >
                      Save as Draft
                    </Button>
                  )}
                  <Button
                    className="rounded-xl px-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 shadow-lg shadow-primary/20"
                    onClick={() => handleSave(false)}
                    disabled={saving}
                  >
                    {saving ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</>
                    ) : editingCampaign ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2" /> Update Campaign</>
                    ) : (
                      <><Play className="w-4 h-4 mr-2" /> Confirm &amp; Launch</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
