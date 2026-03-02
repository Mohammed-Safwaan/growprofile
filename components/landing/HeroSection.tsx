import Link from 'next/link'
import { ArrowRight, MessageSquare, Users, TrendingUp, Sparkles, CheckCircle2, Instagram } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HeroSection() {
  return (
    <section className="relative min-h-[90vh] overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-20 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-primary/30 to-secondary/20 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-20 left-1/4 w-[400px] h-[400px] bg-gradient-to-br from-secondary/25 to-accent/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-accent/10 to-primary/10 rounded-full blur-3xl"></div>
        
        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:60px_60px]"></div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text Content */}
          <div className="animate-slide-up">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-full mb-6 shadow-lg shadow-primary/5">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Meta-Compliant AutoDM Platform</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 mb-6 leading-[1.1] tracking-tight">
              Turn Comments Into{' '}
              <span className="relative">
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Customers</span>
                <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" fill="none">
                  <path d="M2 8C50 2 150 2 198 8" stroke="url(#gradient)" strokeWidth="4" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(270, 84%, 55%)" />
                      <stop offset="50%" stopColor="hsl(210, 100%, 50%)" />
                      <stop offset="100%" stopColor="hsl(336, 100%, 55%)" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            </h1>
            
            <p className="text-xl text-slate-600 mb-8 leading-relaxed max-w-lg">
              Automatically send personalized DMs to users who comment on your Instagram posts. 
              <span className="font-medium text-slate-900"> Official Meta API. 100% compliant.</span>
            </p>
            
            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3 mb-8">
              {['Keyword Triggers', 'Custom Templates', 'Link Delivery', 'Real-time Analytics'].map((feature) => (
                <div key={feature} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-sm text-slate-700 shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {feature}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Button asChild size="lg" className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-lg px-8 shadow-xl shadow-primary/25 transition-all hover:shadow-primary/40 hover:-translate-y-0.5">
                <Link href="/auth/signup" className="flex items-center gap-2">
                  Start Free Trial <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 border-slate-300 hover:bg-slate-50 hover:border-primary/50 group">
                <Link href="#how-it-works" className="flex items-center gap-2">
                  See How It Works
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 border-2 border-white flex items-center justify-center text-xs font-medium text-slate-600">
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <span>Growing Instagram businesses with <strong className="text-slate-700">AutoDM</strong></span>
            </div>
          </div>

          {/* Right: Dashboard Preview */}
          <div className="relative animate-fade-in" style={{ animationDelay: '0.3s' }}>
            {/* Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 blur-3xl rounded-3xl"></div>
            
            {/* Main Card */}
            <div className="relative z-10 bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-slate-200/80">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-orange-500 flex items-center justify-center">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">@yourbusiness</p>
                    <p className="text-xs text-green-600 font-medium">● Connected</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  Campaign Active
                </div>
              </div>
              
              {/* Stats Cards */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 hover-lift">
                  <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
                    <MessageSquare className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">DMs Sent Today</p>
                    <p className="font-bold text-slate-900">Auto-responding to comments</p>
                  </div>
                  <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">247</div>
                </div>
                
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-secondary/5 to-secondary/10 rounded-xl border border-secondary/20 hover-lift">
                  <div className="w-12 h-12 bg-gradient-to-br from-secondary to-accent rounded-xl flex items-center justify-center shadow-lg shadow-secondary/25">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">Link Clicks</p>
                    <p className="font-bold text-slate-900">From automated DMs</p>
                  </div>
                  <div className="text-3xl font-bold text-secondary">89</div>
                </div>
                
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-accent/5 to-accent/10 rounded-xl border border-accent/20 hover-lift">
                  <div className="w-12 h-12 bg-gradient-to-br from-accent to-primary rounded-xl flex items-center justify-center shadow-lg shadow-accent/25">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">Conversion Rate</p>
                    <p className="font-bold text-slate-900">Comments to customers</p>
                  </div>
                  <div className="text-3xl font-bold text-accent">36%</div>
                </div>
              </div>

              {/* Mini Comment Preview */}
              <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-500 mb-2">Latest trigger:</p>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300"></div>
                  <div className="flex-1">
                    <p className="text-sm"><span className="font-semibold">@customer</span> commented: <span className="text-primary">"Price?"</span></p>
                    <p className="text-xs text-green-600 mt-1">✓ DM sent automatically with pricing link</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Floating Elements */}
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center shadow-xl float">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
