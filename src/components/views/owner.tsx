'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  PageHeader, EmptyState, formatPKR, formatCompactPKR, formatDate, cn,
} from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  ShoppingCart, TrendingUp, TrendingDown, Wallet, Banknote,
  Sparkles, AlertTriangle, XCircle, CalendarClock, Package,
  CreditCard, Building2, Database, FileText, Boxes,
  Gauge, Lightbulb, ArrowRight,
  Lock, ChevronRight, PackageX, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'

type InsightTone = 'success' | 'warning' | 'danger' | 'info'

interface Insight {
  tone: InsightTone
  icon: any
  text: React.ReactNode
  action?: { label: string; view: any }
}

interface OwnerData {
  dash: any
  expiry: any
  profitMeds: { rows: any[] }
  medicines: { items: any[] }
  credit: { customers: any[] }
  suppliers: { suppliers: any[] }
  daily14: { rows: any[] }
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function nDaysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d }

function healthMeta(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'oklch(0.65 0.18 145)', text: 'text-emerald-600 dark:text-emerald-400' }
  if (score >= 60) return { label: 'Good', color: 'oklch(0.55 0.18 180)', text: 'text-sky-600 dark:text-sky-400' }
  if (score >= 40) return { label: 'Fair', color: 'oklch(0.7 0.18 75)', text: 'text-amber-600 dark:text-amber-400' }
  return { label: 'At Risk', color: 'oklch(0.55 0.22 25)', text: 'text-red-600 dark:text-red-400' }
}

const TONE_CLS: Record<InsightTone, { card: string; icon: string; text: string }> = {
  success: {
    card: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30',
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    card: 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30',
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-300',
  },
  danger: {
    card: 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30',
    icon: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    text: 'text-red-700 dark:text-red-300',
  },
  info: {
    card: 'border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30',
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-300',
  },
}

