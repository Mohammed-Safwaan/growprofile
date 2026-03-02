import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/campaigns/[id] — Get a single campaign
 */
export const GET = withAuth(async (
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
    include: {
      media: true,
      igAccount: {
        select: { igUsername: true, igUserId: true },
      },
      _count: { select: { interactions: true, leads: true } },
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Get recent interactions for this campaign
  const recentInteractions = await prisma.interaction.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      igUsername: true,
      igScopedUserId: true,
      type: true,
      status: true,
      commentText: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    success: true,
    campaign,
    recentInteractions,
  })
})

/**
 * PATCH /api/campaigns/[id] — Update a campaign
 */
export const PATCH = withAuth(async (
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const body = await request.json()

  // Verify ownership
  const existing = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const {
    name,
    status,
    triggerKeywords,
    replyMessage,
    dmMessages,
    requireFollow,
    followUpEnabled,
    followUpDelayMinutes,
    maxFollowUps,
    mediaIds,
  } = body

  // Build update data — only include fields that were provided
  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (status !== undefined) updateData.status = status
  if (triggerKeywords !== undefined) updateData.triggerKeywords = triggerKeywords
  if (replyMessage !== undefined) updateData.replyMessage = replyMessage
  if (dmMessages !== undefined) updateData.dmMessages = dmMessages
  if (requireFollow !== undefined) updateData.requireFollow = requireFollow
  if (followUpEnabled !== undefined) updateData.followUpEnabled = followUpEnabled
  if (followUpDelayMinutes !== undefined) updateData.followUpDelayMinutes = followUpDelayMinutes
  if (maxFollowUps !== undefined) updateData.maxFollowUps = maxFollowUps

  const campaign = await prisma.campaign.update({
    where: { id },
    data: updateData,
    include: {
      media: true,
      _count: { select: { interactions: true, leads: true } },
    },
  })

  // Send campaign status alert if status changed
  if (status !== undefined && status !== existing.status) {
    import('@/lib/email').then(({ sendCampaignAlert }) =>
      sendCampaignAlert({
        to: user.email,
        name: user.name || 'there',
        campaignName: campaign.name,
        status,
      })
    ).catch((err) => console.error('[campaigns] Failed to send campaign alert:', err))
  }

  // If mediaIds were provided, replace existing media
  if (mediaIds !== undefined) {
    await prisma.campaignMedia.deleteMany({ where: { campaignId: id } })

    if (mediaIds.length > 0) {
      await prisma.campaignMedia.createMany({
        data: mediaIds.map((m: { igMediaId: string; mediaUrl?: string; mediaType?: string; caption?: string; permalink?: string }) => ({
          campaignId: id,
          igAccountId: existing.igAccountId,
          igMediaId: m.igMediaId,
          mediaUrl: m.mediaUrl || null,
          mediaType: m.mediaType || null,
          caption: m.caption || null,
          permalink: m.permalink || null,
        })),
      })
    }
  }

  return NextResponse.json({ success: true, campaign })
})

/**
 * DELETE /api/campaigns/[id] — Delete a campaign
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params

  const existing = await prisma.campaign.findFirst({
    where: { id, userId: user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  await prisma.campaign.delete({ where: { id } })

  return NextResponse.json({ success: true })
})
