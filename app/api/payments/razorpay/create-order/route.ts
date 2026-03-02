/**
 * POST /api/payments/razorpay/create-order
 *
 * Creates a Razorpay order for the given plan.
 * The frontend then opens the Razorpay checkout widget with this order.
 *
 * Body: { planId: string }
 * Returns: { orderId, amount, currency, keyId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'
import razorpay, { usdToInrPaise } from '@/lib/razorpay'

export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { planId } = await req.json()
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 })
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } })
    if (!plan || !plan.isActive) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    // Use firstMonthPrice if available
    const priceUsd = Number(plan.firstMonthPrice ?? plan.price)
    const amountPaise = usdToInrPaise(priceUsd)

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true },
    })

    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `gp_${user.id.replace(/-/g, '').slice(0, 14)}_${Date.now()}`,
      notes: {
        userId: user.id,
        planId,
        userEmail: dbUser?.email || '',
      },
    })

    // Create a pending Payment record
    await prisma.payment.create({
      data: {
        userId:         user.id,
        gateway:        'RAZORPAY',
        razorpayOrderId: String(order.id),
        amount:         priceUsd,
        currency:       'INR',
        status:         'CREATED',
      },
    })

    return NextResponse.json({
      success:  true,
      orderId:  order.id,
      amount:   amountPaise,
      currency: 'INR',
      keyId:    process.env.RAZORPAY_KEY_ID || '',
      planName: plan.displayName,
      userName: dbUser?.name || '',
      userEmail: dbUser?.email || '',
    })
  } catch (err: any) {
    console.error('[razorpay/create-order] error:', err)
    return NextResponse.json({ error: err.message || 'Failed to create order' }, { status: 500 })
  }
})
