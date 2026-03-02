'use client'

/**
 * PaymentGateway component
 *
 * Shows a gateway selector (Stripe or Razorpay) on the pricing/upgrade page.
 * - Stripe   → redirect to Stripe Hosted Checkout
 * - Razorpay → load razorpay.js inline widget
 *
 * Usage:
 *   <PaymentGateway planId={plan.id} planName={plan.displayName} />
 */

import { useState } from 'react'
import { CreditCard, Smartphone, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

interface Props {
  planId:    string
  planName:  string
  priceUsd:  number
  onSuccess?: () => void
}

type Gateway = 'STRIPE' | 'RAZORPAY'

declare global {
  interface Window {
    Razorpay?: any
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script    = document.createElement('script')
    script.src      = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload   = () => resolve(true)
    script.onerror  = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function PaymentGateway({ planId, planName, priceUsd, onSuccess }: Props) {
  const { authFetch } = useAuth()
  const router = useRouter()

  const [gateway, setGateway]   = useState<Gateway>('STRIPE')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  const handleStripe = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await authFetch('/api/payments/stripe/checkout', {
        method: 'POST',
        body:   JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      // Redirect to Stripe hosted checkout
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleRazorpay = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Load the Razorpay checkout script
      const ok = await loadRazorpayScript()
      if (!ok) throw new Error('Failed to load Razorpay. Please try again.')

      // 2. Create order on server
      const res  = await authFetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        body:   JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Order creation failed')

      const { orderId, amount, currency, keyId, userName, userEmail } = data

      // 3. Open Razorpay widget
      const rzp = new window.Razorpay({
        key:         keyId,
        amount,
        currency,
        name:        'GrowProfile',
        description: `${planName} Plan`,
        order_id:    orderId,
        prefill: {
          name:  userName,
          email: userEmail,
        },
        theme: { color: '#6366f1' },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          // 4. Verify on server
          const verifyRes = await authFetch('/api/payments/razorpay/verify', {
            method: 'POST',
            body:   JSON.stringify({
              orderId:   response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId,
            }),
          })
          const verifyData = await verifyRes.json()
          if (!verifyRes.ok) {
            setError(verifyData.error || 'Payment verification failed')
            setLoading(false)
            return
          }
          setSuccess(true)
          setLoading(false)
          onSuccess?.()
          router.push('/dashboard/plan?upgraded=1')
        },
        modal: {
          ondismiss: () => {
            setLoading(false)
          },
        },
      })

      rzp.open()
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (gateway === 'STRIPE')   handleStripe()
    else                        handleRazorpay()
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500" />
        <p className="text-xl font-semibold text-foreground">Payment Successful!</p>
        <p className="text-muted-foreground text-sm">Redirecting to dashboard…</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5">
      {/* Gateway Selector */}
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
          Choose Payment Method
        </p>
        <div className="grid grid-cols-2 gap-3">
          {/* Stripe */}
          <button
            type="button"
            onClick={() => setGateway('STRIPE')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium ${
              gateway === 'STRIPE'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40'
            }`}
          >
            <CreditCard className="w-6 h-6" />
            <span>Card / International</span>
            <span className="text-xs font-normal opacity-70">Visa · Mastercard · Amex</span>
          </button>

          {/* Razorpay */}
          <button
            type="button"
            onClick={() => setGateway('RAZORPAY')}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium ${
              gateway === 'RAZORPAY'
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/40'
            }`}
          >
            <Smartphone className="w-6 h-6" />
            <span>UPI / India</span>
            <span className="text-xs font-normal opacity-70">UPI · Net Banking · Wallets</span>
          </button>
        </div>
      </div>

      {/* Gateway details */}
      {gateway === 'STRIPE' && (
        <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <ExternalLink className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>You'll be redirected to Stripe's secure checkout page. 14-day free trial included.</span>
        </div>
      )}
      {gateway === 'RAZORPAY' && (
        <div className="flex items-start gap-3 p-3.5 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
          <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Pay via UPI, Net Banking, or wallet. Amount charged in INR (≈₹{Math.round(priceUsd * 84)}/mo).</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CTA */}
      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-primary hover:bg-primary/90 text-white h-12 text-base font-semibold"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing…</>
        ) : (
          gateway === 'STRIPE'
            ? `Continue to Checkout →`
            : `Pay with Razorpay →`
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Secured by {gateway === 'STRIPE' ? 'Stripe' : 'Razorpay'} · Cancel anytime
      </p>
    </div>
  )
}
