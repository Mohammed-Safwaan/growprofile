'use client'

import { Sparkles, ArrowRight, Instagram } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export function WelcomeCard() {
  const { user } = useAuth()
  const igAccount = user?.instagramAccounts?.[0]
  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="mb-8 relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary via-secondary to-accent p-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff1_1px,transparent_1px),linear-gradient(to_bottom,#fff1_1px,transparent_1px)] bg-[size:30px_30px]"></div>
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
      
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-white/80" />
            <span className="text-sm font-medium text-white/80">Welcome back, {firstName}!</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Ready to grow your audience?</h1>
          <p className="text-white/80 max-w-lg">
            {igAccount
              ? `You have ${user?.stats?.campaigns ?? 0} campaign(s) running on @${igAccount.igUsername}. Create a new one or check your analytics.`
              : 'Connect your Instagram account to start creating AutoDM campaigns and grow your audience.'
            }
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {igAccount ? (
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl">
              <Link href="/dashboard/apps/autodm" className="gap-2">
                <Instagram className="w-4 h-4" />
                New Campaign
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 shadow-xl">
              <Link href="/dashboard/account" className="gap-2">
                <Instagram className="w-4 h-4" />
                Connect Instagram
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant="secondary" className="shadow-lg">
            <Link href="/dashboard/apps/autodm" className="gap-2">
              View Campaigns <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
