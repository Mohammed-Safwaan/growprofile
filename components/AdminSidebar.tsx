'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Users, BarChart3, CreditCard, Settings, LogOut, Menu, ScrollText, ShieldAlert, Banknote } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const menuItems = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: BarChart3,
  },
  {
    label: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    icon: CreditCard,
  },
  {
    label: 'Payments',
    href: '/admin/payments',
    icon: Banknote,
  },
  {
    label: 'Audit Logs',
    href: '/admin/audit-logs',
    icon: ScrollText,
  },
  {
    label: 'Abuse Flags',
    href: '/admin/abuse-flags',
    icon: ShieldAlert,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()
  const [isOpen, setIsOpen] = useState(true)

  const handleLogout = async () => {
    await logout()
    router.push('/auth/login')
  }

  return (
    <>
      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 hover:bg-slate-200 rounded-lg"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Sidebar */}
      <aside
        className={`${
          isOpen ? 'w-64' : 'w-20'
        } bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-all duration-300 flex flex-col overflow-hidden`}
      >
        <div className="p-6">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex-shrink-0"></div>
            {isOpen && <span className="font-bold text-lg">GrowProfile</span>}
          </Link>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {isOpen && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-700">
          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700"
          >
            <LogOut className="w-5 h-5 mr-3" />
            {isOpen && <span>Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
