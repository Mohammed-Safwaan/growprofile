import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/dashboard/growth — Aggregated growth/audience/insights data
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  const { searchParams } = request.nextUrl
  const days = Math.min(Number(searchParams.get('days') || 30), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const igAccounts = await prisma.instagramAccount.findMany({
    where: { userId: user.id },
    select: { id: true, igUsername: true },
  })

  const igAccountIds = igAccounts.map((a) => a.id)

  if (igAccountIds.length === 0) {
    return NextResponse.json({
      success: true,
      hasData: false,
      message: 'Connect an Instagram account to see growth data',
    })
  }

  const [
    totalInteractions,
    totalDms,
    totalLeads,
    dailyInteractionsRaw,
    dailyDmsRaw,
    topCampaigns,
    interactionsByType,
    topKeywords,
    recentLeads,
  ] = await Promise.all([
    // Total interactions
    prisma.interaction.count({
      where: { igAccountId: { in: igAccountIds }, createdAt: { gte: since } },
    }),
    // Total DMs
    prisma.interaction.count({
      where: {
        igAccountId: { in: igAccountIds },
        status: { in: ['REPLIED', 'COMPLETED'] },
        createdAt: { gte: since },
      },
    }),
    // Total leads
    prisma.lead.count({
      where: { userId: user.id, capturedAt: { gte: since } },
    }),
    // Daily interactions
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(i.created_at) as date, COUNT(*) as count
      FROM interactions i
      WHERE i.ig_account_id = ANY(${igAccountIds})
        AND i.created_at >= ${since}
      GROUP BY DATE(i.created_at)
      ORDER BY date
    `,
    // Daily DMs
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT DATE(i.created_at) as date, COUNT(*) as count
      FROM interactions i
      WHERE i.ig_account_id = ANY(${igAccountIds})
        AND i.status IN ('REPLIED', 'COMPLETED')
        AND i.created_at >= ${since}
      GROUP BY DATE(i.created_at)
      ORDER BY date
    `,
    // Top campaigns by interactions
    prisma.campaign.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { interactions: true, leads: true } },
      },
      orderBy: { interactions: { _count: 'desc' } },
      take: 5,
    }),
    // Interactions by type
    prisma.interaction.groupBy({
      by: ['type'],
      where: { igAccountId: { in: igAccountIds }, createdAt: { gte: since } },
      _count: true,
    }),
    // Top keywords
    prisma.$queryRaw<{ keyword: string; count: bigint }[]>`
      SELECT metadata->>'matchedKeyword' as keyword, COUNT(*) as count
      FROM interactions
      WHERE ig_account_id = ANY(${igAccountIds})
        AND metadata->>'matchedKeyword' IS NOT NULL
        AND created_at >= ${since}
      GROUP BY metadata->>'matchedKeyword'
      ORDER BY count DESC
      LIMIT 10
    `,
    // Recent leads
    prisma.lead.findMany({
      where: { userId: user.id },
      orderBy: { capturedAt: 'desc' },
      take: 10,
      include: { campaign: { select: { name: true } } },
    }),
  ])

  // Build time series
  const dailyInteractions = buildTimeSeries(dailyInteractionsRaw, days)
  const dailyDms = buildTimeSeries(dailyDmsRaw, days)

  // Engagement rate: DMs / Interactions
  const engagementRate = totalInteractions > 0
    ? ((totalDms / totalInteractions) * 100).toFixed(1)
    : '0.0'

  return NextResponse.json({
    success: true,
    hasData: true,
    summary: {
      totalInteractions,
      totalDms,
      totalLeads,
      engagementRate: `${engagementRate}%`,
    },
    charts: {
      dailyInteractions,
      dailyDms,
      interactionsByType: interactionsByType.map((t) => ({
        type: t.type,
        count: t._count,
      })),
      topKeywords: topKeywords.map((k) => ({
        keyword: k.keyword || 'unknown',
        count: Number(k.count),
      })),
    },
    topCampaigns: topCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      interactions: c._count.interactions,
      leads: c._count.leads,
    })),
    recentLeads: recentLeads.map((l) => ({
      id: l.id,
      igUsername: l.igUsername,
      campaignName: l.campaign?.name || 'Unknown',
      capturedAt: l.capturedAt,
    })),
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
