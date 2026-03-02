/**
 * Abuse Detector Worker
 *
 * Periodically scans for suspicious activity and creates AbuseFlag records.
 *
 * Checks:
 * 1. Rate-limit violations: users who tried to send more DMs than their plan allows
 * 2. Spam patterns: unusually high campaign creation in short periods
 * 3. Token failures: repeated IG token errors suggesting misuse
 * 4. Suspicious activity: abnormal interaction patterns
 *
 * Run as a standalone process:
 *   npx tsx lib/workers/abuse-detector.worker.ts
 *
 * Or call detectAbuse() from a cron/scheduler.
 */

import 'dotenv/config'
import { PrismaClient } from '../../lib/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import IORedis from 'ioredis'

const { Pool } = pg

// ─── Prisma setup ─────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── Redis for rate-limit data ────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// ─── Configuration ────────────────────────────────────
const SCAN_INTERVAL_MS = 5 * 60 * 1000 // Every 5 minutes
const THRESHOLDS = {
  // Max failed DMs in 1 hour before flagging
  failedDmsPerHour: 20,
  // Max campaigns created in 1 hour
  campaignsPerHour: 10,
  // Max token errors in 1 hour
  tokenErrorsPerHour: 15,
  // Auto-suspend after this many OPEN/INVESTIGATING flags
  autoSuspendFlagCount: 5,
}

// ─── Detection functions ──────────────────────────────

/**
 * Check for users with excessive failed DMs
 */
async function detectFailedDmSpam(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const results = await prisma.$queryRaw<{ user_id: string; ig_account_id: string; fail_count: bigint }[]>`
    SELECT ia.user_id, i.ig_account_id, COUNT(*) as fail_count
    FROM interactions i
    JOIN instagram_accounts ia ON i.ig_account_id = ia.id
    WHERE i.status = 'FAILED'
      AND i.created_at >= ${oneHourAgo}
    GROUP BY ia.user_id, i.ig_account_id
    HAVING COUNT(*) >= ${THRESHOLDS.failedDmsPerHour}
  `

  for (const row of results) {
    await createFlagIfNotExists({
      userId: row.user_id,
      igAccountId: row.ig_account_id,
      type: 'RATE_LIMIT_EXCEEDED',
      severity: Number(row.fail_count) >= THRESHOLDS.failedDmsPerHour * 2 ? 'HIGH' : 'MEDIUM',
      description: `${Number(row.fail_count)} failed DMs in the past hour`,
      metadata: { failCount: Number(row.fail_count), detectedAt: new Date().toISOString() },
    })
  }
}

/**
 * Check for rapid campaign creation (potential spam)
 */
async function detectCampaignSpam(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const results = await prisma.$queryRaw<{ user_id: string; campaign_count: bigint }[]>`
    SELECT user_id, COUNT(*) as campaign_count
    FROM campaigns
    WHERE created_at >= ${oneHourAgo}
    GROUP BY user_id
    HAVING COUNT(*) >= ${THRESHOLDS.campaignsPerHour}
  `

  for (const row of results) {
    await createFlagIfNotExists({
      userId: row.user_id,
      type: 'SPAM',
      severity: Number(row.campaign_count) >= THRESHOLDS.campaignsPerHour * 2 ? 'HIGH' : 'MEDIUM',
      description: `${Number(row.campaign_count)} campaigns created in the past hour`,
      metadata: { campaignCount: Number(row.campaign_count), detectedAt: new Date().toISOString() },
    })
  }
}

/**
 * Check for repeated token failures (might indicate stolen/invalid tokens)
 */
async function detectTokenFailures(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const results = await prisma.$queryRaw<{ user_id: string; ig_account_id: string; error_count: bigint }[]>`
    SELECT ia.user_id, we.ig_account_id, COUNT(*) as error_count
    FROM webhook_events we
    JOIN instagram_accounts ia ON we.ig_account_id = ia.id
    WHERE we.status = 'FAILED'
      AND we.error LIKE '%token%'
      AND we.created_at >= ${oneHourAgo}
    GROUP BY ia.user_id, we.ig_account_id
    HAVING COUNT(*) >= ${THRESHOLDS.tokenErrorsPerHour}
  `

  for (const row of results) {
    await createFlagIfNotExists({
      userId: row.user_id,
      igAccountId: row.ig_account_id,
      type: 'TOKEN_FAILURE',
      severity: 'HIGH',
      description: `${Number(row.error_count)} token-related errors in the past hour`,
      metadata: { errorCount: Number(row.error_count), detectedAt: new Date().toISOString() },
    })
  }
}

