/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events.
 * Stripe requires the RAW request body for signature verification — do NOT parse as JSON first.
 *
 * Events handled:
 *  checkout.session.completed         → fulfill new subscription
 *  invoice.payment_succeeded          → record recurring payment
 *  invoice.payment_failed             → mark payment failed, notify user
 *  customer.subscription.updated      → sync status + plan
 *  customer.subscription.deleted      → cancel subscription, revert to STARTER
 */
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import stripeClient from '@/lib/stripe'
import prisma from '@/lib/prisma'

export const config = { api: { bodyParser: false } }

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') || ''

  let event: Stripe.Event

  try {
    event = stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: any) {
    console.error('[stripe webhook] signature verification failed:', err.message)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── New subscription via Checkout ────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const userId  = session.metadata?.userId
        const planId  = session.metadata?.planId
        const stripeSub = session.subscription as string
        const customerId = session.customer as string

        if (!userId || !planId || !stripeSub) break

        const plan = await prisma.plan.findUnique({ where: { id: planId } })
        if (!plan) break

        // Retrieve the subscription from Stripe to get period dates
        const sub = await stripeClient.subscriptions.retrieve(stripeSub)

        await prisma.$transaction(async (tx) => {
          // Cancel old active subscriptions
          await tx.subscription.updateMany({
            where: { userId, status: 'ACTIVE' },
            data:  { status: 'CANCELLED', cancelledAt: new Date() },
          })

          const status: 'TRIALING' | 'ACTIVE' =
            sub.status === 'trialing' ? 'TRIALING' : 'ACTIVE'

          // Upsert by stripeSubscriptionId
          await tx.subscription.upsert({
            where:  { stripeSubscriptionId: stripeSub },
            update: {
              planId,
              status,
              stripeCustomerId: customerId,
              currentPeriodStart: new Date((sub as any).current_period_start * 1000),
              currentPeriodEnd:   new Date((sub as any).current_period_end   * 1000),
            },
            create: {
              userId,
              planId,
              gateway:             'STRIPE',
              status,
              stripeSubscriptionId: stripeSub,
              stripeCustomerId:     customerId,
              currentPeriodStart:  new Date((sub as any).current_period_start * 1000),
              currentPeriodEnd:    new Date((sub as any).current_period_end   * 1000),
            },
          })

          // Update user plan
          await tx.user.update({ where: { id: userId }, data: { planId } })
        })

        break
      }

      // ── Recurring invoice paid ────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSub = (invoice as any).subscription as string | null
        const _inv1 = invoice as any
        if (!_inv1.payment_intent || !stripeSub) break

        const paymentIntentId = _inv1.payment_intent as string
        const amountPaid = invoice.amount_paid // in cents

        const sub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripeSub },
        })
        if (!sub) break

        // Refresh period end
        const stripedSub = await stripeClient.subscriptions.retrieve(stripeSub)

        await prisma.$transaction(async (tx) => {
          // Upsert payment record
          await tx.payment.upsert({
            where:  { stripePaymentIntentId: paymentIntentId },
            update: { status: 'CAPTURED', paidAt: new Date() },
            create: {
              userId:               sub.userId,
              subscriptionId:       sub.id,
              gateway:              'STRIPE',
              stripePaymentIntentId: paymentIntentId,
              stripeInvoiceId:      invoice.id,
              amount:               amountPaid / 100,
              currency:             invoice.currency.toUpperCase(),
              status:               'CAPTURED',
              method:               'card',
              paidAt:               new Date(),
            },
          })

          // Update period
          await tx.subscription.update({
            where: { id: sub.id },
            data:  {
              status:            'ACTIVE',
              currentPeriodStart: new Date((stripedSub as any).current_period_start * 1000),
              currentPeriodEnd:   new Date((stripedSub as any).current_period_end   * 1000),
            },
          })
        })

        break
      }

      // ── Invoice payment failed ────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const paymentIntentId = (invoice as any).payment_intent as string | null
        const stripeSub = (invoice as any).subscription as string | null
        if (!paymentIntentId || !stripeSub) break

        const sub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripeSub },
        })
        if (!sub) break

        await prisma.$transaction(async (tx) => {
          await tx.payment.upsert({
            where:  { stripePaymentIntentId: paymentIntentId },
            update: { status: 'FAILED' },
            create: {
              userId:               sub.userId,
              subscriptionId:       sub.id,
              gateway:              'STRIPE',
              stripePaymentIntentId: paymentIntentId,
              stripeInvoiceId:      invoice.id,
              amount:               invoice.amount_due / 100,
              currency:             invoice.currency.toUpperCase(),
              status:               'FAILED',
              method:               'card',
            },
          })

          await tx.subscription.update({
            where: { id: sub.id },
            data:  { status: 'PAST_DUE' },
          })
        })

        break
      }

      // ── Subscription updated (plan change, trial-end, etc.) ───────────────
      case 'customer.subscription.updated': {
        const stripedSub = event.data.object as Stripe.Subscription
        const sub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripedSub.id },
        })
        if (!sub) break

        const statusMap: Record<string, string> = {
          active:   'ACTIVE',
          trialing: 'TRIALING',
          past_due: 'PAST_DUE',
          canceled: 'CANCELLED',
          unpaid:   'PAST_DUE',
        }

        await prisma.subscription.update({
          where: { id: sub.id },
          data:  {
            status:            (statusMap[stripedSub.status] || 'ACTIVE') as any,
            currentPeriodStart: new Date((stripedSub as any).current_period_start * 1000),
            currentPeriodEnd:   new Date((stripedSub as any).current_period_end   * 1000),
          },
        })

        break
      }

      // ── Subscription cancelled (from portal or auto-cancellation) ─────────
      case 'customer.subscription.deleted': {
        const stripedSub = event.data.object as Stripe.Subscription

        const sub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripedSub.id },
          include: { plan: { select: { name: true } } },
        })
        if (!sub) break

        // Revert to STARTER if they cancel their only paid plan
        const starterPlan = await prisma.plan.findFirst({
          where: { name: 'STARTER' },
          select: { id: true },
        })

        await prisma.$transaction(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data:  { status: 'CANCELLED', cancelledAt: new Date() },
          })

          if (starterPlan) {
            await tx.user.update({
              where: { id: sub.userId },
              data:  { planId: starterPlan.id },
            })
          }
        })

        break
      }

      default:
        // Silently ignore unhandled events
        break
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[stripe webhook] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
