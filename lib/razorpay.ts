/**
 * Razorpay client singleton
 * Docs: https://razorpay.com/docs/api
 *
 * Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env
 */
import Razorpay from 'razorpay'
import crypto from 'crypto'

const keyId     = process.env.RAZORPAY_KEY_ID     || ''
const keySecret = process.env.RAZORPAY_KEY_SECRET || ''

if (process.env.NODE_ENV === 'production' && (!keyId || !keySecret)) {
  throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production')
}

declare global {
  // eslint-disable-next-line no-var
  var _razorpay: Razorpay | undefined
}

const razorpay: Razorpay =
  global._razorpay ||
  new Razorpay({ key_id: keyId, key_secret: keySecret })

if (process.env.NODE_ENV !== 'production') {
  global._razorpay = razorpay
}

export default razorpay

// ─── Verify Razorpay payment signature ────────────────────────────────────

/**
 * Verifies the HMAC-SHA256 signature returned by Razorpay after payment.
 * @param orderId    razorpay_order_id from the callback
 * @param paymentId  razorpay_payment_id from the callback
 * @param signature  razorpay_signature from the callback
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!keySecret) return false
  const hmac = crypto.createHmac('sha256', keySecret)
  hmac.update(`${orderId}|${paymentId}`)
  const expected = hmac.digest('hex')
  return expected === signature
}

/**
 * Verifies a Razorpay webhook signature.
 * @param rawBody   raw request body string
 * @param signature X-Razorpay-Signature header value
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) return false
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')
  return expected === signature
}

// ─── Amount helpers ────────────────────────────────────────────────────────

/** Convert USD dollars to INR paise (Razorpay uses smallest unit) */
export function usdToInrPaise(usd: number, exchangeRate = 84): number {
  return Math.round(usd * exchangeRate * 100)
}
