import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, paginatedResponse, createAuditLog } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'
import { abuseFlagUpdateSchema, validate, ValidationError, validationErrorResponse } from '@/lib/validations'

/**
 * GET /api/admin/abuse-flags — Paginated list with filters
 *
 * Query params:
 *   page, limit, status, severity, type, userId
 */
export const GET = withAdmin(async (request: NextRequest, _user: AuthUser) => {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))
  const skip = (page - 1) * limit

  const status = searchParams.get('status') || undefined
  const severity = searchParams.get('severity') || undefined
  const type = searchParams.get('type') || undefined
  const userId = searchParams.get('userId') || undefined

  const where: any = {}
  if (status) where.status = status
  if (severity) where.severity = severity
  if (type) where.type = type
  if (userId) where.userId = userId

  const [flags, total] = await Promise.all([
    prisma.abuseFlag.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        igAccount: { select: { id: true, igUsername: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.abuseFlag.count({ where }),
  ])

  return paginatedResponse(
    flags.map((f) => ({
      id: f.id,
      userId: f.userId,
      userName: f.user?.name || f.user?.email || 'Unknown',
      igUsername: f.igAccount?.igUsername || null,
      type: f.type,
      severity: f.severity,
      description: f.description,
      metadata: f.metadata,
      status: f.status,
      resolvedByName: f.resolvedBy?.name || f.resolvedBy?.email || null,
      resolvedAt: f.resolvedAt,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    total,
    page,
    limit
  )
})

/**
 * PATCH /api/admin/abuse-flags — Update flag status (resolve, dismiss, investigate)
 *
 * Body: { flagId, status: "RESOLVED"|"DISMISSED"|"INVESTIGATING", note? }
 */
export const PATCH = withAdmin(async (request: NextRequest, user: AuthUser) => {
  let body: any
  try {
    const raw = await request.json()
    body = validate(abuseFlagUpdateSchema, raw)
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(validationErrorResponse(err), { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { flagId, status, note } = body

  const flag = await prisma.abuseFlag.findUnique({ where: { id: flagId } })
  if (!flag) {
    return NextResponse.json({ error: 'Abuse flag not found' }, { status: 404 })
  }

  const resolved = status === 'RESOLVED' || status === 'DISMISSED'
  const updatedFlag = await prisma.abuseFlag.update({
    where: { id: flagId },
    data: {
      status,
      resolvedById: resolved ? user.id : flag.resolvedById,
      resolvedAt: resolved ? new Date() : flag.resolvedAt,
      metadata: note
        ? { ...(flag.metadata as any || {}), resolutionNote: note }
        : flag.metadata,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  await createAuditLog({
    userId: user.id,
    action: `abuse_flag.${status.toLowerCase()}`,
    entityType: 'AbuseFlag',
    entityId: flagId,
    details: { previousStatus: flag.status, newStatus: status, note },
    request,
  })

  return NextResponse.json({ success: true, flag: updatedFlag })
})
