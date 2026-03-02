/**
 * Webhook Process Worker
 *
 * Processes incoming Instagram webhook events:
 * 1. Comment events → Match against active campaigns → trigger AutoDM
 * 2. Message events → Handle keyword-based DM campaigns, follow-up tracking
 * 3. Reaction events → Log for analytics
 *
 * Run this as a standalone process:
 *   npx tsx lib/workers/webhook-process.worker.ts
 */

import 'dotenv/config'
import { Worker, Job } from 'bullmq'
import { PrismaClient } from '../../lib/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import IORedis from 'ioredis'
import type { ParsedWebhookEvent, WebhookCommentEvent, WebhookMessageEvent } from '../webhook-utils'

const { Pool } = pg

// ─── Prisma setup (standalone process) ────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── Redis connection ─────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// ─── DM Sender Queue (import inline to avoid circular deps) ─
import { Queue } from 'bullmq'
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

// ─── Job data interface ───────────────────────────────────
interface WebhookJobData {
  webhookEventId: string
  eventType: string
  igAccountId: string
  userId: string
  event: ParsedWebhookEvent
}

// ─── Process comment events ───────────────────────────────

async function processComment(job: Job<WebhookJobData>) {
  const { webhookEventId, igAccountId, userId, event } = job.data
  const commentEvent = event as WebhookCommentEvent

  const igAccount = await prisma.instagramAccount.findUnique({
    where: { id: igAccountId },
    select: { igUserId: true, igBusinessId: true },
  })

  if (!igAccount) {
    await markEventFailed(webhookEventId, `IG account not found: ${igAccountId}`)
    return
  }

  if (commentEvent.from.id === igAccount.igUserId || commentEvent.from.id === igAccount.igBusinessId) {
    await markEventProcessed(webhookEventId, 'Own comment — skipped')
    return
  }

  console.log(`[WebhookWorker] Processing comment: "${commentEvent.text}" from ${commentEvent.from.username || commentEvent.from.id}`)

  // Find active COMMENT_DM campaigns for this IG account
  const campaigns = await prisma.campaign.findMany({
    where: {
      igAccountId,
      status: 'ACTIVE',
      type: 'COMMENT_DM',
    },
    include: {
      media: true,
    },
  })

  if (campaigns.length === 0) {
    console.log(`[WebhookWorker] No active campaigns for IG account ${igAccountId}`)
    await markEventProcessed(webhookEventId, 'No matching campaigns')
    return
  }

  const commentText = commentEvent.text.toLowerCase().trim()

  for (const campaign of campaigns) {
    // Check if this comment is on one of the campaign's media
    const isTargetMedia = campaign.media.length === 0 || // Empty = all media
      campaign.media.some(m => m.igMediaId === commentEvent.mediaId)

    if (!isTargetMedia) continue

    // Check keyword match
    const keywords = campaign.triggerKeywords.map(k => k.toLowerCase())
    const hasMatch = keywords.length === 0 || // Empty keywords = match all
      keywords.some(keyword => commentText.includes(keyword))

    if (!hasMatch) continue

    console.log(`[WebhookWorker] Keyword match! Campaign: ${campaign.name}`)

    // Check if this exact comment was already processed (webhook retries, duplicates).
    const existingByComment = await prisma.interaction.findFirst({
      where: {
        campaignId: campaign.id,
        commentId: commentEvent.commentId,
        type: 'COMMENT',
      },
    })

    if (existingByComment) {
      console.log(`[WebhookWorker] Comment ${commentEvent.commentId} already processed for campaign ${campaign.id}`)
      continue
    }

    // Check if we've already interacted with this user for this campaign
    // Keep successful/active interactions unique, but allow retries after failures.
    const existingInteraction = await prisma.interaction.findFirst({
      where: {
        campaignId: campaign.id,
        igScopedUserId: commentEvent.from.id,
        type: 'COMMENT',
        status: {
          in: ['PENDING', 'REPLIED', 'COMPLETED'],
        },
      },
    })

    if (existingInteraction) {
      console.log(`[WebhookWorker] Already interacted with user ${commentEvent.from.id} for campaign ${campaign.id}`)
      continue
    }

    // Create interaction record
    const interaction = await prisma.interaction.create({
      data: {
        campaignId: campaign.id,
        igAccountId,
        igScopedUserId: commentEvent.from.id,
        igUsername: commentEvent.from.username || null,
        type: 'COMMENT',
        status: 'PENDING',
        commentId: commentEvent.commentId,
        commentText: commentEvent.text,
        metadata: {
          mediaId: commentEvent.mediaId,
          matchedKeyword: keywords.find(k => commentText.includes(k)) || 'all',
        },
      },
    })

    // Parse DM messages from campaign config
    const dmMessages = campaign.dmMessages as Array<{ text: string; delayMinutes?: number }>
    if (!dmMessages || dmMessages.length === 0) {
      console.log(`[WebhookWorker] Campaign ${campaign.id} has no DM messages configured`)
      await prisma.interaction.update({
        where: { id: interaction.id },
        data: { status: 'SKIPPED' },
      })
      continue
    }

    // Enqueue first DM
    await dmSenderQueue.add(
      `dm-${interaction.id}-0`,
      {
        interactionId: interaction.id,
        campaignId: campaign.id,
        igAccountId,
        userId,
        recipientId: commentEvent.from.id,
        messageText: dmMessages[0].text,
        messageIndex: 0,
        totalMessages: dmMessages.length,
        requireFollow: campaign.requireFollow,
        commentId: commentEvent.commentId,
        replyMessage: campaign.replyMessage,
      },
      {
        // Add a small delay to avoid immediate DM after comment (looks more natural)
        delay: 3000 + Math.random() * 5000, // 3-8 seconds
      }
    )

    // Create lead entry (if not exists)
    const existingLead = await prisma.lead.findFirst({
      where: {
        campaignId: campaign.id,
        igScopedUserId: commentEvent.from.id,
      },
    })

    if (!existingLead) {
      await prisma.lead.create({
        data: {
          userId,
          campaignId: campaign.id,
          igScopedUserId: commentEvent.from.id,
          igUsername: commentEvent.from.username || null,
        },
      })
    }

    console.log(`[WebhookWorker] Queued DM for interaction ${interaction.id}`)
  }

  await markEventProcessed(webhookEventId)
}

