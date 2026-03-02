import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, createAuditLog } from '@/lib/api-middleware'
import { AuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { adminAuth } from '@/lib/firebase-admin'

/**
 * GET /api/admin/users/[id] — Full user profile for admin
 */
export const GET = withAdmin(async (
  _request: NextRequest,
  _admin: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      plan: true,
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { plan: { select: { displayName: true, price: true } } },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      instagramAccounts: {
        select: { id: true, igUsername: true, igUserId: true, isActive: true, tokenExpiresAt: true, createdAt: true },
      },
      campaigns: {
        select: { id: true, name: true, status: true, type: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: {
        select: { leads: true, campaigns: true, instagramAccounts: true, payments: true },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const abuseFlags = await prisma.abuseFlag.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, type: true, severity: true, status: true, description: true, createdAt: true },
  })

  const auditLogs = await prisma.auditLog.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
  })

  return NextResponse.json({
    success: true,
    data: {
      ...user,
      abuseFlags,
      recentActivity: auditLogs,
    },
  })
})

/**
 * PATCH /api/admin/users/[id] — Update user (status, role, plan)
 */
export const PATCH = withAdmin(async (
  request: NextRequest,
  adminUser: AuthUser,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params
  const body = await request.json()
  const { status, role, planId, note } = body

  const targetUser = await prisma.user.findUnique({ where: { id } })
  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (targetUser.id === adminUser.id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 })
  }

  const updates: any = {}
  const details: any = { note }

  if (status && status !== targetUser.status) {
    updates.status = status
    details.statusChange = { from: targetUser.status, to: status }
    const disabled = status === 'SUSPENDED' || status === 'BANNED'
    try {
      await adminAuth.updateUser(targetUser.firebaseUid, { disabled })
    } catch (err: any) {
      console.warn('[admin/users] Firebase update warning:', err.message)
    }
    // Send suspension email
    if (disabled && targetUser.email) {
      import('@/lib/email').then(({ sendSuspensionEmail }) =>
        sendSuspensionEmail({
          to: targetUser.email,
          name: targetUser.name || 'User',
          reason: note || `Account ${status.toLowerCase()} by admin`,
        })
      ).catch(() => {})
    }
  }

  if (role && role !== targetUser.role) {
    if (adminUser.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Only super admins can change roles' }, { status: 403 })
    }
    updates.role = role
    details.roleChange = { from: targetUser.role, to: role }
  }

  if (planId && planId !== targetUser.planId) {
    updates.planId = planId
    details.planChange = { from: targetUser.planId, to: planId }
    // Update or create active subscription
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: id, status: 'ACTIVE' },
    })
    if (activeSub) {
      await prisma.subscription.update({
        where: { id: activeSub.id },
        data: { planId },
      })
    } else {
      await prisma.subscription.create({
        data: { userId: id, planId, status: 'ACTIVE', currentPeriodStart: new Date() },
      })
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updates,
    include: { plan: { select: { displayName: true } } },
  })

  await createAuditLog({
    userId: adminUser.id,
    action: 'admin.update_user',
    entityType: 'User',
    entityId: id,
    details,
    request,
  })

  return NextResponse.json({ success: true, data: updatedUser })
})
