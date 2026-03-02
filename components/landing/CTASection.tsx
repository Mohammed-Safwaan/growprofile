import Link from 'next/link'
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CTASection() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent"></div>
      
      {/* Pattern Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#fff1_1px,transparent_1px),linear-gradient(to_bottom,#fff1_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white/20 rounded-full blur-3xl"></div>
      
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center relative">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full mb-8">
          <Sparkles className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">14-Day Free Trial • No Credit Card</span>
        </div>
        
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
          Start converting comments
          <br />into customers today
        </h2>
        <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
          Start automating your Instagram engagement today — turn every comment with your keyword into a personalized DM.
        </p>

        {/* Features */}
        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {['Unlimited campaigns', 'Real-time analytics', 'Priority support'].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">{feature}</span>
            </div>
          ))}
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 text-lg px-10 shadow-2xl shadow-black/20 hover:-translate-y-0.5 transition-all">
            <Link href="/auth/signup" className="flex items-center gap-2">
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
