import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'
import { fetchMediaComments, IgComment } from '@/lib/instagram-api'
import { decryptToken } from '@/lib/encryption'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// ─── BullMQ dm-sender queue ───────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
let dmSenderQueue: Queue | null = null

function getDmSenderQueue(): Queue {
  if (!dmSenderQueue) {
    dmSenderQueue = new Queue('dm-sender', {
      connection: new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return dmSenderQueue
}

// ─── Helper: decrypt IG access token ──────────────────────

function getDecryptedToken(account: {
  accessTokenEncrypted: string | null
  accessTokenIv: string | null
  accessTokenTag: string | null
}): string | null {
  return decryptToken({
    accessTokenEncrypted: account.accessTokenEncrypted,
    accessTokenIv: account.accessTokenIv,
    accessTokenTag: account.accessTokenTag,
  })
}

// ─── POST /api/campaigns/poll ─────────────────────────────
// Manually poll comments on campaign media and trigger AutoDMs.
//
// Body (optional):
//   { campaignId?: string }
//   If campaignId is provided, poll only that campaign.
//   Otherwise, poll all active COMMENT_DM campaigns for the user.
//
// This is the manual alternative to webhooks for unpublished apps.
// When Meta grants webhook access, this endpoint stays as a
// backup / manual-trigger option.

export const POST = withAuth(async (request: NextRequest, user: AuthUser) => {
  const body = await request.json().catch(() => ({}))
  const { campaignId } = body as { campaignId?: string }

  // Fetch active campaigns
  const where: Record<string, unknown> = {
    userId: user.id,
    status: 'ACTIVE',
    type: 'COMMENT_DM',
  }
  if (campaignId) where.id = campaignId

  const campaigns = await prisma.campaign.findMany({
    where,
    include: {
      media: true,
      igAccount: {
        select: {
          id: true,
          igUserId: true,
          igUsername: true,
          accessTokenEncrypted: true,
          accessTokenIv: true,
          accessTokenTag: true,
          pageAccessTokenEncrypted: true,
          pageAccessTokenIv: true,
          pageAccessTokenTag: true,
          igBusinessId: true,
          isActive: true,
          tokenExpiresAt: true,
        },
      },
    },
  })

  if (campaigns.length === 0) {
    return NextResponse.json({
      success: false,
      error: 'No active COMMENT_DM campaigns found',
    }, { status: 404 })
  }

  const results: Array<{
    campaignId: string
    campaignName: string
    mediaPolled: number
    commentsFound: number
    keywordMatches: number
    dmsQueued: number
    duplicatesSkipped: number
    errors: string[]
  }> = []

  for (const campaign of campaigns) {
    const campaignResult = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      mediaPolled: 0,
      commentsFound: 0,
      keywordMatches: 0,
      dmsQueued: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
    }

    const igAccount = campaign.igAccount
    if (!igAccount || !igAccount.isActive) {
      campaignResult.errors.push('IG account not found or inactive')
      results.push(campaignResult)
      continue
    }

    // Check token expiry
    if (igAccount.tokenExpiresAt && new Date(igAccount.tokenExpiresAt) < new Date()) {
      campaignResult.errors.push('IG access token has expired')
      results.push(campaignResult)
      continue
    }

    // Decrypt access token
    const accessToken = getDecryptedToken(igAccount)
    if (!accessToken) {
      campaignResult.errors.push('Failed to decrypt IG access token')
      results.push(campaignResult)
      continue
    }

    // Prefer Page token for comments API when available,
    // otherwise fall back to graph.instagram.com comments endpoint.
    let commentApiMode: 'facebook' | 'instagram' = 'instagram'
    let apiToken = accessToken
    if (igAccount.pageAccessTokenEncrypted) {
      const pageToken = decryptToken({
        accessTokenEncrypted: igAccount.pageAccessTokenEncrypted,
        accessTokenIv: igAccount.pageAccessTokenIv,
        accessTokenTag: igAccount.pageAccessTokenTag,
      })
      if (pageToken) {
        apiToken = pageToken
        commentApiMode = 'facebook'
      }
    }

    // Get campaign media (if empty, we can't poll comments)
    if (campaign.media.length === 0) {
      campaignResult.errors.push('Campaign has no media configured — cannot poll comments')
      results.push(campaignResult)
      continue
    }

    const keywords = campaign.triggerKeywords.map((k: string) => k.toLowerCase())

    // Poll comments for each media post
    for (const media of campaign.media) {
      campaignResult.mediaPolled++

      let comments: IgComment[]
      try {
        comments = await fetchMediaComments(media.igMediaId, apiToken, 100, commentApiMode)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        campaignResult.errors.push(`Failed to fetch comments for media ${media.igMediaId}: ${errMsg}`)
        continue
      }

      campaignResult.commentsFound += comments.length

      for (const comment of comments) {
        // Skip comments from our own account
        if (comment.from.id === igAccount.igUserId) continue
        if (igAccount.igBusinessId && comment.from.id === igAccount.igBusinessId) continue
        if (comment.from.username && comment.from.username === igAccount.igUsername) continue

        const commentText = comment.text.toLowerCase().trim()

        // Check keyword match
        const hasMatch = keywords.length === 0 ||
          keywords.some((keyword: string) => commentText.includes(keyword))

        if (!hasMatch) continue

        campaignResult.keywordMatches++

        // Dedup by commentId first to avoid reprocessing the same comment.
        const existingByComment = await prisma.interaction.findFirst({
          where: {
            campaignId: campaign.id,
            commentId: comment.id,
            type: 'COMMENT',
          },
        })

        if (existingByComment) {
          campaignResult.duplicatesSkipped++
          continue
        }

        // Dedup by user/status: keep successful/active interactions unique,
        // but allow retries after failures (new comments only).
        const existingInteraction = await prisma.interaction.findFirst({
          where: {
            campaignId: campaign.id,
            igScopedUserId: comment.from.id,
            type: 'COMMENT',
            status: {
              in: ['PENDING', 'REPLIED', 'COMPLETED'],
            },
          },
        })

        if (existingInteraction) {
          campaignResult.duplicatesSkipped++
          continue
        }

        // Create interaction record
        const interaction = await prisma.interaction.create({
          data: {
            campaignId: campaign.id,
            igAccountId: igAccount.id,
            igScopedUserId: comment.from.id,
            igUsername: comment.from.username || null,
            type: 'COMMENT',
            status: 'PENDING',
            commentId: comment.id,
            commentText: comment.text,
            metadata: {
              mediaId: media.igMediaId,
              matchedKeyword: keywords.find((k: string) => commentText.includes(k)) || 'all',
              source: 'manual_poll',
            },
          },
        })

        // Parse DM messages
        const dmMessages = campaign.dmMessages as Array<{ text: string; delayMinutes?: number }>
        if (!dmMessages || dmMessages.length === 0) {
          await prisma.interaction.update({
            where: { id: interaction.id },
            data: { status: 'SKIPPED' },
          })
          campaignResult.errors.push(`Campaign has no DM messages configured`)
          continue
        }

        // Enqueue DM via the dm-sender BullMQ queue
        const queue = getDmSenderQueue()
        await queue.add(
          `dm-${interaction.id}-0`,
          {
            interactionId: interaction.id,
            campaignId: campaign.id,
            igAccountId: igAccount.id,
            userId: user.id,
            recipientId: comment.from.id,
            messageText: dmMessages[0].text,
            messageIndex: 0,
            totalMessages: dmMessages.length,
            requireFollow: campaign.requireFollow,
            commentId: comment.id,
            replyMessage: campaign.replyMessage,
          },
          {
            delay: 3000 + Math.random() * 5000, // 3-8s delay
          }
        )

        // Create lead (if not exists)
        const existingLead = await prisma.lead.findFirst({
          where: {
            campaignId: campaign.id,
            igScopedUserId: comment.from.id,
          },
        })
        if (!existingLead) {
          await prisma.lead.create({
            data: {
              userId: user.id,
              campaignId: campaign.id,
              igScopedUserId: comment.from.id,
              igUsername: comment.from.username || null,
            },
          })
        }

        campaignResult.dmsQueued++
        console.log(`[Poll] Queued DM for @${comment.from.username} (comment: "${comment.text}") → campaign "${campaign.name}"`)
      }
    }

    results.push(campaignResult)
  }

  const totalDmsQueued = results.reduce((sum, r) => sum + r.dmsQueued, 0)
  const totalKeywordMatches = results.reduce((sum, r) => sum + r.keywordMatches, 0)

  return NextResponse.json({
    success: true,
    summary: {
      campaignsPolled: results.length,
      totalCommentsFound: results.reduce((sum, r) => sum + r.commentsFound, 0),
      totalKeywordMatches,
      totalDmsQueued,
      totalDuplicatesSkipped: results.reduce((sum, r) => sum + r.duplicatesSkipped, 0),
    },
    results,
  })
})
