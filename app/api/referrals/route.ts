import { NextRequest, NextResponse } from 'next/server'
import { withAuth, createAuditLog } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'
import { referralCreateSchema, validate, ValidationError, validationErrorResponse } from '@/lib/validations'
import crypto from 'crypto'

/**
 * GET /api/referrals — Get user's referral stats + referral list
 */
export const GET = withAuth(async (_request: NextRequest, user: AuthUser) => {
  // Derive a deterministic referral code from user id
  const referralCode = crypto
    .createHash('sha256')
    .update(user.id)
    .digest('hex')
    .slice(0, 12)

  const [referrals, totalReferred, completedReferrals, rewardedCount] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: user.id },
      include: {
        referred: { select: { id: true, name: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.referral.count({ where: { referrerId: user.id } }),
    prisma.referral.count({ where: { referrerId: user.id, status: 'completed' } }),
    prisma.referral.count({ where: { referrerId: user.id, rewardApplied: true } }),
  ])

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://growprofile.com'
  const referralLink = `${baseUrl}/auth/signup?ref=${referralCode}`

  return NextResponse.json({
    success: true,
    referralCode,
    referralLink,
    stats: {
      totalReferred,
      completedReferrals,
      rewardedCount,
      pendingRewards: completedReferrals - rewardedCount,
    },
    referrals: referrals.map((r) => ({
      id: r.id,
      name: r.referred?.name || r.referred?.email || 'Unknown',
      date: r.createdAt,
      status: r.status,
      rewardApplied: r.rewardApplied,
    })),
  })
})

/**
 * POST /api/referrals — Track a referral (called during signup when ref code present)
 *
 * Body: { referralCode }
 */
export const POST = withAuth(async (request: NextRequest, user: AuthUser) => {
  let body: any
  try {
    const raw = await request.json()
    body = validate(referralCreateSchema, raw)
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(validationErrorResponse(err), { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { referralCode } = body

  // Find the referrer by matching the deterministic hash code
  // We need to search all users and compute their code
  const allUsers = await prisma.user.findMany({
    select: { id: true },
    where: { id: { not: user.id } }, // exclude self
  })

  const referrer = allUsers.find((u) => {
    const code = crypto
      .createHash('sha256')
      .update(u.id)
      .digest('hex')
      .slice(0, 12)
    return code === referralCode
  })

  if (!referrer) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 })
  }

  // Check if already referred
  const existing = await prisma.referral.findUnique({
    where: { referrerId_referredId: { referrerId: referrer.id, referredId: user.id } },
  })

  if (existing) {
    return NextResponse.json({ error: 'Referral already exists' }, { status: 409 })
  }

  const referral = await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      referredId: user.id,
      referralCode,
      status: 'pending',
    },
  })

  await createAuditLog({
    userId: user.id,
    action: 'referral.created',
    entityType: 'Referral',
    entityId: referral.id,
    details: { referrerId: referrer.id, referralCode },
    request,
  })

  return NextResponse.json({ success: true, referral })
})
