'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  PageHeader, StatCard, EmptyState, formatPKR, formatCompactPKR, formatDate, formatDateTime, cn,
} from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Search, CreditCard, Wallet, Banknote, Loader2, Printer,
  AlertTriangle, CheckCircle2, Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

const PAYMENT_METHODS = ['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER']
const OVERDUE_DAYS = 30

interface CreditRow {
  id: string
  name: string
  phone?: string | null
  totalCredit: number
  totalPaid: number
  remaining: number
  lastPayment: string | null
  due: boolean
}

async function fetchSettings() {
  try {
    const r = await fetch('/api/settings')
    if (!r.ok) return null
    const d = await r.json()
    return d.settings || null
  } catch { return null }
}

function printStatement(detail: any, settings: any) {
  // detail has: name, phone, address, notes, sales[], payments[]
  type Ev = { date: string; desc: string; debit: number; credit: number }
  const events: Ev[] = []
  for (const s of detail.sales || []) {
    events.push({
      date: s.createdAt,
      desc: `Sale ${s.invoiceNumber}${s.paymentStatus === 'CREDIT' ? ' (on credit)' : s.paymentStatus === 'PARTIAL' ? ' (partial)' : ''}`,
      debit: s.total,
      credit: 0,
    })
  }
  for (const p of detail.payments || []) {
    events.push({
      date: p.createdAt,
      desc: `Payment received${p.method ? ' via ' + p.method : ''}${p.notes ? ' — ' + p.notes : ''}`,
      debit: 0,
      credit: p.amount,
    })
  }
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const opening = 0
  let running = opening
  const rowsHtml = events.map(e => {
    running += e.debit - e.credit
    return `
      <tr>
        <td>${formatDate(e.date)}</td>
        <td>${e.desc}</td>
        <td style="text-align:right">${e.debit > 0 ? formatPKR(e.debit) : '—'}</td>
        <td style="text-align:right">${e.credit > 0 ? formatPKR(e.credit) : '—'}</td>
        <td style="text-align:right;font-weight:600">${formatPKR(running)}</td>
      </tr>
    `
  }).join('')
  const ending = running

  const pharmacyName = settings?.['pharmacy.name'] || 'Pharmacy'
  const pharmacyAddress = settings?.['pharmacy.address'] || ''
  const pharmacyPhone = settings?.['pharmacy.phone'] || ''
  const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <title>Statement - ${detail.name}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1f2937; padding: 24px; }
      h1 { font-size: 18px; margin: 0; }
      h2 { font-size: 14px; margin: 4px 0 0; color: #4b5563; font-weight: 500; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
      .meta { text-align: right; font-size: 12px; color: #6b7280; }
      .party { margin-bottom: 16px; }
      .party .label { font-size: 11px; text-transform: uppercase; color: #6b7280; }
      .party .name { font-size: 16px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      thead th { background: #f3f4f6; text-align: left; padding: 8px 10px; border-bottom: 1px solid #d1d5db; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #4b5563; }
      tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
      tfoot td { padding: 10px; border-top: 2px solid #111; font-weight: 700; font-size: 14px; }
      .opening { background: #f9fafb; font-style: italic; color: #6b7280; }
      @media print { body { padding: 12px; } }
    </style>
  </head><body>
    <div class="header">
      <div>
        <h1>${pharmacyName}</h1>
        ${pharmacyAddress ? `<h2>${pharmacyAddress}</h2>` : ''}
        ${pharmacyPhone ? `<h2>Phone: ${pharmacyPhone}</h2>` : ''}
      </div>
      <div class="meta">
        <div style="font-size: 14px; font-weight: 700; color: #111;">CREDIT STATEMENT</div>
        <div>Issued: ${today}</div>
      </div>
    </div>
    <div class="party">
      <div class="label">Billed To</div>
      <div class="name">${detail.name}</div>
      ${detail.phone ? `<div>Phone: ${detail.phone}</div>` : ''}
      ${detail.address ? `<div>${detail.address}</div>` : ''}
      ${detail.notes ? `<div style="color:#6b7280;margin-top:4px">Notes: ${detail.notes}</div>` : ''}
    </div>
    <table>
      <thead>
        <tr><th>Date</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr>
      </thead>
      <tbody>
        <tr class="opening"><td colspan="4">Opening Balance</td><td style="text-align:right;font-weight:600">${formatPKR(opening)}</td></tr>
        ${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:20px">No transactions</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right">Ending Balance (Owed to Pharmacy)</td>
          <td style="text-align:right;color:${ending > 0 ? '#dc2626' : '#16a34a'}">${formatPKR(ending)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:24px;font-size:11px;color:#9ca3af;text-align:center">
      This statement was generated electronically. Please review and report any discrepancy within 7 days.
    </p>
    <script>window.onload = () => { window.print(); }</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) { toast.error('Popup blocked. Allow popups for this site.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

function isOverdue(r: CreditRow): boolean {
  if (!r.due || r.remaining <= 0) return false
  if (!r.lastPayment) return true  // never paid, with outstanding
  const days = (Date.now() - new Date(r.lastPayment).getTime()) / 86400000
  return days > OVERDUE_DAYS
}

export function CreditView() {
  const { hasPermission } = useAuth()
  const canPay = hasPermission('credit.payment')

  const [rows, setRows] = useState<CreditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyUnpaid, setOnlyUnpaid] = useState(true)
  const [collectedToday, setCollectedToday] = useState(0)
  const [settings, setSettings] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [payTarget, setPayTarget] = useState<CreditRow | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'CASH', saleId: '', notes: '' })
  const [paySubmitting, setPaySubmitting] = useState(false)
  const [unpaidSales, setUnpaidSales] = useState<any[]>([])

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [credR, salesR] = await Promise.all([
        fetch('/api/credit').then(r => r.json()),
        fetch(`/api/sales?from=${today}&to=${today}&limit=500`).then(r => r.json()).catch(() => ({ sales: [] })),
      ])
      setRows(credR.customers || [])
      const todaySales = salesR.sales || []
      const collected = todaySales.reduce((s: number, x: any) => s + (x.paidAmount || 0), 0)
      setCollectedToday(collected)
    } catch {
      toast.error('Failed to load credit data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetchSettings().then(setSettings)
  }, [load, refreshKey])

  const filtered = useMemo(() => {
    let list = rows
    if (onlyUnpaid) list = list.filter(r => r.remaining > 0)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || (r.phone || '').toLowerCase().includes(q))
    }
    return list
  }, [rows, onlyUnpaid, search])

  const stats = useMemo(() => ({
    withCredit: rows.filter(r => r.remaining > 0).length,
    outstanding: rows.reduce((s, r) => s + (r.remaining || 0), 0),
    overdue: rows.filter(isOverdue).length,
    collectedToday,
  }), [rows, collectedToday])

  const openPay = async (c: CreditRow) => {
    setPayTarget(c)
    setPayForm({ amount: Math.max(0, c.remaining), method: 'CASH', saleId: '', notes: '' })
    setUnpaidSales([])
    setPayOpen(true)
    // fetch unpaid sales for this customer
    try {
      const r = await fetch(`/api/sales?customerId=${c.id}&limit=200`)
      const d = await r.json()
      const sales = (d.sales || []).filter((s: any) => s.paymentStatus !== 'PAID' && (s.total - s.paidAmount) > 0.01)
      setUnpaidSales(sales)
    } catch {
      setUnpaidSales([])
    }
  }

  const submitPay = async () => {
    if (!payTarget) return
    if (payForm.amount <= 0) { toast.error('Enter a valid amount'); return }
    setPaySubmitting(true)
    try {
      const r = await fetch('/api/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: payTarget.id,
          amount: payForm.amount,
          method: payForm.method,
          saleId: payForm.saleId || undefined,
          notes: payForm.notes || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Payment failed')
      toast.success(`Payment of ${formatPKR(payForm.amount)} recorded from ${payTarget.name}`)
      setPayOpen(false)
      setPayTarget(null)
      setRefreshKey(k => k + 1)  // auto-refresh
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPaySubmitting(false)
    }
  }

  const openDetail = async (c: CreditRow) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const r = await fetch(`/api/customers/${c.id}`)
      const d = await r.json()
      setDetail(d.customer)
    } catch {
      toast.error('Failed to load customer')
    } finally {
      setDetailLoading(false)
    }
  }

  const handlePrint = async (c: CreditRow) => {
    let d: any = detail && detail.id === c.id ? detail : null
    if (!d) {
      try {
        const r = await fetch(`/api/customers/${c.id}`)
        const dd = await r.json()
        d = dd.customer
      } catch {
        toast.error('Failed to load customer for print')
        return
      }
    }
    const s = settings || await fetchSettings()
    printStatement(d, s)
  }

  return (
    <div>
      <PageHeader
        title="Credit / Udhaar Management"
        subtitle="Track customer credit and collect payments"
        actions={
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
              <Switch checked={onlyUnpaid} onCheckedChange={setOnlyUnpaid} id="only-unpaid" />
              <Label htmlFor="only-unpaid" className="text-sm cursor-pointer">Show only unpaid</Label>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Customers with Credit" value={stats.withCredit} icon={CreditCard} tone="warning" hint="Active udhaar" />
        <StatCard label="Total Outstanding" value={formatCompactPKR(stats.outstanding)} icon={Wallet} tone="danger" hint={`To collect • ${formatPKR(stats.outstanding)}`} />
        <StatCard label="Overdue Customers" value={stats.overdue} icon={AlertTriangle} tone="warning" hint={`${OVERDUE_DAYS}+ days unpaid`} />
        <StatCard label="Collected Today" value={formatCompactPKR(stats.collectedToday)} icon={Banknote} tone="success" hint={`From today's sales • ${formatPKR(stats.collectedToday)}`} />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No credit customers"
              description={onlyUnpaid
                ? 'All credit settled. Toggle "Show only unpaid" off to see all.'
                : 'No customers found.'}
            />
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total Credit</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="hidden md:table-cell">Last Payment</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => {
                    const overdue = isOverdue(c)
                    return (
                      <TableRow key={c.id} className={overdue ? 'bg-red-50/40 dark:bg-red-900/10' : ''}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm" title={formatPKR(c.totalCredit)}>{formatCompactPKR(c.totalCredit)}</TableCell>
                        <TableCell className={cn('text-right font-mono text-sm', c.totalPaid > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} title={formatPKR(c.totalPaid)}>
                          {formatCompactPKR(c.totalPaid)}
                        </TableCell>
                        <TableCell className={cn('text-right font-mono text-sm font-semibold', c.remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} title={formatPKR(c.remaining)}>
                          {formatCompactPKR(c.remaining)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{c.lastPayment ? formatDate(c.lastPayment) : '—'}</TableCell>
                        <TableCell className="text-center">
                          {c.remaining <= 0 ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Settled
                            </Badge>
                          ) : overdue ? (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />Overdue
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Due</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canPay && (
                              <Button size="sm" className="h-8" onClick={() => openPay(c)}>
                                <Banknote className="h-3.5 w-3.5" /> Collect
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(c)} title="View statement">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePrint(c)} title="Print statement">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* Record Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Collect Credit Payment
            </DialogTitle>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="font-medium">{payTarget.name}</div>
                {payTarget.phone && <div className="text-xs text-muted-foreground">{payTarget.phone}</div>}
                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">Outstanding</span>
                  <span className="font-mono font-semibold text-red-600 dark:text-red-400">{formatPKR(payTarget.remaining)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (PKR) *</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: Number(e.target.value) || 0 })}
                />
                {payTarget.remaining > 0 && (
                  <div className="flex gap-1.5">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setPayForm({ ...payForm, amount: payTarget.remaining })}>
                      Full ({formatPKR(payTarget.remaining)})
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setPayForm({ ...payForm, amount: Math.round(payTarget.remaining / 2) })}>
                      Half
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={payForm.method} onValueChange={v => setPayForm({ ...payForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {unpaidSales.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Apply to Sale (optional)</Label>
                  <Select value={payForm.saleId} onValueChange={v => setPayForm({ ...payForm, saleId: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Unapplied" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Unapplied —</SelectItem>
                      {unpaidSales.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.invoiceNumber} — {formatPKR(s.total - s.paidAmount)} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  placeholder="Optional reference / note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitPay} disabled={paySubmitting}>
              {paySubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog (read-only statement view) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                {detail?.name || 'Customer'}
              </span>
              {detail && (
                <Button size="sm" variant="outline" onClick={() => printStatement(detail, settings)}>
                  <Printer className="h-3.5 w-3.5" /> Print Statement
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <TabsView detail={detail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TabsView({ detail }: { detail: any }) {
  const totalSales = (detail.sales || []).reduce((s: number, x: any) => s + x.total, 0)
  const totalPaid = (detail.sales || []).reduce((s: number, x: any) => s + x.paidAmount, 0)
    + (detail.payments || []).reduce((s: number, x: any) => s + x.amount, 0)
  const outstanding = totalSales - totalPaid

  return (
    <>
      <div className="grid grid-cols-3 gap-2 my-2">
        <div className="rounded-lg border p-2">
          <div className="text-xs text-muted-foreground">Total Credit</div>
          <div className="font-mono font-semibold">{formatPKR(totalSales)}</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="text-xs text-muted-foreground">Paid</div>
          <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatPKR(totalPaid)}</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className={cn('font-mono font-semibold', outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
            {formatPKR(outstanding)}
          </div>
        </div>
      </div>

      <Tabs defaultValue="sales" className="mt-2">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <div className="max-h-[320px] overflow-y-auto scroll-area rounded-md border">
            {(!detail.sales || detail.sales.length === 0) ? (
              <EmptyState icon={CreditCard} title="No sales" />
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.sales.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{formatDate(s.createdAt)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPKR(s.total)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{formatPKR(s.paidAmount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.paymentStatus === 'PAID' ? 'secondary' : s.paymentStatus === 'PARTIAL' ? 'outline' : 'destructive'} className="text-xs">
                          {s.paymentStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="payments">
          <div className="max-h-[320px] overflow-y-auto scroll-area rounded-md border">
            {(!detail.payments || detail.payments.length === 0) ? (
              <EmptyState icon={Wallet} title="No payments recorded" />
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDateTime(p.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{p.method}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{p.notes || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{formatPKR(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
