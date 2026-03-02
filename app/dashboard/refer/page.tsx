'use client'

import { Copy, Check, Users, DollarSign, TrendingUp, Loader2, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface ReferralStats {
  totalReferred: number
  completedReferrals: number
  rewardedCount: number
  pendingRewards: number
}

interface Referral {
  id: string
  name: string
  date: string
  status: string
  rewardApplied: boolean
}

export default function ReferralPage() {
  const [copied, setCopied] = useState(false)
  const [referralLink, setReferralLink] = useState('')
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [loading, setLoading] = useState(true)
  const { authFetch } = useAuth()

  useEffect(() => {
    async function fetchReferrals() {
      try {
        const res = await authFetch('/api/referrals')
        const data = await res.json()
        if (data.success) {
          setReferralLink(data.referralLink || '')
          setStats(data.stats || null)
          setReferrals(data.referrals || [])
        }
      } catch (err) {
        console.error('Failed to fetch referral data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchReferrals()
  }, [authFetch])

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statCards = [
    {
      label: 'Total Referrals',
      value: stats?.totalReferred ?? 0,
      icon: Users,
      color: 'from-primary to-secondary'
    },
    {
      label: 'Completed',
      value: stats?.completedReferrals ?? 0,
      icon: TrendingUp,
      color: 'from-secondary to-accent'
    },
    {
      label: 'Pending Rewards',
      value: stats?.pendingRewards ?? 0,
      icon: Gift,
      color: 'from-accent to-primary'
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Referral Program</h1>
        <p className="text-muted-foreground">Earn rewards by inviting friends to GrowProfile</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <div key={idx} className="p-6 rounded-xl bg-card border border-border">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <p className="text-sm text-muted-foreground mb-2">{stat.label}</p>
              <p className="text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Referral Link */}
        <div className="lg:col-span-2">
          <div className="p-8 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Your Referral Link</h2>
            <p className="text-muted-foreground mb-6">
              Share this link with friends and earn $29 for every new subscriber
            </p>
            
            <div className="flex gap-2">
              <Input
                type="text"
                value={referralLink}
                readOnly
                className="bg-white border-border text-foreground flex-1 select-all"
              />
              <Button
                onClick={handleCopy}
                className="bg-primary hover:bg-primary/90 gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* How it Works */}
          <div className="p-6 rounded-xl bg-card border border-border mb-8">
            <h2 className="text-xl font-bold text-foreground mb-6">How It Works</h2>
            <div className="space-y-6">
              {[
                {
                  step: '1',
                  title: 'Share Your Link',
                  description: 'Copy your unique referral link and share it with friends via email, social media, or chat'
                },
                {
                  step: '2',
                  title: 'Friends Sign Up',
                  description: 'When someone uses your link to sign up, they\'ll get a 14-day free trial'
                },
                {
                  step: '3',
                  title: 'They Become Subscriber',
                  description: 'Once they upgrade to a paid plan, you\'ll earn $29 commission'
                },
                {
                  step: '4',
                  title: 'Get Paid Monthly',
                  description: 'Earnings are paid to your account monthly on the 15th'
                }
              ].map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center font-bold text-primary">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Referrals */}
          <div className="p-6 rounded-xl bg-card border border-border">
            <h2 className="text-xl font-bold text-foreground mb-6">Recent Referrals</h2>
            {referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No referrals yet. Share your link to get started!</p>
            ) : (
              <div className="space-y-4">
                {referrals.map((ref) => (
                  <div key={ref.id} className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg border border-border">
                    <div>
                      <p className="font-semibold text-foreground">{ref.name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(ref.date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                        ref.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : ref.status === 'rewarded'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {ref.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Info Card */}
        <div className="lg:col-span-1">
          <div className="p-6 rounded-xl bg-card border border-border sticky top-24">
            <h3 className="font-bold text-foreground mb-6">Program Benefits</h3>
            <ul className="space-y-3">
              {[
                'Earn $29 per referral',
                'Unlimited earning potential',
                'Monthly payouts',
                'Real-time tracking',
                'Detailed analytics',
                'No expiration date'
              ].map((benefit, idx) => (
                <li key={idx} className="flex gap-2 items-start text-sm">
                  <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{benefit}</span>
                </li>
              ))}
            </ul>

            <Button className="w-full bg-primary hover:bg-primary/90 mt-6">
              View Analytics
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
