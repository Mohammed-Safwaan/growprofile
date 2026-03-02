import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/dashboard/usage — Current user's usage metrics + billing info
 */
export const GET = withAuth(async (_request: NextRequest, user: AuthUser) => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    activeCampaigns,
    totalCampaigns,
    dmsSentThisMonth,
    totalLeads,
    connectedAccountsCount,
    subscription,
  ] = await Promise.all([
    prisma.campaign.count({ where: { userId: user.id, status: 'ACTIVE' } }),
    prisma.campaign.count({ where: { userId: user.id } }),
    prisma.interaction.count({
      where: {
        igAccount: { userId: user.id },
        status: { in: ['REPLIED', 'COMPLETED'] },
        createdAt: { gte: startOfMonth },
      },
    }),
    prisma.lead.count({ where: { userId: user.id } }),
    prisma.instagramAccount.count({ where: { userId: user.id } }),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const plan = subscription?.plan
  const planName = plan?.displayName || 'Starter'
  // Plan doesn't have maxDmsPerMonth/maxCampaigns — derive from features or use defaults
  const maxDms = (plan?.features as any)?.maxDmsPerMonth ?? 100
  const maxCampaigns = (plan?.features as any)?.maxCampaigns ?? 2
  const maxAccounts = plan?.maxIgAccounts ?? 1

  const usage = [
    {
      name: 'DM Sends',
      current: dmsSentThisMonth,
      limit: maxDms,
      unit: 'sends/month',
      percentage: maxDms > 0 ? Math.round((dmsSentThisMonth / maxDms) * 100) : 0,
    },
    {
      name: 'Active Campaigns',
      current: activeCampaigns,
      limit: maxCampaigns,
      unit: 'campaigns',
      percentage: maxCampaigns > 0 ? Math.round((activeCampaigns / maxCampaigns) * 100) : 0,
    },
    {
      name: 'Account Connections',
      current: connectedAccountsCount,
      limit: maxAccounts,
      unit: 'accounts',
      percentage: maxAccounts > 0 ? Math.round((connectedAccountsCount / maxAccounts) * 100) : 0,
    },
    {
      name: 'Leads Captured',
      current: totalLeads,
      limit: null,
      unit: 'leads',
      percentage: null,
    },
  ]

  const billingInfo = [
    { label: 'Current Plan', value: planName },
    { label: 'Billing Cycle', value: subscription?.currentPeriodEnd ? 'Monthly' : 'N/A' },
    {
      label: 'Next Billing Date',
      value: subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
        : 'N/A',
    },
    {
      label: 'Amount',
      value: plan?.price ? `₹${plan.price}/mo` : 'Free',
    },
  ]

  return NextResponse.json({
    success: true,
    usage,
    billingInfo,
    plan: {
      name: planName,
      type: plan?.name || 'STARTER',
    },
  })
})
