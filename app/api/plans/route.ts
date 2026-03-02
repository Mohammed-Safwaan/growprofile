import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/plans — Public endpoint for listing active plans
 */
export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        displayName: true,
        price: true,
        firstMonthPrice: true,
        maxIgAccounts: true,
        maxLeads: true,
        features: true,
        allowReels: true,
        allowPosts: true,
        allowStories: true,
        allowDms: true,
        allowLives: true,
        advancedFlows: true,
      },
    })

    return NextResponse.json({ success: true, plans })
  } catch (error) {
    console.error('[plans] Error fetching plans:', error)
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
  }
}
