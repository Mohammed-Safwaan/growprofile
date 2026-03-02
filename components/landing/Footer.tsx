import Link from 'next/link'
import Image from 'next/image'

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white">
      {/* Main Footer */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <Image
                src="/images/logo.png"
                alt="ScorpixMedia Logo"
                width={40}
                height={40}
                className="rounded-xl"
              />
              <div className="flex flex-col">
                <span className="text-lg font-bold">GrowProfile</span>
                <span className="text-xs text-slate-400">by ScorpixMedia</span>
              </div>
            </Link>
            <p className="text-slate-400 mb-6 max-w-sm">
              The official Meta-compliant AutoDM platform for Instagram. Turn comments into customers automatically.
            </p>
          </div>
          
          {/* Product */}
          <div>
            <p className="font-semibold text-white mb-4">Product</p>
            <ul className="space-y-3 text-sm">
              <li><Link href="#features" className="text-slate-400 hover:text-white transition-colors">Features</Link></li>
              <li><Link href="#how-it-works" className="text-slate-400 hover:text-white transition-colors">How it Works</Link></li>
              <li><Link href="/pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/faq" className="text-slate-400 hover:text-white transition-colors">FAQ</Link></li>
            </ul>
          </div>
          
          {/* Legal */}
          <div>
            <p className="font-semibold text-white mb-4">Legal</p>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">Cookie Policy</a></li>
              <li><a href="#" className="text-slate-400 hover:text-white transition-colors">GDPR</a></li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* Bottom Bar */}
      <div className="border-t border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-500">© 2026 ScorpixMedia. All rights reserved.</p>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <span>Built with official Meta APIs</span>
              <span className="w-1 h-1 rounded-full bg-slate-600"></span>
              <span>100% Compliant</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
