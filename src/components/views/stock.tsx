'use client'

import { useEffect, useState, useMemo } from 'react'
import { PageHeader, EmptyState, formatDateTime, cn } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  XCircle, AlertTriangle, PackageCheck, Activity, Boxes, Search,
  TrendingUp, TrendingDown, Truck, ClipboardList,
  PackageSearch, ArrowUpRight, ArrowDownRight, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface MedicineItem {
  id: string
  name: string
  genericName?: string | null
  manufacturer?: string | null
  categoryName?: string | null
  unitType: string
  stock: number
  minStock: number
  maxStock: number
  retailPrice: number
  purchasePrice: number
  rackLocation?: string | null
  isActive: boolean
}

interface StockTxn {
  id: string
  type: string
  quantity: number
  medicine?: string | null
  batch?: string | null
  refType?: string | null
  notes?: string | null
  createdAt: string
}

type StatusKey = 'OUT' | 'LOW' | 'OVER' | 'HEALTHY'
type TabKey = 'low' | 'out' | 'over' | 'fast' | 'slow' | 'all'

function statusOf(m: MedicineItem): StatusKey {
  if (m.stock <= 0) return 'OUT'
  if (m.minStock > 0 && m.stock <= m.minStock) return 'LOW'
  if (m.maxStock > 0 && m.stock >= m.maxStock) return 'OVER'
  return 'HEALTHY'
}

