'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader, StatCard, formatPKR, formatCompactPKR, AlertPill } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ShoppingCart, TrendingUp, Truck, Wallet, Banknote,
  CreditCard, Building2, Package, AlertTriangle, CalendarClock, XCircle,
  AlertCircle, Plus, Receipt, Activity, Zap, ArrowRight, ClipboardList, Scan,
} from 'lucide-react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useNav } from '@/lib/nav-context'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/components/ui-helpers'

const CHART_COLORS = ['oklch(0.45 0.13 180)', 'oklch(0.65 0.18 145)', 'oklch(0.55 0.18 60)', 'oklch(0.55 0.22 305)', 'oklch(0.7 0.18 35)']

const QUICK_ACTIONS = [
  { key: 'pos', label: 'New Sale', icon: ShoppingCart, color: 'bg-emerald-500 hover:bg-emerald-600 text-white', perm: 'pos.use' },
  { key: 'scan', label: 'Scan Medicine', icon: Scan, color: 'bg-violet-500 hover:bg-violet-600 text-white', perm: 'inventory.edit' },
  { key: 'purchases', label: 'New Purchase', icon: Truck, color: 'bg-sky-500 hover:bg-sky-600 text-white', perm: 'purchases.edit' },
  { key: 'expenses', label: 'Add Expense', icon: Wallet, color: 'bg-amber-500 hover:bg-amber-600 text-white', perm: 'expenses.edit' },
  { key: 'credit', label: 'Collect Payment', icon: CreditCard, color: 'bg-rose-500 hover:bg-rose-600 text-white', perm: 'credit.payment' },
  { key: 'inventory', label: 'Add Medicine', icon: Package, color: 'bg-slate-600 hover:bg-slate-700 text-white', perm: 'inventory.edit' },
  { key: 'zreport', label: 'End of Day Report', icon: Receipt, color: 'bg-slate-600 hover:bg-slate-700 text-white', perm: 'reports.view' },
] as const

