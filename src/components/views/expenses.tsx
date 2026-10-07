'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, StatCard, EmptyState, formatPKR, formatCompactPKR, formatDate, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Wallet, Plus, Trash2, Loader2, Receipt, Filter, X,
  Zap, Building2, Users, Wifi, Truck, Wrench, Package,
  CalendarDays, TrendingUp, PieChart,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

// ============================================================================
// Constants
// ============================================================================
const EXPENSE_CATEGORIES = [
  'RENT', 'ELECTRICITY', 'SALARIES', 'INTERNET', 'TRANSPORT', 'MAINTENANCE', 'MISC',
] as const
type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

interface CategoryMeta {
  label: string
  icon: any
  badgeCls: string
  barCls: string
  dotCls: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  RENT: {
    label: 'Rent', icon: Building2,
    badgeCls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-900',
    barCls: 'bg-blue-500',
    dotCls: 'bg-blue-500',
  },
  ELECTRICITY: {
    label: 'Electricity', icon: Zap,
    badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    barCls: 'bg-amber-500',
    dotCls: 'bg-amber-500',
  },
  SALARIES: {
    label: 'Salaries', icon: Users,
    badgeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    barCls: 'bg-emerald-500',
    dotCls: 'bg-emerald-500',
  },
  INTERNET: {
    label: 'Internet', icon: Wifi,
    badgeCls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    barCls: 'bg-sky-500',
    dotCls: 'bg-sky-500',
  },
  TRANSPORT: {
    label: 'Transport', icon: Truck,
    badgeCls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-900',
    barCls: 'bg-violet-500',
    dotCls: 'bg-violet-500',
  },
  MAINTENANCE: {
    label: 'Maintenance', icon: Wrench,
    badgeCls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    barCls: 'bg-rose-500',
    dotCls: 'bg-rose-500',
  },
  MISC: {
    label: 'Misc', icon: Package,
    badgeCls: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-900',
    barCls: 'bg-slate-500',
    dotCls: 'bg-slate-500',
  },
}

function getCategoryMeta(cat: string): CategoryMeta {
  return CATEGORY_META[cat] || {
    label: cat || 'Unknown',
    icon: Package,
    badgeCls: 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-200 dark:border-slate-900',
    barCls: 'bg-slate-500',
    dotCls: 'bg-slate-500',
  }
}

// ============================================================================
// Types
// ============================================================================
interface Expense {
  id: string
  category: string
  amount: number
  description?: string | null
  date: string
  user?: { name: string } | null
  userId?: string
  createdAt: string
}

// ============================================================================
// Date helpers
// ============================================================================
function startOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function endOfDay(d: Date) { const r = new Date(d); r.setHours(23, 59, 59, 999); return r }
function startOfWeek(d: Date) {
  const r = startOfDay(d)
  const day = r.getDay() // 0 Sun..6 Sat — assume week starts Monday
  const diff = (day + 6) % 7
  r.setDate(r.getDate() - diff)
  return r
}
function startOfMonth(d: Date) { const r = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); return r }
function toISODate(d: Date) { return d.toISOString().slice(0, 10) }

