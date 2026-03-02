/**
 * POST /api/payments/razorpay/verify
 *
 * Called by the client after Razorpay checkout succeeds.
 * Verifies the HMAC signature, then fulfills the payment:
 * - Marks Payment CAPTURED
 * - Creates/updates Subscription to ACTIVE
 * - Updates user.planId
 *
 * Body: { orderId, paymentId, signature, planId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verifyPaymentSignature } from '@/lib/razorpay'
import { createAuditLog } from '@/lib/api-middleware'

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { orderId, paymentId, signature, planId } = await req.json()

    if (!orderId || !paymentId || !signature || !planId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify HMAC signature
    const valid = verifyPaymentSignature(orderId, paymentId, signature)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    // Fulfill inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update or create the Payment record
      const payment = await tx.payment.upsert({
        where:  { razorpayOrderId: orderId } as any,
        update: {
          razorpayPaymentId: paymentId,
          status:            'CAPTURED',
          paidAt:            new Date(),
        },
        create: {
          userId:           user.id,
          gateway:          'RAZORPAY',
          razorpayOrderId:  orderId,
          razorpayPaymentId: paymentId,
          amount:           Number(plan.firstMonthPrice ?? plan.price),
          currency:         'INR',
          status:           'CAPTURED',
          paidAt:           new Date(),
          method:           'razorpay',
        },
      })

      // Cancel any old active subscriptions
      await tx.subscription.updateMany({
        where:  { userId: user.id, status: 'ACTIVE' },
        data:   { status: 'CANCELLED', cancelledAt: new Date() },
      })

      const now   = new Date()
      const end   = new Date(now)
      end.setMonth(end.getMonth() + 1)

      // Create new active subscription
      const subscription = await tx.subscription.create({
        data: {
          userId:            user.id,
          planId,
          gateway:           'RAZORPAY',
          status:            'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd:   end,
          payments:          { connect: { id: payment.id } },
        },
      })

      // Update user plan
      await tx.user.update({
        where: { id: user.id },
        data:  { planId },
      })

      return { payment, subscription }
    })

    await createAuditLog({
      userId:     user.id,
      action:     'payment.razorpay_captured',
      entityType: 'Payment',
      entityId:   result.payment.id,
      details:    { planId, orderId, paymentId },
      request:    req,
    })

    return NextResponse.json({
      success: true,
      message: `Subscribed to ${plan.displayName}`,
      subscriptionId: result.subscription.id,
    })
  } catch (err: any) {
    console.error('[razorpay/verify] error:', err)
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 })
  }
})