const STATUS_META: Record<StatusKey, { label: string; badge: string; row: string; tone: 'destructive' | 'secondary' | 'default' | 'outline' }> = {
  OUT: { label: 'Out of Stock', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900', row: 'bg-red-50/40 dark:bg-red-950/20', tone: 'destructive' },
  LOW: { label: 'Low Stock', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900', row: 'bg-amber-50/40 dark:bg-amber-950/20', tone: 'secondary' },
  OVER: { label: 'Overstock', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900', row: 'bg-sky-50/40 dark:bg-sky-950/20', tone: 'outline' },
  HEALTHY: { label: 'Healthy', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900', row: '', tone: 'default' },
}

const TXN_META: Record<string, { label: string; cls: string }> = {
  PURCHASE: { label: 'Purchase In', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  SALE: { label: 'Sale', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  SALE_RETURN: { label: 'Sale Return', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  PURCHASE_RETURN: { label: 'Purchase Return', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  ADJUSTMENT_IN: { label: 'Adjustment +', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  ADJUSTMENT_OUT: { label: 'Adjustment −', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  INITIAL: { label: 'Initial', cls: 'bg-muted text-muted-foreground' },
}

export function StockView() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('inventory.edit')

  const [medicines, setMedicines] = useState<MedicineItem[]>([])
  const [txns, setTxns] = useState<StockTxn[]>([])
  const [salesByMed, setSalesByMed] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<TabKey>('low')
  const [draftQty, setDraftQty] = useState<Record<string, number>>({})
  const [approving, setApproving] = useState<string | null>(null)

  useEffect(() => {
    const since = new Date()
    since.setDate(since.getDate() - 30)
    Promise.all([
      fetch('/api/medicines').then(r => r.json()),
      fetch('/api/stock').then(r => r.json()),
      fetch(`/api/sales?from=${since.toISOString().slice(0, 10)}&limit=500`).then(r => r.json()),
    ]).then(([m, s, sal]) => {
      setMedicines(m.items || [])
      setTxns((s.txns || []).slice(0, 20))
      const byMed: Record<string, number> = {}
      for (const sale of (sal.sales || [])) {
        for (const it of (sale.items || [])) {
          const mid = it.medicineId
          byMed[mid] = (byMed[mid] || 0) + Number(it.quantity || 0)
        }
      }
      setSalesByMed(byMed)
      // initialize draft quantities
      const initial: Record<string, number> = {}
      for (const med of (m.items || [])) {
        if (med.stock <= med.minStock) {
          const avgWeekly = (byMed[med.id] || 0) / (30 / 7)
          const suggested = Math.max(
            med.minStock * 2 - med.stock,
            Math.ceil(avgWeekly * 4 - med.stock),
            0,
          )
          initial[med.id] = Math.max(suggested, 0)
        }
      }
      setDraftQty(initial)
      setLoading(false)
    }).catch(() => {
      toast.error('Failed to load stock data')
      setLoading(false)
    })
  }, [])

  const stats = useMemo(() => {
    let out = 0, low = 0, over = 0, healthy = 0
    for (const m of medicines) {
      const s = statusOf(m)
      if (s === 'OUT') out++
      else if (s === 'LOW') low++
      else if (s === 'OVER') over++
      else healthy++
    }
    return { out, low, over, healthy }
  }, [medicines])

  const fastSlow = useMemo(() => {
    const entries = medicines.map(m => ({
      id: m.id,
      sales: salesByMed[m.id] || 0,
    }))
    entries.sort((a, b) => b.sales - a.sales)
    const topIds = new Set(entries.slice(0, 10).filter(e => e.sales > 0).map(e => e.id))
    const slowIds = new Set(medicines.filter(m => !salesByMed[m.id]).map(m => m.id))
    return { topIds, slowIds }
  }, [medicines, salesByMed])

  const reorderList = useMemo(
    () => medicines
      .filter(m => m.stock <= m.minStock && m.minStock > 0 || m.stock <= 0)
      .sort((a, b) => a.stock - b.stock),
    [medicines],
  )

  const filtered = useMemo(() => {
    let list = medicines
    if (tab === 'low') list = list.filter(m => statusOf(m) === 'LOW')
    else if (tab === 'out') list = list.filter(m => statusOf(m) === 'OUT')
    else if (tab === 'over') list = list.filter(m => statusOf(m) === 'OVER')
    else if (tab === 'fast') list = list.filter(m => fastSlow.topIds.has(m.id)).sort((a, b) => (salesByMed[b.id] || 0) - (salesByMed[a.id] || 0))
    else if (tab === 'slow') list = list.filter(m => fastSlow.slowIds.has(m.id))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.genericName || '').toLowerCase().includes(q) ||
        (m.manufacturer || '').toLowerCase().includes(q) ||
        (m.categoryName || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [medicines, tab, search, fastSlow, salesByMed])

  const handleApprove = async (med: MedicineItem) => {
    setApproving(med.id)
    // Simulate adding to draft POs (saving handled in another view)
    await new Promise(r => setTimeout(r, 400))
    toast.success(`Added ${draftQty[med.id] || 0} units of ${med.name} to draft POs`, {
      description: 'Review & confirm in Purchases view.',
    })
    setApproving(null)
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Smart Stock Management" subtitle="Auto-detected stock states & reorder suggestions" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 rounded-lg mb-4" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Smart Stock Management"
        subtitle="Auto-detected stock states & reorder suggestions"
        actions={
          <Badge variant="outline" className="font-mono text-xs">
            {medicines.length} medicines
          </Badge>
        }
      />

      {/* Status overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatusCard label="Out of Stock" value={stats.out} icon={XCircle} tone="danger" />
        <StatusCard label="Low Stock" value={stats.low} icon={AlertTriangle} tone="warning" />
        <StatusCard label="Overstock" value={stats.over} icon={Boxes} tone="info" />
        <StatusCard label="Healthy" value={stats.healthy} icon={PackageCheck} tone="success" />
      </div>

      {/* Reorder suggestions */}
      {reorderList.length > 0 && (
        <Card className="mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Reorder Suggestions
              <Badge variant="secondary" className="ml-1">{reorderList.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {reorderList.slice(0, 12).map(m => {
                const avgWeekly = (salesByMed[m.id] || 0) / (30 / 7)
                const q = draftQty[m.id] ?? 0
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'rounded-lg border p-3 flex flex-col gap-2',
                      m.stock <= 0
                        ? 'border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20'
                        : 'border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{m.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {m.manufacturer || '—'} • {m.genericName || 'N/A'}
                        </div>
                      </div>
                      <Badge
                        variant={m.stock <= 0 ? 'destructive' : 'secondary'}
                        className="font-mono text-xs"
                      >
                        {m.stock} / {m.minStock}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-muted/50 px-2 py-1.5">
                        <div className="text-muted-foreground">Current</div>
                        <div className="font-bold font-mono">{m.stock}</div>
                      </div>
                      <div className="rounded bg-muted/50 px-2 py-1.5">
                        <div className="text-muted-foreground">Avg / week</div>
                        <div className="font-bold font-mono">{avgWeekly.toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground block mb-1">
                          Suggested Qty
                        </label>
                        <Input
                          type="number"
                          min={0}
                          disabled={!canEdit}
                          value={q}
                          onChange={e =>
                            setDraftQty(prev => ({ ...prev, [m.id]: Math.max(0, Number(e.target.value)) }))
                          }
                          className="h-9 font-mono"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!canEdit || approving === m.id || q <= 0}
                        onClick={() => handleApprove(m)}
                      >
                        {approving === m.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <ClipboardList className="h-4 w-4" />}
                        Approve
                      </Button>
                    </div>
                    {!canEdit && (
                      <div className="text-[10px] text-muted-foreground italic">
                        Read-only — inventory.edit permission required.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {reorderList.length > 12 && (
              <div className="text-xs text-muted-foreground mt-3 text-center">
                Showing top 12 of {reorderList.length} reorder candidates.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs + stock table */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mb-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="low" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Low ({stats.low})
            </TabsTrigger>
            <TabsTrigger value="out" className="gap-1">
              <XCircle className="h-3.5 w-3.5" /> Out ({stats.out})
            </TabsTrigger>
            <TabsTrigger value="over" className="gap-1">
              <Boxes className="h-3.5 w-3.5" /> Overstock ({stats.over})
            </TabsTrigger>
            <TabsTrigger value="fast" className="gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Fast-Moving
            </TabsTrigger>
            <TabsTrigger value="slow" className="gap-1">
              <TrendingDown className="h-3.5 w-3.5" /> Slow-Moving
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1">
              <PackageSearch className="h-3.5 w-3.5" /> All Stock
            </TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search medicines…"
              className="pl-8 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={PackageCheck}
                  title="No medicines in this category"
                  description="Adjust filters or check another tab."
                />
              ) : (
                <div className="max-h-[480px] overflow-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead className="hidden md:table-cell">Manufacturer</TableHead>
                        <TableHead className="hidden lg:table-cell">Category</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Min</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Max</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Rack</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(m => {
                        const s = statusOf(m)
                        const meta = STATUS_META[s]
                        const sales30 = salesByMed[m.id] || 0
                        return (
                          <TableRow key={m.id} className={meta.row}>
                            <TableCell>
                              <div className="font-medium">{m.name}</div>
                              {(m.genericName || tab === 'fast' || tab === 'slow') && (
                                <div className="text-xs text-muted-foreground">
                                  {m.genericName || '—'}
                                  {tab === 'fast' && ` • 30d sales: ${sales30}`}
                                  {tab === 'slow' && ' • 0 sales in 30d'}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {m.manufacturer || '—'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                              {m.categoryName || '—'}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {m.stock}
                            </TableCell>
                            <TableCell className="text-right font-mono hidden sm:table-cell">
                              {m.minStock}
                            </TableCell>
                            <TableCell className="text-right font-mono hidden sm:table-cell">
                              {m.maxStock || '—'}
                            </TableCell>
                            <TableCell>
                              <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', meta.badge)}>
                                {meta.label}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell font-mono text-xs">
                              {m.rackLocation || '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Stock movements table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Stock Movements
            <Badge variant="outline" className="font-mono text-xs ml-1">{txns.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txns.length === 0 ? (
            <EmptyState icon={Activity} title="No stock movements yet" description="Purchases, sales and adjustments will appear here." />
          ) : (
            <div className="max-h-[360px] overflow-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Medicine</TableHead>
                    <TableHead className="hidden md:table-cell">Batch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="hidden lg:table-cell">Ref</TableHead>
                    <TableHead className="hidden xl:table-cell">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.map(t => {
                    const meta = TXN_META[t.type] || { label: t.type, cls: 'bg-muted text-muted-foreground' }
                    const inOut = t.quantity >= 0
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(t.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{t.medicine || '—'}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs">
                          {t.batch || '—'}
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', meta.cls)}>
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold whitespace-nowrap">
                          <span className={inOut ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {inOut ? <ArrowUpRight className="inline h-3.5 w-3.5" /> : <ArrowDownRight className="inline h-3.5 w-3.5" />}
                            {inOut ? '+' : ''}{Math.abs(t.quantity)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                          {t.refType || '—'}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground max-w-xs truncate">
                          {t.notes || '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusCard({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: any;
  tone: 'danger' | 'warning' | 'info' | 'success'
}) {
  const toneCls: Record<string, string> = {
    danger: 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30',
    warning: 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30',
    info: 'border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30',
    success: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30',
  }
  const iconCls: Record<string, string> = {
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  }
  return (
    <div className={cn('flex items-center gap-3 p-4 rounded-lg border', toneCls[tone])}>
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', iconCls[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  )
}
