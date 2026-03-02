import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'

/**
 * GET /api/admin/payments — Paginated payment history
 *
 * Query params:
 *   page, limit, status, userId, search, from, to
 */
export const GET = withAdmin(async (request: NextRequest, _user: AuthUser) => {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(100, Number(searchParams.get('limit') || 25))
  const skip = (page - 1) * limit

  const status = searchParams.get('status') || undefined
  const userId = searchParams.get('userId') || undefined
  const search = searchParams.get('search') || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: any = {}
  if (status) where.status = status
  if (userId) where.userId = userId
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }
  if (search) {
    where.user = {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    }
  }

  const [payments, total, totalRevenue, monthRevenue, pendingCount, failedCount] =
    await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, name: true, avatarUrl: true } },
          subscription: {
            include: { plan: { select: { displayName: true, price: true } } },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where: { status: 'CAPTURED' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: 'CAPTURED',
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { status: 'CREATED' } }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
    ])

  return NextResponse.json({
    success: true,
    data: payments.map((p) => ({
      id: p.id,
      userId: p.userId,
      userEmail: p.user?.email || 'Unknown',
      userName: p.user?.name || null,
      userAvatar: p.user?.avatarUrl || null,
      planName: p.subscription?.plan?.displayName || null,
      planPrice: p.subscription?.plan?.price ? Number(p.subscription.plan.price) : null,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      method: p.method,
      razorpayPaymentId: p.razorpayPaymentId,
      razorpayOrderId: p.razorpayOrderId,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    totals: {
      allTime: Number(totalRevenue._sum.amount || 0),
      thisMonth: Number(monthRevenue._sum.amount || 0),
      pending: pendingCount,
      failed: failedCount,
    },
  })
})
