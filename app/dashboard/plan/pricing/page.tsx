'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ArrowRight, Loader2, X, Sparkles, Zap, Crown, Settings, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import PaymentGateway from '@/components/payments/PaymentGateway'
import { useAuth } from '@/contexts/AuthContext'

interface PlanData {
  id: string
  name: string
  displayName: string
  price: string | number
  firstMonthPrice: string | number | null
  maxIgAccounts: number
  maxLeads: number
  features: Record<string, boolean>
  allowReels: boolean
  allowPosts: boolean
  allowStories: boolean
  allowDms: boolean
  allowLives: boolean
  advancedFlows: boolean
}

function buildFeatureList(plan: PlanData): string[] {
  const list: string[] = []

  // Account limits
  list.push(
    plan.maxIgAccounts === 1
      ? '1 Instagram account'
      : `Up to ${plan.maxIgAccounts} Instagram accounts`
  )
  list.push(
    plan.maxLeads === -1

      ? 'Unlimited leads'
      : `Up to ${plan.maxLeads} leads/month`
  )

  // Content types
  if (plan.allowReels) list.push('Reels auto-reply')
  if (plan.allowPosts) list.push('Post comment triggers')
  if (plan.allowStories) list.push('Story reply triggers')
  if (plan.allowDms) list.push('DM keyword triggers')
  if (plan.allowLives) list.push('Live DM triggers')

  // Advanced features from JSON blob
  const featureLabels: Record<string, string> = {
    commentDm: 'Comment-to-DM automation',
    followGate: 'Follow-gate flows',
    emailCollection: 'Email collection',
    prioritySupport: 'Priority support',
    analytics: 'Advanced analytics',
    customBranding: 'Custom branding',
  }

  for (const [key, label] of Object.entries(featureLabels)) {
    if (plan.features?.[key]) list.push(label)
  }

  if (plan.advancedFlows) list.push('Advanced follow-up flows')

  return list
}

const planIcons: Record<string, React.ReactNode> = {
  STARTER: <Zap className="w-6 h-6" />,
  CREATOR: <Crown className="w-6 h-6" />,
}

const planDescriptions: Record<string, string> = {
  STARTER: 'Perfect for getting started with Instagram automation',
  CREATOR: 'For creators serious about growth and engagement',
}

export default function PricingPage() {
  const { user, authFetch } = useAuth()
  const [plans, setPlans] = useState<PlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Checkout dialog
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Portal button
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')

  const openCheckout = (plan: PlanData) => {
    setSelectedPlan(plan)
    setDialogOpen(true)
  }

  const openBillingPortal = async () => {
    setPortalLoading(true)
    setPortalError('')
    try {
      const res  = await authFetch('/api/payments/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open portal')
      window.location.href = data.url
    } catch (err: any) {
      setPortalError(err.message)
      setPortalLoading(false)
    }
  }

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch('/api/plans')
        const data = await res.json()
        if (data.success) {
          setPlans(data.plans)
        } else {
          setError('Failed to load plans')
        }
      } catch {
        setError('Failed to load plans')
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  const currentPlanName = (user as any)?.plan?.name

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-4xl font-bold text-foreground">Upgrade Your Plan</h1>
        </div>
        <p className="text-muted-foreground max-w-md mx-auto">
          Choose the plan that best fits your growth goals. Upgrade or downgrade anytime.
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-8 max-w-4xl mx-auto ${
        plans.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'
      }`}>
        {plans.map((plan) => {
          const isCurrent = plan.name === currentPlanName
          const price = Number(plan.price)
          const firstMonth = plan.firstMonthPrice ? Number(plan.firstMonthPrice) : null
          const features = buildFeatureList(plan)

          return (
            <div
              key={plan.id}
              className={`rounded-2xl border transition-all overflow-hidden flex flex-col ${
                isCurrent
                  ? 'border-primary shadow-xl md:scale-105 bg-card ring-2 ring-primary/20'
                  : price > 0
                  ? 'border-border bg-card hover:border-primary/50 hover:shadow-lg'
                  : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              {isCurrent && (
                <div className="h-1.5 bg-gradient-to-r from-primary to-primary/60" />
              )}
              <div className="p-8 flex-1 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${isCurrent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {planIcons[plan.name] || <Zap className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{plan.displayName}</h3>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">Current Plan</Badge>
                    )}
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-6">
                  {planDescriptions[plan.name] || `The ${plan.displayName} plan`}
                </p>

                <div className="mb-6">
                  {firstMonth !== null && !isCurrent ? (
                    <div>
                      <span className="text-5xl font-bold text-foreground">${firstMonth}</span>
                      <span className="text-muted-foreground ml-2">/first month</span>
                      <div className="text-sm text-muted-foreground mt-1">
                        then ${price}/month
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-5xl font-bold text-foreground">
                        {price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price > 0 && (
                        <span className="text-muted-foreground ml-2">/month</span>
                      )}
                    </div>
                  )}
                </div>

                {isCurrent ? (
                  <Button disabled className="w-full mb-8" variant="outline">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Current Plan
                  </Button>
                ) : price === 0 ? (
                  <Button variant="outline" className="w-full mb-8" disabled={!!currentPlanName && currentPlanName !== 'CREATOR'}>
                    {currentPlanName === 'STARTER' ? 'Current Plan' : 'Downgrade to Free'}
                  </Button>
                ) : (
                  <Button
                    className="w-full mb-8 bg-primary hover:bg-primary/90"
                    onClick={() => openCheckout(plan)}
                  >
                    <span className="flex items-center justify-center gap-2">
                      Upgrade to {plan.displayName} <ArrowRight className="w-4 h-4" />
                    </span>
                  </Button>
                )}

                <div className="space-y-3 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    What&apos;s included
                  </p>
                  {features.map((feature, fidx) => (
                    <div key={fidx} className="flex gap-3 items-start">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Manage subscription (for existing paid subscribers) */}
      <div className="mt-10 flex flex-col items-center gap-3">
        <Separator className="max-w-xs" />
        <p className="text-xs text-muted-foreground">
          Already subscribed? Manage billing, cancel, or download invoices.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={openBillingPortal}
          disabled={portalLoading}
          className="gap-2"
        >
          {portalLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ExternalLink className="w-4 h-4" />}
          Manage Billing
        </Button>
        {portalError && <p className="text-xs text-destructive">{portalError}</p>}
      </div>

      <div className="text-center mt-4 text-xs text-muted-foreground">
        All plans include SSL encryption, Instagram API compliance, and 99.9% uptime SLA.
      </div>

      {/* ── Checkout Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe to {selectedPlan?.displayName}</DialogTitle>
            <DialogDescription>
              {selectedPlan?.firstMonthPrice
                ? `First month at $${Number(selectedPlan.firstMonthPrice)}, then $${Number(selectedPlan.price)}/month. Cancel anytime.`
                : `$${Number(selectedPlan?.price ?? 0)}/month. 14-day free trial included.`}
            </DialogDescription>
          </DialogHeader>

          {selectedPlan && (
            <PaymentGateway
              planId={selectedPlan.id}
              planName={selectedPlan.displayName}
              priceUsd={Number(selectedPlan.firstMonthPrice ?? selectedPlan.price)}
              onSuccess={() => setDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