/**
 * Auto-suspend users with too many unresolved flags
 */
async function autoSuspendAbusiveUsers(): Promise<void> {
  // Try to get threshold from SystemSetting
  let threshold = THRESHOLDS.autoSuspendFlagCount
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'abuse_auto_suspend' },
    })
    if (setting?.value) {
      threshold = typeof setting.value === 'number' ? setting.value : Number(setting.value)
    }
  } catch {}

  const flaggedUsers = await prisma.abuseFlag.groupBy({
    by: ['userId'],
    where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
    _count: true,
    having: { userId: { _count: { gte: threshold } } },
  })

  for (const entry of flaggedUsers) {
    const user = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { id: true, status: true },
    })

    if (user && user.status !== 'SUSPENDED' && user.status !== 'BANNED') {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      })

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'user.auto_suspended',
          entityType: 'User',
          entityId: user.id,
          details: {
            reason: 'Exceeded abuse flag threshold',
            flagCount: entry._count,
            threshold,
          },
        },
      })

      // Send suspension email (fire & forget)
      const suspendedUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, name: true },
      })
      if (suspendedUser?.email) {
        const { sendSuspensionEmail } = await import('@/lib/email')
        sendSuspensionEmail({
          to: suspendedUser.email,
          name: suspendedUser.name || 'User',
          reason: 'Automated abuse detection: exceeded flag threshold',
        }).catch((err) => console.error('[abuse-detector] Failed to send suspension email:', err))
      }

      console.log(`[abuse-detector] Auto-suspended user ${user.id} (${entry._count} open flags)`)
    }
  }
}

// ─── Helper ───────────────────────────────────────────

interface CreateFlagParams {
  userId: string
  igAccountId?: string
  type: 'SPAM' | 'RATE_LIMIT_EXCEEDED' | 'TOS_VIOLATION' | 'REPORTED_BY_USER' | 'SUSPICIOUS_ACTIVITY' | 'TOKEN_FAILURE'
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  description: string
  metadata?: Record<string, any>
}

async function createFlagIfNotExists(params: CreateFlagParams): Promise<void> {
  // Check if there's already a recent OPEN flag of the same type for this user+account
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const existing = await prisma.abuseFlag.findFirst({
    where: {
      userId: params.userId,
      igAccountId: params.igAccountId || undefined,
      type: params.type,
      status: { in: ['OPEN', 'INVESTIGATING'] },
      createdAt: { gte: oneHourAgo },
    },
  })

  if (existing) {
    // Update metadata with latest data
    await prisma.abuseFlag.update({
      where: { id: existing.id },
      data: {
        metadata: { ...(existing.metadata as any || {}), ...params.metadata, lastUpdated: new Date().toISOString() },
        severity: severityPriority(params.severity) > severityPriority(existing.severity) ? params.severity : existing.severity,
      },
    })
    return
  }

  await prisma.abuseFlag.create({
    data: {
      userId: params.userId,
      igAccountId: params.igAccountId || null,
      type: params.type,
      severity: params.severity,
      description: params.description,
      metadata: params.metadata || {},
      status: 'OPEN',
    },
  })

  console.log(`[abuse-detector] Created ${params.severity} ${params.type} flag for user ${params.userId}`)
}

function severityPriority(s: string): number {
  return { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }[s] ?? 0
}

// ─── Main scan loop ───────────────────────────────────

export async function detectAbuse(): Promise<void> {
  const start = Date.now()
  console.log('[abuse-detector] Starting scan...')

  try {
    await Promise.all([
      detectFailedDmSpam(),
      detectCampaignSpam(),
      detectTokenFailures(),
    ])

    await autoSuspendAbusiveUsers()

    const elapsed = Date.now() - start
    console.log(`[abuse-detector] Scan complete in ${elapsed}ms`)
  } catch (error) {
    console.error('[abuse-detector] Scan failed:', error)
  }
}

// ─── Standalone process ───────────────────────────────

async function main() {
  console.log('[abuse-detector] Worker started')
  console.log(`[abuse-detector] Scan interval: ${SCAN_INTERVAL_MS / 1000}s`)

  // Run immediately on startup
  await detectAbuse()

  // Then repeat on interval
  setInterval(detectAbuse, SCAN_INTERVAL_MS)
}

main().catch((err) => {
  console.error('[abuse-detector] Fatal error:', err)
  process.exit(1)
})
