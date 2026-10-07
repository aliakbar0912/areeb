'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { PageHeader, formatPKR, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  Trash2, Plus, Minus, Search, ShoppingCart, Printer, Receipt,
  X, Banknote, CreditCard, Building2, Smartphone, Package, CheckCircle2, Loader2, Pill, AlertCircle, Award, Scan,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface CartItem {
  medicineId: string
  name: string
  unitType: string
  unitFactor: number  // multiplier: box=packSizeBox, strip=packSizeStrip, tablet=1
  unitLabel: string   // BOX | STRIP | TABLET | PIECE | BOTTLE
  unitPrice: number   // price per selected unit
  quantity: number    // in selected units
  batchId?: string
  discount: number
}

interface MedicineRow {
  id: string
  name: string
  genericName?: string
  manufacturer?: string
  retailPrice: number
  stripPrice: number
  boxPrice: number
  unitType: string
  stock: number
  prescriptionRequired: boolean
  batches: any[]
}

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: Banknote },
  { id: 'BANK', label: 'Bank', icon: Building2 },
  { id: 'EASYPAISA', label: 'Easypaisa', icon: Smartphone },
  { id: 'JAZZCASH', label: 'JazzCash', icon: Smartphone },
  { id: 'OTHER', label: 'Other', icon: CreditCard },
]

