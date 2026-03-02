/**
 * POST /api/payments/stripe/checkout
 *
 * Creates a Stripe Checkout Session for a given planId.
 * Redirects the user to Stripe's hosted checkout page.
 *
 * Body: { planId: string }
 * Returns: { url: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'
import stripe, { getOrCreateStripeCustomer, buildUrl } from '@/lib/stripe'

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { planId } = await req.json()
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 })
    }

    // Fetch the plan
    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }
    if (!plan.stripePriceId) {
      return NextResponse.json({ error: 'Stripe is not configured for this plan' }, { status: 422 })
    }

    // Fetch full user profile
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true },
    })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, dbUser.email, dbUser.name)

    // Check for active Stripe subscription (upgrade flow)
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: user.id, stripeSubscriptionId: { not: null }, status: 'ACTIVE' },
      select: { stripeSubscriptionId: true },
    })

    let session: import('stripe').Stripe.Checkout.Session

    if (activeSub?.stripeSubscriptionId) {
      // Upgrade/downgrade: use Stripe's subscription update via checkout
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        subscription_data: {
          metadata: { userId: user.id, planId },
        },
        success_url: buildUrl(`/dashboard/plan?session_id={CHECKOUT_SESSION_ID}&upgraded=1`),
        cancel_url: buildUrl(`/dashboard/plan`),
        metadata: { userId: user.id, planId },
        // Allow promo codes in the checkout
        allow_promotion_codes: true,
      })
    } else {
      // New subscription — optionally add first-month discount
      const discounts: import('stripe').Stripe.Checkout.SessionCreateParams.Discount[] = []
      if (plan.firstMonthPrice) {
        const firstMonthCents = Math.round(Number(plan.firstMonthPrice) * 100)
        const regularCents    = Math.round(Number(plan.price) * 100)
        const discountAmount  = Math.max(0, regularCents - firstMonthCents)
        if (discountAmount > 0) {
          const coupon = await stripe.coupons.create({
            amount_off: discountAmount,
            currency:   'usd',
            duration:   'once',
            name:       `${plan.displayName} First Month Promo`,
          })
          discounts.push({ coupon: coupon.id })
        }
      }

      session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: 14,
          metadata: { userId: user.id, planId },
        },
        success_url: buildUrl(`/dashboard/plan?session_id={CHECKOUT_SESSION_ID}&new=1`),
        cancel_url: buildUrl(`/dashboard/plan`),
        metadata: { userId: user.id, planId },
        discounts: discounts.length ? discounts : undefined,
        allow_promotion_codes: !discounts.length,
      })
    }

    return NextResponse.json({ success: true, url: session.url })
  } catch (err: any) {
    console.error('[stripe/checkout] error:', err)
    return NextResponse.json({ error: err.message || 'Checkout failed' }, { status: 500 })
  }
})
