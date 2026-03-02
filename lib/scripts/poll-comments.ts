#!/usr/bin/env bun
/**
 * Manual Comment Polling Script
 *
 * Polls Instagram comments on campaign media, matches keywords,
 * and enqueues DMs through the BullMQ dm-sender queue.
 *
 * This is the manual alternative to Meta webhooks (which require
 * the app to be published). Once webhooks are available, this
 * script remains as a backup / manual-trigger tool.
 *
 * Usage:
 *   bun run lib/scripts/poll-comments.ts                    # Poll all active campaigns
 *   bun run lib/scripts/poll-comments.ts <campaignId>       # Poll a specific campaign
 *   bun run lib/scripts/poll-comments.ts --dry-run          # Preview without sending DMs
 */

import 'dotenv/config'
import { PrismaClient } from '../../lib/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { fetchMediaComments, IgComment } from '../instagram-api'
import { decryptToken } from '../encryption'

const { Pool } = pg

// ─── Setup ────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const dmSenderQueue = new Queue('dm-sender', {
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

// ─── Parse args ───────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const campaignId = args.find(a => !a.startsWith('--'))

if (dryRun) {
  console.log('🔍 DRY RUN MODE — will not enqueue DMs\n')
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log('━━━ Manual Comment Polling ━━━\n')

  // Fetch active COMMENT_DM campaigns
  const where: Record<string, unknown> = {
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
          userId: true,
        },
      },
    },
  })

  if (campaigns.length === 0) {
    console.log('❌ No active COMMENT_DM campaigns found')
    process.exit(1)
  }

  console.log(`Found ${campaigns.length} active campaign(s)\n`)

  let totalDmsQueued = 0
  let totalMatches = 0
  let totalDuplicates = 0

  for (const campaign of campaigns) {
    console.log(`─── Campaign: "${campaign.name}" ───`)
    console.log(`  Keywords: [${campaign.triggerKeywords.join(', ')}]`)
    console.log(`  Media count: ${campaign.media.length}`)

    const igAccount = campaign.igAccount
    if (!igAccount || !igAccount.isActive) {
      console.log('  ⚠️  IG account inactive — skipping\n')
      continue
    }

    if (igAccount.tokenExpiresAt && new Date(igAccount.tokenExpiresAt) < new Date()) {
      console.log('  ⚠️  Token expired — skipping\n')
      continue
    }

    const accessToken = decryptToken({
      accessTokenEncrypted: igAccount.accessTokenEncrypted,
      accessTokenIv: igAccount.accessTokenIv,
      accessTokenTag: igAccount.accessTokenTag,
    })

    // Prefer PAGE_ACCESS_TOKEN for comments API when available,
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
        console.log(`  Using PAGE_ACCESS_TOKEN for API calls`)
      } else {
        console.log(`  Using IG user token via graph.instagram.com for comments`)
      }
    } else {
      console.log(`  Using IG user token via graph.instagram.com for comments`)
    }

    if (!apiToken) {
      console.log('  ⚠️  Cannot decrypt token — skipping\n')
      continue
    }

    console.log(`  IG Account: @${igAccount.igUsername} (${igAccount.igUserId})`)

    if (campaign.media.length === 0) {
      console.log('  ⚠️  No media configured — skipping\n')
      continue
    }

    const keywords = campaign.triggerKeywords.map((k: string) => k.toLowerCase())

    for (const media of campaign.media) {
      console.log(`\n  📸 Fetching comments for media ${media.igMediaId}...`)

      let comments: IgComment[]
      try {
        comments = await fetchMediaComments(media.igMediaId, apiToken, 100, commentApiMode)
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        console.log(`  ❌ Failed to fetch comments: ${errMsg}`)
        continue
      }

      console.log(`  Found ${comments.length} comments`)

      for (const comment of comments) {
        // Skip own comments (check both IG user ID and IG business ID)
        if (comment.from.id === igAccount.igUserId) continue
        if (igAccount.igBusinessId && comment.from.id === igAccount.igBusinessId) continue
        if (comment.from.username && comment.from.username === igAccount.igUsername) continue

        const commentText = comment.text.toLowerCase().trim()
        const hasMatch = keywords.length === 0 ||
          keywords.some((keyword: string) => commentText.includes(keyword))

        if (!hasMatch) continue

        totalMatches++
        const matchedKeyword = keywords.find((k: string) => commentText.includes(k)) || 'all'
        console.log(`  ✅ MATCH: @${comment.from.username} said "${comment.text}" (keyword: ${matchedKeyword})`)

        // Check dedup by commentId first to avoid reprocessing the same comment.
        const existingByComment = await prisma.interaction.findFirst({
          where: {
            campaignId: campaign.id,
            commentId: comment.id,
            type: 'COMMENT',
          },
        })

        if (existingByComment) {
          console.log(`     ↳ Comment already processed (interaction ${existingByComment.id}) — skipping`)
          totalDuplicates++
          continue
        }

        // Check dedup by user status
        // Keep one successful/active interaction per user+campaign,
        // but allow retries when previous attempts failed (new comments only).
        const existing = await prisma.interaction.findFirst({
          where: {
            campaignId: campaign.id,
            igScopedUserId: comment.from.id,
            type: 'COMMENT',
            status: {
              in: ['PENDING', 'REPLIED', 'COMPLETED'],
            },
          },
        })

        if (existing) {
          console.log(`     ↳ Already processed (interaction ${existing.id}) — skipping`)
          totalDuplicates++
          continue
        }

        if (dryRun) {
          console.log(`     ↳ [DRY RUN] Would queue DM: "${(campaign.dmMessages as any[])?.[0]?.text}"`)
          continue
        }

        // Create interaction
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
              matchedKeyword,
              source: 'manual_poll_cli',
            },
          },
        })

        // Parse DM messages
        const dmMessages = campaign.dmMessages as Array<{ text: string; delayMinutes?: number }>
        if (!dmMessages || dmMessages.length === 0) {
          console.log('     ↳ ⚠️  No DM messages configured — skipping')
          await prisma.interaction.update({
            where: { id: interaction.id },
            data: { status: 'SKIPPED' },
          })
          continue
        }

        // Enqueue DM
        await dmSenderQueue.add(
          `dm-${interaction.id}-0`,
          {
            interactionId: interaction.id,
            campaignId: campaign.id,
            igAccountId: igAccount.id,
            userId: igAccount.userId,
            recipientId: comment.from.id,
            messageText: dmMessages[0].text,
            messageIndex: 0,
            totalMessages: dmMessages.length,
            requireFollow: campaign.requireFollow,
            commentId: comment.id,
            replyMessage: campaign.replyMessage,
          },
          {
            delay: 3000 + Math.random() * 5000,
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
              userId: igAccount.userId,
              campaignId: campaign.id,
              igScopedUserId: comment.from.id,
              igUsername: comment.from.username || null,
            },
          })
        }

        totalDmsQueued++
        console.log(`     ↳ 📩 DM queued: "${dmMessages[0].text}" → @${comment.from.username}`)
      }
    }
    console.log()
  }

  // Summary
  console.log('━━━ Summary ━━━')
  console.log(`  Keyword matches: ${totalMatches}`)
  console.log(`  Duplicates skipped: ${totalDuplicates}`)
  console.log(`  DMs queued: ${totalDmsQueued}`)
  if (dryRun) console.log('  (Dry run — no DMs were actually queued)')
  console.log()
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
    process.exit(0)
  })
