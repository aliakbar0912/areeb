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
  Search, Plus, Truck, Eye, Pencil, Trash2, Banknote, Building2,
  Wallet, Receipt, Loader2, Phone, Mail, MapPin, ArrowDownToLine,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

const PAYMENT_METHODS = ['CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER']

interface SupplierRow {
  id: string
  name: string
  company?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  openingBalance: number
  totalPurchases: number
  totalPaid: number
  payable: number
}

interface SupplierDetail extends SupplierRow {
  purchases: any[]
  payments: any[]
  purchaseReturns: any[]
}

const emptyForm = {
  name: '', company: '', phone: '', email: '', address: '', openingBalance: 0,
}

export function SuppliersView() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('suppliers.edit')
  const canPay = hasPermission('purchases.edit')

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Add/Edit dialog state
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  // Detail dialog state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Payment dialog state
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'CASH', purchaseId: '', notes: '' })
  const [paySubmitting, setPaySubmitting] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<SupplierRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/suppliers')
      const d = await r.json()
      setSuppliers(d.suppliers || [])
    } catch {
      toast.error('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!search) return suppliers
    const q = search.toLowerCase()
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.company || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q)
    )
  }, [suppliers, search])

  const totals = useMemo(() => ({
    count: suppliers.length,
    purchases: suppliers.reduce((s, x) => s + (x.totalPurchases || 0), 0),
    paid: suppliers.reduce((s, x) => s + (x.totalPaid || 0), 0),
    payable: suppliers.reduce((s, x) => s + (x.payable || 0), 0),
  }), [suppliers])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  const openEdit = (s: SupplierRow) => {
    setEditing(s)
    setForm({
      name: s.name, company: s.company || '', phone: s.phone || '',
      email: s.email || '', address: s.address || '',
      openingBalance: s.openingBalance || 0,
    })
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!form.name.trim()) { toast.error('Supplier name is required'); return }
    setSubmitting(true)
    try {
      const url = editing ? `/api/suppliers/${editing.id}` : '/api/suppliers'
      const method = editing ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save')
      toast.success(editing ? 'Supplier updated' : 'Supplier added')
      setFormOpen(false)
      await load()
      if (detailOpen && detail && editing?.id === detail.id) {
        setDetail({ ...detail, ...form } as SupplierDetail)
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (s: SupplierRow) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const r = await fetch(`/api/suppliers/${s.id}`)
      const d = await r.json()
      setDetail(d.supplier)
    } catch {
      toast.error('Failed to load supplier')
    } finally {
      setDetailLoading(false)
    }
  }

  const openPay = () => {
    if (!detail) return
    setPayForm({ amount: Math.max(0, detail.payable), method: 'CASH', purchaseId: '', notes: '' })
    setPayOpen(true)
  }

  const submitPay = async () => {
    if (!detail) return
    if (payForm.amount <= 0) { toast.error('Enter a valid amount'); return }
    setPaySubmitting(true)
    try {
      const r = await fetch('/api/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: detail.id,
          amount: payForm.amount,
          method: payForm.method,
          purchaseId: payForm.purchaseId || undefined,
          notes: payForm.notes || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Payment failed')
      toast.success(`Payment of ${formatPKR(payForm.amount)} recorded`)
      setPayOpen(false)
      await load()
      // refresh detail
      const dr = await fetch(`/api/suppliers/${detail.id}`)
      const dd = await dr.json()
      setDetail(dd.supplier)
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
      const r = await fetch(`/api/suppliers/${deleteTarget.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      toast.success('Supplier deleted')
      setDeleteTarget(null)
      await load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage suppliers, purchases & payables"
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 w-56"
              />
            </div>
            {canEdit && (
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add Supplier
              </Button>
            )}
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Suppliers" value={totals.count} icon={Truck} tone="info" hint="Active suppliers" />
        <StatCard label="Total Purchases" value={formatCompactPKR(totals.purchases)} icon={Receipt} tone="default" hint={`All-time • ${formatPKR(totals.purchases)}`} />
        <StatCard label="Total Paid" value={formatCompactPKR(totals.paid)} icon={Wallet} tone="success" hint={`To suppliers • ${formatPKR(totals.paid)}`} />
        <StatCard label="Total Payable" value={formatCompactPKR(totals.payable)} icon={Building2} tone="danger" hint={`Outstanding • ${formatPKR(totals.payable)}`} />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No suppliers found"
              description={search ? 'Try a different search term.' : 'Add your first supplier to get started.'}
              action={canEdit ? <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Supplier</Button> : undefined}
            />
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">Email</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.name}</div>
                        {s.company && <div className="text-xs text-muted-foreground">{s.company}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{s.phone || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{s.email || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm" title={formatPKR(s.openingBalance)}>{formatCompactPKR(s.openingBalance)}</TableCell>
                      <TableCell className="text-right font-mono text-sm" title={formatPKR(s.totalPurchases)}>{formatCompactPKR(s.totalPurchases)}</TableCell>
                      <TableCell className={cn('text-right font-mono text-sm', s.totalPaid > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} title={formatPKR(s.totalPaid)}>
                        {formatCompactPKR(s.totalPaid)}
                      </TableCell>
                      <TableCell className={cn('text-right font-mono text-sm font-semibold', s.payable > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} title={formatPKR(s.payable)}>
                        {formatCompactPKR(s.payable)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(s)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(s)} title="Delete">
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
            <DialogTitle>{editing ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Supplier name" />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company (optional)" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="03xx-xxxxxxx" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} placeholder="Full address" />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance (PKR)</Label>
              <Input type="number" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: Number(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground">Positive = we owe supplier</p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Add Supplier'}
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
                <Building2 className="h-5 w-5 text-primary" />
                {detail?.name || 'Supplier'}
                {detail?.company && <span className="text-sm font-normal text-muted-foreground">— {detail.company}</span>}
              </span>
              {detail && detail.payable > 0 && (
                <Badge variant="destructive" className="font-mono">
                  Payable: {formatPKR(detail.payable)}
                </Badge>
              )}
              {detail && detail.payable <= 0 && (
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div>{detail.phone || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="truncate">{detail.email || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Address</div>
                    <div className="truncate">{detail.address || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Wallet className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Opening Balance</div>
                    <div className="font-mono">{formatPKR(detail.openingBalance)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 my-2">
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Purchases</div>
                  <div className="font-mono font-semibold">{formatPKR(detail.totalPurchases)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{formatPKR(detail.totalPaid)}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-xs text-muted-foreground">Payable</div>
                  <div className={cn('font-mono font-semibold', detail.payable > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                    {formatPKR(detail.payable)}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="purchases" className="mt-2">
                <TabsList>
                  <TabsTrigger value="purchases">Purchases ({detail.purchases?.length || 0})</TabsTrigger>
                  <TabsTrigger value="payments">Payments ({detail.payments?.length || 0})</TabsTrigger>
                  <TabsTrigger value="returns">Returns ({detail.purchaseReturns?.length || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="purchases">
                  <div className="max-h-[320px] overflow-y-auto scroll-area rounded-md border">
                    {(!detail.purchases || detail.purchases.length === 0) ? (
                      <EmptyState icon={Receipt} title="No purchases yet" />
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
                          {detail.purchases.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-mono text-sm">{p.invoiceNumber}</TableCell>
                              <TableCell className="text-sm">{formatDate(p.invoiceDate || p.createdAt)}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{formatPKR(p.total)}</TableCell>
                              <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">{formatPKR(p.paidAmount)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={p.status === 'PAID' ? 'secondary' : p.status === 'PARTIAL' ? 'outline' : 'destructive'} className="text-xs">
                                  {p.status}
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

                <TabsContent value="returns">
                  <div className="max-h-[320px] overflow-y-auto scroll-area rounded-md border">
                    {(!detail.purchaseReturns || detail.purchaseReturns.length === 0) ? (
                      <EmptyState icon={ArrowDownToLine} title="No purchase returns" />
                    ) : (
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Return #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.purchaseReturns.map((r: any) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-sm">{r.returnNumber}</TableCell>
                              <TableCell className="text-sm">{formatDate(r.createdAt)}</TableCell>
                              <TableCell className="font-mono text-sm">{formatPKR(r.total)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{r.reason || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
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
              Record Supplier Payment
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground">Supplier</div>
                <div className="font-medium">{detail.name}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">Outstanding Payable</span>
                  <span className="font-mono font-semibold text-red-600 dark:text-red-400">{formatPKR(detail.payable)}</span>
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
              {detail.purchases && detail.purchases.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Apply to Purchase (optional)</Label>
                  <Select value={payForm.purchaseId} onValueChange={v => setPayForm({ ...payForm, purchaseId: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Unapplied" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Unapplied —</SelectItem>
                      {detail.purchases.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.invoiceNumber} — {formatPKR(p.total - p.paidAmount)} due
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
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. All related purchases, payments, and returns will also be removed. This cannot be undone.
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
