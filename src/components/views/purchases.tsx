'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader, StatCard, formatPKR, formatCompactPKR, formatDate, formatDateTime, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import {
  Truck, Plus, Search, Eye, Wallet, Trash2, Loader2, CheckCircle2,
  Banknote, Building2, Smartphone, CreditCard, CalendarDays, FileText,
  RotateCcw, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'

// ============================================================================
// Types
// ============================================================================
interface PurchaseItem {
  id: string
  medicineId: string
  medicine?: { id: string; name: string }
  batchNumber: string
  expiryDate: string
  quantity: number
  freeQuantity: number
  purchasePrice: number
  salePrice: number
  mrpPerUnit: number
  discount: number
  total: number
  scheme?: string | null
}

interface Purchase {
  id: string
  invoiceNumber: string
  supplierId: string
  supplier?: { id: string; name: string }
  userId: string
  user?: { id: string; name: string }
  invoiceDate: string
  subtotal: number
  discount: number
  total: number
  paidAmount: number
  status: string // PAID | PARTIAL | UNPAID
  items: PurchaseItem[]
  returns?: any[]
}

interface Supplier {
  id: string
  name: string
  company?: string | null
  phone?: string | null
  payable: number
  totalPurchases: number
  totalPaid: number
}

interface Medicine {
  id: string
  name: string
  genericName?: string | null
  manufacturer?: string | null
  unitType: string
  purchasePrice: number
  retailPrice: number
  stock: number
}

interface NewItemRow {
  key: string
  medicineId: string
  medicineName: string
  batchNumber: string
  expiryDate: string
  quantity: number
  freeQuantity: number
  purchasePrice: number
  salePrice: number
  mrpPerUnit: number
  discount: number
  scheme: string
}

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'BANK', label: 'Bank', icon: Building2 },
  { id: 'EASYPAISA', label: 'Easypaisa', icon: Smartphone },
  { id: 'JAZZCASH', label: 'JazzCash', icon: Smartphone },
  { id: 'OTHER', label: 'Other', icon: CreditCard },
]

let rowKeySeq = 0
const newRowKey = () => `row-${++rowKeySeq}`

function blankRow(meds: Medicine[]): NewItemRow {
  const m = meds[0]
  return {
    key: newRowKey(),
    medicineId: m?.id ?? '',
    medicineName: m?.name ?? '',
    batchNumber: '',
    expiryDate: '',
    quantity: 1,
    freeQuantity: 0,
    purchasePrice: m?.purchasePrice ?? 0,
    salePrice: m?.retailPrice ?? 0,
    mrpPerUnit: m?.retailPrice ?? 0,
    discount: 0,
    scheme: '',
  }
}

function rowTotal(r: NewItemRow): number {
  return Math.max(0, (Number(r.quantity) || 0) * (Number(r.purchasePrice) || 0) - (Number(r.discount) || 0))
}

function effectiveCost(r: NewItemRow): number {
  const tot = (Number(r.quantity) || 0) + (Number(r.freeQuantity) || 0)
  if (tot <= 0) return 0
  return rowTotal(r) / tot
}

function statusBadge(status: string) {
  const s = (status || '').toUpperCase()
  if (s === 'PAID') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">PAID</Badge>
  if (s === 'PARTIAL') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-900">PARTIAL</Badge>
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-900">UNPAID</Badge>
}

