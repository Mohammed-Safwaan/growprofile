/**
 * Stripe client singleton
 * Docs: https://stripe.com/docs/api
 *
 * Set STRIPE_SECRET_KEY in .env
 * Set STRIPE_PUBLISHABLE_KEY in .env.local (client-side)
 */
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY

if (!key && process.env.NODE_ENV === 'production') {
  throw new Error('STRIPE_SECRET_KEY is required in production')
}

// Singleton pattern — avoids creating multiple instances during hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _stripe: Stripe | undefined
}

const stripe: Stripe =
  global._stripe ||
  new Stripe(key || 'sk_test_placeholder', {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  })

if (process.env.NODE_ENV !== 'production') {
  global._stripe = stripe
}

export default stripe

// ─── Helper: get or create Stripe customer for a user ─────────────────────

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  name?: string | null,
): Promise<string> {
  const prisma = (await import('./prisma')).default

  // Look for an existing subscription with a stripeCustomerId
  const existing = await prisma.subscription.findFirst({
    where: { userId, stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true },
  })

  if (existing?.stripeCustomerId) return existing.stripeCustomerId

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  })

  return customer.id
}

// ─── Helper: build absolute URL ───────────────────────────────────────────

export function buildUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:4000'
  return `${base.replace(/\/$/, '')}${path}`
}
