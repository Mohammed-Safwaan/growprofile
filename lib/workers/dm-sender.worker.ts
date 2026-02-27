/**
 * DM Sender Worker
 *
 * Sends Instagram DMs via the Graph API with:
 * - Rate limiting (per IG account)
 * - Follow-gate checking
 * - Comment reply (public)
 * - Multi-message sequences with delays
 * - Follow-up scheduling
 *
 * Run this as a standalone process:
 *   npx tsx lib/workers/dm-sender.worker.ts
 */

import 'dotenv/config'
import { Worker, Job, Queue } from 'bullmq'
import { PrismaClient } from '../../lib/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import IORedis from 'ioredis'
import {
  sendInstagramDM,
  sendPrivateReply,
  replyToComment,
  rateLimitKey,
  RATE_LIMITS,
} from '../instagram-api'
import { decryptToken } from '../encryption'
import { isDevWebhookMode, logDevDM, logDevCommentReply } from '../dev-mode'

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

// Separate connection for rate limiting incr/get
const rateLimitRedis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// Self-referencing queue for scheduling follow-up messages
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
interface DmJobData {
  interactionId: string
  campaignId: string
  igAccountId: string
  userId: string
  recipientId: string
  messageText: string
  messageIndex: number
  totalMessages: number
  requireFollow: boolean
  commentId?: string       // For private reply fallback
  replyMessage?: string    // Public comment reply text
}

// ─── Rate limit check ─────────────────────────────────────

async function checkRateLimit(igAccountId: string): Promise<{ allowed: boolean; reason?: string }> {
  const hourKey = rateLimitKey(igAccountId, 'dm', 'hour')
  const dayKey = rateLimitKey(igAccountId, 'dm', 'day')

  const [hourCount, dayCount] = await Promise.all([
    rateLimitRedis.get(hourKey).then(v => parseInt(v || '0', 10)),
    rateLimitRedis.get(dayKey).then(v => parseInt(v || '0', 10)),
  ])

  if (hourCount >= RATE_LIMITS.DM_PER_HOUR) {
    return { allowed: false, reason: `Hourly limit reached (${hourCount}/${RATE_LIMITS.DM_PER_HOUR})` }
  }
  if (dayCount >= RATE_LIMITS.DM_PER_DAY) {
    return { allowed: false, reason: `Daily limit reached (${dayCount}/${RATE_LIMITS.DM_PER_DAY})` }
  }

  return { allowed: true }
}

async function incrementRateLimit(igAccountId: string) {
  const hourKey = rateLimitKey(igAccountId, 'dm', 'hour')
  const dayKey = rateLimitKey(igAccountId, 'dm', 'day')

  await Promise.all([
    rateLimitRedis.incr(hourKey).then(() => rateLimitRedis.expire(hourKey, 3600)),
    rateLimitRedis.incr(dayKey).then(() => rateLimitRedis.expire(dayKey, 86400)),
  ])
}

// ─── Get decrypted access token ───────────────────────────

async function getAccessToken(igAccountId: string): Promise<string> {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: igAccountId },
    select: {
      accessTokenEncrypted: true,
      accessTokenIv: true,
      accessTokenTag: true,
      tokenExpiresAt: true,
      isActive: true,
      igUserId: true,
    },
  })

  if (!account) throw new Error(`IG account ${igAccountId} not found`)
  if (!account.isActive) throw new Error(`IG account ${igAccountId} is inactive`)

  // Check token expiry
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
    throw new Error(`IG account ${igAccountId} token has expired`)
  }

  const token = decryptToken({
    accessTokenEncrypted: account.accessTokenEncrypted,
    accessTokenIv: account.accessTokenIv,
    accessTokenTag: account.accessTokenTag,
  })

  if (!token) {
    throw new Error(`IG account ${igAccountId} has no token or decryption failed`)
  }

  return token
}

// ─── Worker definition ────────────────────────────────────

