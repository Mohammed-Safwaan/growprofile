import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/campaigns/[id]/analytics — Campaign analytics with time-series data
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser, context: any) => {
  const campaignId = context?.params?.id
  if (!campaignId) {
    return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })
  }

  // Verify campaign belongs to user
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: user.id },
    select: { id: true, name: true, createdAt: true, status: true, type: true },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { searchParams } = request.nextUrl
  const days = Math.min(Number(searchParams.get('days') || 30), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [
    totalComments,
    totalDmsSent,
    totalDmsCompleted,
    totalFollowChecks,
    totalLeads,
    failedDms,
    dailyInteractionsRaw,
    dailyLeadsRaw,
    keywordBreakdownRaw,
    statusBreakdown,
  ] = await Promise.all([
    // Total comments matched
    prisma.interaction.count({
      where: { campaignId, type: 'COMMENT' },
    }),
    // Total DMs sent (REPLIED or COMPLETED)
    prisma.interaction.count({
      where: { campaignId, status: { in: ['REPLIED', 'COMPLETED'] } },
    }),
    // Completed (full funnel)
    prisma.interaction.count({
      where: { campaignId, status: 'COMPLETED' },
    }),
    // Follow checks
    prisma.interaction.count({
      where: { campaignId, type: 'FOLLOW_CHECK' },
    }),
    // Leads captured
    prisma.lead.count({
      where: { campaignId },
    }),
    // Failed DMs
    prisma.interaction.count({
      where: { campaignId, status: 'FAILED' },
    }),
    // Daily interactions over period
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM interactions
      WHERE campaign_id = ${campaignId}
        AND created_at >= ${since}
      GROUP BY DATE(created_at)
      ORDER BY date
    `,
    // Daily leads over period
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(captured_at) as date, COUNT(*) as count
      FROM leads
      WHERE campaign_id = ${campaignId}
        AND captured_at >= ${since}
      GROUP BY DATE(captured_at)
      ORDER BY date
    `,
    // Keyword breakdown from interaction metadata
    prisma.$queryRaw<{ keyword: string; count: bigint }[]>`
      SELECT metadata->>'matchedKeyword' as keyword, COUNT(*) as count
      FROM interactions
      WHERE campaign_id = ${campaignId}
        AND metadata->>'matchedKeyword' IS NOT NULL
      GROUP BY metadata->>'matchedKeyword'
      ORDER BY count DESC
      LIMIT 20
    `,
    // Status breakdown
    prisma.interaction.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    }),
  ])

  // Build daily time-series
  const dailyInteractions = buildTimeSeries(dailyInteractionsRaw, days)
  const dailyLeads = buildTimeSeries(dailyLeadsRaw, days)

  const conversionRate =
    totalComments > 0 ? ((totalDmsCompleted / totalComments) * 100).toFixed(1) : '0.0'

  return NextResponse.json({
    success: true,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      status: campaign.status,
      createdAt: campaign.createdAt,
    },
    stats: {
      totalComments,
      totalDmsSent,
      totalDmsCompleted,
      totalFollowChecks,
      totalLeads,
      failedDms,
      conversionRate: `${conversionRate}%`,
    },
    charts: {
      dailyInteractions,
      dailyLeads,
      keywordBreakdown: keywordBreakdownRaw.map((k) => ({
        keyword: k.keyword || 'unknown',
        count: Number(k.count),
      })),
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count,
      })),
    },
  })
})

function buildTimeSeries(
  raw: { date: string; count: bigint }[],
  days: number
): { date: string; count: number }[] {
  const result: { date: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const entry = raw.find((r) => {
      const rd = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0]
      return rd === dateStr
    })
    result.push({ date: dateStr, count: entry ? Number(entry.count) : 0 })
  }
  return result
}
