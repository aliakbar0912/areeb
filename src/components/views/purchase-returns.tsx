'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { PageHeader, formatPKR, formatDate, formatDateTime, EmptyState } from '@/components/ui-helpers'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import {
  RotateCcw, Search, Check, CheckCircle2, Loader2, Package, AlertCircle,
  ArrowRight, ArrowLeft, History,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav-context'

// ============================================================================
// Types (mirrors purchases.tsx)
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
  discount: number
  total: number
  scheme?: string | null
}

interface PurchaseReturnItem {
  id: string
  medicineId: string
  quantity: number
  unitPrice: number
  total: number
}

interface PurchaseReturn {
  id: string
  returnNumber: string
  purchaseId: string
  supplierId: string
  supplier?: { id: string; name: string }
  total: number
  reason?: string | null
  restoreStock: boolean
  createdAt: string
  items: PurchaseReturnItem[]
}

interface Purchase {
  id: string
  invoiceNumber: string
  supplierId: string
  supplier?: { id: string; name: string }
  invoiceDate: string
  total: number
  paidAmount: number
  status: string
  items: PurchaseItem[]
  returns?: PurchaseReturn[]
}

// ============================================================================
// Purchase Combobox (searchable)
// ============================================================================
function PurchaseCombobox({
  purchases, value, onSelect,
}: { purchases: Purchase[]; value: string; onSelect: (p: Purchase) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = purchases.find(p => p.id === value)

  const filtered = useMemo(() => {
    if (!search) return purchases
    const q = search.toLowerCase()
    return purchases.filter(p =>
      (p.invoiceNumber || '').toLowerCase().includes(q) ||
      (p.supplier?.name || '').toLowerCase().includes(q)
    )
  }, [purchases, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 justify-between w-full font-normal"
        >
          <span className="truncate text-left">
            {selected
              ? `${selected.invoiceNumber} — ${selected.supplier?.name || ''}`
              : <span className="text-muted-foreground">Search invoice # or supplier…</span>}
          </span>
          <Search className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search invoice # or supplier…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No purchase found.</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 100).map(p => (
                <CommandItem
                  key={p.id}
                  value={`${p.invoiceNumber} ${p.supplier?.name || ''}`}
                  onSelect={() => { onSelect(p); setOpen(false); setSearch('') }}
                  className="text-xs"
                >
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-medium">{p.invoiceNumber}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.supplier?.name || '—'} • {formatDate(p.invoiceDate)} • {p.items?.length || 0} items
                      </div>
                    </div>
                    <span className="font-mono text-[10px]">{formatPKR(p.total)}</span>
                  </div>
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
export function PurchaseReturnsView() {
  const { hasPermission } = useAuth()
  const { payload, navigate } = useNav()
  const canReturn = hasPermission('purchases.return')

  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])

  // Step 1 state
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('')
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loadingPurchase, setLoadingPurchase] = useState(false)

  // Step 2 state: map of purchaseItemId -> { selected, quantity }
  const [returnMap, setReturnMap] = useState<Record<string, { selected: boolean; quantity: number }>>({})

  // Step 3 state
  const [reason, setReason] = useState('')
  const [restoreStock, setRestoreStock] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetchPurchases = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/purchases')
      const d = await r.json()
      setPurchases(d.purchases || [])
    } catch (e) {
      toast.error('Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPurchases() }, [fetchPurchases])

  const handleSelectPurchaseId = useCallback(async (id: string) => {
    setSelectedPurchaseId(id)
    setPurchase(null)
    setLoadingPurchase(true)
    setReturnMap({})
    setReason('')
    setRestoreStock(true)
    try {
      const r = await fetch(`/api/purchases/${id}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load purchase')
      setPurchase(d.purchase)
      // init return map with all items deselected and full original qty
      const init: Record<string, { selected: boolean; quantity: number }> = {}
      for (const it of d.purchase.items || []) {
        init[it.id] = { selected: false, quantity: it.quantity }
      }
      setReturnMap(init)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load purchase')
      setSelectedPurchaseId('')
    } finally {
      setLoadingPurchase(false)
    }
  }, [])

  // Preselect purchase if navigated with payload.purchaseId
  useEffect(() => {
    if (payload?.purchaseId && purchases.length > 0) {
      handleSelectPurchaseId(payload.purchaseId)
    }
  }, [payload, purchases, handleSelectPurchaseId])

  const toggleItem = (itemId: string, checked: boolean) => {
    setReturnMap(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { selected: false, quantity: 0 }), selected: checked },
    }))
  }

  const setItemQty = (itemId: string, qty: number) => {
    const max = purchase?.items?.find(i => i.id === itemId)?.quantity ?? 0
    const v = Math.max(0, Math.min(qty, max))
    setReturnMap(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { selected: false, quantity: 0 }), quantity: v },
    }))
  }

  const selectedItems = useMemo(() => {
    if (!purchase) return []
    return (purchase.items || []).filter(it => returnMap[it.id]?.selected)
  }, [purchase, returnMap])

  const returnTotal = useMemo(() => {
    return selectedItems.reduce((s, it) => {
      const qty = returnMap[it.id]?.quantity || 0
      return s + qty * it.purchasePrice
    }, 0)
  }, [selectedItems, returnMap])

  const resetForm = () => {
    setSelectedPurchaseId('')
    setPurchase(null)
    setReturnMap({})
    setReason('')
    setRestoreStock(true)
  }

  const submitReturn = async () => {
    if (!purchase) return
    const items = selectedItems
      .map(it => ({ purchaseItemId: it.id, quantity: Number(returnMap[it.id]?.quantity) || 0 }))
      .filter(x => x.quantity > 0)
    if (items.length === 0) { toast.error('Select at least one item with quantity > 0'); return }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/purchases/${purchase.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: reason || undefined, restoreStock }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to create return')
      toast.success(`Return ${d.purchaseReturn?.returnNumber || ''} created — ${formatPKR(d.purchaseReturn?.total || 0)}`)
      resetForm()
      await fetchPurchases()
    } catch (e: any) {
      toast.error(e.message || 'Failed to create return')
    } finally {
      setSubmitting(false)
    }
  }

  // Recent returns (purchases with returns.length > 0)
  const recentReturns = useMemo(() => {
    const list: Array<{ ret: PurchaseReturn; purchase: Purchase }> = []
    for (const p of purchases) {
      for (const rt of p.returns || []) {
        list.push({
          ret: {
            ...rt,
            supplier: p.supplier,
            purchaseId: p.id,
          } as PurchaseReturn,
          purchase: p,
        })
      }
    }
    return list.sort((a, b) => new Date(b.ret.createdAt).getTime() - new Date(a.ret.createdAt).getTime())
  }, [purchases])

  if (loading) {
    return (
      <div>
        <PageHeader title="Purchase Returns" subtitle="Return medicines to suppliers" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Purchase Returns"
        subtitle="Return medicines to suppliers"
      />

      {!canReturn ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={AlertCircle}
              title="Permission required"
              description="You do not have permission to create purchase returns (purchases.return)."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 3-step wizard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <Card className={selectedPurchaseId ? 'border-muted' : 'border-primary'}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
                  <Label className="text-xs font-semibold">Select Purchase</Label>
                </div>
                <PurchaseCombobox
                  purchases={purchases}
                  value={selectedPurchaseId}
                  onSelect={p => handleSelectPurchaseId(p.id)}
                />
              </CardContent>
            </Card>

            <Card className={!selectedPurchaseId ? 'opacity-50' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedPurchaseId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
                  <Label className="text-xs font-semibold">Select Items & Qty</Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedPurchaseId
                    ? `${selectedItems.length} item(s) selected • Total: ${formatPKR(returnTotal)}`
                    : 'Select a purchase to begin'}
                </div>
              </CardContent>
            </Card>

            <Card className={!selectedPurchaseId ? 'opacity-50' : ''}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${selectedPurchaseId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>3</div>
                  <Label className="text-xs font-semibold">Reason & Submit</Label>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedPurchaseId
                    ? `Restore stock: ${restoreStock ? 'Yes' : 'No'}`
                    : 'Complete steps 1 & 2 first'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main panel */}
          {!selectedPurchaseId ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={RotateCcw}
                  title="Select a purchase invoice"
                  description="Search by invoice # or supplier name above to start a return."
                />
              </CardContent>
            </Card>
          ) : loadingPurchase ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : purchase ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* Items table - steps 2 & 3 */}
              <Card className="lg:col-span-2">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-sm font-semibold font-mono">{purchase.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {purchase.supplier?.name || '—'} • {formatDate(purchase.invoiceDate)}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {selectedItems.length} of {purchase.items?.length || 0} items selected
                    </Badge>
                  </div>

                  <div className="border rounded-md max-h-[420px] overflow-y-auto scroll-area">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Medicine</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-right">Purchased</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Return Qty</TableHead>
                          <TableHead className="text-right">Line Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(purchase.items || []).map(it => {
                          const r = returnMap[it.id] || { selected: false, quantity: 0 }
                          const lineTotal = r.quantity * it.purchasePrice
                          return (
                            <TableRow key={it.id} className={r.selected ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                              <TableCell>
                                <Checkbox
                                  checked={r.selected}
                                  onCheckedChange={(c) => toggleItem(it.id, !!c)}
                                />
                              </TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium">{it.medicine?.name || '—'}</div>
                                {it.scheme && <div className="text-[10px] text-muted-foreground">Scheme: {it.scheme}</div>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{it.batchNumber}</TableCell>
                              <TableCell className="text-right font-mono text-xs">
                                {it.quantity}{it.freeQuantity > 0 && <span className="text-emerald-600"> +{it.freeQuantity} free</span>}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{formatPKR(it.purchasePrice)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  value={r.quantity}
                                  disabled={!r.selected}
                                  onChange={e => setItemQty(it.id, Number(e.target.value) || 0)}
                                  className="h-8 text-xs w-20 text-right ml-auto"
                                  min={0}
                                  max={it.quantity}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-semibold">
                                {formatPKR(lineTotal)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Reason + submit panel */}
              <Card>
                <CardContent className="p-3 space-y-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Return Reason</Label>
                    <Input
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Expired stock, damaged, wrong batch"
                      className="h-9"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">Restore Stock</div>
                      <div className="text-xs text-muted-foreground">
                        Decrement inventory for returned items
                      </div>
                    </div>
                    <Switch
                      checked={restoreStock}
                      onCheckedChange={setRestoreStock}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items selected</span><span>{selectedItems.length}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base">
                      <span>Return Total</span>
                      <span className="font-mono text-primary">{formatPKR(returnTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetForm}
                      disabled={submitting}
                    >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Reset
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={submitReturn}
                      disabled={submitting || selectedItems.length === 0}
                    >
                      {submitting
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Submit Return
                    </Button>
                  </div>

                  {purchase.returns && purchase.returns.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="text-xs text-muted-foreground mb-1">Previous returns on this invoice</div>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto scroll-area">
                        {purchase.returns.map(rt => (
                          <div key={rt.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40">
                            <div>
                              <div className="font-mono font-medium">{rt.returnNumber}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatDate(rt.createdAt)} {rt.restoreStock && '• Stock restored'}
                              </div>
                            </div>
                            <span className="font-mono">{formatPKR(rt.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}

          {/* Recent returns */}
          <Card className="mt-4">
            <CardContent className="p-0">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  <span className="text-sm font-semibold">Recent Purchase Returns</span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">{recentReturns.length} total</Badge>
              </div>
              {recentReturns.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No purchase returns yet"
                  description="Returns you create will appear here."
                />
              ) : (
                <div className="max-h-[320px] overflow-y-auto scroll-area">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Return #</TableHead>
                        <TableHead>Purchase Invoice</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentReturns.map(({ ret, purchase: p }) => (
                        <TableRow key={ret.id}>
                          <TableCell className="text-xs">{formatDateTime(ret.createdAt)}</TableCell>
                          <TableCell className="font-mono text-xs font-medium">{ret.returnNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">{p.supplier?.name || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">{formatPKR(ret.total)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ret.reason || '—'}</TableCell>
                          <TableCell>
                            {ret.restoreStock
                              ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">Restored</Badge>
                              : <Badge variant="secondary">Not restored</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { resetForm(); handleSelectPurchaseId(p.id) }}
                              title="View purchase"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick nav hint */}
          <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
            <Package className="h-3.5 w-3.5" />
            Need to view all purchases?{' '}
            <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => navigate('purchases')}>
              Go to Purchases
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