const worker = new Worker<DmJobData>(
  'dm-sender',
  async (job: Job<DmJobData>) => {
    const {
      interactionId,
      campaignId,
      igAccountId,
      userId,
      recipientId,
      messageText,
      messageIndex,
      totalMessages,
      requireFollow,
      commentId,
      replyMessage,
    } = job.data

    console.log(`[DmSender] Job ${job.id} — Sending message ${messageIndex + 1}/${totalMessages} to ${recipientId}`)

    // ─── Rate limit check ───────────────────────────────
    const rateLimitResult = await checkRateLimit(igAccountId)
    if (!rateLimitResult.allowed) {
      console.warn(`[DmSender] Rate limited: ${rateLimitResult.reason}`)

      // Check if this is an abuse pattern
      await createAbuseFlagIfNeeded(igAccountId, userId)

      // Retry after a delay (BullMQ will handle exponential backoff)
      throw new Error(`Rate limited: ${rateLimitResult.reason}`)
    }

    // ─── DEV MODE: Log DM instead of sending ─────────
    if (isDevWebhookMode()) {
      // Get IG user ID for logging
      const igAccount = await prisma.instagramAccount.findUnique({
        where: { id: igAccountId },
        select: { igUserId: true },
      })

      if (!igAccount) throw new Error('IG account not found')

      // Log the comment reply (if configured)
      if (messageIndex === 0 && replyMessage && commentId) {
        logDevCommentReply({ commentId, replyMessage })
      }

      // Log the DM
      logDevDM({
        igUserId: igAccount.igUserId,
        recipientId,
        messageText,
        messageIndex,
        totalMessages,
        interactionId,
        campaignId,
      })

      // Update interaction as if it was sent successfully
      await prisma.interaction.update({
        where: { id: interactionId },
        data: {
          status: messageIndex === totalMessages - 1 ? 'COMPLETED' : 'REPLIED',
          dmMessageId: `dev_dm_${Date.now()}`,
          followUpCount: messageIndex > 0 ? messageIndex + 1 : undefined,
        },
      })

      // Increment rate limit counter (keep rate limiting realistic in dev)
      await incrementRateLimit(igAccountId)

    } else {
      // ─── PRODUCTION: Send real DMs via Instagram API ─

      // Get access token (only needed in production)
      const accessToken = await getAccessToken(igAccountId)

      // Get IG user ID for API calls
      const igAccount = await prisma.instagramAccount.findUnique({
        where: { id: igAccountId },
        select: { igUserId: true },
      })

      if (!igAccount) throw new Error('IG account not found')

      // First message: Send public comment reply if configured
      if (messageIndex === 0 && replyMessage && commentId) {
        try {
          await replyToComment(commentId, replyMessage, accessToken)
          console.log(`[DmSender] Sent public comment reply to ${commentId}`)
        } catch (err) {
          // Non-fatal — continue with DM
          console.warn(`[DmSender] Comment reply failed (non-fatal):`, err)
        }
      }

      // Send DM
      try {
        if (messageIndex === 0 && commentId) {
          try {
            const result = await sendPrivateReply(
              igAccount.igUserId,
              commentId,
              messageText,
              accessToken
            )
            console.log(`[DmSender] Sent private reply (msg_id: ${result.message_id})`)

            await prisma.interaction.update({
              where: { id: interactionId },
              data: {
                status: 'REPLIED',
                dmMessageId: result.message_id,
              },
            })
          } catch (privateReplyErr) {
            console.warn(`[DmSender] Private reply failed, falling back to direct DM:`, privateReplyErr)
            const result = await sendInstagramDM(
              igAccount.igUserId,
              recipientId,
              messageText,
              accessToken
            )
            console.log(`[DmSender] Sent direct DM (msg_id: ${result.message_id})`)

            await prisma.interaction.update({
              where: { id: interactionId },
              data: {
                status: 'REPLIED',
                dmMessageId: result.message_id,
              },
            })
          }
        } else {
          const result = await sendInstagramDM(
            igAccount.igUserId,
            recipientId,
            messageText,
            accessToken
          )
          console.log(`[DmSender] Sent DM ${messageIndex + 1}/${totalMessages} (msg_id: ${result.message_id})`)

          await prisma.interaction.update({
            where: { id: interactionId },
            data: {
              status: messageIndex === totalMessages - 1 ? 'COMPLETED' : 'REPLIED',
              followUpCount: messageIndex + 1,
            },
          })
        }

        await incrementRateLimit(igAccountId)

      } catch (dmErr) {
        const errMsg = dmErr instanceof Error ? dmErr.message : String(dmErr)
        console.error(`[DmSender] DM send failed:`, errMsg)

        // Update interaction as failed
        await prisma.interaction.update({
          where: { id: interactionId },
          data: {
            status: 'FAILED',
            metadata: {
              error: errMsg,
              failedAt: new Date().toISOString(),
              messageIndex,
            },
          },
        })

        throw dmErr // Re-throw for BullMQ retry
      }
    } // end else (production mode)

    // ─── Schedule follow-up messages ──────────────────
    if (messageIndex < totalMessages - 1) {
      // Get the campaign's follow-up config
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
          dmMessages: true,
          followUpEnabled: true,
          followUpDelayMinutes: true,
          maxFollowUps: true,
        },
      })

      if (campaign?.followUpEnabled && messageIndex < (campaign.maxFollowUps ?? 2)) {
        const dmMessages = campaign.dmMessages as Array<{ text: string; delayMinutes?: number }>
        const nextMessage = dmMessages[messageIndex + 1]

        if (nextMessage) {
          const delayMs = (nextMessage.delayMinutes || campaign.followUpDelayMinutes || 60) * 60 * 1000

          await dmSenderQueue.add(
            `dm-${interactionId}-${messageIndex + 1}`,
            {
              interactionId,
              campaignId,
              igAccountId,
              userId,
              recipientId,
              messageText: nextMessage.text,
              messageIndex: messageIndex + 1,
              totalMessages,
              requireFollow: false, // Only check follow on first message
            },
            { delay: delayMs }
          )

          console.log(`[DmSender] Scheduled follow-up ${messageIndex + 2}/${totalMessages} in ${delayMs / 60000} minutes`)
        }
      }
    }
  },
  {
    connection,
    concurrency: 3, // Limited concurrency to respect rate limits
    limiter: {
      max: 5,
      duration: 1000, // Max 5 DMs per second across all accounts
    },
  }
)

