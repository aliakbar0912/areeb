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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Search, Plus, Users, Eye, Pencil, Trash2, CreditCard, Receipt,
  Wallet, Loader2, Phone, MapPin, FileText, Printer, Banknote,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

const PAYMENT_METHODS = ['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER']

interface CustomerRow {
  id: string
  name: string
  phone?: string | null
  address?: string | null
  notes?: string | null
  totalSales: number
  totalPaid: number
  outstanding: number
}

interface CustomerDetail extends CustomerRow {
  sales: any[]
  payments: any[]
}

const emptyForm = { name: '', phone: '', address: '', notes: '' }

interface StatementRow {
  date: string
  description: string
  debit: number
  credit: number
  balance: number
}

async function fetchSettings() {
  try {
    const r = await fetch('/api/settings')
    if (!r.ok) return null
    const d = await r.json()
    return d.settings || null
  } catch { return null }
}

function buildStatementRows(detail: CustomerDetail): { rows: StatementRow[]; opening: number; ending: number } {
  // Opening balance is 0 (schema has no openingBalance for customers)
  const opening = 0
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
  let running = opening
  const rows: StatementRow[] = events.map(e => {
    running += e.debit - e.credit
    return { ...e, balance: running }
  })
  return { rows, opening, ending: running }
}