// ─── Process message events ───────────────────────────────

async function processMessage(job: Job<WebhookJobData>) {
  const { webhookEventId, igAccountId, userId, event } = job.data
  const messageEvent = event as WebhookMessageEvent

  // Skip echo messages (our own outgoing messages)
  if (messageEvent.isEcho) {
    await markEventProcessed(webhookEventId, 'Echo message — skipped')
    return
  }

  console.log(`[WebhookWorker] Processing DM from ${messageEvent.senderId}: "${messageEvent.text}"`)

  // Find active DM_KEYWORD campaigns for this IG account
  const campaigns = await prisma.campaign.findMany({
    where: {
      igAccountId,
      status: 'ACTIVE',
      type: 'DM_KEYWORD',
    },
  })

  if (campaigns.length === 0) {
    // No DM keyword campaigns — just log the message
    await prisma.interaction.create({
      data: {
        igAccountId,
        igScopedUserId: messageEvent.senderId,
        type: 'DM_RECEIVED',
        status: 'COMPLETED',
        dmMessageId: messageEvent.messageId,
        metadata: { text: messageEvent.text },
      },
    })
    await markEventProcessed(webhookEventId, 'No DM keyword campaigns')
    return
  }

  const messageText = (messageEvent.text || '').toLowerCase().trim()

  for (const campaign of campaigns) {
    const keywords = campaign.triggerKeywords.map(k => k.toLowerCase())
    const hasMatch = keywords.some(keyword => messageText.includes(keyword))

    if (!hasMatch) continue

    console.log(`[WebhookWorker] DM keyword match! Campaign: ${campaign.name}`)

    // Check for existing interaction
    // Keep successful/active interactions unique, but allow retries after failures.
    const existingInteraction = await prisma.interaction.findFirst({
      where: {
        campaignId: campaign.id,
        igScopedUserId: messageEvent.senderId,
        type: 'DM_RECEIVED',
        status: {
          in: ['PENDING', 'REPLIED', 'COMPLETED'],
        },
      },
    })

    if (existingInteraction) {
      console.log(`[WebhookWorker] Already processed DM keyword from ${messageEvent.senderId}`)
      continue
    }

    // Create interaction
    const interaction = await prisma.interaction.create({
      data: {
        campaignId: campaign.id,
        igAccountId,
        igScopedUserId: messageEvent.senderId,
        type: 'DM_RECEIVED',
        status: 'PENDING',
        dmMessageId: messageEvent.messageId,
        metadata: {
          text: messageEvent.text,
          matchedKeyword: keywords.find(k => messageText.includes(k)),
        },
      },
    })

    // Parse DM response messages
    const dmMessages = campaign.dmMessages as Array<{ text: string; delayMinutes?: number }>
    if (!dmMessages || dmMessages.length === 0) continue

    // Enqueue DM response
    await dmSenderQueue.add(
      `dm-${interaction.id}-0`,
      {
        interactionId: interaction.id,
        campaignId: campaign.id,
        igAccountId,
        userId,
        recipientId: messageEvent.senderId,
        messageText: dmMessages[0].text,
        messageIndex: 0,
        totalMessages: dmMessages.length,
        requireFollow: campaign.requireFollow,
      },
      {
        delay: 1000 + Math.random() * 3000,
      }
    )

    // Create lead (if not exists)
    const existingLead = await prisma.lead.findFirst({
      where: {
        campaignId: campaign.id,
        igScopedUserId: messageEvent.senderId,
      },
    })

    if (!existingLead) {
      await prisma.lead.create({
        data: {
          userId,
          campaignId: campaign.id,
          igScopedUserId: messageEvent.senderId,
        },
      })
    }
  }

  await markEventProcessed(webhookEventId)
}