export function PosView() {
  const { user, hasPermission } = useAuth()
  const { navigate } = useNav()
  const [search, setSearch] = useState('')
  const [medicines, setMedicines] = useState<MedicineRow[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('walkin')
  const [discount, setDiscount] = useState(0)
  const [discountType, setDiscountType] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT')
  const [taxRate, setTaxRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loyaltyInfo, setLoyaltyInfo] = useState<{ currentPoints: number; maxRedeemable: number; maxDiscount: number; minRedeemPoints: number; canRedeem: boolean } | null>(null)
  const [loyaltyRedeemPts, setLoyaltyRedeemPts] = useState(0)
  const [loyaltyApplied, setLoyaltyApplied] = useState<{ points: number; discount: number } | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paidAmount, setPaidAmount] = useState(0)
  const [multiPayments, setMultiPayments] = useState<{ method: string; amount: number }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAddCategories, setQuickAddCategories] = useState<any[]>([])
  const [quickAddCreated, setQuickAddCreated] = useState<any>(null) // stores created medicine for "Add Batch" follow-up
  const [addBatchOpen, setAddBatchOpen] = useState(false)
  const [addBatchSaving, setAddBatchSaving] = useState(false)
  const [addBatchForm, setAddBatchForm] = useState({
    batchNumber: '', expiryDate: '', quantity: 0,
    purchasePrice: 0, salePrice: 0, packSizeBox: 1, packSizeStrip: 1,
  })
  const [quickAddForm, setQuickAddForm] = useState({
    name: '', genericName: '', manufacturer: '', unitType: 'TABLET',
    categoryId: '', purchasePrice: 0, retailPrice: 0, stripPrice: 0, boxPrice: 0,
    barcode: '', prescriptionRequired: false, minStock: 10, maxStock: 100,
  })
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/medicines').then(r => r.json()),
      fetch('/api/customers').then(r => r.json()),
      fetch('/api/sales?limit=5').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/loyalty').then(r => r.json()).catch(() => ({ customers: [] })),
    ]).then(([m, c, s, cat, loyalty]) => {
      // For each medicine, fetch batches
      const meds = m.items || []
      setMedicines(meds)
      // Merge loyalty points into customers
      const loyaltyMap: Record<string, any> = {}
      for (const lc of (loyalty.customers || [])) {
        loyaltyMap[lc.id] = lc
      }
      const enrichedCustomers = (c.customers || []).map((cust: any) => ({
        ...cust,
        loyaltyPoints: loyaltyMap[cust.id]?.points || 0,
        loyaltyTier: loyaltyMap[cust.id]?.tier || { name: 'None', color: '' },
      }))
      setCustomers([{ id: 'walkin', name: 'Walk-in Customer', phone: '' }, ...enrichedCustomers])
      setRecentSales(s.sales || [])
      setQuickAddCategories(cat.categories || [])
      setLoading(false)
      // fetch settings tax
      fetch('/api/settings').then(r => r.json()).then(d => {
        const taxEnabled = d.settings['invoice.taxEnabled'] === 'true'
        const rate = parseFloat(d.settings['invoice.taxRate'] || '0')
        if (taxEnabled) setTaxRate(rate)
      })
    })
  }, [])

  // focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  // Fetch loyalty info when customer changes
  useEffect(() => {
    setLoyaltyInfo(null)
    setLoyaltyRedeemPts(0)
    setLoyaltyApplied(null)
    if (selectedCustomer === 'walkin') return
    let active = true
    fetch(`/api/loyalty/redeem?customerId=${selectedCustomer}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setLoyaltyInfo(d) })
      .catch(() => {})
    return () => { active = false }
  }, [selectedCustomer])

  // keyboard shortcut: F2 to focus search, F9 to checkout
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select() }
      if (e.key === 'F9' && cart.length > 0) { e.preventDefault(); openPay() }
      if (e.key === 'Escape') { setPayOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart])

  const filtered = useMemo(() => {
    if (!search) return medicines.filter(m => m.stock > 0).slice(0, 50)
    const q = search.toLowerCase()
    return medicines.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.genericName || '').toLowerCase().includes(q) ||
      (m.manufacturer || '').toLowerCase().includes(q)
    ).slice(0, 50)
  }, [medicines, search])

  const addToCart = useCallback((med: MedicineRow) => {
    // pick unitType based on medicine
    const hasStrips = med.unitType === 'TABLET' || med.unitType === 'CAPSULE'
    const unitLabel = hasStrips ? 'STRIP' : med.unitType
    const unitFactor = hasStrips ? 10 : 1  // assume strip=10 for simplicity; real factor from batch
    const unitPrice = hasStrips ? med.stripPrice : med.retailPrice

    setCart(prev => {
      const existing = prev.find(c => c.medicineId === med.id && c.unitLabel === unitLabel)
      if (existing) {
        return prev.map(c => c === existing ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        medicineId: med.id,
        name: med.name,
        unitType: med.unitType,
        unitFactor,
        unitLabel,
        unitPrice,
        quantity: 1,
        discount: 0,
      }]
    })
    setSearch('')
    searchRef.current?.focus()
  }, [])

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => prev.map((c, i) =>
      i === idx ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c
    ))
  }
  const setQty = (idx: number, val: number) => {
    if (val < 1) val = 1
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: val } : c))
  }
  const removeFromCart = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0), [cart])
  const discountAmt = discountType === 'PERCENT' ? subtotal * (discount / 100) : discount
  const loyaltyDiscount = loyaltyApplied?.discount || 0
  const taxable = Math.max(0, subtotal - discountAmt - loyaltyDiscount)
  const tax = taxable * (taxRate / 100)
  const total = taxable + tax

  const openPay = () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    setPaidAmount(total)
    setMultiPayments([{ method: 'CASH', amount: total }])
    setPaymentMethod('CASH')
    setPayOpen(true)
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    let totalPaid = multiPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    if (selectedCustomer === 'walkin' && totalPaid < total) {
      toast.error('Walk-in customer cannot have credit. Pay full amount.')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        items: cart.map(c => ({
          medicineId: c.medicineId,
          batchId: c.batchId,
          unitType: c.unitLabel,
          unitFactor: c.unitFactor,
          unitPrice: c.unitPrice,
          quantity: c.quantity * c.unitFactor,  // store in base units
          discount: c.discount,
        })),
        customerId: selectedCustomer === 'walkin' ? null : selectedCustomer,
        discount: discountAmt + loyaltyDiscount,
        discountType,
        taxRate,
        payments: multiPayments.filter(p => p.amount > 0),
      }
      const r = await fetch('/api/sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Checkout failed')
      setLastSale(d.sale)

      // Redeem loyalty points if applied
      let earnedPoints = 0
      if (loyaltyApplied && selectedCustomer !== 'walkin') {
        try {
          await fetch('/api/loyalty/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId: selectedCustomer,
              points: loyaltyApplied.points,
              saleId: d.sale.id,
            }),
          })
        } catch (e) {
          // redemption failure shouldn't block sale
          console.error('Loyalty redemption failed', e)
        }
      }

      // Calculate points earned on this sale (auto-earned via sales API)
      // Default: 1 pt per Rs 100 spent (auto-earned server-side)
      earnedPoints = Math.floor(d.sale.total / 100)

      setCart([])
      setDiscount(0)
      setLoyaltyApplied(null)
      setLoyaltyRedeemPts(0)
      setPayOpen(false)
      toast.success(`Sale ${d.sale.invoiceNumber} completed — ${formatPKR(d.sale.total)}`, {
        description: earnedPoints > 0 && selectedCustomer !== 'walkin'
          ? `+${earnedPoints} loyalty points earned`
          : undefined,
      })
      // refresh stock + recent sales
      const [m, s] = await Promise.all([
        fetch('/api/medicines').then(r => r.json()),
        fetch('/api/sales?limit=5').then(r => r.json()),
      ])
      setMedicines(m.items || [])
      setRecentSales(s.sales || [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const printInvoice = (saleId: string) => {
    window.open(`/api/invoices/print/${saleId}`, '_blank', 'width=420,height=600')
  }

  const openQuickAdd = () => {
    // prefill name from current search if it looks like a medicine name
    const q = search.trim()
    if (q && q.length >= 2 && !filtered.length) {
      setQuickAddForm(f => ({ ...f, name: q }))
    } else {
      setQuickAddForm(f => ({ ...f, name: '' }))
    }
    setQuickAddOpen(true)
  }

  const handleQuickAddSubmit = async () => {
    if (!quickAddForm.name.trim()) {
      toast.error('Medicine name is required')
      return
    }
    if (!quickAddForm.retailPrice || quickAddForm.retailPrice <= 0) {
      toast.error('Sale price (per unit) is required')
      return
    }
    setQuickAddSaving(true)
    try {
      const body = {
        ...quickAddForm,
        categoryId: quickAddForm.categoryId || null,
        purchasePrice: Number(quickAddForm.purchasePrice) || 0,
        retailPrice: Number(quickAddForm.retailPrice) || 0,
        stripPrice: Number(quickAddForm.stripPrice) || 0,
        boxPrice: Number(quickAddForm.boxPrice) || 0,
        minStock: Number(quickAddForm.minStock) || 0,
        maxStock: Number(quickAddForm.maxStock) || 0,
      }
      const r = await fetch('/api/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create medicine')
      // refresh medicines list
      const medsRes = await fetch('/api/medicines')
      if (medsRes.ok) {
        const medsData = await medsRes.json()
        setMedicines(medsData.items || [])
      }
      setQuickAddOpen(false)
      setQuickAddForm({
        name: '', genericName: '', manufacturer: '', unitType: 'TABLET',
        categoryId: '', purchasePrice: 0, retailPrice: 0, stripPrice: 0, boxPrice: 0,
        barcode: '', prescriptionRequired: false, minStock: 10, maxStock: 100,
      })
      // Show success dialog with Add Batch option
      setQuickAddCreated(d.medicine)
      // Pre-fill Add Batch form with sensible defaults from medicine
      const expiryDefault = new Date()
      expiryDefault.setFullYear(expiryDefault.getFullYear() + 1)
      setAddBatchForm({
        batchNumber: `B${d.medicine.name.slice(0, 3).toUpperCase()}-${new Date().getFullYear()}`,
        expiryDate: expiryDefault.toISOString().slice(0, 10),
        quantity: 0,
        purchasePrice: Number(quickAddForm.purchasePrice) || 0,
        salePrice: Number(quickAddForm.retailPrice) || 0,
        packSizeBox: d.medicine.unitType === 'TABLET' || d.medicine.unitType === 'CAPSULE' ? 100 : 1,
        packSizeStrip: d.medicine.unitType === 'TABLET' || d.medicine.unitType === 'CAPSULE' ? 10 : 1,
      })
      setSearch('')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setQuickAddSaving(false)
    }
  }

  const handleAddBatchSubmit = async () => {
    if (!quickAddCreated) return
    if (!addBatchForm.batchNumber.trim()) {
      toast.error('Batch number is required')
      return
    }
    if (!addBatchForm.expiryDate) {
      toast.error('Expiry date is required')
      return
    }
    if (!addBatchForm.quantity || addBatchForm.quantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }
    setAddBatchSaving(true)
    try {
      const r = await fetch(`/api/medicines/${quickAddCreated.id}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addBatchForm,
          purchasePrice: Number(addBatchForm.purchasePrice) || 0,
          salePrice: Number(addBatchForm.salePrice) || 0,
          quantity: Number(addBatchForm.quantity) || 0,
          packSizeBox: Number(addBatchForm.packSizeBox) || 1,
          packSizeStrip: Number(addBatchForm.packSizeStrip) || 1,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create batch')
      toast.success(`Batch "${d.batch.batchNumber}" added with ${addBatchForm.quantity} units`, {
        description: `${quickAddCreated.name} is now available for sale in POS.`,
      })
      setAddBatchOpen(false)
      setQuickAddCreated(null)
      // refresh medicines list
      const medsRes = await fetch('/api/medicines')
      if (medsRes.ok) {
        const medsData = await medsRes.json()
        setMedicines(medsData.items || [])
      }
      searchRef.current?.focus()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setAddBatchSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="POS / Billing" />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="POS / Billing"
        subtitle="Fast keyboard-friendly pharmacy checkout. Press F2 to search, F9 to checkout."
        actions={
          <>
            {hasPermission('inventory.edit') && (
              <Button variant="outline" size="sm" onClick={() => navigate('scan')} className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20">
                <Scan className="h-3.5 w-3.5 mr-1.5" /> Scan
              </Button>
            )}
            {hasPermission('inventory.edit') && (
              <Button variant="outline" size="sm" onClick={openQuickAdd}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Quick Add
              </Button>
            )}
            <Badge variant="outline" className="font-mono">{cart.length} items</Badge>
            <Badge variant="secondary" className="font-mono">Total: {formatPKR(total)}</Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Medicine search & list */}
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  placeholder="Search by name, generic, manufacturer or barcode…  [F2]"
                  className="pl-9 text-base h-11"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Available Medicines ({filtered.length})</span>
                <span className="text-xs text-muted-foreground font-normal">Click to add to cart</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-280px)] overflow-y-auto scroll-area">
                {filtered.length === 0 ? (
                  <EmptyState
                    icon={Package}
                    title={search ? `No medicines match "${search}"` : 'No medicines available'}
                    description={search ? 'Try a different search term, or quickly add this medicine to your inventory.' : 'Add your first medicine to start selling.'}
                    action={hasPermission('inventory.edit') ? (
                      <Button size="sm" onClick={openQuickAdd} className="bg-primary">
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Quick Add Medicine
                      </Button>
                    ) : undefined}
                  />
                ) : (
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Medicine</TableHead>
                        <TableHead className="hidden md:table-cell">Generic</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((m, i) => (
                        <TableRow
                          key={m.id}
                          onClick={() => addToCart(m)}
                          className={`cursor-pointer hover:bg-accent ${m.stock <= 0 ? 'opacity-50' : ''}`}
                        >
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.manufacturer}</div>
                            {m.prescriptionRequired && (
                              <Badge variant="destructive" className="text-[10px] mt-0.5">Rx</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{m.genericName || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <div>{formatPKR(m.retailPrice)}</div>
                            {(m.stripPrice > 0 || m.boxPrice > 0) && (
                              <div className="text-[10px] text-muted-foreground">
                                {m.stripPrice > 0 && `Strip: ${formatPKR(m.stripPrice)}`}
                                {m.stripPrice > 0 && m.boxPrice > 0 && ' • '}
                                {m.boxPrice > 0 && `Box: ${formatPKR(m.boxPrice)}`}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <Badge variant={m.stock <= 0 ? 'destructive' : m.stock <= 10 ? 'secondary' : 'outline'}>
                              {m.stock}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cart panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2 py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Cart</span>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cart.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="Cart is empty" description="Search and click a medicine to add it." />
              ) : (
                <ScrollArea className="max-h-[320px]">
                  <div className="divide-y">
                    {cart.map((c, idx) => (
                      <div key={idx} className="p-3 flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.unitLabel} × {c.quantity} @ {formatPKR(c.unitPrice)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number" value={c.quantity} onChange={e => setQty(idx, parseInt(e.target.value) || 1)}
                            className="w-14 h-7 text-center px-1"
                          />
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {cart.length > 0 && (
                <div className="border-t p-3 space-y-2">
                  {/* Customer */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">Customer</Label>
                    <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                      <SelectTrigger className="h-8 text-sm flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="flex items-center gap-1.5">
                              {c.name}{c.phone ? ` (${c.phone})` : ''}
                              {c.loyaltyPoints > 0 && c.loyaltyTier?.name && c.loyaltyTier.name !== 'None' && (
                                <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold ${c.loyaltyTier.color || ''}`}>
                                  <Award className="h-2.5 w-2.5" />
                                  {c.loyaltyTier.name} · {c.loyaltyPoints}pts
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Loyalty points display */}
                  {loyaltyInfo && selectedCustomer !== 'walkin' && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Award className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="text-purple-800 dark:text-purple-300 font-medium">
                          {loyaltyInfo.currentPoints.toLocaleString()} loyalty pts
                        </span>
                      </div>
                      {loyaltyApplied ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          -{loyaltyApplied.discount} applied
                        </span>
                      ) : loyaltyInfo.canRedeem ? (
                        <span className="text-purple-600 dark:text-purple-400">
                          Max Rs {loyaltyInfo.maxDiscount} redeemable
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Min {loyaltyInfo.minRedeemPoints} pts to redeem
                        </span>
                      )}
                    </div>
                  )}

                  {/* Discount */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">Discount</Label>
                    <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                      <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AMOUNT">Amount</SelectItem>
                        <SelectItem value="PERCENT">Percent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))}
                      className="h-8 flex-1" placeholder="0"
                    />
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span><span className="font-mono">{formatPKR(subtotal)}</span>
                    </div>
                    {discountAmt > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>Discount {discountType === 'PERCENT' ? `(${discount}%)` : ''}</span>
                        <span className="font-mono">- {formatPKR(discountAmt)}</span>
                      </div>
                    )}
                    {loyaltyDiscount > 0 && (
                      <div className="flex justify-between text-purple-600 dark:text-purple-400">
                        <span className="flex items-center gap-1">
                          <Award className="h-3 w-3" />
                          Loyalty ({loyaltyApplied?.points} pts)
                        </span>
                        <span className="font-mono">- {formatPKR(loyaltyDiscount)}</span>
                      </div>
                    )}
                    {tax > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tax ({taxRate}%)</span><span className="font-mono">+ {formatPKR(tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-1 border-t">
                      <span>TOTAL</span><span className="font-mono text-primary">{formatPKR(total)}</span>
                    </div>
                  </div>

                  <Button className="w-full" size="lg" onClick={openPay}>
                    <Receipt className="h-4 w-4 mr-2" /> Checkout [F9]
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent sales */}
          <Card>
            <CardHeader className="pb-2 py-3">
              <CardTitle className="text-sm">Recent Sales</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-[180px] overflow-y-auto scroll-area">
                {recentSales.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">No recent sales</div>
                )}
                {recentSales.map(s => (
                  <div key={s.id} className="p-2.5 flex items-center justify-between hover:bg-accent">
                    <div>
                      <div className="font-mono text-xs font-medium">{s.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.customer?.name || 'Walk-in'} • {formatPKR(s.total)}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => printInvoice(s.id)}>
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment — Total {formatPKR(total)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Loyalty redemption option */}
            {loyaltyInfo && selectedCustomer !== 'walkin' && loyaltyInfo.canRedeem && !loyaltyApplied && (
              <div className="rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">Redeem Loyalty Points</span>
                  </div>
                  <span className="text-xs text-purple-600 dark:text-purple-400">
                    {loyaltyInfo.currentPoints.toLocaleString()} pts available
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={loyaltyInfo.minRedeemPoints}
                    max={loyaltyInfo.maxRedeemable}
                    value={loyaltyRedeemPts || ''}
                    onChange={e => setLoyaltyRedeemPts(Number(e.target.value) || 0)}
                    placeholder={`Min ${loyaltyInfo.minRedeemPoints}`}
                    className="h-8 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-purple-600 hover:bg-purple-700 h-8"
                    onClick={async () => {
                      if (loyaltyRedeemPts < loyaltyInfo.minRedeemPoints) {
                        toast.error(`Minimum ${loyaltyInfo.minRedeemPoints} points required`)
                        return
                      }
                      if (loyaltyRedeemPts > loyaltyInfo.maxRedeemable) {
                        toast.error(`Cannot redeem more than ${loyaltyInfo.maxRedeemable} points`)
                        return
                      }
                      const redeemAmount = loyaltyRedeemPts * (loyaltyInfo.maxDiscount / loyaltyInfo.maxRedeemable)
                      setLoyaltyApplied({ points: loyaltyRedeemPts, discount: Math.round(redeemAmount) })
                      toast.success(`Applied ${loyaltyRedeemPts} points = Rs ${Math.round(redeemAmount)} discount`)
                    }}
                  >
                    Apply
                  </Button>
                </div>
                <div className="text-[10px] text-purple-600 dark:text-purple-400">
                  Worth Rs {loyaltyRedeemPts > 0 ? Math.round(loyaltyRedeemPts * (loyaltyInfo.maxDiscount / Math.max(1, loyaltyInfo.maxRedeemable))) : 0} discount
                </div>
              </div>
            )}
            {loyaltyApplied && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                    {loyaltyApplied.points} pts redeemed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                    - Rs {loyaltyApplied.discount}
                  </span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setLoyaltyApplied(null); setLoyaltyRedeemPts(0) }}>
                    Remove
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs mb-1.5 block">Payment Methods (multiple allowed)</Label>
              <div className="space-y-2">
                {multiPayments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={p.method} onValueChange={v => setMultiPayments(prev => prev.map((x, idx) => idx === i ? { ...x, method: v } : x))}>
                      <SelectTrigger className="w-36 h-9 text-sm">
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
                    <Input
                      type="number" value={p.amount}
                      onChange={e => setMultiPayments(prev => prev.map((x, idx) => idx === i ? { ...x, amount: Number(e.target.value) } : x))}
                      className="flex-1"
                      placeholder="Amount"
                    />
                    {multiPayments.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => setMultiPayments(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setMultiPayments(prev => [...prev, { method: 'CASH', amount: 0 }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add another payment
                </Button>
              </div>
            </div>

            {(() => {
              const totalPaid = multiPayments.reduce((s, p) => s + (p.amount || 0), 0)
              const change = totalPaid - total
              return (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-md bg-muted">
                    <div className="text-xs text-muted-foreground">Paid</div>
                    <div className="font-bold text-sm">{formatPKR(totalPaid)}</div>
                  </div>
                  <div className={`p-2 rounded-md ${change < 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-muted'}`}>
                    <div className="text-xs text-muted-foreground">{change < 0 ? 'Remaining' : 'Change'}</div>
                    <div className="font-bold text-sm">{formatPKR(Math.abs(change))}</div>
                  </div>
                  <div className="p-2 rounded-md bg-primary/10">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-bold text-sm">{formatPKR(total)}</div>
                  </div>
                </div>
              )
            })()}

            {selectedCustomer === 'walkin' && multiPayments.reduce((s, p) => s + (p.amount || 0), 0) < total && (
              <div className="text-xs p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
                Walk-in customers must pay full amount. Select a customer for credit sale.
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={handleCheckout} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirm Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last Sale Receipt Dialog */}
      <Dialog open={!!lastSale} onOpenChange={o => !o && setLastSale(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" /> Sale Completed
            </DialogTitle>
          </DialogHeader>
          {lastSale && (
            <div className="space-y-3">
              <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <div className="text-xs text-muted-foreground">Invoice Number</div>
                <div className="text-2xl font-bold font-mono">{lastSale.invoiceNumber}</div>
                <div className="mt-2 text-3xl font-bold text-primary">{formatPKR(lastSale.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Status: <Badge variant={lastSale.paymentStatus === 'PAID' ? 'default' : 'secondary'}>
                    {lastSale.paymentStatus}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => printInvoice(lastSale.id)}>
                  <Printer className="h-4 w-4 mr-2" /> Print Invoice
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setLastSale(null)}>
                  New Sale
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Add Medicine Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Pill className="h-4 w-4" />
              </div>
              Quick Add Medicine
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-2.5 text-xs text-sky-800 dark:text-sky-200">
              Creates a new medicine with basic info. You can add batches (stock) later via the Inventory view.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-name" className="text-xs">Medicine Name *</Label>
              <Input
                id="qa-name"
                value={quickAddForm.name}
                onChange={e => setQuickAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Panadol Extra"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-generic" className="text-xs">Generic / Salt</Label>
                <Input
                  id="qa-generic"
                  value={quickAddForm.genericName}
                  onChange={e => setQuickAddForm(f => ({ ...f, genericName: e.target.value }))}
                  placeholder="e.g. Paracetamol"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-mfr" className="text-xs">Manufacturer</Label>
                <Input
                  id="qa-mfr"
                  value={quickAddForm.manufacturer}
                  onChange={e => setQuickAddForm(f => ({ ...f, manufacturer: e.target.value }))}
                  placeholder="e.g. GSK"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-barcode" className="text-xs">Barcode</Label>
                <Input
                  id="qa-barcode"
                  value={quickAddForm.barcode}
                  onChange={e => setQuickAddForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-unit" className="text-xs">Unit Type</Label>
                <Select
                  value={quickAddForm.unitType}
                  onValueChange={v => setQuickAddForm(f => ({ ...f, unitType: v }))}
                >
                  <SelectTrigger id="qa-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['TABLET', 'CAPSULE', 'BOTTLE', 'STRIP', 'BOX', 'PIECE', 'TUBE', 'INJECTION'].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-category" className="text-xs">Category</Label>
              <Select
                value={quickAddForm.categoryId}
                onValueChange={v => setQuickAddForm(f => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger id="qa-category"><SelectValue placeholder="Select category (optional)" /></SelectTrigger>
                <SelectContent>
                  {quickAddCategories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-retail" className="text-xs">Sale Price / unit *</Label>
                <Input
                  id="qa-retail"
                  type="number" step="any" min="0"
                  value={quickAddForm.retailPrice}
                  onChange={e => setQuickAddForm(f => ({ ...f, retailPrice: Number(e.target.value) || 0 }))}
                  placeholder="e.g. 5.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-purchase" className="text-xs">Purchase Price</Label>
                <Input
                  id="qa-purchase"
                  type="number" step="any" min="0"
                  value={quickAddForm.purchasePrice}
                  onChange={e => setQuickAddForm(f => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))}
                  placeholder="e.g. 3.50"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-strip" className="text-xs">Strip Price</Label>
                <Input
                  id="qa-strip"
                  type="number" step="any" min="0"
                  value={quickAddForm.stripPrice}
                  onChange={e => setQuickAddForm(f => ({ ...f, stripPrice: Number(e.target.value) || 0 }))}
                  placeholder="0 if N/A"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-box" className="text-xs">Box Price</Label>
                <Input
                  id="qa-box"
                  type="number" step="any" min="0"
                  value={quickAddForm.boxPrice}
                  onChange={e => setQuickAddForm(f => ({ ...f, boxPrice: Number(e.target.value) || 0 }))}
                  placeholder="0 if N/A"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-min" className="text-xs">Min Stock</Label>
                <Input
                  id="qa-min"
                  type="number" min="0"
                  value={quickAddForm.minStock}
                  onChange={e => setQuickAddForm(f => ({ ...f, minStock: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-max" className="text-xs">Max Stock</Label>
                <Input
                  id="qa-max"
                  type="number" min="0"
                  value={quickAddForm.maxStock}
                  onChange={e => setQuickAddForm(f => ({ ...f, maxStock: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={quickAddForm.prescriptionRequired}
                onChange={e => setQuickAddForm(f => ({ ...f, prescriptionRequired: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <span>Prescription Required (Rx)</span>
            </label>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button onClick={handleQuickAddSubmit} disabled={quickAddSaving}>
              {quickAddSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Medicine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Medicine Created Success Dialog with Add Batch option */}
      <Dialog open={!!quickAddCreated && !addBatchOpen} onOpenChange={(o) => { if (!o) setQuickAddCreated(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              Medicine Created
            </DialogTitle>
          </DialogHeader>
          {quickAddCreated && (
            <div className="space-y-3">
              <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Medicine Name</div>
                <div className="text-lg font-bold">{quickAddCreated.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Retail: <span className="font-mono font-semibold text-foreground">{formatPKR(quickAddCreated.retailPrice)}</span>
                  {quickAddCreated.genericName && ` • ${quickAddCreated.genericName}`}
                </div>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This medicine has <strong>0 stock</strong>. Add a batch now to make it available for sale in POS, or skip and add later via Inventory.</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setQuickAddCreated(null); searchRef.current?.focus() }}>
                  Skip for Now
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddBatchOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Batch & Stock
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Batch Dialog (after Quick Add) */}
      <Dialog open={addBatchOpen} onOpenChange={(o) => { setAddBatchOpen(o); if (!o) setQuickAddCreated(null) }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Package className="h-4 w-4" />
              </div>
              Add Batch for {quickAddCreated?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-2.5 text-xs text-sky-800 dark:text-sky-200">
              Adding a batch makes this medicine available for sale. The batch's expiry date is tracked via FEFO (First Expiry First Out) when selling.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ab-batch" className="text-xs">Batch Number *</Label>
                <Input
                  id="ab-batch"
                  value={addBatchForm.batchNumber}
                  onChange={e => setAddBatchForm(f => ({ ...f, batchNumber: e.target.value }))}
                  placeholder="e.g. B123"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ab-expiry" className="text-xs">Expiry Date *</Label>
                <Input
                  id="ab-expiry"
                  type="date"
                  value={addBatchForm.expiryDate}
                  onChange={e => setAddBatchForm(f => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ab-qty" className="text-xs">Quantity (base units) *</Label>
              <Input
                id="ab-qty"
                type="number" min="0" step="any"
                value={addBatchForm.quantity}
                onChange={e => setAddBatchForm(f => ({ ...f, quantity: Number(e.target.value) || 0 }))}
                placeholder="e.g. 100 (tablets)"
              />
              <p className="text-[10px] text-muted-foreground">For tablets: enter total tablets (e.g. 100 for 10 strips of 10)</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ab-pp" className="text-xs">Purchase Price / unit</Label>
                <Input
                  id="ab-pp"
                  type="number" step="any" min="0"
                  value={addBatchForm.purchasePrice}
                  onChange={e => setAddBatchForm(f => ({ ...f, purchasePrice: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ab-sp" className="text-xs">Sale Price / unit</Label>
                <Input
                  id="ab-sp"
                  type="number" step="any" min="0"
                  value={addBatchForm.salePrice}
                  onChange={e => setAddBatchForm(f => ({ ...f, salePrice: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ab-psb" className="text-xs">Pack Size (Box)</Label>
                <Input
                  id="ab-psb"
                  type="number" min="1"
                  value={addBatchForm.packSizeBox}
                  onChange={e => setAddBatchForm(f => ({ ...f, packSizeBox: Number(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ab-pss" className="text-xs">Pack Size (Strip)</Label>
                <Input
                  id="ab-pss"
                  type="number" min="1"
                  value={addBatchForm.packSizeStrip}
                  onChange={e => setAddBatchForm(f => ({ ...f, packSizeStrip: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddBatchOpen(false); setQuickAddCreated(null) }}>Cancel</Button>
            <Button onClick={handleAddBatchSubmit} disabled={addBatchSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {addBatchSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Add Batch & Enable Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