// ============================================================================
// Main View
// ============================================================================
export function ExpensesView() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('expenses.edit')

  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Filters
  const today = new Date()
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [filterFrom, setFilterFrom] = useState<string>('')
  const [filterTo, setFilterTo] = useState<string>('')

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    category: 'RENT' as string,
    customCategory: '',
    amount: '',
    description: '',
    date: toISODate(today),
  })

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const buildUrl = useCallback(() => {
    const u = new URL('/api/expenses', window.location.origin)
    if (filterFrom) u.searchParams.set('from', filterFrom)
    if (filterTo) u.searchParams.set('to', filterTo)
    if (filterCategory !== 'ALL') u.searchParams.set('category', filterCategory)
    return u.toString()
  }, [filterFrom, filterTo, filterCategory])

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(buildUrl())
      const d = await r.json()
      setExpenses(d.expenses || [])
    } catch {
      toast.error('Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }, [buildUrl])

  useEffect(() => { fetchExpenses() }, [fetchExpenses, refreshKey])

  // Re-fetch full list (no filters) for summary cards when filters are applied
  const [allExpenses, setAllExpenses] = useState<Expense[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/expenses')
        const d = await r.json()
        if (!cancelled) setAllExpenses(d.expenses || [])
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [refreshKey])

  // Summary cards (computed from allExpenses, ignores filters)
  const todayTotal = useMemo(() => {
    const s = startOfDay(today), e = endOfDay(today)
    return allExpenses
      .filter(x => { const d = new Date(x.date); return d >= s && d <= e })
      .reduce((s, x) => s + Number(x.amount || 0), 0)
  }, [allExpenses])

  const weekTotal = useMemo(() => {
    const s = startOfWeek(today), e = endOfDay(today)
    return allExpenses
      .filter(x => { const d = new Date(x.date); return d >= s && d <= e })
      .reduce((s, x) => s + Number(x.amount || 0), 0)
  }, [allExpenses])

  const monthTotal = useMemo(() => {
    const s = startOfMonth(today), e = endOfDay(today)
    return allExpenses
      .filter(x => { const d = new Date(x.date); return d >= s && d <= e })
      .reduce((s, x) => s + Number(x.amount || 0), 0)
  }, [allExpenses])

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const x of allExpenses) {
      const d = new Date(x.date)
      if (d >= startOfMonth(today) && d <= endOfDay(today)) {
        map[x.category] = (map[x.category] || 0) + Number(x.amount || 0)
      }
    }
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? { name: sorted[0][0], total: sorted[0][1] } : null
  }, [allExpenses])

  // Category breakdown for filtered range
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {}
    for (const x of expenses) {
      map[x.category] = (map[x.category] || 0) + Number(x.amount || 0)
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, v]) => s + v, 0)
    return { entries, total }
  }, [expenses])

  const filteredTotal = useMemo(() => {
    return expenses.reduce((s, x) => s + Number(x.amount || 0), 0)
  }, [expenses])

  const resetFilters = () => {
    setFilterCategory('ALL')
    setFilterFrom('')
    setFilterTo('')
  }

  const hasActiveFilters = filterCategory !== 'ALL' || !!filterFrom || !!filterTo

  const resetForm = () => {
    setForm({
      category: 'RENT',
      customCategory: '',
      amount: '',
      description: '',
      date: toISODate(new Date()),
    })
  }

  const openAdd = () => {
    resetForm()
    setAddOpen(true)
  }

  const submitExpense = async () => {
    const category = form.category === '__CUSTOM__' ? form.customCategory.trim() : form.category
    if (!category) { toast.error('Category is required'); return }
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Amount must be greater than 0'); return }
    if (!form.date) { toast.error('Date is required'); return }
    setSubmitting(true)
    try {
      const r = await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount,
          description: form.description.trim() || undefined,
          date: form.date,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create expense')
      toast.success(`Expense recorded: ${getCategoryMeta(category).label} — ${formatPKR(amount)}`)
      setAddOpen(false)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create expense')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/expenses?id=${deleteId}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to delete expense')
      toast.success('Expense deleted')
      setDeleteId(null)
      setRefreshKey(k => k + 1)
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete expense')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Expenses" subtitle="Daily & monthly expense tracking" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-12 rounded-lg mb-3" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    )
  }

  const topMeta = topCategory ? getCategoryMeta(topCategory.name) : null

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Daily & monthly expense tracking"
        actions={canEdit && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Add Expense
          </Button>
        )}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Today"
          value={formatCompactPKR(todayTotal)}
          icon={CalendarDays}
          tone="info"
          hint={`${allExpenses.filter(x => { const d = new Date(x.date); return d >= startOfDay(today) && d <= endOfDay(today) }).length} entries • ${formatPKR(todayTotal)}`}
        />
        <StatCard
          label="This Week"
          value={formatCompactPKR(weekTotal)}
          icon={TrendingUp}
          tone="default"
          hint={`Mon → today • ${formatPKR(weekTotal)}`}
        />
        <StatCard
          label="This Month"
          value={formatCompactPKR(monthTotal)}
          icon={Wallet}
          tone="warning"
          hint={`${new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-PK', { month: 'long' })} • ${formatPKR(monthTotal)}`}
        />
        <StatCard
          label="Top Category (month)"
          value={topCategory ? topMeta?.label || topCategory.name : '—'}
          icon={topMeta?.icon || PieChart}
          tone="success"
          hint={topCategory ? formatPKR(topCategory.total) : 'No expenses'}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {EXPENSE_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{getCategoryMeta(c).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="h-9 w-[150px]"
            max={filterTo || undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase text-muted-foreground">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="h-9 w-[150px]"
            min={filterFrom || undefined}
          />
        </div>

        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={resetFilters} className="h-9">
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span>{expenses.length} entries • {formatPKR(filteredTotal)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Expenses table */}
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                <span className="text-sm font-semibold">Expenses</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">{formatPKR(filteredTotal)}</Badge>
            </div>
            {expenses.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expenses found"
                description={hasActiveFilters
                  ? 'Try clearing filters or widening the date range.'
                  : 'Add your first expense to start tracking.'}
                action={canEdit && !hasActiveFilters && (
                  <Button size="sm" onClick={openAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Add Expense
                  </Button>
                )}
              />
            ) : (
              <div className="max-h-[520px] overflow-y-auto scroll-area">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Recorded by</TableHead>
                      {canEdit && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map(x => {
                      const meta = getCategoryMeta(x.category)
                      const Icon = meta.icon
                      return (
                        <TableRow key={x.id}>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(x.date)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('gap-1', meta.badgeCls)}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                            <span className="line-clamp-2">{x.description || '—'}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(x.amount)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {x.user?.name || '—'}
                          </TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteId(x.id)}
                                title="Delete expense"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 w-8 p-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="h-4 w-4" />
              <span className="text-sm font-semibold">By Category</span>
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {hasActiveFilters ? 'In current filter range' : 'All recorded expenses'}
              {' • '}<span className="font-mono">{formatPKR(categoryBreakdown.total)}</span>
            </div>
            {categoryBreakdown.entries.length === 0 ? (
              <EmptyState
                icon={PieChart}
                title="No data"
                description="No expenses in this range."
              />
            ) : (
              <div className="space-y-2.5">
                {categoryBreakdown.entries.map(([cat, val]) => {
                  const meta = getCategoryMeta(cat)
                  const Icon = meta.icon
                  const pct = categoryBreakdown.total > 0 ? (val / categoryBreakdown.total) * 100 : 0
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium truncate">{meta.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-mono">{pct.toFixed(0)}%</span>
                          <span className="font-mono font-semibold">{formatPKR(val)}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full transition-all', meta.barCls)}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record New Expense</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-cat">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger id="exp-cat" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{getCategoryMeta(c).label}</SelectItem>
                  ))}
                  <SelectItem value="__CUSTOM__">Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.category === '__CUSTOM__' && (
              <div className="space-y-1.5">
                <Label htmlFor="exp-custom">Custom Category</Label>
                <Input
                  id="exp-custom"
                  value={form.customCategory}
                  onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                  placeholder="e.g. MARKETING"
                  className="uppercase"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">Amount (PKR)</Label>
              <Input
                id="exp-amount"
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                min={0}
                step="0.01"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                max={toISODate(today)}
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="exp-desc">Description (optional)</Label>
              <Textarea
                id="exp-desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes — vendor, reference, purpose"
                rows={3}
              />
            </div>
          </div>

          {/* Live preview */}
          {form.amount && Number(form.amount) > 0 && (
            <div className="mt-1 rounded-md border bg-muted/30 p-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {(() => {
                  const cat = form.category === '__CUSTOM__' ? form.customCategory.trim() : form.category
                  const meta = getCategoryMeta(cat || '')
                  const Icon = meta.icon
                  return (
                    <>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-muted-foreground text-xs">
                        on {formatDate(form.date ? new Date(form.date) : new Date())}
                      </span>
                    </>
                  )
                })()}
              </div>
              <span className="font-mono font-bold text-primary">{formatPKR(Number(form.amount) || 0)}</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>Cancel</Button>
            </DialogClose>
            <Button onClick={submitExpense} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The expense entry will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
