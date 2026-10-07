'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, StatCard, EmptyState, AlertPill, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell, RefreshCw, AlertTriangle, XCircle, Info, CalendarClock,
  CreditCard, Building2, Package, ArrowRight, CheckCircle2, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav, ViewKey } from '@/lib/nav-context'

type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

interface Alert {
  id: string
  type: string // LOW_STOCK | EXPIRED | EXPIRY | CREDIT_DUE | SUPPLIER_DUE
  title: string
  message: string
  severity: Severity
  refId: string
  refType: string
}

type FilterKey = 'all' | 'low_stock' | 'expiry' | 'expired' | 'credit' | 'supplier'

const FILTERS: { key: FilterKey; label: string; icon: any }[] = [
  { key: 'all', label: 'All', icon: Bell },
  { key: 'low_stock', label: 'Low Stock', icon: Package },
  { key: 'expiry', label: 'Expiry', icon: CalendarClock },
  { key: 'expired', label: 'Expired', icon: XCircle },
  { key: 'credit', label: 'Customer Credit', icon: CreditCard },
  { key: 'supplier', label: 'Supplier Payable', icon: Building2 },
]

const SEVERITY_STRIPE: Record<Severity, string> = {
  CRITICAL: 'bg-red-500',
  WARNING: 'bg-amber-500',
  INFO: 'bg-sky-500',
}

const SEVERITY_ICON: Record<Severity, any> = {
  CRITICAL: XCircle,
  WARNING: AlertTriangle,
  INFO: Info,
}

const TYPE_ICON: Record<string, any> = {
  LOW_STOCK: Package,
  EXPIRED: XCircle,
  EXPIRY: CalendarClock,
  CREDIT_DUE: CreditCard,
  SUPPLIER_DUE: Building2,
}

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: 'Low Stock',
  EXPIRED: 'Expired',
  EXPIRY: 'Expiring',
  CREDIT_DUE: 'Credit Due',
  SUPPLIER_DUE: 'Supplier Payable',
}

function navigateTargetFor(t: string): ViewKey {
  if (t === 'LOW_STOCK') return 'inventory'
  if (t === 'EXPIRED' || t === 'EXPIRY') return 'expiry'
  if (t === 'CREDIT_DUE') return 'credit'
  if (t === 'SUPPLIER_DUE') return 'suppliers'
  return 'notifications'
}

export function NotificationsView() {
  const { hasPermission } = useAuth()
  const { navigate } = useNav()
  const canView = hasPermission('notifications.view')

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const r = await fetch('/api/notifications?type=all')
      if (!r.ok) throw new Error('Failed to load')
      const d = await r.json()
      setAlerts(d.alerts || [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load notifications')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (canView) load()
    else setLoading(false)
  }, [canView, load])

  // auto-refresh every 30s
  useEffect(() => {
    if (!canView) return
    const t = setInterval(() => load(true), 30_000)
    return () => clearInterval(t)
  }, [canView, load])

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts
    if (filter === 'expiry') return alerts.filter(a => a.type === 'EXPIRY')
    if (filter === 'expired') return alerts.filter(a => a.type === 'EXPIRED')
    if (filter === 'low_stock') return alerts.filter(a => a.type === 'LOW_STOCK')
    if (filter === 'credit') return alerts.filter(a => a.type === 'CREDIT_DUE')
    if (filter === 'supplier') return alerts.filter(a => a.type === 'SUPPLIER_DUE')
    return alerts
  }, [alerts, filter])

  const counts = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'CRITICAL').length,
    warning: alerts.filter(a => a.severity === 'WARNING').length,
    info: alerts.filter(a => a.severity === 'INFO').length,
  }), [alerts])

  if (!canView) {
    return (
      <div>
        <PageHeader title="Alerts Center" subtitle="Real-time alerts & notifications" />
        <EmptyState icon={Bell} title="Access denied" description="You do not have permission to view notifications." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Alerts Center"
        subtitle="Real-time alerts & notifications"
        actions={
          <Button variant="outline" onClick={() => load(false)} disabled={refreshing || loading}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Alerts" value={counts.total} icon={Bell} tone="info" hint="All active" />
        <StatCard label="Critical" value={counts.critical} icon={XCircle} tone="danger" hint="Need attention" />
        <StatCard label="Warning" value={counts.warning} icon={AlertTriangle} tone="warning" hint="Monitor closely" />
        <StatCard label="Info" value={counts.info} icon={Info} tone="default" hint="For awareness" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map(f => {
          const Icon = f.icon
          const count = f.key === 'all'
            ? alerts.length
            : f.key === 'expiry'
              ? alerts.filter(a => a.type === 'EXPIRY').length
              : f.key === 'expired'
                ? alerts.filter(a => a.type === 'EXPIRED').length
                : f.key === 'low_stock'
                  ? alerts.filter(a => a.type === 'LOW_STOCK').length
                  : f.key === 'credit'
                    ? alerts.filter(a => a.type === 'CREDIT_DUE').length
                    : f.key === 'supplier'
                      ? alerts.filter(a => a.type === 'SUPPLIER_DUE').length
                      : 0
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all',
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card hover:bg-accent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
              <Badge variant={active ? 'secondary' : 'outline'} className="ml-1 px-1.5 py-0 text-xs">
                {count}
              </Badge>
            </button>
          )
        })}
      </div>

      {/* Alert list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No alerts"
              description={filter === 'all'
                ? 'All systems healthy. No active alerts right now.'
                : `No "${FILTERS.find(f => f.key === filter)?.label}" alerts at this time.`}
            />
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-y-auto scroll-area divide-y">
              {filtered.map(a => {
                const Stripe = SEVERITY_STRIPE[a.severity]
                const TypeIcon = TYPE_ICON[a.type] || SEVERITY_ICON[a.severity]
                const SevIcon = SEVERITY_ICON[a.severity]
                return (
                  <div key={a.id} className="relative flex items-start gap-3 p-4 pl-5 hover:bg-accent/50 transition-colors">
                    <div className={cn('absolute left-0 top-0 bottom-0 w-1.5', Stripe)} />
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                      a.severity === 'CRITICAL' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      a.severity === 'WARNING' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      a.severity === 'INFO' && 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
                    )}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{a.title}</span>
                        <AlertPill severity={a.severity}>
                          <SevIcon className="h-3 w-3" />
                          {TYPE_LABEL[a.type] || a.type.replace('_', ' ')}
                        </AlertPill>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                      <div className="text-xs text-muted-foreground mt-1">
                        Type: <span className="font-mono">{a.refType || '—'}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => navigate(navigateTargetFor(a.type), { refId: a.refId, refType: a.refType })}
                    >
                      View <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
