'use client'

import { useNav, ViewKey } from '@/lib/nav-context'
import { useAuth } from '@/lib/auth-context'
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, CalendarClock, Truck,
  Undo2, Users, CreditCard, Receipt, Wallet, BarChart3, Briefcase,
  Bell, Search, ScrollText, DatabaseBackup, Settings, UserCog, ShieldCheck,
  LogOut, ChevronRight, Plus, X, Pill, Keyboard, Sun, Moon, ClipboardList, Award, Scan
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface NavItem {
  key: ViewKey
  label: string
  icon: any
  permission?: string
  badge?: number
  group: 'main' | 'inventory' | 'transactions' | 'people' | 'analytics' | 'admin'
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', group: 'main' },
  { key: 'pos', label: 'POS / Billing', icon: ShoppingCart, permission: 'pos.use', group: 'main' },
  { key: 'scan', label: 'Scan Medicine', icon: Scan, permission: 'inventory.edit', group: 'main' },
  { key: 'inventory', label: 'Medicines', icon: Package, permission: 'inventory.view', group: 'inventory' },
  { key: 'stock', label: 'Stock Management', icon: Boxes, permission: 'stock.view', group: 'inventory' },
  { key: 'expiry', label: 'Expiry Management', icon: CalendarClock, permission: 'expiry.view', group: 'inventory' },
  { key: 'purchases', label: 'Purchases', icon: Truck, permission: 'purchases.view', group: 'transactions' },
  { key: 'draft-pos', label: 'Draft Purchase Orders', icon: ClipboardList, permission: 'purchases.view', group: 'transactions' },
  { key: 'purchase-returns', label: 'Purchase Returns', icon: Undo2, permission: 'purchases.return', group: 'transactions' },
  { key: 'sales-returns', label: 'Sales Returns', icon: Receipt, permission: 'sales.return', group: 'transactions' },
  { key: 'expenses', label: 'Expenses', icon: Wallet, permission: 'expenses.view', group: 'transactions' },
  { key: 'suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers.view', group: 'people' },
  { key: 'customers', label: 'Customers', icon: Users, permission: 'customers.view', group: 'people' },
  { key: 'loyalty', label: 'Loyalty Program', icon: Award, permission: 'customers.view', group: 'people' },
  { key: 'credit', label: 'Credit / Udhaar', icon: CreditCard, permission: 'credit.view', group: 'people' },
  { key: 'reports', label: 'Reports', icon: BarChart3, permission: 'reports.view', group: 'analytics' },
  { key: 'owner', label: 'Business Overview', icon: Briefcase, permission: 'owner.view', group: 'analytics' },
  { key: 'zreport', label: 'End of Day Z-Report', icon: Receipt, permission: 'reports.view', group: 'analytics' },
  { key: 'audit', label: 'Audit Log', icon: ScrollText, permission: 'audit.view', group: 'analytics' },
  { key: 'backup', label: 'Backup / Restore', icon: DatabaseBackup, permission: 'backup.use', group: 'admin' },
  { key: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view', group: 'admin' },
  { key: 'users', label: 'Users', icon: UserCog, permission: 'users.manage', group: 'admin' },
  { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: 'users.manage', group: 'admin' },
]

const GROUP_LABEL: Record<string, string> = {
  main: 'Operations',
  inventory: 'Inventory',
  transactions: 'Transactions',
  people: 'People & Credit',
  analytics: 'Reports & Insights',
  admin: 'Administration',
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission } = useAuth()
  const { view, navigate } = useNav()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<any>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [alertsCount, setAlertsCount] = useState(0)
  const [draftPOCount, setDraftPOCount] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = localStorage.getItem('pharm-theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return stored ?? (prefersDark ? 'dark' : 'light')
  })

  // Apply theme class to <html> whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    if (typeof window !== 'undefined') localStorage.setItem('pharm-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  const showDropdown = searchOpen && search.length > 0
  const displayResults = search.length > 0 ? searchResults : null

  // Global keyboard shortcuts: g d/p/i/s/e/c/r/o (dashboard, pos, inventory, stock, expenses, credit, reports, owner)
  // / to focus search, ? to show help, Esc to clear search
  useEffect(() => {
    let pendingG = false
    let pendingTimer: ReturnType<typeof setTimeout> | null = null

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      // '/' focuses search (unless already typing)
      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Search medicines"]')
        input?.focus()
        input?.select()
        return
      }
      // '?' shows shortcuts help (unless typing)
      if (e.key === '?' && !isTyping && !e.shiftKey) {
        e.preventDefault()
        // toggle a help dialog via custom event
        window.dispatchEvent(new CustomEvent('pharm-shortcuts-help'))
        return
      }
      // Escape clears search if focused
      if (e.key === 'Escape' && isTyping) {
        (target as HTMLInputElement).value = ''
        setSearch('')
        ;(target as HTMLInputElement).blur()
        return
      }
      // 'g' prefix navigation (only when not typing)
      if (!isTyping) {
        if (e.key === 'g') {
          pendingG = true
          if (pendingTimer) clearTimeout(pendingTimer)
          pendingTimer = setTimeout(() => { pendingG = false }, 700)
          return
        }
        if (pendingG) {
          pendingG = false
          if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null }
          const keyMap: Record<string, ViewKey> = {
            d: 'dashboard', p: 'pos', i: 'inventory', s: 'stock',
            e: 'expenses', c: 'credit', r: 'reports', o: 'owner',
            u: 'suppliers', t: 'customers', x: 'expiry', z: 'zreport',
            a: 'audit', n: 'notifications', h: 'draft-pos', q: 'scan',
          }
          const target = keyMap[e.key.toLowerCase()]
          if (target) {
            e.preventDefault()
            navigate(target)
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  // Shortcuts help dialog
  const [helpOpen, setHelpOpen] = useState(false)
  useEffect(() => {
    const handler = () => setHelpOpen(o => !o)
    window.addEventListener('pharm-shortcuts-help', handler)
    return () => window.removeEventListener('pharm-shortcuts-help', handler)
  }, [])

  // poll notifications count + draft PO count
  useEffect(() => {
    let active = true
    const fetchAlerts = async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch('/api/notifications?type=all'),
          fetch('/api/draft-pos').catch(() => null),
        ])
        if (active && r1.ok) {
          const d = await r1.json()
          const critical = d.alerts.filter((a: any) => a.severity === 'CRITICAL').length
          setAlertsCount(critical)
        }
        if (active && r2 && r2.ok) {
          const d2 = await r2.json()
          const pending = (d2.items || []).filter((i: any) => i.status === 'PENDING').length
          setDraftPOCount(pending)
        }
      } catch {}
    }
    fetchAlerts()
    const timer = setInterval(fetchAlerts, 30000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  // global search (debounced)
  useEffect(() => {
    if (search.length < 1) return
    let active = true
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(search)}`)
      if (active && r.ok) {
        const d = await r.json()
        setSearchResults(d.results)
        setSearchOpen(true)
      }
    }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [search])

  const filteredNav = NAV.filter(n => !n.permission || hasPermission(n.permission))
  const grouped: Record<string, NavItem[]> = {}
  for (const n of filteredNav) {
    if (!grouped[n.group]) grouped[n.group] = []
    grouped[n.group].push(n)
  }

  const handleSearchSelect = (item: any) => {
    setSearch('')
    setSearchOpen(false)
    if (item.type === 'medicine') navigate('inventory', { focusId: item.id })
    else if (item.type === 'customer') navigate('customers', { focusId: item.id })
    else if (item.type === 'supplier') navigate('suppliers', { focusId: item.id })
    else if (item.type === 'sale') navigate('pos', { focusId: item.id })
    else if (item.type === 'purchase') navigate('purchases', { focusId: item.id })
  }

  const initials = user?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-sidebar px-3 lg:px-5 shadow-sm">
        <button
          className="lg:hidden p-2 -ml-1 rounded-md hover:bg-secondary"
          onClick={() => setMobileNavOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          <ChevronRight className={`h-5 w-5 transition-transform ${mobileNavOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-sm leading-tight">Shifa Medical Store</div>
            <div className="text-xs text-muted-foreground leading-tight">Pharmacy Management</div>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search medicines, customers, invoices, batches…"
            className="pl-9 bg-background"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => search && setSearchOpen(true)}
          />
          {showDropdown && displayResults && (
            <div className="absolute left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-96 overflow-y-auto scroll-area z-50">
              {['medicines', 'customers', 'suppliers', 'sales', 'purchases', 'batches'].map(k => {
                const items = (displayResults as any)[k] as any[] | undefined
                if (!items || items.length === 0) return null
                return (
                  <div key={k}>
                    <div className="px-3 py-1 text-xs font-semibold uppercase text-muted-foreground bg-muted/50">{k}</div>
                    {items.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => handleSearchSelect(item)}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2 border-b"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{item.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.sub}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )
              })}
              {Object.values(displayResults).every((arr: any) => !arr || arr.length === 0) && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No results</div>
              )}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('notifications')}
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {alertsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {alertsCount}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setHelpOpen(o => !o)}
          aria-label="Keyboard shortcuts (press ?)"
          title="Keyboard shortcuts"
        >
          <Keyboard className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-secondary">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left leading-tight">
                <div className="text-xs font-semibold">{user?.name}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{user?.role}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hasPermission('settings.view') && (
              <DropdownMenuItem onClick={() => navigate('settings')}>
                <Settings className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => logout()}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-sidebar border-r">
          <nav className="flex-1 overflow-y-auto scroll-area py-2">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {GROUP_LABEL[group]}
                </div>
                {items.map(item => {
                  const Icon = item.icon
                  const active = view === item.key
                  return (
                    <button
                      key={item.key}
                      onClick={() => navigate(item.key)}
                      className={`w-full flex items-center gap-3 px-3 mx-1 py-2 rounded-md text-sm font-medium transition-colors
                        ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.badge ? <Badge variant="secondary" className="text-xs">{item.badge}</Badge> : null}
                      {item.key === 'draft-pos' && draftPOCount > 0 && (
                        <Badge variant={active ? 'secondary' : 'default'} className="text-xs font-mono bg-amber-500 text-white hover:bg-amber-600">
                          {draftPOCount}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="border-t p-3 text-[10px] text-muted-foreground text-center">
            <div>Shifa Pharmacy v1.0</div>
            <div className="mt-0.5">© {new Date().getFullYear()} All rights reserved</div>
          </div>
        </aside>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setMobileNavOpen(false)}>
            <aside
              className="absolute left-0 top-14 bottom-0 w-64 bg-sidebar border-r shadow-xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <nav className="flex-1 overflow-y-auto scroll-area py-2">
                {Object.entries(grouped).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {GROUP_LABEL[group]}
                    </div>
                    {items.map(item => {
                      const Icon = item.icon
                      const active = view === item.key
                      return (
                        <button
                          key={item.key}
                          onClick={() => { navigate(item.key); setMobileNavOpen(false) }}
                          className={`w-full flex items-center gap-3 px-3 mx-1 py-2 rounded-md text-sm font-medium
                            ${active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {item.key === 'draft-pos' && draftPOCount > 0 && (
                            <Badge variant="default" className="text-xs font-mono bg-amber-500 text-white">{draftPOCount}</Badge>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto scroll-area bg-background">
          <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-6 max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="mt-auto border-t bg-sidebar py-2.5 px-4 lg:px-6 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Shifa Medical Store</span>
          <span>•</span>
          <span>Pharmacy Management System</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Logged in as <strong className="text-foreground">{user?.name}</strong> ({user?.role})</span>
          <span className="hidden sm:inline">{new Date().toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </footer>

      {/* Keyboard shortcuts help dialog */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="bg-card border rounded-xl shadow-2xl max-w-md w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <kbd className="px-2 py-0.5 rounded border bg-muted text-xs font-mono">?</kbd>
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setHelpOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
                aria-label="Close"
              >×</button>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-2 mb-1">Global</div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Focus search</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">/</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Show this help</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">?</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Clear search</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">Esc</kbd>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Navigation (press g then key)</div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ['g d', 'Dashboard'], ['g p', 'POS / Billing'],
                  ['g q', 'Scan Medicine'], ['g i', 'Medicines'],
                  ['g s', 'Stock'], ['g x', 'Expiry'],
                  ['g e', 'Expenses'], ['g t', 'Customers'],
                  ['g u', 'Suppliers'], ['g c', 'Credit / Udhaar'],
                  ['g r', 'Reports'], ['g o', 'Business Overview'],
                  ['g z', 'Z-Report'], ['g h', 'Draft POs'],
                  ['g a', 'Audit Log'], ['g n', 'Notifications'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between py-0.5 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[10px] font-mono">{key}</kbd>
                  </div>
                ))}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">POS specific</div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Focus medicine search</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">F2</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Open checkout</span>
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs font-mono">F9</kbd>
              </div>
            </div>
            <div className="mt-4 text-[10px] text-muted-foreground text-center">Press <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">{'?'}</kbd> or <kbd className="px-1 py-0.5 rounded border bg-muted font-mono">Esc</kbd> to close</div>
          </div>
        </div>
      )}
    </div>
  )
}