// ─── Helper to mark event as processed ────────────────────

async function markEventProcessed(webhookEventId: string, note?: string) {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: 'PROCESSED',
      error: note || null,
      processedAt: new Date(),
    },
  })
}

async function markEventFailed(webhookEventId: string, error: string) {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: 'FAILED',
      error,
      processedAt: new Date(),
    },
  })
}

// ─── Worker definition ────────────────────────────────────

const worker = new Worker<WebhookJobData>(
  'webhook-process',
  async (job) => {
    console.log(`[WebhookWorker] Processing job ${job.id} — type: ${job.data.eventType}`)

    try {
      switch (job.data.eventType) {
        case 'comment':
          await processComment(job)
          break
        case 'message':
          await processMessage(job)
          break
        case 'message_reaction':
          // Just mark as processed — reactions are informational
          await markEventProcessed(job.data.webhookEventId, 'Reaction event — logged')
          break
        default:
          await markEventProcessed(job.data.webhookEventId, `Unknown event type: ${job.data.eventType}`)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`[WebhookWorker] Error processing job ${job.id}:`, errorMsg)
      await markEventFailed(job.data.webhookEventId, errorMsg)
      throw err // Re-throw so BullMQ retries
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs per second
    },
  }
)

worker.on('completed', (job) => {
  console.log(`[WebhookWorker] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[WebhookWorker] Job ${job?.id} failed:`, err.message)
})

worker.on('error', (err) => {
  console.error('[WebhookWorker] Worker error:', err)
})

console.log('[WebhookWorker] Started and listening for webhook-process jobs...')

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[WebhookWorker] Shutting down...')
  await worker.close()
  await prisma.$disconnect()
  await connection.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[WebhookWorker] Shutting down...')
  await worker.close()
  await prisma.$disconnect()
  await connection.quit()
  process.exit(0)
})
