/**
 * POST /api/payments/stripe/portal
 *
 * Opens the Stripe Customer Portal where the user can:
 * - View invoices
 * - Update payment method
 * - Cancel or downgrade subscription
 *
 * Returns: { url: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'
import stripe, { buildUrl } from '@/lib/stripe'

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Find the user's Stripe customer ID
    const sub = await prisma.subscription.findFirst({
      where: { userId: user.id, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    })

    if (!sub?.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe subscription found. Please subscribe first.' },
        { status: 404 },
      )
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: buildUrl('/dashboard/plan'),
    })

    return NextResponse.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('[stripe/portal] error:', err)
    return NextResponse.json({ error: err.message || 'Failed to open portal' }, { status: 500 })
  }
})