export function OwnerView() {
  const { hasPermission } = useAuth()
  const canView = hasPermission('owner.view')
  const { navigate } = useNav()

  const [data, setData] = useState<OwnerData | null>(null)
  const [fetchLoading, setFetchLoading] = useState(true)

  useEffect(() => {
    if (!canView) return
    const from30 = isoDate(nDaysAgo(30))
    const from14 = isoDate(nDaysAgo(14))
    const today = isoDate(new Date())
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
      fetch('/api/expiry').then(r => r.json()),
      fetch(`/api/reports?type=profit-medicine&from=${from30}&to=${today}`).then(r => r.json()),
      fetch('/api/medicines').then(r => r.json()),
      fetch('/api/credit?onlyUnpaid=true').then(r => r.json()),
      fetch('/api/suppliers').then(r => r.json()),
      fetch(`/api/reports?type=daily-sales&from=${from14}&to=${today}`).then(r => r.json()),
    ]).then(([dash, expiry, profitMeds, medicines, credit, suppliers, daily14]) => {
      setData({ dash, expiry, profitMeds, medicines, credit, suppliers, daily14 })
      setFetchLoading(false)
    }).catch(() => {
      toast.error('Failed to load owner overview')
      setFetchLoading(false)
    })
  }, [canView])

  const loading = !canView ? false : fetchLoading

  /* ---------------- derived ---------------- */

  const todaySnap = useMemo(() => {
    if (!data) return null
    const d = data.dash
    const sales = d?.todaySales || 0
    const profit = d?.todayProfit || 0
    const expenses = d?.todayExpenses || 0
    const net = profit - expenses
    return { sales, profit, expenses, net }
  }, [data])

  const salesByMedName = useMemo(() => {
    if (!data) return {} as Record<string, number>
    const map: Record<string, number> = {}
    for (const r of data.profitMeds.rows || []) {
      map[r.name] = (map[r.name] || 0) + (r.qty || 0)
    }
    return map
  }, [data])

  const topSelling = useMemo(() => {
    if (!data) return []
    return (data.dash?.chart?.topSelling || []).slice(0, 5)
  }, [data])

  const slowMoving = useMemo(() => {
    if (!data) return []
    const meds = data.medicines.items || []
    const enriched = meds.map((m: any) => ({
      ...m,
      sold30d: salesByMedName[m.name] || 0,
    }))
    return enriched
      .filter((m: any) => m.isActive !== false && m.sold30d < 3)
      .sort((a: any, b: any) => (b.stock || 0) - (a.stock || 0))
      .slice(0, 5)
  }, [data, salesByMedName])

  const expiredLoss = useMemo(() => {
    if (!data) return 0
    return data.expiry?.totals?.expiredLoss || 0
  }, [data])

  const expiredCount = useMemo(() => {
    if (!data) return 0
    return data.expiry?.totals?.expired || 0
  }, [data])

  const nearExpiryCount = useMemo(() => {
    if (!data) return 0
    const t = data.expiry?.totals || {}
    return (t.days30 || 0) + (t.days60 || 0) + (t.days90 || 0)
  }, [data])

  const totalCreditOutstanding = useMemo(() => {
    if (!data) return 0
    return (data.credit?.customers || []).reduce((s: number, c: any) => s + (c.remaining || 0), 0)
  }, [data])

  const creditCustomerCount = useMemo(() => {
    if (!data) return 0
    return (data.credit?.customers || []).length
  }, [data])

  const totalSupplierPayable = useMemo(() => {
    if (!data) return 0
    return (data.suppliers?.suppliers || []).reduce((s: number, x: any) => s + Math.max(0, x.payable || 0), 0)
  }, [data])

  const supplierCount = useMemo(() => {
    if (!data) return 0
    return (data.suppliers?.suppliers || []).filter((s: any) => (s.payable || 0) > 0).length
  }, [data])

  /* ---------------- health score ---------------- */

  const health = useMemo(() => {
    if (!data) return null
    const rows: any[] = data.daily14.rows || []
    // split into this week (last 7) and last week (7-14)
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const last7 = sorted.slice(-7)
    const prev7 = sorted.slice(-14, -7)
    const thisWeek = last7.reduce((s, r) => s + (r.sales || 0), 0)
    const lastWeek = prev7.reduce((s, r) => s + (r.sales || 0), 0)

    // 1. sales trend (0-25)
    let trendScore = 12
    if (thisWeek > 0 || lastWeek > 0) {
      const ratio = lastWeek > 0 ? thisWeek / lastWeek : (thisWeek > 0 ? 2 : 0)
      trendScore = Math.min(25, Math.max(0, ratio * 12.5))
    }

    // 2. stock health (0-25)
    const lowStock = data.dash?.lowStockCount || 0
    const expired = data.dash?.expiredCount || 0
    const stockPenalty = (lowStock + expired) * 1.5
    const stockScore = Math.max(0, Math.min(25, 25 - stockPenalty))

    // 3. credit outstanding (0-25)
    const monthlySales = thisWeek * 4 || 1
    const creditRatio = totalCreditOutstanding / monthlySales
    const creditScore = Math.max(0, Math.min(25, 25 * (1 - Math.min(1, creditRatio))))

    // 4. supplier payable (0-25)
    const payableRatio = totalSupplierPayable / monthlySales
    const payableScore = Math.max(0, Math.min(25, 25 * (1 - Math.min(1, payableRatio))))

    const total = Math.round(trendScore + stockScore + creditScore + payableScore)
    return {
      total,
      trendScore: Math.round(trendScore),
      stockScore: Math.round(stockScore),
      creditScore: Math.round(creditScore),
      payableScore: Math.round(payableScore),
      thisWeek, lastWeek,
    }
  }, [data, totalCreditOutstanding, totalSupplierPayable])

  /* ---------------- insights ---------------- */

  const insights = useMemo<Insight[]>(() => {
    if (!data || !health) return []
    const list: Insight[] = []

    // 1. sales trend
    if (health.thisWeek === 0 && health.lastWeek === 0) {
      list.push({ tone: 'info', icon: Info2, text: 'No sales in the last 14 days — review your operations or marketing.' })
    } else if (health.thisWeek >= health.lastWeek) {
      const pct = health.lastWeek > 0 ? Math.round(((health.thisWeek - health.lastWeek) / health.lastWeek) * 100) : 100
      list.push({
        tone: 'success',
        icon: TrendingUp,
        text: <>Sales <strong>increased {pct}%</strong> this week ({formatPKR(health.thisWeek)}) vs last week ({formatPKR(health.lastWeek)}).</>,
      })
    } else {
      const pct = Math.round(((health.lastWeek - health.thisWeek) / Math.max(1, health.lastWeek)) * 100)
      list.push({
        tone: 'warning',
        icon: TrendingDown,
        text: <>Sales <strong>decreased {pct}%</strong> this week ({formatPKR(health.thisWeek)}) vs last week ({formatPKR(health.lastWeek)}).</>,
      })
    }

    // 2. best profit medicine
    const topProfit = (data.profitMeds.rows || []).slice().sort((a, b) => (b.profit || 0) - (a.profit || 0))[0]
    if (topProfit && topProfit.profit > 0) {
      list.push({
        tone: 'success',
        icon: TrendingUp,
        text: <>Best profit medicine: <strong>{topProfit.name}</strong> with <strong>{formatPKR(topProfit.profit)}</strong> profit in the last 30 days.</>,
        action: { label: 'View Report', view: 'reports' },
      })
    }

    // 3. expired medicines
    if (expiredCount > 0) {
      list.push({
        tone: 'danger',
        icon: XCircle,
        text: <>You have <strong>{expiredCount} expired medicine(s)</strong> worth <strong>{formatPKR(expiredLoss)}</strong> in potential losses — review immediately.</>,
        action: { label: 'Review Expiry', view: 'expiry' },
      })
    }

    // 4. credit outstanding
    if (creditCustomerCount > 0 && totalCreditOutstanding > 0) {
      list.push({
        tone: 'warning',
        icon: CreditCard,
        text: <>You have <strong>{creditCustomerCount} customer(s)</strong> who owe you <strong>{formatPKR(totalCreditOutstanding)}</strong> — follow up to collect.</>,
        action: { label: 'Open Credit', view: 'credit' },
      })
    }

    // 5. supplier payable
    if (supplierCount > 0 && totalSupplierPayable > 0) {
      list.push({
        tone: 'warning',
        icon: Building2,
        text: <>You owe suppliers <strong>{formatPKR(totalSupplierPayable)}</strong> across <strong>{supplierCount} supplier(s)</strong> — plan payments to maintain trust.</>,
        action: { label: 'Open Suppliers', view: 'suppliers' },
      })
    }

    // 6. fastest moving item
    if (topSelling.length > 0) {
      const fast = topSelling[0]
      list.push({
        tone: 'info',
        icon: Zap,
        text: <>Your fastest-moving item is <strong>{fast.name}</strong> ({fast.qty} units sold in 30 days) — consider increasing stock.</>,
        action: { label: 'Manage Inventory', view: 'inventory' },
      })
    }

    // 7. slowest items
    if (slowMoving.length > 0) {
      const names = slowMoving.slice(0, 3).map((s: any) => s.name).join(', ')
      list.push({
        tone: 'warning',
        icon: PackageX,
        text: <>Slowest items: <strong>{names}</strong> — consider a clearance sale or revising reorder levels.</>,
        action: { label: 'Manage Inventory', view: 'inventory' },
      })
    }

    // 8. near expiry alert
    if (nearExpiryCount > 0) {
      list.push({
        tone: 'warning',
        icon: CalendarClock,
        text: <><strong>{nearExpiryCount} batch(es)</strong> expire within 90 days — discount or sell these first (FEFO).</>,
        action: { label: 'Review Expiry', view: 'expiry' },
      })
    }

    // 9. low stock alert
    const lowStock = data.dash?.lowStockCount || 0
    if (lowStock > 0) {
      list.push({
        tone: 'warning',
        icon: AlertTriangle,
        text: <><strong>{lowStock} medicine(s)</strong> are low on stock — reorder soon to avoid stockouts.</>,
        action: { label: 'Manage Stock', view: 'stock' },
      })
    }

    return list
  }, [data, health, topSelling, slowMoving, expiredCount, expiredLoss, creditCustomerCount, totalCreditOutstanding, supplierCount, totalSupplierPayable, nearExpiryCount])

  /* ---------------- render ---------------- */

  if (!canView) {
    return (
      <div>
        <PageHeader title="Business Overview" subtitle="Auto-generated business insights for the owner" />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Lock className="h-10 w-10 text-muted-foreground mb-3" />
            <div className="font-semibold">Access denied</div>
            <div className="text-sm text-muted-foreground mt-1">
              You need <code className="font-mono">owner.view</code> permission to view this page.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Business Overview" subtitle="Auto-generated business insights for the owner" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  if (!data || !todaySnap || !health) {
    return (
      <div>
        <PageHeader title="Business Overview" subtitle="Auto-generated business insights for the owner" />
        <Card>
          <CardContent>
            <EmptyState icon={AlertTriangle} title="No data available" description="Try again in a moment." />
          </CardContent>
        </Card>
      </div>
    )
  }

  const dash = data.dash
  const meta = healthMeta(health.total)

  return (
    <div>
      <PageHeader
        title="Business Overview"
        subtitle="Auto-generated business insights for the owner"
      />

      {/* Today snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <SnapCard
          label="Today's Sales"
          value={formatCompactPKR(todaySnap.sales)}
          icon={ShoppingCart}
          tone={todaySnap.sales > 0 ? 'success' : 'default'}
          hint={`${dash.todayInvoices || 0} invoices • ${formatPKR(todaySnap.sales)}`}
          onClick={() => navigate('pos')}
        />
        <SnapCard
          label="Today's Profit"
          value={formatCompactPKR(todaySnap.profit)}
          icon={TrendingUp}
          tone={todaySnap.profit >= 0 ? 'success' : 'danger'}
          hint={`Gross profit • ${formatPKR(todaySnap.profit)}`}
          onClick={() => navigate('reports')}
        />
        <SnapCard
          label="Today's Expenses"
          value={formatCompactPKR(todaySnap.expenses)}
          icon={Wallet}
          tone={todaySnap.expenses > 0 ? 'warning' : 'default'}
          hint={`Spent • ${formatPKR(todaySnap.expenses)}`}
          onClick={() => navigate('expenses')}
        />
        <SnapCard
          label="Net Cash Flow"
          value={formatCompactPKR(todaySnap.net)}
          icon={Banknote}
          tone={todaySnap.net >= 0 ? 'success' : 'danger'}
          hint={`Profit − Expenses • ${formatPKR(todaySnap.net)}`}
        />
      </div>

      {/* Business health score + Top selling */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* Health gauge */}
        <Card>
          <CardHeader className="pb-2 py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Business Health Score
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-center gap-5">
              <div
                className="relative shrink-0 rounded-full"
                style={{
                  width: 130, height: 130,
                  background: `conic-gradient(${meta.color} ${health.total * 3.6}deg, var(--muted) 0deg)`,
                }}
              >
                <div className="absolute inset-[14px] rounded-full bg-card flex items-center justify-center">
                  <div className="text-center">
                    <div className={cn('text-3xl font-bold', meta.text)}>{health.total}</div>
                    <div className="text-xs text-muted-foreground">/ 100</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <Badge variant="outline" className={cn('mb-3 font-semibold', meta.text)}>{meta.label}</Badge>
                <div className="space-y-1.5">
                  <ScoreBar label="Sales Trend" value={health.trendScore} color="oklch(0.45 0.13 180)" />
                  <ScoreBar label="Stock Health" value={health.stockScore} color="oklch(0.65 0.18 145)" />
                  <ScoreBar label="Credit Recovered" value={health.creditScore} color="oklch(0.55 0.18 60)" />
                  <ScoreBar label="Supplier Trust" value={health.payableScore} color="oklch(0.55 0.22 305)" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top selling */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 py-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><Boxes className="h-4 w-4" /> Top 5 Best-Selling Medicines (30 days)</span>
              <Button size="sm" variant="ghost" onClick={() => navigate('reports')}>View Reports →</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {topSelling.length === 0 ? (
              <EmptyState icon={PackageX} title="No sales in 30 days" description="Top sellers will appear here once sales start coming in." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topSelling.slice().reverse()} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `${v} units`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="qty" fill="oklch(0.65 0.18 145)" radius={[0, 4, 4, 0]} name="Units Sold" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Slow-moving + Inventory warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Slow-moving */}
        <Card>
          <CardHeader className="pb-2 py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageX className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Top 5 Slow-Moving Medicines (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {slowMoving.length === 0 ? (
              <EmptyState icon={Boxes} title="No slow-moving items" description="All active medicines have been selling well." />
            ) : (
              <div className="max-h-[220px] overflow-y-auto scroll-area">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Medicine</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Sold (30d)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slowMoving.map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-sm">{m.name}</TableCell>
                        <TableCell className={cn('text-right font-mono text-sm', (m.stock || 0) <= 0 ? 'text-red-600 dark:text-red-400' : '')}>{m.stock || 0}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{m.sold30d}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory warnings */}
        <Card>
          <CardHeader className="pb-2 py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Inventory Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3">
            <WarningRow
              icon={AlertTriangle}
              tone="warning"
              title="Low Stock Medicines"
              count={dash.lowStockCount || 0}
              hint="Reorder soon to avoid stockouts"
              onClick={() => navigate('inventory')}
            />
            <WarningRow
              icon={CalendarClock}
              tone="warning"
              title="Near-Expiry Stock"
              count={nearExpiryCount}
              hint="Batches expiring within 90 days"
              onClick={() => navigate('expiry')}
            />
            <WarningRow
              icon={XCircle}
              tone="danger"
              title="Expired Stock"
              count={expiredCount}
              hint={`${formatPKR(expiredLoss)} potential loss`}
              onClick={() => navigate('expiry')}
            />
          </CardContent>
        </Card>
      </div>

      {/* Financial snapshot */}
      <Card className="mb-5">
        <CardHeader className="pb-2 py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Financial Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FinancialTile
              label="Customer Credit Outstanding"
              value={formatCompactPKR(totalCreditOutstanding)}
              tone={totalCreditOutstanding > 0 ? 'danger' : 'success'}
              icon={CreditCard}
              hint={`${creditCustomerCount} customer(s) • ${formatPKR(totalCreditOutstanding)}`}
              onClick={() => navigate('credit')}
            />
            <FinancialTile
              label="Supplier Payable"
              value={formatCompactPKR(totalSupplierPayable)}
              tone={totalSupplierPayable > 0 ? 'warning' : 'success'}
              icon={Building2}
              hint={`${supplierCount} supplier(s) • ${formatPKR(totalSupplierPayable)}`}
              onClick={() => navigate('suppliers')}
            />
            <FinancialTile
              label="Today's Expenses"
              value={formatCompactPKR(todaySnap.expenses)}
              tone={todaySnap.expenses > 0 ? 'warning' : 'default'}
              icon={Wallet}
              hint={`Spent • ${formatPKR(todaySnap.expenses)}`}
              onClick={() => navigate('expenses')}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <FinancialTile
              label="Current Cash Balance"
              value={formatCompactPKR(dash.currentCash || 0)}
              tone={(dash.currentCash || 0) >= 0 ? 'success' : 'danger'}
              icon={Banknote}
              hint={`Net cash • ${formatPKR(dash.currentCash || 0)}`}
            />
            <FinancialTile
              label="Today's Purchases"
              value={formatCompactPKR(dash.todayPurchases || 0)}
              tone="default"
              icon={TrendingUp}
              hint="From suppliers today"
              onClick={() => navigate('purchases')}
            />
            <FinancialTile
              label="Total Medicines"
              value={dash.totalMedicines || 0}
              tone="info"
              icon={Package}
              hint={`${dash.lowStockCount || 0} low stock`}
              onClick={() => navigate('inventory')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto insights */}
      <Card className="mb-5 border-primary/30 bg-gradient-to-br from-card to-primary/5">
        <CardHeader className="pb-2 py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Auto-Generated Insights
            <Badge variant="secondary" className="text-xs ml-auto">Live • Computed from your data</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {insights.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No insights yet" description="Start transacting to see auto-generated business insights here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((ins, i) => {
                const tone = TONE_CLS[ins.tone]
                const Icon = ins.icon
                return (
                  <div
                    key={i}
                    className={cn('flex items-start gap-3 p-3 rounded-lg border', tone.card)}
                  >
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', tone.icon)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug">{ins.text}</div>
                      {ins.action && (
                        <button
                          onClick={() => navigate(ins.action!.view)}
                          className={cn('inline-flex items-center gap-1 mt-1.5 text-xs font-semibold hover:underline', tone.text)}
                        >
                          {ins.action.label}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => navigate('backup')} variant="outline">
          <Database className="h-4 w-4" /> Backup data
        </Button>
        <Button onClick={() => navigate('reports')} variant="outline">
          <FileText className="h-4 w-4" /> Review reports
        </Button>
        <Button onClick={() => navigate('inventory')} variant="outline">
          <Package className="h-4 w-4" /> Manage inventory
        </Button>
      </div>
    </div>
  )
}

/* ---------------- sub-components ---------------- */

function SnapCard({
  label, value, icon: Icon, tone, hint, onClick,
}: {
  label: string; value: string; icon: any;
  tone: 'default' | 'success' | 'danger' | 'warning';
  hint?: string; onClick?: () => void;
}) {
  const textCls: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
  }
  const iconCls: Record<string, string> = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group flex items-start gap-3 p-4 rounded-lg border bg-card text-left transition-all',
        onClick && 'hover:shadow-md hover:border-primary/40 cursor-pointer',
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', iconCls[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</div>
        <div className={cn('text-xl lg:text-2xl font-bold truncate', textCls[tone])}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
    </button>
  )
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="text-muted-foreground w-28 shrink-0 truncate">{label}</div>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(value / 25) * 100}%`, background: color }} />
      </div>
      <div className="font-mono w-6 text-right shrink-0">{value}</div>
    </div>
  )
}

function WarningRow({
  icon: Icon, tone, title, count, hint, onClick,
}: {
  icon: any; tone: 'warning' | 'danger'; title: string; count: number; hint: string; onClick: () => void;
}) {
  const toneCls = tone === 'danger'
    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
  const iconCls = tone === 'danger'
    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all hover:shadow-md',
        toneCls,
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', iconCls)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {title}
          <span className="font-mono text-base">{count}</span>
        </div>
        <div className="text-xs opacity-80 truncate">{hint}</div>
      </div>
      <ChevronRight className="h-4 w-4 opacity-60" />
    </button>
  )
}

function FinancialTile({
  label, value, tone, icon: Icon, hint, onClick,
}: {
  label: string; value: string;
  tone: 'default' | 'success' | 'danger' | 'warning' | 'info';
  icon: any; hint?: string; onClick?: () => void;
}) {
  const textCls: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-sky-600 dark:text-sky-400',
  }
  const iconCls: Record<string, string> = {
    default: 'bg-muted text-foreground',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border bg-card text-left transition-all',
        onClick && 'hover:shadow-md hover:border-primary/40 cursor-pointer',
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', iconCls[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</div>
        <div className={cn('text-lg lg:text-xl font-bold truncate', textCls[tone])}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div>}
      </div>
    </button>
  )
}

/* helper alias — using AlertCircle from lucide-react would be cleaner, but inline keeps this self-contained */
function Info2(props: any) {
  // small inline info icon
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}