function printStatement(detail: CustomerDetail, settings: any) {
  const { rows, opening, ending } = buildStatementRows(detail)
  const pharmacyName = settings?.['pharmacy.name'] || 'Pharmacy'
  const pharmacyAddress = settings?.['pharmacy.address'] || ''
  const pharmacyPhone = settings?.['pharmacy.phone'] || ''
  const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })

  const rowsHtml = rows.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${r.description}</td>
      <td style="text-align:right">${r.debit > 0 ? formatPKR(r.debit) : '—'}</td>
      <td style="text-align:right">${r.credit > 0 ? formatPKR(r.credit) : '—'}</td>
      <td style="text-align:right;font-weight:600">${formatPKR(r.balance)}</td>
    </tr>
  `).join('')

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
        <div style="font-size: 14px; font-weight: 700; color: #111;">CUSTOMER STATEMENT</div>
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

export function CustomersView() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('customers.edit')
  const canPay = hasPermission('credit.payment')

  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [purchaseHistory, setPurchaseHistory] = useState<any>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchPurchaseHistory = useCallback(async (customerId: string) => {
    setHistoryLoading(true)
    try {
      const r = await fetch(`/api/customers/${customerId}/purchase-history`)
      if (r.ok) {
        const d = await r.json()
        setPurchaseHistory(d)
      }
    } catch (e) {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'CASH', saleId: '', notes: '' })
  const [paySubmitting, setPaySubmitting] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [settings, setSettings] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/customers')
      const d = await r.json()
      setCustomers(d.customers || [])
    } catch {
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetchSettings().then(setSettings)
  }, [load])

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    )
  }, [customers, search])

  const stats = useMemo(() => ({
    count: customers.length,
    withOutstanding: customers.filter(c => c.outstanding > 0).length,
    totalCredit: customers.reduce((s, c) => s + (c.outstanding || 0), 0),
    totalSales: customers.reduce((s, c) => s + (c.totalSales || 0), 0),
  }), [customers])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (c: CustomerRow) => {
    setEditing(c)
    setForm({ name: c.name, phone: c.phone || '', address: c.address || '', notes: c.notes || '' })
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!form.name.trim()) { toast.error('Customer name is required'); return }
    setSubmitting(true)
    try {
      const url = editing ? `/api/customers/${editing.id}` : '/api/customers'
      const method = editing ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save')
      toast.success(editing ? 'Customer updated' : 'Customer added')
      setFormOpen(false)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (c: CustomerRow) => {
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

  const openPay = () => {
    if (!detail) return
    setPayForm({ amount: Math.max(0, detail.outstanding), method: 'CASH', saleId: '', notes: '' })
    setPayOpen(true)
  }

  const submitPay = async () => {
    if (!detail) return
    if (payForm.amount <= 0) { toast.error('Enter a valid amount'); return }
    setPaySubmitting(true)
    try {
      const r = await fetch('/api/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: detail.id,
          amount: payForm.amount,
          method: payForm.method,
          saleId: payForm.saleId || undefined,
          notes: payForm.notes || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Payment failed')
      toast.success(`Payment of ${formatPKR(payForm.amount)} recorded`)
      setPayOpen(false)
      await load()
      const dr = await fetch(`/api/customers/${detail.id}`)
      const dd = await dr.json()
      setDetail(dd.customer)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPaySubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const r = await fetch(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      toast.success('Customer deleted')
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  const handlePrint = async (c: CustomerRow) => {
    // ensure we have detail
    let d: CustomerDetail | null = detail && detail.id === c.id ? detail : null
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
    printStatement(d as CustomerDetail, s)
  }

  const statementPreview = useMemo(() => {
    if (!detail) return null
    return buildStatementRows(detail)
  }, [detail])

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customers, sales history & statements"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
            {canEdit && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add Customer
              </Button>
            )}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Customers" value={stats.count} icon={Users} tone="info" hint="Registered" />
        <StatCard label="With Outstanding Credit" value={stats.withOutstanding} icon={CreditCard} tone="warning" hint="Need follow-up" />
        <StatCard label="Total Outstanding" value={formatCompactPKR(stats.totalCredit)} icon={Wallet} tone="danger" hint={`To collect • ${formatPKR(stats.totalCredit)}`} />
        <StatCard label="Total Sales" value={formatCompactPKR(stats.totalSales)} icon={Receipt} tone="success" hint={`All-time • ${formatPKR(stats.totalSales)}`} />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers found"
              description={search ? 'Try a different search term.' : 'Add your first customer to get started.'}
              action={canEdit ? <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Customer</Button> : undefined}
            />
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Address</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{c.address || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm" title={formatPKR(c.totalSales)}>{formatCompactPKR(c.totalSales)}</TableCell>
                      <TableCell className={cn('text-right font-mono text-sm', c.totalPaid > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} title={formatPKR(c.totalPaid)}>
                        {formatCompactPKR(c.totalPaid)}
                      </TableCell>
                      <TableCell className={cn('text-right font-mono text-sm font-semibold', c.outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} title={formatPKR(c.outstanding)}>
                        {formatCompactPKR(c.outstanding)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(c)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePrint(c)} title="Print statement">
                            <Printer className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(c)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="03xx-xxxxxxx" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} placeholder="Full address" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Optional notes (e.g. regular customer, loyalty)" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                {detail?.name || 'Customer'}
              </span>
              {detail && detail.outstanding > 0 && (
                <Badge variant="destructive" className="font-mono">
                  Outstanding: {formatPKR(detail.outstanding)}
                </Badge>
              )}
              {detail && detail.outstanding <= 0 && (
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
                  Settled
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div>{detail.phone || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 md:col-span-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Address</div>
                    <div className="truncate">{detail.address || '—'}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 my-2">
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Total Sales</div>
                  <div className="font-mono font-semibold">{formatPKR(detail.totalSales)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatPKR(detail.totalPaid)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Outstanding</div>
                  <div className={cn('font-mono font-semibold', detail.outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                    {formatPKR(detail.outstanding)}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="sales" className="mt-2">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="sales">Sales ({detail.sales?.length || 0})</TabsTrigger>
                  <TabsTrigger value="payments">Payments ({detail.payments?.length || 0})</TabsTrigger>
                  <TabsTrigger value="statement">Statement</TabsTrigger>
                  <TabsTrigger value="history">Purchase History</TabsTrigger>
                </TabsList>

                <TabsContent value="sales">
                  <div className="max-h-[320px] overflow-y-auto scroll-area rounded-md border">
                    {(!detail.sales || detail.sales.length === 0) ? (
                      <EmptyState icon={Receipt} title="No sales yet" />
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Payment History</h4>
                    {canPay && (
                      <Button size="sm" onClick={openPay}>
                        <Plus className="h-3.5 w-3.5" /> Record Payment
                      </Button>
                    )}
                  </div>
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
                              <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                                {formatPKR(p.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="statement">
                  {statementPreview && (
                    <div>
                      <div className="flex items-center justify-end mb-2">
                        <Button size="sm" variant="outline" onClick={() => printStatement(detail, settings)}>
                          <Printer className="h-3.5 w-3.5" /> Print Statement
                        </Button>
                      </div>
                      <div className="max-h-[360px] overflow-y-auto scroll-area rounded-md border">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                              <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow className="bg-muted/40">
                              <TableCell colSpan={4} className="text-sm italic text-muted-foreground">Opening Balance</TableCell>
                              <TableCell className="text-right font-mono text-sm font-semibold">{formatPKR(statementPreview.opening)}</TableCell>
                            </TableRow>
                            {statementPreview.rows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No transactions</TableCell>
                              </TableRow>
                            ) : (
                              statementPreview.rows.map((r, i) => (
                                <TableRow key={i}>
                                  <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                                  <TableCell className="text-sm">{r.description}</TableCell>
                                  <TableCell className="text-right font-mono text-sm text-red-600 dark:text-red-400">{r.debit > 0 ? formatPKR(r.debit) : '—'}</TableCell>
                                  <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{r.credit > 0 ? formatPKR(r.credit) : '—'}</TableCell>
                                  <TableCell className="text-right font-mono text-sm font-semibold">{formatPKR(r.balance)}</TableCell>
                                </TableRow>
                              ))
                            )}
                            <TableRow className="border-t-2">
                              <TableCell colSpan={4} className="text-sm font-semibold text-right">Ending Balance</TableCell>
                              <TableCell className={cn('text-right font-mono font-bold', statementPreview.ending > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                                {formatPKR(statementPreview.ending)}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Purchase History Tab */}
                <TabsContent value="history">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : !purchaseHistory ? (
                    <div className="text-center py-8">
                      <Button size="sm" onClick={() => detail && fetchPurchaseHistory(detail.id)}>
                        Load Purchase History
                      </Button>
                    </div>
                  ) : purchaseHistory.sales.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No purchase history available for this customer.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Summary cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="p-2 rounded-lg border bg-card">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Spent</div>
                          <div className="font-bold text-sm text-primary">{formatCompactPKR(purchaseHistory.summary.totalSales)}</div>
                        </div>
                        <div className="p-2 rounded-lg border bg-card">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoices</div>
                          <div className="font-bold text-sm">{purchaseHistory.summary.invoiceCount}</div>
                        </div>
                        <div className="p-2 rounded-lg border bg-card">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Order</div>
                          <div className="font-bold text-sm">{formatCompactPKR(purchaseHistory.summary.avgOrderValue)}</div>
                        </div>
                        <div className="p-2 rounded-lg border bg-card">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unique Meds</div>
                          <div className="font-bold text-sm">{purchaseHistory.summary.uniqueMedicines}</div>
                        </div>
                      </div>

                      {/* Medicine breakdown */}
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Medicines Purchased ({purchaseHistory.medicineBreakdown.length})</div>
                        <div className="max-h-[200px] overflow-y-auto scroll-area rounded-md border">
                          <Table>
                            <TableHeader className="sticky top-0 bg-card z-10">
                              <TableRow>
                                <TableHead className="text-xs">Medicine</TableHead>
                                <TableHead className="text-right text-xs">Times</TableHead>
                                <TableHead className="text-right text-xs">Qty</TableHead>
                                <TableHead className="text-right text-xs">Revenue</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {purchaseHistory.medicineBreakdown.map((med: any, i: number) => (
                                <TableRow key={i}>
                                  <TableCell>
                                    <div className="font-medium text-sm">{med.name}</div>
                                    {med.manufacturer && <div className="text-[10px] text-muted-foreground">{med.manufacturer}</div>}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-xs">{med.count}</TableCell>
                                  <TableCell className="text-right font-mono text-xs">{med.qty}</TableCell>
                                  <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(med.revenue)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Recent purchases with item details */}
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recent Invoices ({purchaseHistory.sales.length})</div>
                        <div className="max-h-[250px] overflow-y-auto scroll-area rounded-md border space-y-2 p-2">
                          {purchaseHistory.sales.slice(0, 10).map((sale: any) => (
                            <div key={sale.id} className="p-2 rounded-lg border bg-card hover:bg-accent transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold">{sale.invoiceNumber}</span>
                                  <Badge variant={sale.status === 'PAID' ? 'default' : sale.status === 'PARTIAL' ? 'secondary' : 'destructive'} className="text-[9px] h-4">
                                    {sale.status}
                                  </Badge>
                                </div>
                                <span className="font-mono text-sm font-bold text-primary">{formatPKR(sale.total)}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {new Date(sale.date).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                {sale.cashier && ` • ${sale.cashier}`}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {sale.items.map((item: any, idx: number) => (
                                  <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    {item.name} ×{item.qty}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Record Credit Payment
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="font-medium">{detail.name}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">Outstanding</span>
                  <span className="font-mono font-semibold text-red-600 dark:text-red-400">{formatPKR(detail.outstanding)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Amount (PKR) *</Label>
                <Input
                  type="number"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: Number(e.target.value) || 0 })}
                />
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
              {detail.sales && detail.sales.some((s: any) => s.paymentStatus !== 'PAID') && (
                <div className="space-y-1.5">
                  <Label>Apply to Sale (optional)</Label>
                  <Select value={payForm.saleId} onValueChange={v => setPayForm({ ...payForm, saleId: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Unapplied" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Unapplied —</SelectItem>
                      {detail.sales.filter((s: any) => s.paymentStatus !== 'PAID').map((s: any) => (
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

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. All related sales and payment records will also be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
