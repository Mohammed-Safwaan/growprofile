import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import prisma from '@/lib/prisma'
import { createAuditLog } from '@/lib/api-middleware'
import { PlanType, UserRole } from '@/lib/generated/prisma'
import { sendWelcomeEmail } from '@/lib/email'

/**
 * POST /api/auth/sync
 * 
 * Called after Firebase sign-in to sync/create the user in PostgreSQL.
 * Returns the enriched user profile with plan and subscription info.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify Firebase ID token
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization header' },
        { status: 401 }
      )
    }

    const idToken = authHeader.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    const { uid, email, name, picture } = decodedToken

    if (!email) {
      return NextResponse.json(
        { error: 'Firebase user must have an email' },
        { status: 400 }
      )
    }

    // 2. Look up or create user in PostgreSQL
    let user = await prisma.user.findUnique({
      where: { firebaseUid: uid },
      include: {
        plan: true,
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        instagramAccounts: {
          where: { isActive: true },
          select: {
            id: true,
            igUsername: true,
            igUserId: true,
            isActive: true,
            tokenExpiresAt: true,
            subscribedWebhooks: true,
          },
        },
        _count: {
          select: {
            campaigns: true,
            leads: true,
          },
        },
      },
    })

    let isNewUser = false

    if (!user) {
      // Check if there's a pre-seeded admin user with this email (e.g. admin@growprofile.com)
      const existingByEmail = await prisma.user.findUnique({
        where: { email },
      })

      if (existingByEmail && existingByEmail.firebaseUid === 'pending_firebase_link') {
        // Link the pre-seeded admin to this Firebase UID
        user = await prisma.user.update({
          where: { email },
          data: {
            firebaseUid: uid,
            name: name || existingByEmail.name,
            avatarUrl: picture || existingByEmail.avatarUrl,
          },
          include: {
            plan: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            instagramAccounts: {
              where: { isActive: true },
              select: {
                id: true,
                igUsername: true,
                igUserId: true,
                isActive: true,
                tokenExpiresAt: true,
                subscribedWebhooks: true,
              },
            },
            _count: {
              select: {
                campaigns: true,
                leads: true,
              },
            },
          },
        })
      } else {
        // Get the default Starter plan
        const starterPlan = await prisma.plan.findUnique({
          where: { name: PlanType.STARTER },
        })

        // Create new user with Starter plan
        user = await prisma.user.create({
          data: {
            firebaseUid: uid,
            email,
            name: name || null,
            avatarUrl: picture || null,
            role: UserRole.USER,
            planId: starterPlan?.id || null,
          },
          include: {
            plan: true,
            subscriptions: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            instagramAccounts: {
              where: { isActive: true },
              select: {
                id: true,
                igUsername: true,
                igUserId: true,
                isActive: true,
                tokenExpiresAt: true,
                subscribedWebhooks: true,
              },
            },
            _count: {
              select: {
                campaigns: true,
                leads: true,
              },
            },
          },
        })
        isNewUser = true

        // Send welcome email (fire & forget)
        sendWelcomeEmail({ to: email, name: name || 'there' }).catch((err) =>
          console.error('[auth/sync] Failed to send welcome email:', err)
        )

        // Create a free subscription for the new user
        if (starterPlan) {
          await prisma.subscription.create({
            data: {
              userId: user.id,
              planId: starterPlan.id,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
            },
          })
        }
      }
    } else {
      // Update user profile if changed in Firebase
      const updates: any = {}
      if (name && name !== user.name) updates.name = name
      if (picture && picture !== user.avatarUrl) updates.avatarUrl = picture
      
      if (Object.keys(updates).length > 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }
    }

    // 3. Log the auth event
    await createAuditLog({
      userId: user.id,
      action: isNewUser ? 'user.signup' : 'user.login',
      entityType: 'User',
      entityId: user.id,
      details: { email, provider: decodedToken.firebase?.sign_in_provider || 'unknown' },
      request,
    })

    // 4. Return enriched user profile
    const activeSubscription = user.subscriptions?.[0] || null

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        plan: user.plan
          ? {
              id: user.plan.id,
              name: user.plan.name,
              displayName: user.plan.displayName,
              maxIgAccounts: user.plan.maxIgAccounts,
              maxLeads: user.plan.maxLeads,
              features: user.plan.features,
            }
          : null,
        subscription: activeSubscription
          ? {
              id: activeSubscription.id,
              status: activeSubscription.status,
              currentPeriodEnd: activeSubscription.currentPeriodEnd,
            }
          : null,
        instagramAccounts: user.instagramAccounts,
        stats: {
          campaigns: user._count.campaigns,
          leads: user._count.leads,
        },
        isNewUser,
      },
    })
  } catch (error: any) {
    console.error('Auth sync error:', error)

    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json(
        { error: 'Token expired', message: 'Please sign in again' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to sync user profile' },
      { status: 500 }
    )
  }
}