// ─── Abuse detection helper ───────────────────────────────

async function createAbuseFlagIfNeeded(igAccountId: string, userId: string) {
  // Check if there's already a recent rate limit flag
  const recentFlag = await prisma.abuseFlag.findFirst({
    where: {
      userId,
      igAccountId,
      type: 'RATE_LIMIT_EXCEEDED',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  })

  if (!recentFlag) {
    await prisma.abuseFlag.create({
      data: {
        userId,
        igAccountId,
        type: 'RATE_LIMIT_EXCEEDED',
        severity: 'MEDIUM',
        description: 'DM rate limit exceeded — possible over-sending',
        metadata: { timestamp: new Date().toISOString() },
      },
    })
    console.warn(`[DmSender] Created abuse flag for user ${userId}, IG account ${igAccountId}`)
  }
}

// ─── Event handlers ───────────────────────────────────────

worker.on('completed', (job) => {
  console.log(`[DmSender] Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[DmSender] Job ${job?.id} failed:`, err.message)
})

worker.on('error', (err) => {
  console.error('[DmSender] Worker error:', err)
})

console.log('[DmSender] Started and listening for dm-sender jobs...')

// ─── Graceful shutdown ────────────────────────────────────

async function shutdown() {
  console.log('[DmSender] Shutting down...')
  await worker.close()
  await dmSenderQueue.close()
  await prisma.$disconnect()
  await connection.quit()
  await rateLimitRedis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
