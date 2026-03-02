import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, paginatedResponse } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'

/**
 * GET /api/admin/audit-logs — Fetch paginated, filterable audit logs
 *
 * Query params:
 *   page (default 1), limit (default 50), userId, action, entityType, from, to, search
 */
export const GET = withAdmin(async (request: NextRequest, _user: AuthUser) => {
  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))
  const skip = (page - 1) * limit

  const userId = searchParams.get('userId') || undefined
  const action = searchParams.get('action') || undefined
  const entityType = searchParams.get('entityType') || undefined
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search') || undefined

  const where: any = {}

  if (userId) where.userId = userId
  if (action) where.action = { contains: action, mode: 'insensitive' }
  if (entityType) where.entityType = entityType
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }
  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { entityType: { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  // Distinct action types for filter dropdown
  const actionTypes = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  })

  return paginatedResponse(
    logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: log.user?.name || log.user?.email || 'System',
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    })),
    total,
    page,
    limit
  )
})
