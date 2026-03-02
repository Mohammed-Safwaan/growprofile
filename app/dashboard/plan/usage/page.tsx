'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface UsageItem {
  name: string
  current: number
  limit: number | null
  unit: string
  percentage: number | null
}

interface BillingItem {
  label: string
  value: string
}

export default function UsagePage() {
  const { authFetch } = useAuth()
  const [usage, setUsage] = useState<UsageItem[]>([])
  const [billingInfo, setBillingInfo] = useState<BillingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await authFetch('/api/dashboard/usage')
        const data = await res.json()
        if (data.success) {
          setUsage(data.usage || [])
          setBillingInfo(data.billingInfo || [])
        }
      } catch (err) {
        console.error('Failed to load usage:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [authFetch])

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
        <h1 className="text-4xl font-bold text-foreground mb-2">Plan Usage</h1>
        <p className="text-muted-foreground">Monitor your current usage and plan limits</p>
      </div>

      {/* Usage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {usage.map((item, idx) => (
          <div key={idx} className="p-6 rounded-xl bg-card border border-border">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-semibold text-foreground">{item.name}</h3>
              <span className="text-sm text-muted-foreground">{item.unit}</span>
            </div>
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-3xl font-bold text-foreground">{item.current.toLocaleString()}</span>
                {item.limit && <span className="text-muted-foreground">/ {item.limit.toLocaleString()}</span>}
              </div>
              {item.percentage !== null && (
                <div className="w-full h-3 bg-secondary/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      item.percentage > 80
                        ? 'bg-accent'
                        : item.percentage > 50
                        ? 'bg-yellow-500'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(item.percentage, 100)}%` }}
                  ></div>
                </div>
              )}
            </div>
            {item.percentage !== null && (
              <p className="text-xs text-muted-foreground">
                {item.percentage}% of plan limit
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Billing Information */}
      <div className="p-6 rounded-xl bg-card border border-border">
        <h2 className="text-xl font-bold text-foreground mb-6">Billing Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {billingInfo.map((info, idx) => (
            <div key={idx} className="flex justify-between items-center pb-4 border-b border-border last:border-b-0">
              <span className="text-muted-foreground">{info.label}</span>
              <span className="font-semibold text-foreground">{info.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