export function DashboardView() {
  const { navigate } = useNav()
  const { hasPermission } = useAuth()
  const [data, setData] = useState<any>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [lowStockMeds, setLowStockMeds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [reordering, setReordering] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [d, a, s] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/notifications?type=all').then(r => r.json()),
        fetch('/api/sales?limit=5').then(r => r.json()),
      ])
      setData(d); setAlerts(a.alerts || []); setRecentSales(s.sales || [])
      // fetch low-stock medicines for reorder action
      const medsRes = await fetch('/api/medicines')
      if (medsRes.ok) {
        const medsData = await medsRes.json()
        const low = (medsData.items || []).filter((m: any) => m.stock <= m.minStock && m.isActive)
        setLowStockMeds(low)
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60000)
    return () => clearInterval(t)
  }, [refresh])

  // Compute trend indicator: compare today's sales to yesterday's
  const todayVsYesterday = useMemo(() => {
    if (!data?.chart?.days || data.chart.days.length < 2) return null
    const today = data.chart.days[data.chart.days.length - 1]
    const yesterday = data.chart.days[data.chart.days.length - 2]
    if (!today || !yesterday || yesterday.sales === 0) return null
    const pct = ((today.sales - yesterday.sales) / yesterday.sales) * 100
    return { pct: Math.abs(pct).toFixed(1), dir: pct >= 0 ? 'up' : 'down' as 'up' | 'down' }
  }, [data])

  const handleReorderAll = async () => {
    if (lowStockMeds.length === 0) return
    setReordering(true)
    try {
      const items = lowStockMeds.map((m: any) => {
        const suggestedQty = Math.max((m.minStock * 2) - m.stock, 30)
        return {
          medicineId: m.id,
          medicineName: m.name,
          genericName: m.genericName,
          manufacturer: m.manufacturer,
          currentStock: m.stock,
          minStock: m.minStock,
          suggestedQty,
          approvedQty: suggestedQty,
          estimatedCost: suggestedQty * (m.purchasePrice || 0),
        }
      })
      const r = await fetch('/api/draft-pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', items }),
      })
      if (r.ok) {
        const d = await r.json()
        import('sonner').then(({ toast }) => {
          toast.success(`Added ${items.length} item(s) to draft purchase order`, {
            description: `Total estimated cost: ${formatPKR(items.reduce((s, i) => s + i.estimatedCost, 0))}`,
            action: { label: 'View Draft POs', onClick: () => navigate('draft-pos') },
          })
        })
      }
    } finally {
      setReordering(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Today's performance overview" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${today} • Real-time pharmacy overview`}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* Important alerts banner */}
      {(data?.alerts?.lowStock > 0 || data?.alerts?.expired > 0 || data?.alerts?.overdueCredit > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {data.alerts.lowStock > 0 && (
              <button
                onClick={() => navigate('stock')}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-sm hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold">{data.alerts.lowStock}</span>
                  <span className="text-xs"> low stock medicine(s)</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {data.alerts.nearExpiry > 0 && (
              <button
                onClick={() => navigate('expiry')}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/60 text-orange-800 dark:text-orange-200 text-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-700 transition-all"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40 shrink-0">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold">{data.alerts.nearExpiry}</span>
                  <span className="text-xs"> near expiry</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {data.alerts.expired > 0 && (
              <button
                onClick={() => navigate('expiry')}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-sm hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40 shrink-0">
                  <XCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold">{data.alerts.expired}</span>
                  <span className="text-xs"> expired medicine(s)</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
            {data.alerts.overdueCredit > 0 && (
              <button
                onClick={() => navigate('credit')}
                className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/60 text-sky-800 dark:text-sky-200 text-sm hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700 transition-all"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40 shrink-0">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold">{data.alerts.overdueCredit}</span>
                  <span className="text-xs"> credit unpaid</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 opacity-50 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}
          </div>
          {data.alerts.lowStock > 0 && hasPermission('inventory.edit') && lowStockMeds.length > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={handleReorderAll}
              disabled={reordering}
              className="shrink-0 gap-1.5 bg-amber-600 hover:bg-amber-700"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              {reordering ? 'Adding…' : `Reorder All (${lowStockMeds.length})`}
            </Button>
          )}
        </div>
      )}

      {/* Quick Actions Row */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {QUICK_ACTIONS.filter(a => !a.perm || hasPermission(a.perm as string)).map(a => (
            <button
              key={a.key}
              onClick={() => navigate(a.key as any)}
              className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl text-[11px] font-medium transition-all shadow-sm ${a.color}`}
            >
              <a.icon className="h-4 w-4" />
              <span className="text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid - using compact format for large values */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Today's Sales" value={formatCompactPKR(data?.todaySales)} icon={ShoppingCart} tone="info"
          hint={`${data?.todayInvoices} invoices • Full: ${formatPKR(data?.todaySales)}`} onClick={() => navigate('pos')}
          trend={todayVsYesterday?.dir} trendValue={todayVsYesterday ? `${todayVsYesterday.pct}%` : undefined} />
        <StatCard label="Today's Profit" value={formatCompactPKR(data?.todayProfit)} icon={TrendingUp} tone="success"
          hint={`Gross profit • Full: ${formatPKR(data?.todayProfit)}`} onClick={() => navigate('reports')} />
        <StatCard label="Today's Purchases" value={formatCompactPKR(data?.todayPurchases)} icon={Truck}
          hint="From suppliers today" onClick={() => navigate('purchases')} />
        <StatCard label="Today's Expenses" value={formatCompactPKR(data?.todayExpenses)} icon={Wallet} tone="warning"
          hint="Today's expense total" onClick={() => navigate('expenses')} />
        <StatCard label="Current Cash" value={formatCompactPKR(data?.currentCash)} icon={Banknote} tone={data?.currentCash >= 0 ? 'success' : 'danger'}
          hint={`Cash balance • Full: ${formatPKR(data?.currentCash)}`} />
        <StatCard label="Customer Credit" value={formatCompactPKR(data?.outstandingCredit)} icon={CreditCard} tone="warning"
          hint="Outstanding Udhaar" onClick={() => navigate('credit')} />
        <StatCard label="Supplier Payable" value={formatCompactPKR(data?.supplierPayable)} icon={Building2} tone="danger"
          hint="Total payable to suppliers" onClick={() => navigate('suppliers')} />
        <StatCard label="Total Medicines" value={data?.totalMedicines ?? 0} icon={Package} tone="info"
          hint={`${data?.lowStockCount} low stock`} onClick={() => navigate('inventory')} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>7-Day Performance</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.45 0.13 180)' }} />
                  <span className="text-muted-foreground">Sales</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.65 0.18 145)' }} />
                  <span className="text-muted-foreground">Profit</span>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.chart?.days || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.45 0.13 180)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="oklch(0.45 0.13 180)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="oklch(0.65 0.18 145)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} dy={8} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} width={48} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(v: any) => formatPKR(Number(v))}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="sales" stroke="oklch(0.45 0.13 180)" strokeWidth={2.5}
                  fill="url(#colorSales)" name="Sales" dot={{ r: 3, fill: 'oklch(0.45 0.13 180)' }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="profit" stroke="oklch(0.65 0.18 145)" strokeWidth={2.5}
                  fill="url(#colorProfit)" name="Profit" dot={{ r: 3, fill: 'oklch(0.65 0.18 145)' }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={data?.chart?.byMethod || []}
                  dataKey="value" nameKey="name"
                  innerRadius={55} outerRadius={85} paddingAngle={3}
                >
                  {(data?.chart?.byMethod || []).map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatPKR(Number(v))} contentStyle={{ borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top selling + Recent Sales + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Top-Selling Medicines (30 days)</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('reports')}>View Reports →</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.chart?.topSelling || []} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => formatPKR(Number(v))} contentStyle={{ borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="total" fill="oklch(0.45 0.13 180)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Live recent sales feed */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Recent Sales
              </span>
              <Button size="sm" variant="ghost" onClick={() => navigate('pos')}>All →</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto scroll-area pr-1">
              {recentSales.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Receipt className="h-4 w-4 mr-2" />
                  No sales yet today
                </div>
              )}
              {recentSales.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent border">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shrink-0">
                    <Receipt className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-semibold truncate">{s.invoiceNumber}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.customer?.name || 'Walk-in'} • {formatDateTime(s.createdAt).split(',')[1] || ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">{formatPKR(s.total)}</div>
                    <Badge variant={s.paymentStatus === 'PAID' ? 'default' : s.paymentStatus === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-[9px] px-1 py-0 h-4">
                      {s.paymentStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              <span>Today's Important Alerts</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('notifications')}>All Alerts →</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto scroll-area pr-1">
              {alerts.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  No active alerts. All systems healthy.
                </div>
              )}
              {alerts.slice(0, 12).map((a, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (a.type === 'LOW_STOCK' || a.type === 'EXPIRED' || a.type === 'EXPIRY') navigate('expiry')
                    else if (a.type === 'CREDIT_DUE') navigate('credit')
                    else if (a.type === 'SUPPLIER_DUE') navigate('suppliers')
                    else navigate('notifications')
                  }}
                  className="w-full flex items-start gap-2 text-left p-2 rounded-lg hover:bg-accent border"
                >
                  <AlertPill severity={a.severity}>{a.type.replace('_', ' ')}</AlertPill>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.message}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
