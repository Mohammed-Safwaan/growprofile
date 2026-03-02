/**
 * POST /api/webhooks/razorpay
 *
 * Handles Razorpay webhook events.
 * Verifies X-Razorpay-Signature header using RAZORPAY_WEBHOOK_SECRET.
 *
 * Events handled:
 *  payment.captured    → confirm payment + activate subscription
 *  payment.failed      → mark payment failed
 *  subscription.activated  → sync subscription active
 *  subscription.cancelled  → cancel subscription
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/razorpay'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''

  // Verify webhook signature
  if (signature && !verifyWebhookSignature(rawBody, signature)) {
    console.error('[razorpay webhook] invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event as string
  const entity = payload.payload?.payment?.entity || payload.payload?.subscription?.entity

  try {
    switch (event) {

      // ── Payment captured ──────────────────────────────────────────────────
      case 'payment.captured': {
        const orderId   = entity?.order_id as string | undefined
        const paymentId = entity?.id       as string | undefined
        if (!orderId || !paymentId) break

        const existingPayment = await prisma.payment.findFirst({
          where: { razorpayOrderId: orderId },
        })
        if (!existingPayment) break

        await prisma.payment.update({
          where: { id: existingPayment.id },
          data:  {
            razorpayPaymentId: paymentId,
            status:            'CAPTURED',
            paidAt:            new Date(),
            method:            entity?.method || 'razorpay',
          },
        })

        break
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'payment.failed': {
        const orderId = entity?.order_id as string | undefined
        if (!orderId) break

        await prisma.payment.updateMany({
          where: { razorpayOrderId: orderId },
          data:  { status: 'FAILED' },
        })

        // Also mark subscription PAST_DUE if linked
        const pmt = await prisma.payment.findFirst({
          where: { razorpayOrderId: orderId, subscriptionId: { not: null } },
          select: { subscriptionId: true },
        })
        if (pmt?.subscriptionId) {
          await prisma.subscription.update({
            where: { id: pmt.subscriptionId },
            data:  { status: 'PAST_DUE' },
          })
        }

        break
      }

      // ── Subscription activated ─────────────────────────────────────────────
      case 'subscription.activated': {
        const razorpaySubId = entity?.id as string | undefined
        if (!razorpaySubId) break

        await prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: razorpaySubId },
          data:  { status: 'ACTIVE' },
        })

        break
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'subscription.cancelled': {
        const razorpaySubId = entity?.id as string | undefined
        if (!razorpaySubId) break

        const sub = await prisma.subscription.findFirst({
          where: { razorpaySubscriptionId: razorpaySubId },
        })
        if (!sub) break

        const starterPlan = await prisma.plan.findFirst({
          where:  { name: 'STARTER' },
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
        break
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[razorpay webhook] handler error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
