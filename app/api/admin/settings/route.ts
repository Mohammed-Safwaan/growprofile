import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, createAuditLog } from '@/lib/api-middleware'
import prisma from '@/lib/prisma'
import { AuthUser } from '@/lib/auth'
import { adminSettingsSchema, validate, ValidationError, validationErrorResponse } from '@/lib/validations'

/**
 * GET /api/admin/settings — Fetch all system settings
 */
export const GET = withAdmin(async (_request: NextRequest, _user: AuthUser) => {
  const settings = await prisma.systemSetting.findMany({
    include: {
      updater: { select: { id: true, name: true, email: true } },
    },
    orderBy: { key: 'asc' },
  })

  // Convert to key-value map for easy consumption
  const settingsMap: Record<string, any> = {}
  for (const s of settings) {
    settingsMap[s.key] = {
      value: s.value,
      updatedAt: s.updatedAt,
      updatedBy: s.updater?.name || s.updater?.email || null,
    }
  }

  return NextResponse.json({ success: true, settings: settingsMap })
})

/**
 * PUT /api/admin/settings — Upsert one or more system settings
 *
 * Body: { settings: { [key: string]: any } }
 */
export const PUT = withAdmin(async (request: NextRequest, user: AuthUser) => {
  let body: any
  try {
    const raw = await request.json()
    body = validate(adminSettingsSchema, raw)
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(validationErrorResponse(err), { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { settings } = body

  const results: Record<string, any> = {}

  for (const [key, value] of Object.entries(settings)) {
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as any, updatedBy: user.id },
      create: { key, value: value as any, updatedBy: user.id },
    })
    results[key] = setting.value
  }

  await createAuditLog({
    userId: user.id,
    action: 'admin.settings.update',
    entityType: 'SystemSetting',
    details: { updatedKeys: Object.keys(settings) },
    request,
  })

  return NextResponse.json({ success: true, settings: results })
})
