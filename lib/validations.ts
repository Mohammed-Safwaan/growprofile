/**
 * Zod validation schemas for API request bodies
 *
 * Usage in API routes:
 *   import { campaignCreateSchema, validate } from '@/lib/validations'
 *   const body = await validate(campaignCreateSchema, await request.json())
 */

import { z } from 'zod'

// ─── Helper: validate and throw structured error ──────

export class ValidationError extends Error {
  public issues: z.ZodIssue[]
  constructor(issues: z.ZodIssue[]) {
    super('Validation failed')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

/**
 * Validate data against a Zod schema.
 * Returns parsed data or throws ValidationError.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(result.error.issues)
  }
  return result.data
}

/**
 * Returns a NextResponse-compatible error object for validation errors.
 */
export function validationErrorResponse(error: ValidationError) {
  return {
    error: 'Validation failed',
    details: error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    })),
  }
}

// ─── Campaign schemas ─────────────────────────────────

export const campaignCreateSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100),
  igAccountId: z.string().uuid('Invalid Instagram account ID'),
  type: z.enum(['COMMENT_DM', 'STORY_REPLY', 'LIVE_DM', 'DM_KEYWORD']),
  triggerKeywords: z.array(z.string().min(1).max(50)).min(1, 'At least one keyword is required').max(20),
  dmMessage: z.string().min(1, 'DM message is required').max(1000),
  dmMessages: z.array(z.string().min(1).max(1000)).optional(),
  publicReply: z.string().max(500).optional(),
  followUpMessage: z.string().max(1000).optional(),
  followUpDelayMinutes: z.number().int().min(1).max(1440).optional(),
  requireFollow: z.boolean().optional().default(false),
  igMediaIds: z.array(z.string()).optional(),
  settings: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.type !== 'DM_KEYWORD' || data.triggerKeywords.length > 0,
  { message: 'DM_KEYWORD campaigns require at least one keyword', path: ['triggerKeywords'] }
)

export const campaignUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  triggerKeywords: z.array(z.string().min(1).max(50)).min(1).max(20).optional(),
  dmMessage: z.string().min(1).max(1000).optional(),
  dmMessages: z.array(z.string().min(1).max(1000)).optional(),
  publicReply: z.string().max(500).optional(),
  followUpMessage: z.string().max(1000).optional(),
  followUpDelayMinutes: z.number().int().min(1).max(1440).optional(),
  requireFollow: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
})

// ─── Auth schemas ─────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  referralCode: z.string().optional(),
})

// ─── Admin schemas ────────────────────────────────────

export const adminUserUpdateSchema = z.object({
  uid: z.string().min(1),
  disabled: z.boolean().optional(),
  role: z.enum(['USER', 'ADMIN', 'SUPER_ADMIN']).optional(),
})

export const abuseFlagUpdateSchema = z.object({
  flagId: z.string().uuid('Invalid flag ID'),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']),
  note: z.string().max(500).optional(),
})

export const adminSettingsSchema = z.object({
  settings: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
})

// ─── Referral schemas ─────────────────────────────────

export const referralCreateSchema = z.object({
  referralCode: z.string().min(1, 'Referral code is required').max(50),
})

// ─── Generic pagination params ────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
