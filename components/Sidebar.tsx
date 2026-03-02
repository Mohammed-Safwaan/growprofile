'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { 
  LayoutDashboard, 
  TrendingUp, 
  Zap, 
  Gift, 
  Settings,
  BarChart3,
  MessageSquare,
  HelpCircle,
  LogOut,
  ChevronDown
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

const menuItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    submenu: null
  },
  {
    label: 'Apps',
    icon: Zap,
    alwaysExpanded: true,
    submenu: [
      { label: 'AutoDM', href: '/dashboard/apps/autodm' }
    ]
  },
  {
    label: 'Growth',
    icon: TrendingUp,
    submenu: [
      { label: 'Audience', href: '/dashboard/growth/audience' },
      { label: 'Insights', href: '/dashboard/growth/insights' }
    ]
  },
  {
    label: 'Plan & Usage',
    icon: BarChart3,
    submenu: [
      { label: 'Pricing', href: '/dashboard/plan/pricing' },
      { label: 'Usage', href: '/dashboard/plan/usage' }
    ]
  },
  {
    label: 'Referral',
    href: '/dashboard/refer',
    icon: Gift,
    submenu: null
  },
  {
    label: 'Account',
    href: '/dashboard/account',
    icon: Settings,
    submenu: null
  },
  {
    label: 'Help & Support',
    icon: HelpCircle,
    submenu: [
      { label: 'FAQ', href: '/dashboard/help/faq' },
      { label: 'Support', href: '/dashboard/help/support' }
    ]
  }
]

export function Sidebar() {
  const pathname = usePathname()
  const [expandedMenu, setExpandedMenu] = useState<string | null>('Apps')
  const { logout, user } = useAuth()
  const router = useRouter()

  const handleLogout = () => {
    logout()
    router.push('/auth/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="w-64 border-r border-sidebar-border bg-sidebar fixed left-0 top-0 h-full overflow-y-auto z-40 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <Image
            src="/images/logo.png"
            alt="ScorpixMedia Logo"
            width={40}
            height={40}
            className="rounded-xl group-hover:shadow-lg transition-shadow"
          />
          <div className="flex flex-col">
            <span className="text-base font-bold text-sidebar-foreground">GrowProfile</span>
            <span className="text-[10px] text-sidebar-foreground/50">by ScorpixMedia</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item, idx) => {
          const Icon = item.icon
          const hasSubmenu = item.submenu && item.submenu.length > 0
          const isExpanded = expandedMenu === item.label
          const isMenuActive = hasSubmenu 
            ? item.submenu.some(sub => isActive(sub.href))
            : isActive(item.href || '')

          if (hasSubmenu) {
            return (
              <div key={idx}>
                <button
                  onClick={() => !item.alwaysExpanded && setExpandedMenu(isExpanded ? null : item.label)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                    isMenuActive
                      ? 'bg-gradient-to-r from-primary/20 to-secondary/20 text-white'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isMenuActive 
                        ? 'bg-gradient-to-br from-primary to-secondary' 
                        : 'bg-sidebar-accent/20'
                    }`}>
                      <Icon className={`w-4 h-4 ${isMenuActive ? 'text-white' : ''}`} />
                    </div>
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {!item.alwaysExpanded && (
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
                {(isExpanded || item.alwaysExpanded) && (
                  <div className="ml-4 mt-1 space-y-1">
                    {item.submenu.map((subitem, sidx) => (
                      <Link
                        key={sidx}
                        href={subitem.href}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                          isActive(subitem.href)
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium'
                            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/20'
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          isActive(subitem.href) ? 'bg-white' : 'bg-sidebar-foreground/40'
                        }`}></div>
                        {subitem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={idx}
              href={item.href || '#'}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive(item.href || '')
                  ? 'bg-gradient-to-r from-primary/20 to-secondary/20 text-white'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/30'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isActive(item.href || '') 
                  ? 'bg-gradient-to-br from-primary to-secondary' 
                  : 'bg-sidebar-accent/20'
              }`}>
                <Icon className={`w-4 h-4 ${isActive(item.href || '') ? 'text-white' : ''}`} />
              </div>
              <span className="font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Pro Badge & Logout */}
      <div className="p-4 space-y-3 border-t border-sidebar-border">
        <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">{user?.plan?.displayName || 'Free Plan'}</span>
            <span className="text-xs px-2 py-0.5 bg-primary rounded-full text-white">
              {user?.subscription?.status === 'active' ? 'Active' : 'Free'}
            </span>
          </div>
          <p className="text-xs text-sidebar-foreground/70">
            {user?.instagramAccounts?.[0]
              ? `@${user.instagramAccounts[0].igUsername} connected`
              : 'No Instagram connected'
            }
          </p>
          <div className="mt-2 h-1.5 bg-sidebar-accent/30 rounded-full overflow-hidden">
            <div className="h-full w-1/4 bg-gradient-to-r from-primary to-secondary rounded-full"></div>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-all text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </aside>
  )
}