// ============================================================================
// Medicine Combobox (searchable)
// ============================================================================
function MedicineCombobox({
  medicines, value, onSelect,
}: { medicines: Medicine[]; value: string; onSelect: (m: Medicine) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = medicines.find(m => m.id === value)

  const filtered = useMemo(() => {
    if (!search) return medicines.slice(0, 80)
    const q = search.toLowerCase()
    return medicines.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.genericName || '').toLowerCase().includes(q) ||
      (m.manufacturer || '').toLowerCase().includes(q)
    ).slice(0, 80)
  }, [medicines, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 text-xs justify-between w-full font-normal"
        >
          <span className="truncate text-left">
            {selected ? selected.name : <span className="text-muted-foreground">Select medicine…</span>}
          </span>
          <Search className="h-3 w-3 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search medicine…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No medicine found.</CommandEmpty>
            <CommandGroup>
              {filtered.map(m => (
                <CommandItem
                  key={m.id}
                  value={`${m.name} ${m.genericName || ''} ${m.manufacturer || ''}`}
                  onSelect={() => { onSelect(m); setOpen(false); setSearch('') }}
                  className="text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{m.name}</span>
                    {(m.genericName || m.manufacturer) && (
                      <span className="text-[10px] text-muted-foreground">
                        {m.genericName}{m.genericName && m.manufacturer ? ' • ' : ''}{m.manufacturer}
                      </span>
                    )}
                  </div>
                  {m.id === value && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Main View
// ============================================================================
export function PurchasesView() {
  const { hasPermission } = useAuth()
  const { navigate } = useNav()
  const canEdit = hasPermission('purchases.edit')

  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])

  const [q, setQ] = useState('')
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [newOpen, setNewOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Purchase | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [payForPurchase, setPayForPurchase] = useState<Purchase | null>(null)

  // new purchase form state
  const [npSupplier, setNpSupplier] = useState('')
  const [npInvoice, setNpInvoice] = useState('')
  const [npDate, setNpDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [npItems, setNpItems] = useState<NewItemRow[]>([])
  const [npDiscount, setNpDiscount] = useState(0)
  const [npPaid, setNpPaid] = useState(0)
  const [npSaving, setNpSaving] = useState(false)

  // payment dialog state
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payNotes, setPayNotes] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, m] = await Promise.all([
        fetch('/api/purchases').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/medicines').then(r => r.json()),
      ])
      setPurchases(p.purchases || [])
      setSuppliers(s.suppliers || [])
      setMedicines(m.items || [])
    } catch (e) {
      toast.error('Failed to load purchases data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // re-filter purchases locally (search already done on backend for `q` + supplier)
  const visiblePurchases = useMemo(() => {
    let list = purchases
    if (supplierFilter !== 'ALL') list = list.filter(p => p.supplierId === supplierFilter)
    if (q) {
      const qq = q.toLowerCase()
      list = list.filter(p =>
        (p.invoiceNumber || '').toLowerCase().includes(qq) ||
        (p.supplier?.name || '').toLowerCase().includes(qq)
      )
    }
    if (fromDate) list = list.filter(p => new Date(p.invoiceDate) >= new Date(fromDate))
    if (toDate) list = list.filter(p => new Date(p.invoiceDate) <= new Date(toDate + 'T23:59:59.999'))
    return list
  }, [purchases, supplierFilter, q, fromDate, toDate])

  // Summary cards
  const summary = useMemo(() => {
    const now = new Date()
    const todayStr = now.toDateString()
    const month = now.getMonth()
    const year = now.getFullYear()
    let today = 0, thisMonth = 0, unpaid = 0
    for (const p of purchases) {
      const d = new Date(p.invoiceDate)
      if (d.toDateString() === todayStr) today += p.total
      if (d.getMonth() === month && d.getFullYear() === year) thisMonth += p.total
      if (p.status !== 'PAID') unpaid += Math.max(0, p.total - p.paidAmount)
    }
    const supplierPayable = suppliers.reduce((s, x) => s + (x.payable || 0), 0)
    return { today, thisMonth, unpaid, supplierPayable }
  }, [purchases, suppliers])

  // New purchase helpers
  const openNew = () => {
    setNpSupplier(suppliers[0]?.id ?? '')
    setNpInvoice('')
    setNpDate(new Date().toISOString().slice(0, 10))
    setNpItems([blankRow(medicines)])
    setNpDiscount(0)
    setNpPaid(0)
    setNewOpen(true)
  }

  const npSubtotal = useMemo(() => npItems.reduce((s, r) => s + rowTotal(r), 0), [npItems])
  const npGrandTotal = useMemo(() => Math.max(0, npSubtotal - (Number(npDiscount) || 0)), [npSubtotal, npDiscount])

  const updateRow = (key: string, patch: Partial<NewItemRow>) => {
    setNpItems(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r))
  }

  const addRow = () => setNpItems(prev => [...prev, blankRow(medicines)])
  const removeRow = (key: string) => setNpItems(prev => prev.length === 1 ? prev : prev.filter(r => r.key !== key))

  const handleSelectMedicine = (key: string, m: Medicine) => {
    updateRow(key, {
      medicineId: m.id, medicineName: m.name,
      purchasePrice: m.purchasePrice || 0,
      salePrice: m.retailPrice || 0,
      mrpPerUnit: m.retailPrice || 0,
    })
  }

  const saveNewPurchase = async () => {
    if (!npSupplier) { toast.error('Please select a supplier'); return }
    const validRows = npItems.filter(r => r.medicineId && r.quantity > 0)
    if (validRows.length === 0) { toast.error('Add at least one item with quantity > 0'); return }
    for (const r of validRows) {
      if (!r.batchNumber) { toast.error('Batch # is required for all items'); return }
      if (!r.expiryDate) { toast.error('Expiry date is required for all items'); return }
    }
    setNpSaving(true)
    try {
      const body = {
        supplierId: npSupplier,
        invoiceNumber: npInvoice || undefined,
        invoiceDate: npDate || undefined,
        items: validRows.map(r => ({
          medicineId: r.medicineId,
          batchNumber: r.batchNumber,
          expiryDate: r.expiryDate,
          quantity: Number(r.quantity) || 0,
          freeQuantity: Number(r.freeQuantity) || 0,
          purchasePrice: Number(r.purchasePrice) || 0,
          salePrice: Number(r.salePrice) || 0,
          mrpPerUnit: Number(r.mrpPerUnit) || 0,
          discount: Number(r.discount) || 0,
          scheme: r.scheme || undefined,
        })),
        paidAmount: Number(npPaid) || 0,
        discount: Number(npDiscount) || 0,
      }
      const r = await fetch('/api/purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to save purchase')
      toast.success(`Purchase ${d.purchase?.invoiceNumber || ''} saved — stock updated`)
      setNewOpen(false)
      await fetchAll()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save purchase')
    } finally {
      setNpSaving(false)
    }
  }

  // Detail dialog
  const openDetail = async (id: string) => {
    setDetailId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/purchases/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load purchase')
      setDetail(d.purchase)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load purchase')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // Payment dialog
  const openPay = (p: Purchase) => {
    setPayForPurchase(p)
    setPayAmount(Math.max(0, p.total - p.paidAmount))
    setPayMethod('CASH')
    setPayNotes('')
  }

  const savePayment = async () => {
    if (!payForPurchase) return
    if (payAmount <= 0) { toast.error('Amount must be greater than 0'); return }
    setPaySaving(true)
    try {
      const r = await fetch('/api/supplier-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: payForPurchase.supplierId,
          amount: Number(payAmount),
          method: payMethod,
          purchaseId: payForPurchase.id,
          notes: payNotes || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to record payment')
      toast.success(`Payment of ${formatPKR(payAmount)} recorded`)
      setPayForPurchase(null)
      // refresh purchases + reopen detail if open
      await fetchAll()
      if (detailId) await openDetail(detailId)
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment')
    } finally {
      setPaySaving(false)
    }
  }

  // Reusable action handlers
  const handleReturnItems = (p: Purchase) => {
    setDetailId(null)
    setDetail(null)
    navigate('purchase-returns', { purchaseId: p.id })
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Purchases" subtitle="Manage supplier purchase invoices & inventory intake" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Manage supplier purchase invoices & inventory intake"
        actions={
          canEdit ? (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> New Purchase
            </Button>
          ) : undefined
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Today's Purchases" value={formatCompactPKR(summary.today)} icon={Truck} tone="info" hint={`From suppliers today • ${formatPKR(summary.today)}`} />
        <StatCard label="This Month" value={formatCompactPKR(summary.thisMonth)} icon={CalendarDays} tone="success" hint={`Current month • ${formatPKR(summary.thisMonth)}`} />
        <StatCard label="Total Unpaid" value={formatCompactPKR(summary.unpaid)} icon={Wallet} tone="warning" hint={`Unpaid balance • ${formatPKR(summary.unpaid)}`} />
        <StatCard label="Supplier Payable" value={formatCompactPKR(summary.supplierPayable)} icon={Building2} tone="danger" hint={`Total owed • ${formatPKR(summary.supplierPayable)}`} />
      </div>

      {/* Toolbar */}
      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice # or supplier…"
                value={q}
                onChange={e => setQ(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="min-w-[180px]">
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All suppliers</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground block mb-1">From</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground block mb-1">To</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9" />
            </div>
            {(q || supplierFilter !== 'ALL' || fromDate || toDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setQ(''); setSupplierFilter('ALL'); setFromDate(''); setToDate('') }}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Purchases table */}
      <Card>
        <CardContent className="p-0">
          {visiblePurchases.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No purchases found"
              description="Try adjusting filters or create a new purchase invoice."
              action={canEdit ? <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Purchase</Button> : undefined}
            />
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-y-auto scroll-area">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Disc.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiblePurchases.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{formatDate(p.invoiceDate)}</TableCell>
                      <TableCell className="font-mono text-xs font-medium">{p.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{p.supplier?.name || '—'}</TableCell>
                      <TableCell className="text-right text-sm">{p.items?.length || 0}</TableCell>
                      <TableCell className="text-right font-mono text-xs" title={formatPKR(p.subtotal)}>{formatCompactPKR(p.subtotal)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-amber-600" title={p.discount > 0 ? formatPKR(p.discount) : ''}>{p.discount > 0 ? `-${formatCompactPKR(p.discount)}` : '-'}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold" title={formatPKR(p.total)}>{formatCompactPKR(p.total)}</TableCell>
                      <TableCell className="text-right font-mono text-xs" title={formatPKR(p.paidAmount)}>{formatCompactPKR(p.paidAmount)}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(p.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && p.status !== 'PAID' && (
                            <Button size="sm" variant="outline" onClick={() => openPay(p)}>
                              <Wallet className="h-3.5 w-3.5 mr-1" /> Pay
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

      {/* ====================== New Purchase Dialog ====================== */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> New Purchase Invoice
            </DialogTitle>
          </DialogHeader>

          {/* Header row: supplier / invoice # / date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Supplier *</Label>
              <Select value={npSupplier} onValueChange={setNpSupplier}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Invoice # (auto if blank)</Label>
              <Input
                value={npInvoice}
                onChange={e => setNpInvoice(e.target.value)}
                placeholder="Auto-generated"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Invoice Date</Label>
              <Input
                type="date"
                value={npDate}
                onChange={e => setNpDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Separator />

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Items</Label>
              <Button size="sm" variant="outline" onClick={addRow} type="button">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Row
              </Button>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[200px]">Medicine</TableHead>
                    <TableHead className="min-w-[100px]">Batch #</TableHead>
                    <TableHead className="min-w-[120px]">Expiry</TableHead>
                    <TableHead className="w-16 text-right">Qty</TableHead>
                    <TableHead className="w-16 text-right">Free</TableHead>
                    <TableHead className="w-20 text-right">P. Price</TableHead>
                    <TableHead className="w-20 text-right">S. Price</TableHead>
                    <TableHead className="w-20 text-right">MRP</TableHead>
                    <TableHead className="w-20">Scheme</TableHead>
                    <TableHead className="w-16 text-right">Disc</TableHead>
                    <TableHead className="w-20 text-right">Total</TableHead>
                    <TableHead className="w-16 text-right">Eff. Cost</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {npItems.map(r => (
                    <TableRow key={r.key}>
                      <TableCell>
                        <MedicineCombobox
                          medicines={medicines}
                          value={r.medicineId}
                          onSelect={m => handleSelectMedicine(r.key, m)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.batchNumber}
                          onChange={e => updateRow(r.key, { batchNumber: e.target.value })}
                          className="h-8 text-xs w-[100px]"
                          placeholder="BATCH-01"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={r.expiryDate}
                          onChange={e => updateRow(r.key, { expiryDate: e.target.value })}
                          className="h-8 text-xs w-[120px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.quantity}
                          onChange={e => updateRow(r.key, { quantity: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-16 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.freeQuantity}
                          onChange={e => updateRow(r.key, { freeQuantity: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-16 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.purchasePrice}
                          onChange={e => updateRow(r.key, { purchasePrice: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-20 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.salePrice}
                          onChange={e => updateRow(r.key, { salePrice: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-20 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.mrpPerUnit}
                          onChange={e => updateRow(r.key, { mrpPerUnit: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-20 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.scheme}
                          onChange={e => updateRow(r.key, { scheme: e.target.value })}
                          className="h-8 text-xs w-20"
                          placeholder="10+1"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={r.discount}
                          onChange={e => updateRow(r.key, { discount: Number(e.target.value) || 0 })}
                          className="h-8 text-xs w-16 text-right"
                          min={0}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatPKR(rowTotal(r))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                        {effectiveCost(r) > 0 ? formatPKR(effectiveCost(r)) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeRow(r.key)}
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Separator />

          {/* Footer totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono font-semibold">{formatPKR(npSubtotal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Discount</Label>
                <Input
                  type="number"
                  value={npDiscount}
                  onChange={e => setNpDiscount(Number(e.target.value) || 0)}
                  className="h-8 flex-1"
                  min={0}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Paid Amount</Label>
                <Input
                  type="number"
                  value={npPaid}
                  onChange={e => setNpPaid(Number(e.target.value) || 0)}
                  className="h-8 flex-1"
                  min={0}
                />
              </div>
            </div>
            <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span className="font-mono">{formatPKR(npSubtotal)}</span>
              </div>
              <div className="flex justify-between text-amber-600">
                <span>Discount</span><span className="font-mono">- {formatPKR(Number(npDiscount) || 0)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>GRAND TOTAL</span>
                <span className="font-mono text-primary">{formatPKR(npGrandTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Paid</span><span className="font-mono">{formatPKR(Number(npPaid) || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={npGrandTotal - (Number(npPaid) || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                  {npGrandTotal - (Number(npPaid) || 0) > 0 ? 'Balance' : 'Change'}
                </span>
                <span className="font-mono">{formatPKR(Math.abs(npGrandTotal - (Number(npPaid) || 0)))}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={saveNewPurchase} disabled={npSaving}>
              {npSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Save Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ====================== Purchase Detail Dialog ====================== */}
      <Dialog open={!!detailId} onOpenChange={o => { if (!o) { setDetailId(null); setDetail(null) } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Purchase Detail
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Header info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-md text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Invoice #</div>
                  <div className="font-mono font-semibold">{detail.invoiceNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Supplier</div>
                  <div className="font-medium">{detail.supplier?.name || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Invoice Date</div>
                  <div>{formatDateTime(detail.invoiceDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>{statusBadge(detail.status)}</div>
                </div>
              </div>

              {/* Items */}
              <div>
                <Label className="text-xs mb-2 block">Items ({detail.items?.length || 0})</Label>
                <div className="border rounded-md overflow-x-auto max-h-[280px] overflow-y-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Free</TableHead>
                        <TableHead className="text-right">P. Price</TableHead>
                        <TableHead className="text-right">Disc</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detail.items || []).map(it => (
                        <TableRow key={it.id}>
                          <TableCell className="text-xs">
                            <div className="font-medium">{it.medicine?.name || '—'}</div>
                            {it.scheme && <div className="text-[10px] text-muted-foreground">Scheme: {it.scheme}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{it.batchNumber}</TableCell>
                          <TableCell className="text-xs">{formatDate(it.expiryDate)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{it.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600">{it.freeQuantity}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatPKR(it.purchasePrice)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{it.discount > 0 ? formatPKR(it.discount) : '-'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(it.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatPKR(detail.subtotal)}</span></div>
                  <div className="flex justify-between text-amber-600"><span>Discount</span><span className="font-mono">- {formatPKR(detail.discount)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base"><span>Total</span><span className="font-mono text-primary">{formatPKR(detail.total)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-mono">{formatPKR(detail.paidAmount)}</span></div>
                  <div className="flex justify-between">
                    <span className={detail.total - detail.paidAmount > 0 ? 'text-red-600' : 'text-emerald-600'}>Balance</span>
                    <span className="font-mono">{formatPKR(Math.max(0, detail.total - detail.paidAmount))}</span>
                  </div>
                </div>

                {/* Returns */}
                <div className="space-y-2">
                  <Label className="text-xs">Returns ({detail.returns?.length || 0})</Label>
                  {detail.returns && detail.returns.length > 0 ? (
                    <div className="border rounded-md divide-y max-h-[140px] overflow-y-auto scroll-area">
                      {detail.returns.map((rt: any) => (
                        <div key={rt.id} className="p-2 text-xs flex items-center justify-between">
                          <div>
                            <div className="font-mono font-medium">{rt.returnNumber}</div>
                            <div className="text-muted-foreground">
                              {formatDate(rt.createdAt)} • {rt.reason || 'No reason'} {rt.restoreStock && '• Stock restored'}
                            </div>
                          </div>
                          <Badge variant="secondary" className="font-mono">{formatPKR(rt.total)}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground p-3 border rounded-md">No returns for this purchase.</div>
                  )}
                </div>
              </div>

              {/* Footer actions */}
              <DialogFooter className="flex-wrap">
                {hasPermission('purchases.return') && (
                  <Button variant="outline" onClick={() => handleReturnItems(detail)} className="mr-auto">
                    <RotateCcw className="h-4 w-4 mr-2" /> Return Items
                  </Button>
                )}
                <DialogClose asChild><Button variant="ghost">Close</Button></DialogClose>
                {canEdit && detail.status !== 'PAID' && (
                  <Button onClick={() => openPay(detail)}>
                    <Wallet className="h-4 w-4 mr-2" /> Record Payment
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mr-2" /> Failed to load purchase.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ====================== Record Payment Dialog ====================== */}
      <Dialog open={!!payForPurchase} onOpenChange={o => { if (!o) setPayForPurchase(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> Record Supplier Payment
            </DialogTitle>
          </DialogHeader>
          {payForPurchase && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/40 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice</span>
                  <span className="font-mono font-medium">{payForPurchase.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier</span>
                  <span>{payForPurchase.supplier?.name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total / Paid</span>
                  <span className="font-mono">{formatPKR(payForPurchase.total)} / {formatPKR(payForPurchase.paidAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Balance Due</span>
                  <span className="font-mono text-red-600">{formatPKR(Math.max(0, payForPurchase.total - payForPurchase.paidAmount))}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Amount (PKR) *</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(Number(e.target.value) || 0)}
                  min={0}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Method</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex items-center gap-2"><m.icon className="h-3.5 w-3.5" />{m.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Notes</Label>
                <Input
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="Optional reference / cheque #"
                  className="h-9"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={savePayment} disabled={paySaving}>
              {paySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
