'use client'

import { useEffect, useState, useMemo } from 'react'
import { PageHeader, formatPKR, formatDate, EmptyState, cn } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  XCircle, CalendarClock, CalendarDays, CalendarRange, CalendarCheck,
  Search, Download, AlertTriangle, PackageX,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface ExpiryItem {
  id: string
  medicine?: string | null
  genericName?: string | null
  manufacturer?: string | null
  batchNumber: string
  expiry: string
  quantity: number
  purchasePrice: number
  loss: number
  days: number
}

interface ExpiryData {
  expired: ExpiryItem[]
  days30: ExpiryItem[]
  days60: ExpiryItem[]
  days90: ExpiryItem[]
  safe: ExpiryItem[]
  totals: {
    expired: number
    days30: number
    days60: number
    days90: number
    safe: number
    expiredLoss: number
  }
}

type TabKey = 'expired' | 'days30' | 'days60' | 'days90' | 'safe'

const TAB_META: Record<TabKey, { label: string; tone: string; card: string; icon: any }> = {
  expired: { label: 'Expired', tone: 'red', card: 'bg-red-50/60 dark:bg-red-950/30 border-red-200 dark:border-red-900', icon: XCircle },
  days30: { label: '30 Days', tone: 'amber', card: 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900', icon: CalendarClock },
  days60: { label: '60 Days', tone: 'orange', card: 'bg-orange-50/60 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900', icon: CalendarDays },
  days90: { label: '90 Days', tone: 'sky', card: 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900', icon: CalendarRange },
  safe: { label: 'Safe', tone: 'emerald', card: 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900', icon: CalendarCheck },
}

const TONE_CLS: Record<string, { icon: string; text: string; card: string }> = {
  red: {
    icon: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    text: 'text-red-700 dark:text-red-400',
    card: 'border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-900/10',
  },
  amber: {
    icon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    text: 'text-amber-700 dark:text-amber-400',
    card: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-900/10',
  },
  orange: {
    icon: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    text: 'text-orange-700 dark:text-orange-400',
    card: 'border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-900/10',
  },
  sky: {
    icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    text: 'text-sky-700 dark:text-sky-400',
    card: 'border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-900/10',
  },
  emerald: {
    icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    text: 'text-emerald-700 dark:text-emerald-400',
    card: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-900/10',
  },
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function ExpiryView() {
  const { hasPermission } = useAuth()
  const canExport = hasPermission('inventory.edit')

  const [data, setData] = useState<ExpiryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('expired')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/expiry')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => {
        toast.error('Failed to load expiry data')
        setLoading(false)
      })
  }, [])

  const currentItems = useMemo<ExpiryItem[]>(() => {
    if (!data) return []
    return data[tab] || []
  }, [data, tab])

  const filtered = useMemo(() => {
    if (!search) return currentItems
    const q = search.toLowerCase()
    return currentItems.filter(it =>
      (it.medicine || '').toLowerCase().includes(q) ||
      (it.genericName || '').toLowerCase().includes(q) ||
      (it.manufacturer || '').toLowerCase().includes(q) ||
      (it.batchNumber || '').toLowerCase().includes(q)
    )
  }, [currentItems, search])

  const totalLoss = useMemo(
    () => filtered.reduce((s, it) => s + (it.loss || 0), 0),
    [filtered],
  )

  const exportCsv = () => {
    if (!data) return
    const rows = filtered
    const headers = ['Medicine', 'Generic', 'Manufacturer', 'Batch', 'Expiry', 'Quantity', 'Purchase Cost', 'Estimated Loss', 'Days to Expiry']
    const lines = [headers.join(',')]
    for (const it of rows) {
      lines.push([
        escapeCsv(it.medicine),
        escapeCsv(it.genericName),
        escapeCsv(it.manufacturer),
        escapeCsv(it.batchNumber),
        escapeCsv(it.expiry),
        escapeCsv(it.quantity),
        escapeCsv(it.purchasePrice),
        escapeCsv(it.loss),
        escapeCsv(it.days),
      ].join(','))
    }
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date().toISOString().slice(0, 10)
    a.download = `expiry-${tab}-${today}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} rows to CSV`)
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Expiry Management" subtitle="FEFO-aware expiry tracking" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  const totals = data?.totals || { expired: 0, days30: 0, days60: 0, days90: 0, safe: 0, expiredLoss: 0 }

  return (
    <div>
      <PageHeader
        title="Expiry Management"
        subtitle="FEFO-aware expiry tracking"
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!canExport || filtered.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <SummaryCard
          label="Expired"
          count={totals.expired}
          hint={formatPKR(totals.expiredLoss) + ' loss'}
          tone="red"
          icon={XCircle}
          onClick={() => setTab('expired')}
        />
        <SummaryCard
          label="30 Days"
          count={totals.days30}
          hint="Critical"
          tone="amber"
          icon={CalendarClock}
          onClick={() => setTab('days30')}
        />
        <SummaryCard
          label="60 Days"
          count={totals.days60}
          hint="Warning"
          tone="orange"
          icon={CalendarDays}
          onClick={() => setTab('days60')}
        />
        <SummaryCard
          label="90 Days"
          count={totals.days90}
          hint="Monitor"
          tone="sky"
          icon={CalendarRange}
          onClick={() => setTab('days90')}
        />
        <SummaryCard
          label="Safe"
          count={totals.safe}
          hint=">90 days"
          tone="emerald"
          icon={CalendarCheck}
          onClick={() => setTab('safe')}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="expired" className="gap-1 text-red-700 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" /> Expired ({totals.expired})
            </TabsTrigger>
            <TabsTrigger value="days30" className="gap-1 text-amber-700 dark:text-amber-400">
              <CalendarClock className="h-3.5 w-3.5" /> 30 Days ({totals.days30})
            </TabsTrigger>
            <TabsTrigger value="days60" className="gap-1 text-orange-700 dark:text-orange-400">
              <CalendarDays className="h-3.5 w-3.5" /> 60 Days ({totals.days60})
            </TabsTrigger>
            <TabsTrigger value="days90" className="gap-1 text-sky-700 dark:text-sky-400">
              <CalendarRange className="h-3.5 w-3.5" /> 90 Days ({totals.days90})
            </TabsTrigger>
            <TabsTrigger value="safe" className="gap-1 text-emerald-700 dark:text-emerald-400">
              <CalendarCheck className="h-3.5 w-3.5" /> Safe ({totals.safe})
            </TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search medicines, batches…"
              className="pl-8 h-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value={tab}>
          <Card>
            <CardHeader className="pb-2 py-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {(() => {
                    const Icon = TAB_META[tab].icon
                    return <Icon className={cn('h-4 w-4', TONE_CLS[TAB_META[tab].tone].text)} />
                  })()}
                  {TAB_META[tab].label} — {filtered.length} batches
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {filtered.length !== currentItems.length && `filtered from ${currentItems.length}`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={tab === 'expired' ? PackageX : CalendarCheck}
                  title={`No ${TAB_META[tab].label.toLowerCase()} batches`}
                  description={tab === 'safe'
                    ? 'No batches with safe expiry window. Stock will appear here when more than 90 days remain.'
                    : 'Inventory is healthy in this window.'}
                />
              ) : (
                <div className="max-h-[520px] overflow-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead className="hidden md:table-cell">Generic</TableHead>
                        <TableHead className="hidden lg:table-cell">Manufacturer</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Cost</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(it => {
                        const tone = TAB_META[tab].tone
                        return (
                          <TableRow key={it.id} className={TAB_META[tab].card.replace(/bg-\S+/, '').trim()}>
                            <TableCell>
                              <div className="font-medium text-sm">{it.medicine || '—'}</div>
                              {it.days < 0 && (
                                <div className="text-xs text-red-600 dark:text-red-400 font-medium">
                                  Expired {Math.abs(it.days)}d ago
                                </div>
                              )}
                              {it.days >= 0 && it.days <= 90 && (
                                <div className={cn('text-xs font-medium', TONE_CLS[tone].text)}>
                                  {it.days}d left
                                </div>
                              )}
                              {it.days > 90 && (
                                <div className="text-xs text-muted-foreground">
                                  {it.days}d left
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {it.genericName || '—'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                              {it.manufacturer || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{it.batchNumber}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{formatDate(it.expiry)}</TableCell>
                            <TableCell className="text-right font-mono">{it.quantity}</TableCell>
                            <TableCell className="text-right font-mono hidden sm:table-cell">
                              {formatPKR(it.purchasePrice * it.quantity)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {it.loss > 0 ? (
                                <span className={it.days < 0
                                  ? 'text-red-600 dark:text-red-400 font-semibold'
                                  : 'text-muted-foreground'}>
                                  {formatPKR(it.loss)}
                                </span>
                              ) : '—'}
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

          {/* Total estimated loss footer (expired tab) */}
          {tab === 'expired' && filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div className="text-sm">
                <span className="text-muted-foreground">Total estimated loss (filtered): </span>
                <span className="font-bold font-mono text-red-700 dark:text-red-400 text-lg">
                  {formatPKR(totalLoss)}
                </span>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {!canExport && (
        <div className="mt-3 text-xs text-muted-foreground italic text-center">
          Export & edit actions require <code className="font-mono">inventory.edit</code> permission.
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, count, hint, tone, icon: Icon, onClick }: {
  label: string; count: number; hint: string; tone: string; icon: any; onClick?: () => void
}) {
  const t = TONE_CLS[tone]
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border text-left transition-all hover:shadow-md',
        t.card,
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', t.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </div>
        <div className={cn('text-2xl font-bold', t.text)}>{count}</div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div>
      </div>
    </button>
  )
}
